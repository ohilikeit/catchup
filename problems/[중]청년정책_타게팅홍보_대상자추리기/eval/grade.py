# -*- coding: utf-8 -*-
"""
청년정책 타게팅 이메일 — 채점 스크립트

사용:
  python eval/grade.py \
    --submission 제출물/최종제출.xlsx \
    --answer-dir eval/answer_key

출력: 콘솔 표 + result.json (영역별 점수 / FP·FN 목록)
정답키는 build_dataset.py 가 생성한 eval/answer_key/*.xlsx 를 사용한다.

배점: 타게팅 90점(정책별 macro F_beta) + 무결성 10점 = 총 100점.
  무결성 = 10 − 3 × (추천한 판별불가(matchable=N) 정책 종수), 하한 0.
  (FP 건수 기반 감점은 폐지 — 오발송은 정밀도 항에서 이미 반영된다.)
  (채점 지표 = 정책별 F_beta의 macro 평균(β=0.5, 정밀도 가중). 단일 지배정책이 점수를
   과점하지 못하게 정답-보유 matchable=Y 정책을 동등 가중한다 — 하단 BETA·macro 주석 참고.
   micro F1/F_beta는 진단용으로 result.json에 병기.)

경고 버킷(서로 겹치지 않음):
  · 미정의정책ID사용  — 제출 정책ID가 policies.csv의 policy_id 집합에 아예 없음
  · 판별불가정책추천  — 제출 정책ID가 matchable=N 정책(회원 명단으로 자격 확인 불가)
  · 정답0건정책추천   — matchable=Y이지만 정답 매칭이 0건인 정책을 추천
"""
import argparse, json, re
from pathlib import Path
import openpyxl

# ---- 채점 가중치 ------------------------------------------------------------
# F_beta = (1+beta^2)*P*R / (beta^2*P + R)  (표준 정의: beta<1 → 정밀도 가중,
#          beta>1 → 재현율 가중). BETA=1.0이면 F_beta ≡ F1(중립).
#
# 채점은 F1(BETA=1.0)을 쓴다. 채점식을 특정 페르소나 순위가 나오도록 역산해 맞추지
# 않는다 — 그건 측정값을 목표로 삼는 Goodhart 오류다. 이 과제는 문제.md가 "확실할 때만
# 추천… 무리하면 오발송"이라 명시한 정밀도-중요 도메인이다. 정밀도를 의도적으로 더
# 강조하려면 그것은 출제자의 '설계 결정'으로 beta<1을 택하는 것이며(그 경우 과다추천
# 페르소나 점수가 더 낮아지는 게 정상), 순위를 맞추려 beta>1로 두는 것은 도메인 철학과
# 정반대라 허용하지 않는다.
#
# [이력] 2026-07-06 한때 역전(standard>advanced) 해소를 위해 beta=1.2(재현율 가중)로
#   설정했으나, 이는 "일단 다 추천"하는 저정밀도 전략을 보상해 과제 철학과 정면 충돌하므로
#   폐기하고 중립 F1로 복귀.
# [이력] 2026-07-07 플레이테스트 교차검증(9세션)에서 basic>advanced 역전 + 변별력 소실
#   확인. 원인분해: (1) score()가 F1을 읽어 β 손잡이가 죽어 있었고(배선 버그, 아래 score()
#   에서 F_beta로 교정), (2) micro-F1이 YP10(정답 45% 단일지배)에 과점돼 "블랭킷 스프레이"를
#   보상. 조치: 채점을 정책별 F_beta의 macro 평균(β=0.5, 정밀도 가중)으로 전환. macro는
#   정답-보유 matchable=Y 정책을 동등 가중해 단일 지배정책 과점을 제거한다. (근본 원인인
#   YP07 소득게이트 시각은닉·YP10 분포편중은 데이터/포스터 생성단계 과제 — 지표는 대증요법.)
BETA = 0.5

# ---- 정규화 헬퍼 -----------------------------------------------------------
def norm_str(v):
    if v is None: return ""
    return re.sub(r"\s+", "", str(v)).strip()

def load_sheet(path, sheet):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet] if sheet in wb.sheetnames else wb[wb.sheetnames[-1]]
    rows = list(ws.iter_rows(values_only=True))
    head = [norm_str(h) for h in rows[0]]
    out = []
    for r in rows[1:]:
        if all(c is None or str(c).strip() == "" for c in r): continue
        out.append({head[i]: r[i] for i in range(len(head))})
    return out

# ---- 타게팅 (집합) ---------------------------------------------------------
def grade_final(sub, ans, all_policy_ids, unmatchable_policies, valid_members):
    def pset(rows):
        s = set()
        for r in rows:
            mid = norm_str(r.get("회원ID")); pid = norm_str(r.get("추천정책ID"))
            if mid.startswith("예시"): continue          # 제출양식 예시 행 무시
            if mid and pid: s.add((mid, pid))
        return s
    A = pset(ans); S = pset(sub)
    tp = A & S; fp = S - A; fn = A - S
    if not A and not S:                 # 정답·제출 모두 없음 → 완벽(예: 대상 정책/매칭이 0건)
        prec = rec = f1 = f_beta = 1.0
    else:
        prec = len(tp)/len(S) if S else 0.0
        rec  = len(tp)/len(A) if A else 0.0
        f1   = (2*prec*rec/(prec+rec)) if (prec+rec) else 0.0
        _den = (BETA*BETA*prec + rec)
        f_beta = ((1+BETA*BETA)*prec*rec/_den) if _den else 0.0
    # ---- 무결성 경고 버킷(서로 배타적) ----
    # policies.csv 로드 실패(all_policy_ids 비어 있음) 시 정책 무결성 검사는 건너뜀
    checks_on = bool(all_policy_ids)
    # 1) 미정의 정책ID: policies.csv의 policy_id 집합(전체)에 아예 없는 ID
    undefined_id = sorted({(m,p) for (m,p) in S
                           if p not in all_policy_ids}) if checks_on else []
    # 2) 판별불가(matchable=N) 정책 추천: 회원 명단으로 자격을 확인할 수 없는 정책
    unmatchable_rec = sorted({(m,p) for (m,p) in S if p in unmatchable_policies})
    # 3) 정답 0건 정책 추천: matchable=Y(valid)이지만 정답 매칭이 0건인 정책
    valid_policies = all_policy_ids - unmatchable_policies
    ans_policies = {p for (_, p) in A}
    zero_ans_rec = sorted({(m,p) for (m,p) in S
                           if p in valid_policies and p not in ans_policies})
    # ---- 정책별 F_beta의 macro 평균 (단일 지배정책 과점 제거 + 오발송 스팸 차단) ----
    # 대상 = ① 정답 보유 matchable=Y 정책(정상 채점) ∪ ② 학생이 추천했으나 정답이 0건인
    # 정책(판별불가·정답0·미정의 = 아무에게도 추천 불가). ②는 tp=0이라 F_beta=0으로 잡혀
    # macro 평균을 끌어내린다 → "아무에게도 추천 불가 정책에 추천 = 그 정책 0점".
    # micro(전체 쌍)와 달리 YP10처럼 정답 많은 정책이 점수를 과점하지 못하고, macro가
    # matchable=N을 통째로 무시해 오발송이 본점수를 회피하던 회귀(무결성 −3만 받던 문제)를 막는다.
    def _fbeta(pp, rr):
        _d = BETA*BETA*pp + rr
        return ((1+BETA*BETA)*pp*rr/_d) if _d else 0.0
    sprayed_zero_ans = {p for (_, p) in S if p not in ans_policies}  # 정답 0건인데 추천된 정책
    macro_policies = sorted((ans_policies & valid_policies) | sprayed_zero_ans)
    per_policy_fbeta = {}
    for _pol in macro_policies:
        _Ap = {(m,p) for (m,p) in A if p == _pol}
        _Sp = {(m,p) for (m,p) in S if p == _pol}
        _tp = len(_Ap & _Sp)
        _p = _tp/len(_Sp) if _Sp else 0.0
        _r = _tp/len(_Ap) if _Ap else 0.0
        per_policy_fbeta[_pol] = round(_fbeta(_p, _r), 4)
    macro_fbeta = (round(sum(per_policy_fbeta.values())/len(per_policy_fbeta), 4)
                   if per_policy_fbeta else (f_beta if (A or S) else 1.0))
    # 유령 ID(존재하지 않는 회원)
    ghost_id = sorted({(m,p) for (m,p) in S if m not in valid_members})
    # 정책ID 체계 불일치 의심: 제출에 쓰인 정책ID 중 정의된 ID가 한 종도 없음
    sub_policy_kinds = {p for (_, p) in S}
    id_scheme_mismatch = (checks_on and bool(sub_policy_kinds)
                          and not (sub_policy_kinds & all_policy_ids))
    return {
        "정답매칭수": len(A), "제출매칭수": len(S),
        "정밀도": round(prec,4), "재현율": round(rec,4), "F1": round(f1,4),
        "F_beta": round(f_beta,4),         # micro(전체 쌍) F_beta — 진단용
        "macro_Fbeta": macro_fbeta,        # score()가 실제로 사용하는 지표(정책별 F_beta 균등평균, β=상단 BETA)
        "정책별_Fbeta": per_policy_fbeta,  # 정답-보유 matchable=Y 정책별 F_beta(진단용)
        "오발송_FP수": len(fp), "누락_FN수": len(fn),
        # (구) '추천불가정책추천' = 미정의 ∪ 판별불가 — 하위 호환용으로 유지
        "추천불가정책추천": sorted(set(undefined_id) | set(unmatchable_rec))[:50],
        "유령ID사용": ghost_id[:50],
        "미정의정책ID사용": undefined_id[:50],
        "미정의정책ID사용수": len(undefined_id),
        "미정의정책ID종류": sorted({p for (_, p) in undefined_id})[:20],
        "판별불가정책추천": unmatchable_rec[:50],
        "판별불가정책추천수": len(unmatchable_rec),
        "판별불가정책종류": sorted({p for (_, p) in unmatchable_rec}),
        "정답0건정책추천": zero_ans_rec[:50],
        "정답0건정책추천수": len(zero_ans_rec),
        "정책ID체계불일치": id_scheme_mismatch,
        "FP샘플": sorted(fp)[:20], "FN샘플": sorted(fn)[:20],
    }

# ---- 배점 -----------------------------------------------------------------
#   타게팅 F1 90 / 무결성 10 = 10 − 3 × (추천한 matchable=N 정책 종수), 하한 0.
def score(final):
    s3 = final["macro_Fbeta"] * 90
    n_unmatchable_kinds = len(final["판별불가정책종류"])
    s4 = max(0.0, 10.0 - 3.0*n_unmatchable_kinds)
    return {"타게팅_F1(90)": round(s3,1), "무결성(10)": round(s4,1),
            "총점(100)": round(s3+s4,1)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submission", required=True, help="최종제출.xlsx 경로")
    ap.add_argument("--answer-dir", required=True)
    ap.add_argument("--members", default=None, help="회원 DB(유령ID 검사용). 기본 데이터/회원명단.xlsx")
    args = ap.parse_args()

    adir = Path(args.answer_dir)
    sub = load_sheet(args.submission, "타게팅")
    ans = load_sheet(adir/"2_추천리스트_정답.xlsx", "타게팅")

    # 추천 가능 정책 = matchable!=N 인 모든 정책(날짜 무관). 판별불가(matchable=N) 정책은
    # policies.csv에서 읽어 제외한다. 같은 루프에서 전체 policy_id 집합도 함께 모은다.
    unmatchable = set()
    all_policy_ids = set()
    try:
        import csv as _csv
        with (adir/"policies.csv").open(encoding="utf-8-sig", newline="") as _f:
            for _r in _csv.DictReader(_f):
                pid = norm_str(_r.get("policy_id"))
                if not pid: continue
                all_policy_ids.add(pid)
                if (_r.get("matchable") or "").strip().upper() == "N":
                    unmatchable.add(pid)
    except Exception as e:
        # 관용 폴백(채점은 계속)이되 무음 금지: policies.csv를 못 읽으면
        # 무결성 검사(추천불가·판별불가 정책 탐지)가 비활성화됨을 경고한다.
        print(f"[경고] policies.csv 로드 실패({e}) — 정책 무결성 검사를 건너뜁니다.")
    members_path = args.members or (Path(args.submission).resolve().parents[1]/"데이터"/"회원명단.xlsx")
    try:
        valid_members = {norm_str(r["회원ID"]) for r in load_sheet(members_path, "회원")}
    except Exception:
        valid_members = {m for (m, _) in
                         {(norm_str(r.get("회원ID")), 1) for r in ans}}  # fallback

    r = grade_final(sub, ans, all_policy_ids, unmatchable, valid_members)
    sc = score(r)

    print("="*60); print(" 채점 결과")
    print("="*60)
    print(f"[타게팅] macro-Fβ {r['macro_Fbeta']*100:.1f}% (β={BETA}) | micro F1 {r['F1']*100:.1f}% "
          f"(정밀도 {r['정밀도']*100:.1f} / 재현율 {r['재현율']*100:.1f}) | FP {r['오발송_FP수']} / FN {r['누락_FN수']}")
    if r["정책별_Fbeta"]:
        print("        정책별 Fβ: " + "  ".join(f"{k}:{v*100:.0f}" for k,v in r["정책별_Fbeta"].items()))
    if r["미정의정책ID사용수"]:
        ex = ", ".join(r["미정의정책ID종류"][:5])
        print(f"        ⚠ 미정의 정책ID 사용: {r['미정의정책ID사용수']}건 (예: {ex})")
    if r["판별불가정책추천수"]:
        kinds = ", ".join(r["판별불가정책종류"])
        print(f"        ⚠ 판별불가(확인 불가) 정책 추천: {r['판별불가정책추천수']}건 ({kinds})")
    if r["정답0건정책추천수"]:
        print(f"        ⚠ 정답 0건 정책 추천: {r['정답0건정책추천수']}건")
    if r["유령ID사용"]:
        print(f"        ⚠ 존재하지 않는 회원ID: {len(r['유령ID사용'])}건")
    if r["정책ID체계불일치"]:
        print("        " + "!"*52)
        print("        ⚠⚠ 정책ID 체계 불일치 의심 — 제출된 정책ID가 정답 체계와")
        print("           전혀 겹치지 않습니다. 제출물의 '정책목록' 시트 ID를")
        print("           사용했는지 확인하세요.")
        print("        " + "!"*52)
    print("-"*60)
    for k, v in sc.items(): print(f"  {k:<20} {v}")
    print("="*60)

    out = {"final": r, "score": sc}
    Path("result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print("→ result.json 저장")

if __name__ == "__main__":
    main()
