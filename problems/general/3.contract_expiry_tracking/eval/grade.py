# -*- coding: utf-8 -*-
"""
계약 기한 관리 — 채점 스크립트

사용:
  python eval/grade.py \
    --part1 data/contract_ledger_template.xlsx \
    --part2 data/expiry_targets_template.xlsx \
    --answer-dir eval/answer_key

자기채점(정답키 자기검증, 100점 기대):
  python eval/grade.py \
    --part1 eval/answer_key/contract_ledger_answer.xlsx \
    --part2 eval/answer_key/expiry_targets_answer.xlsx \
    --answer-dir eval/answer_key

배점: Part1 계약대장 셀 Exact 50 / Part2 대상표 Set-F1 40 / 무결성 10.
정답키는 build_dataset.py 가 생성한 eval/answer_key/*.xlsx 를 사용한다.
출력: 콘솔 표 + result.json (영역별 점수 / FP·FN 목록).
"""
import argparse
import json
import re
from pathlib import Path

import openpyxl

TARGETS = {"만료경과", "만료임박", "자동연장주의"}


# ---- 정규화 헬퍼 -----------------------------------------------------------
def norm_str(v):
    if v is None:
        return ""
    return re.sub(r"\s+", "", str(v)).strip()


def norm_int(v):
    """수치 셀: 빈칸 보존(0과 구분). 숫자·부호 외 모두 제거(₩·원·콤마·한글병기 흡수)."""
    if v is None or str(v).strip() == "":
        return ""
    s = str(v)
    # 엑셀이 숫자를 12000000.0 으로 줄 수 있으니 소수부 정리
    s = re.sub(r"\.0+$", "", s.strip())
    digits = re.sub(r"[^0-9-]", "", s)
    if digits in ("", "-"):
        return norm_str(v)
    try:
        return str(int(digits))
    except ValueError:
        return norm_str(v)


def norm_date(v):
    """날짜 셀 → YYYY-MM-DD. 4형식(ISO/한글/점/슬래시) + 엑셀 datetime 흡수. 빈칸 보존."""
    if v is None or str(v).strip() == "":
        return ""
    s = str(v).strip()
    # 엑셀 datetime: '2026-08-07 00:00:00' 또는 ISO 'T'
    s = s.split(" ")[0].split("T")[0]
    nums = re.findall(r"\d+", s)
    if len(nums) >= 3:
        y, m, d = int(nums[0]), int(nums[1]), int(nums[2])
        if y >= 1900 and 1 <= m <= 12 and 1 <= d <= 31:
            return f"{y:04d}-{m:02d}-{d:02d}"
    return norm_str(v)


def norm_yn(v):
    """자동갱신: Y/N 정규화. 예/아니오/O/X/유/무/있음/없음 흡수."""
    s = norm_str(v).upper()
    yes = {"Y", "예", "O", "유", "있음", "TRUE", "1"}
    no = {"N", "아니오", "아니요", "X", "무", "없음", "FALSE", "0"}
    if s in yes:
        return "Y"
    if s in no:
        return "N"
    return s


def norm_target(v):
    """대상유형 문자열 정규화(공백 제거 + 동치 표기 흡수)."""
    s = norm_str(v)
    alias = {
        "만료경과": "만료경과", "만료됨": "만료경과", "기간만료": "만료경과", "만료": "만료경과",
        "만료임박": "만료임박", "갱신대상": "만료임박", "만료예정": "만료임박", "임박": "만료임박",
        "자동연장주의": "자동연장주의", "자동갱신주의": "자동연장주의",
        "자동연장위험": "자동연장주의", "자동갱신위험": "자동연장주의", "통지필요": "자동연장주의",
    }
    return alias.get(s, s)


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
        out.append({head[i]: r[i] for i in range(min(len(head), len(r)))})
    return out


# ---- Part 1: 계약대장 (셀 단위 Exact) --------------------------------------
LEDGER_FIELDS = {
    "계약명": norm_str,
    "거래상대방": norm_str,
    "계약유형": norm_str,
    "시작일": norm_date,
    "종료일": norm_date,
    "계약금액": norm_int,
    "자동갱신": norm_yn,
    "갱신통지일": norm_int,
}


def ledgerkey(r):
    return norm_str(r.get("계약번호"))


def grade_part1(sub, ans):
    A = {ledgerkey(r): r for r in ans}
    S = {ledgerkey(r): r for r in sub}
    per_field = {f: [0, 0] for f in LEDGER_FIELDS}   # [correct, total]
    detail = []
    for key, arow in A.items():
        srow = S.get(key, {})
        for f, fn in LEDGER_FIELDS.items():
            exp = fn(arow.get(f))
            got = fn(srow.get(f))
            ok = (exp == got)
            per_field[f][1] += 1
            if ok:
                per_field[f][0] += 1
            elif len(detail) < 80:
                detail.append({"계약": key, "필드": f, "정답": exp, "제출": got})
    cells_ok = sum(v[0] for v in per_field.values())
    cells_tot = sum(v[1] for v in per_field.values())
    return {
        "정확셀": cells_ok, "전체셀": cells_tot,
        "셀정확도": round(cells_ok / cells_tot, 4) if cells_tot else 0,
        "계약총수": len(A),
        "필드별": {f: round(v[0] / v[1], 3) if v[1] else 0 for f, v in per_field.items()},
        "오답상세": detail,
    }


# ---- Part 2: 대상표 (Set-F1) ----------------------------------------------
def targetset(rows):
    s = set()
    for r in rows:
        ct = norm_str(r.get("계약번호"))
        tg = norm_target(r.get("대상유형"))
        if ct.startswith("예시"):
            continue
        if ct and tg:
            s.add((ct, tg))
    return s


def grade_part2(sub, ans, valid_keys):
    A = targetset(ans)
    S = targetset(sub)
    tp = A & S
    fp = S - A
    fn = A - S
    if not A and not S:
        prec = rec = f1 = 1.0
    else:
        prec = len(tp) / len(S) if S else 0.0
        rec = len(tp) / len(A) if A else 0.0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
    ghost = sorted({(ct, tg) for (ct, tg) in S if ct not in valid_keys})
    bad_type = sorted({(ct, tg) for (ct, tg) in S if tg not in TARGETS})
    return {
        "정답대상수": len(A), "제출대상수": len(S),
        "정밀도": round(prec, 4), "재현율": round(rec, 4), "F1": round(f1, 4),
        "오탐_FP수": len(fp), "누락_FN수": len(fn),
        "유령계약": ghost[:50], "허용외대상유형": bad_type[:50],
        "FP샘플": sorted(fp)[:20], "FN샘플": sorted(fn)[:20],
    }


# ---- 배점 -----------------------------------------------------------------
# Part1 셀정확도 50(추출이 핵심) / Part2 Set-F1 40 / 무결성 10.
def score(p1, p2):
    s1 = p1["셀정확도"] * 50
    s2 = p2["F1"] * 40
    viol = len(p2["유령계약"]) + len(p2["허용외대상유형"])
    s3 = max(0, 10 - viol * 0.5)
    return {"Part1_계약대장(50)": round(s1, 1), "Part2_F1(40)": round(s2, 1),
            "Part2_무결성(10)": round(s3, 1), "총점(100)": round(s1 + s2 + s3, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part1", required=True)
    ap.add_argument("--part2", required=True)
    ap.add_argument("--answer-dir", required=True)
    args = ap.parse_args()

    adir = Path(args.answer_dir)
    p1_sub = load_sheet(args.part1, "계약대장")
    p1_ans = load_sheet(adir / "contract_ledger_answer.xlsx", "계약대장")
    p2_sub = load_sheet(args.part2, "대상목록")
    p2_ans = load_sheet(adir / "expiry_targets_answer.xlsx", "대상목록")

    valid_keys = {ledgerkey(r) for r in p1_ans}

    r1 = grade_part1(p1_sub, p1_ans)
    r2 = grade_part2(p2_sub, p2_ans, valid_keys)
    sc = score(r1, r2)

    print("=" * 60)
    print(" 채점 결과 (계약 기한 관리)")
    print("=" * 60)
    print(f"[Part1] 셀정확도 {r1['셀정확도']*100:.1f}% ({r1['정확셀']}/{r1['전체셀']}) | "
          f"계약 {r1['계약총수']}건")
    print(f"        필드별: {r1['필드별']}")
    print(f"[Part2] F1 {r2['F1']*100:.1f}% (정밀도 {r2['정밀도']*100:.1f} / 재현율 {r2['재현율']*100:.1f}) | "
          f"FP {r2['오탐_FP수']} / FN {r2['누락_FN수']} | 정답대상 {r2['정답대상수']} / 제출 {r2['제출대상수']}")
    if r2["유령계약"]:
        print(f"        ⚠ 유령 계약(미존재 번호): {len(r2['유령계약'])}건")
    if r2["허용외대상유형"]:
        print(f"        ⚠ 허용 외 대상유형: {len(r2['허용외대상유형'])}건")
    print("-" * 60)
    for k, v in sc.items():
        print(f"  {k:<20} {v}")
    print("=" * 60)

    out = {"part1": r1, "part2": r2, "score": sc}
    Path("result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print("→ result.json 저장")


if __name__ == "__main__":
    main()
