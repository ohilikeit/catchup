# -*- coding: utf-8 -*-
"""
이커머스 CRM 리텐션 캠페인 타게팅 — 채점 스크립트

사용:
  python eval/grade.py \
    --part1 data/campaign_table_template.xlsx \
    --part2 data/targeting_template.xlsx \
    --answer-dir eval/answer_key

출력: 콘솔 표 + result.json (영역별 점수 / FP·FN 목록)
정답키는 build_dataset.py 가 생성한 eval/answer_key/*.xlsx 를 사용한다.
"""
import argparse, json, re, datetime
from pathlib import Path
import openpyxl

# ---- 정규화 헬퍼 -----------------------------------------------------------
def norm_str(v):
    if v is None: return ""
    return re.sub(r"\s+", "", str(v)).strip()

def norm_int(v):
    if v is None or str(v).strip() == "": return ""     # 빈칸 보존(0과 구분)
    s = re.sub(r"[,\s]", "", str(v))
    try: return str(int(float(s)))
    except ValueError: return str(v).strip()

def norm_constraint(v):
    """회원등급/선호채널 요건: '무관'·'없음'·'제한없음'·빈칸을 모두 '제약없음'으로 동일 처리."""
    s = norm_str(v)
    if s in ("", "무관", "없음", "제한없음", "해당없음"): return ""
    return s

def norm_req(v):
    """수신동의/앱설치 요건: '필요'·'Y'·'예'·'O'·'필수'를 모두 '필요'로, 그 외는 빈칸."""
    s = norm_str(v).upper()
    if s in ("필요", "Y", "예", "O", "필수", "TRUE"): return "필요"
    return ""

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

# ---- Part 1: 캠페인 정리표 (셀 단위) ----------------------------------------
P1_FIELDS = {
    "거주지요건": norm_str, "연령_min": norm_int, "연령_max": norm_int,
    "휴면일수_min": norm_int, "휴면일수_max": norm_int,
    "누적구매액하한_원": norm_int, "회원등급요건": norm_constraint,
    "선호채널요건": norm_constraint, "수신동의요건": norm_req, "앱설치요건": norm_req,
}
def grade_part1(sub, ans):
    A = {norm_str(r["캠페인ID"]): r for r in ans}
    S = {norm_str(r["캠페인ID"]): r for r in sub}
    per_field = {f: [0, 0] for f in P1_FIELDS}   # [correct, total]
    detail = []
    for pid, arow in A.items():
        srow = S.get(pid, {})
        for f, fn in P1_FIELDS.items():
            exp = fn(arow.get(f)); got = fn(srow.get(f))
            ok = (exp == got)
            per_field[f][1] += 1
            if ok: per_field[f][0] += 1
            if not ok:
                detail.append({"캠페인ID": pid, "필드": f, "정답": exp, "제출": got})
    cells_ok = sum(v[0] for v in per_field.values())
    cells_tot = sum(v[1] for v in per_field.values())
    return {
        "정확셀": cells_ok, "전체셀": cells_tot,
        "셀정확도": round(cells_ok / cells_tot, 4) if cells_tot else 0,
        "캠페인총수": len(A),
        "필드별": {f: round(v[0]/v[1], 3) for f, v in per_field.items()},
        "오답상세": detail,
    }

# ---- Part 2: 타게팅 (집합) -------------------------------------------------
def grade_part2(sub, ans, valid_policies, valid_members):
    def pset(rows):
        s = set()
        for r in rows:
            mid = norm_str(r.get("고객ID")); pid = norm_str(r.get("추천캠페인ID"))
            if mid.startswith("예시"): continue          # 제출양식 예시 행 무시
            if mid and pid: s.add((mid, pid))
        return s
    A = pset(ans); S = pset(sub)
    tp = A & S; fp = S - A; fn = A - S
    if not A and not S:                 # 정답·제출 모두 없음 → 완벽
        prec = rec = f1 = 1.0
    else:
        prec = len(tp)/len(S) if S else 0.0
        rec  = len(tp)/len(A) if A else 0.0
        f1   = (2*prec*rec/(prec+rec)) if (prec+rec) else 0.0
    # 무결성: 추천 대상 아님(matchable=N 등) 캠페인 추천 / 유령 ID
    bad_policy = sorted({(m,p) for (m,p) in S if p not in valid_policies})
    ghost_id   = sorted({(m,p) for (m,p) in S if m not in valid_members})
    # 판별불가(matchable=N) 추천 탐지: 추천 대상(valid)이지만 정답 매칭이 0건인 캠페인
    ans_policies = {p for (_, p) in A}
    unmatchable = sorted({(m,p) for (m,p) in S
                          if p in valid_policies and p not in ans_policies})
    return {
        "정답매칭수": len(A), "제출매칭수": len(S),
        "정밀도": round(prec,4), "재현율": round(rec,4), "F1": round(f1,4),
        "오발송_FP수": len(fp), "누락_FN수": len(fn),
        "추천불가캠페인추천": bad_policy[:50], "유령ID사용": ghost_id[:50],
        "판별불가캠페인추천": unmatchable[:50],
        "FP샘플": sorted(fp)[:20], "FN샘플": sorted(fn)[:20],
    }

# ---- 배점 -----------------------------------------------------------------
#   Part1 추출 50 / Part2 F1 40 / Part2 무결성 10.
def score(p1, p2):
    s1 = p1["셀정확도"] * 50
    s3 = p2["F1"] * 40
    viol = p2["오발송_FP수"]  # 무결성 감점(오발송 위주)
    s4 = max(0, 10 - viol*0.5)
    return {"Part1_추출(50)": round(s1,1),
            "Part2_F1(40)": round(s3,1), "Part2_무결성(10)": round(s4,1),
            "총점(100)": round(s1+s3+s4,1)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part1", required=True)
    ap.add_argument("--part2", required=True)
    ap.add_argument("--answer-dir", required=True)
    ap.add_argument("--members", default=None, help="고객 DB(유령ID 검사용). 기본 data/customers.xlsx")
    args = ap.parse_args()

    adir = Path(args.answer_dir)
    p1_sub = load_sheet(args.part1, "캠페인정리")
    p1_ans = load_sheet(adir/"campaign_table_answer.xlsx", "캠페인정리")
    p2_sub = load_sheet(args.part2, "타게팅")
    p2_ans = load_sheet(adir/"targeting_answer.xlsx", "타게팅")

    # 추천 가능 캠페인 = matchable!=N 인 모든 캠페인. 판별불가(matchable=N) 캠페인은
    # campaigns.csv에서 읽어 제외 → 그 캠페인 추천을 무결성 위반으로 잡는다.
    unmatchable = set()
    try:
        import csv as _csv
        with (adir/"campaigns.csv").open(encoding="utf-8-sig", newline="") as _f:
            for _r in _csv.DictReader(_f):
                if (_r.get("matchable") or "").strip().upper() == "N":
                    unmatchable.add(norm_str(_r.get("campaign_id")))
    except Exception:
        pass
    valid_policies = {norm_str(r["캠페인ID"]) for r in p1_ans} - unmatchable
    members_path = args.members or (Path(args.part2).resolve().parents[0]/"customers.xlsx")
    try:
        valid_members = {norm_str(r["고객ID"]) for r in load_sheet(members_path, "고객")}
    except Exception:
        valid_members = {m for (m, _) in
                         {(norm_str(r.get("고객ID")), 1) for r in p2_ans}}  # fallback

    r1 = grade_part1(p1_sub, p1_ans)
    r2 = grade_part2(p2_sub, p2_ans, valid_policies, valid_members)
    sc = score(r1, r2)

    print("="*60); print(" 채점 결과")
    print("="*60)
    print(f"[Part1] 셀정확도 {r1['셀정확도']*100:.1f}% ({r1['정확셀']}/{r1['전체셀']}) | "
          f"캠페인 {r1['캠페인총수']}건")
    print(f"        필드별: {r1['필드별']}")
    print(f"[Part2] F1 {r2['F1']*100:.1f}% (정밀도 {r2['정밀도']*100:.1f} / 재현율 {r2['재현율']*100:.1f}) | "
          f"FP {r2['오발송_FP수']} / FN {r2['누락_FN수']}")
    if r2["추천불가캠페인추천"]: print(f"        ⚠ 추천불가 캠페인 추천: {len(r2['추천불가캠페인추천'])}건")
    if r2["유령ID사용"]:     print(f"        ⚠ 존재하지 않는 고객ID: {len(r2['유령ID사용'])}건")
    if r2["판별불가캠페인추천"]: print(f"        ⚠ 판별불가(추천불가) 캠페인 추천: {len(r2['판별불가캠페인추천'])}건")
    print("-"*60)
    for k, v in sc.items(): print(f"  {k:<20} {v}")
    print("="*60)

    out = {"part1": r1, "part2": r2, "score": sc}
    Path("result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print("→ result.json 저장")

if __name__ == "__main__":
    main()
