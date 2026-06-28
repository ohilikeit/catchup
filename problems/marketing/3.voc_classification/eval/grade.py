# -*- coding: utf-8 -*-
"""
VOC 유형·감성 2축 분류 과제 — 채점 스크립트 (분류 아키타입, 다클래스 macro-F1 + 혼동행렬)

사용:
  python eval/grade.py \
    --submission data/classification_template.xlsx \
    --answer-dir eval/answer_key

자기채점(정답키 자기검증, 100점 기대):
  python eval/grade.py \
    --submission eval/answer_key/classification_answer.xlsx \
    --answer-dir eval/answer_key

배점: 문의유형 macro-F1 45 / 감성 macro-F1 45 / 무결성 10.
채점 프리미티브:
  · 다클래스 macro-F1 — 클래스별 F1을 (gold에 등장하는) 클래스에 대해 단순 평균.
    단순 정확도가 아니라 macro라 '다수 클래스로 다 찍기'를 처벌(소수 클래스 F1이 0이면 평균이 급락).
  · 혼동행렬 — 어느 클래스를 어디로 틀렸는지(행=정답, 열=제출) 출력.
  · norm_label — 라벨 문자열 정규화(공백·동의어 흡수, 라벨집합 외 값/빈칸은 오답).
출력: 콘솔 표 + 혼동행렬 + result.json.
"""
import argparse, json, re
from pathlib import Path
import openpyxl

# ---- 라벨 집합 -------------------------------------------------------------
TYPE_LABELS  = ["환불취소", "배송문제", "제품불량", "사용법문의", "칭찬감사", "기타"]
SENTI_LABELS = ["긍정", "부정", "중립"]
INVALID = "(무효)"   # 라벨집합 외 값/빈칸 센티넬


# ---- 정규화 ----------------------------------------------------------------
def norm_str(v):
    if v is None:
        return ""
    return re.sub(r"\s+", "", str(v)).strip()


TYPE_ALIAS = {
    "환불취소": "환불취소", "환불": "환불취소", "취소": "환불취소", "환불/취소": "환불취소",
    "환불·취소": "환불취소", "환불및취소": "환불취소", "반품": "환불취소",
    "배송문제": "배송문제", "배송": "배송문제", "배송지연": "배송문제", "배송문의": "배송문제",
    "제품불량": "제품불량", "불량": "제품불량", "제품하자": "제품불량", "하자": "제품불량", "고장": "제품불량",
    "사용법문의": "사용법문의", "사용법": "사용법문의", "사용문의": "사용법문의", "사용방법": "사용법문의",
    "사용법문제": "사용법문의",
    "칭찬감사": "칭찬감사", "칭찬": "칭찬감사", "감사": "칭찬감사", "칭찬/감사": "칭찬감사", "칭찬·감사": "칭찬감사",
    "기타": "기타", "그외": "기타", "기타문의": "기타",
}
SENTI_ALIAS = {
    "긍정": "긍정", "positive": "긍정", "pos": "긍정", "+": "긍정", "긍": "긍정",
    "부정": "부정", "negative": "부정", "neg": "부정", "-": "부정", "부": "부정",
    "중립": "중립", "neutral": "중립", "neu": "중립", "중": "중립",
}


def norm_type(v):
    r = norm_str(v)
    if r == "":
        return INVALID
    if r in TYPE_ALIAS:
        return TYPE_ALIAS[r]
    return r if r in TYPE_LABELS else INVALID


def norm_senti(v):
    r = norm_str(v)
    if r == "":
        return INVALID
    low = r.lower()
    if r in SENTI_ALIAS:
        return SENTI_ALIAS[r]
    if low in SENTI_ALIAS:
        return SENTI_ALIAS[low]
    return r if r in SENTI_LABELS else INVALID


def load_sheet(path, sheet):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[sheet] if sheet in wb.sheetnames else wb[wb.sheetnames[-1]]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    head = [norm_str(h) for h in rows[0]]
    out = []
    for r in rows[1:]:
        if all(c is None or str(c).strip() == "" for c in r):
            continue
        out.append({head[i]: r[i] for i in range(len(head))})
    return out


# ---- 다클래스 macro-F1 + 혼동행렬 ------------------------------------------
def grade_axis(gold_map, sub_map, item_ids, labels, norm_fn):
    """한 축(유형 또는 감성)의 macro-F1 + 혼동행렬.
       gold_map/sub_map: item_id -> 원시 라벨값. item_ids: 정답 기준 전체 item_id.
       반환: {macro_f1, per_class:{label:{p,r,f1,support}}, confusion, invalid_count}"""
    cols = labels + [INVALID]
    confusion = {g: {p: 0 for p in cols} for g in labels}
    tp = {c: 0 for c in labels}
    fp = {c: 0 for c in labels}
    fn = {c: 0 for c in labels}
    support = {c: 0 for c in labels}
    pred_count = {c: 0 for c in labels}
    invalid_count = 0

    for iid in item_ids:
        g = norm_fn(gold_map.get(iid))            # 정답은 항상 유효
        p = norm_fn(sub_map.get(iid))             # 제출(빈칸/오타 → INVALID)
        support[g] += 1
        confusion[g][p] += 1
        if p == INVALID:
            invalid_count += 1
        else:
            pred_count[p] += 1
        if p == g:
            tp[g] += 1
        else:
            fn[g] += 1
            if p in labels:
                fp[p] += 1

    per_class = {}
    f1s = []
    for c in labels:
        prec = tp[c] / (tp[c] + fp[c]) if (tp[c] + fp[c]) else 0.0
        rec  = tp[c] / (tp[c] + fn[c]) if (tp[c] + fn[c]) else 0.0
        f1   = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
        per_class[c] = {"정밀도": round(prec, 4), "재현율": round(rec, 4),
                        "F1": round(f1, 4), "support": support[c], "pred": pred_count[c]}
        # macro 분모 = gold에 등장하는(support>0) 또는 제출된(pred>0) 클래스
        if support[c] > 0 or pred_count[c] > 0:
            f1s.append(f1)
    macro = sum(f1s) / len(f1s) if f1s else 0.0
    return {
        "macro_f1": round(macro, 4),
        "per_class": per_class,
        "confusion": confusion,
        "invalid_count": invalid_count,
    }


def fmt_confusion(conf, labels):
    cols = labels + [INVALID]
    short = {l: l[:4] for l in cols}
    head = "정답\\제출".ljust(10) + "".join(short[c].rjust(7) for c in cols)
    lines = [head]
    for g in labels:
        row = g[:9].ljust(10) + "".join(str(conf[g][c]).rjust(7) for c in cols)
        lines.append(row)
    return "\n".join(lines)


# ---- 배점 -----------------------------------------------------------------
# 유형 macro-F1 45 / 감성 macro-F1 45 / 무결성 10.
def score(rt, rs, ghost_n):
    s_type = rt["macro_f1"] * 45
    s_senti = rs["macro_f1"] * 45
    viol = rt["invalid_count"] + rs["invalid_count"] + ghost_n
    s_int = max(0, 10 - viol * 0.5)
    return {
        "유형_macroF1(45)": round(s_type, 1),
        "감성_macroF1(45)": round(s_senti, 1),
        "무결성(10)": round(s_int, 1),
        "총점(100)": round(s_type + s_senti + s_int, 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--submission", required=True)
    ap.add_argument("--answer-dir", required=True)
    args = ap.parse_args()

    adir = Path(args.answer_dir)
    sub = load_sheet(args.submission, "분류")
    ans = load_sheet(adir / "classification_answer.xlsx", "분류")

    def key(r):
        return norm_str(r.get("item_id"))

    A_type = {key(r): r.get("문의유형") for r in ans}
    A_senti = {key(r): r.get("감성") for r in ans}
    S_type = {key(r): r.get("문의유형") for r in sub if key(r)}
    S_senti = {key(r): r.get("감성") for r in sub if key(r)}
    item_ids = [key(r) for r in ans]
    valid_ids = set(item_ids)
    ghost = sorted({key(r) for r in sub if key(r) and key(r) not in valid_ids})

    rt = grade_axis(A_type, S_type, item_ids, TYPE_LABELS, norm_type)
    rs = grade_axis(A_senti, S_senti, item_ids, SENTI_LABELS, norm_senti)
    sc = score(rt, rs, len(ghost))

    print("=" * 64); print(" 채점 결과 (VOC 유형·감성 2축 분류)")
    print("=" * 64)
    print(f"[문의유형] macro-F1 {rt['macro_f1']*100:.1f}%  (라벨 {len(TYPE_LABELS)}클래스)")
    for c in TYPE_LABELS:
        pc = rt["per_class"][c]
        print(f"   - {c:<8} F1={pc['F1']*100:5.1f}  (P={pc['정밀도']*100:5.1f} R={pc['재현율']*100:5.1f} "
              f"support={pc['support']:>3} pred={pc['pred']:>3})")
    if rt["invalid_count"]:
        print(f"   ⚠ 라벨집합 외/빈칸: {rt['invalid_count']}건")
    print("   [혼동행렬]")
    print("   " + fmt_confusion(rt["confusion"], TYPE_LABELS).replace("\n", "\n   "))
    print("-" * 64)
    print(f"[감성]   macro-F1 {rs['macro_f1']*100:.1f}%  (라벨 {len(SENTI_LABELS)}클래스)")
    for c in SENTI_LABELS:
        pc = rs["per_class"][c]
        print(f"   - {c:<8} F1={pc['F1']*100:5.1f}  (P={pc['정밀도']*100:5.1f} R={pc['재현율']*100:5.1f} "
              f"support={pc['support']:>3} pred={pc['pred']:>3})")
    if rs["invalid_count"]:
        print(f"   ⚠ 라벨집합 외/빈칸: {rs['invalid_count']}건")
    print("   [혼동행렬]")
    print("   " + fmt_confusion(rs["confusion"], SENTI_LABELS).replace("\n", "\n   "))
    if ghost:
        print(f"⚠ 유령 item_id(정답에 없음): {len(ghost)}건")
    print("-" * 64)
    for k, v in sc.items():
        print(f"  {k:<20} {v}")
    print("=" * 64)

    out = {"문의유형": rt, "감성": rs, "유령ID": ghost, "score": sc}
    Path("result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print("→ result.json 저장")


if __name__ == "__main__":
    main()
