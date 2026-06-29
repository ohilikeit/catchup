# -*- coding: utf-8 -*-
"""
쿠폰 성과 집계(ROI·적자) 과제 — 데이터셋/정답 생성기 (단일 입력 = spec.csv)

[아키타입] 집계/분석 (Computed, ±ε 허용오차 + 정수 Exact + 문자 Exact).
  "GA4 주문 export(1행=1주문) → 쿠폰별 성과표 + 전사 요약 1행".
  GA4에서 추출한 주문 로그를 쿠폰코드로 그룹바이해 쿠폰별 매출·할인·공헌이익·순이익·ROI를
  집계하고, 적자 쿠폰을 가려낸다. 핵심 함정: '취소' 주문은 쿠폰 성과에서 제외(기여 규칙).

[입력]
  eval/answer_key/spec.csv  ★ 시나리오 명세(단일 진실 소스). 헤더(정확히):
    coupon_id,name,사용건수,취소건수,정상매출_원,정상할인_원,취소매출_원,취소할인_원,주채널,zero_type,round_boundary
    · 사용건수 = '결제완료' 주문 수(쿠폰 성과 인정 대상). 취소건수 = '취소' 주문 수(성과 제외).
    · 정상매출_원/정상할인_원 = 결제완료 주문들의 매출/할인 합(이 합이 쿠폰 성과의 분자·분모).
    · 취소매출_원/취소할인_원 = 취소 주문들의 매출/할인 합(취소를 잘못 포함하면 부풀려지는 함정값).
    · 주채널 = 그 쿠폰 결제완료 매출을 가장 많이 끌어온 GA4 유입채널(argmax). 동점 금지(자기검증).
    · zero_type: none | 미사용 | 할인0.
        미사용 → 사용건수=0(아무도 안 쓴 쿠폰). 모든 수치=0, ROI=0.0, 주채널·적자여부 빈칸.
        할인0  → 사용건수>0 이지만 정상할인=0(무료배송 등). ROI=0.0(0으로 안 나눔), 적자 아님.
    · round_boundary(Y/N): Y면 정상매출이 ...5로 끝나 공헌이익(매출×0.3)이 X.5원 반올림 경계에 옴.

[출력]
  data/GA4_주문export.xlsx                  GA4 주문 로그(1행=1주문):
                  주문ID,쿠폰코드,유입채널,주문상태(결제완료/취소),매출액_원,할인액_원,주문일
  data/coupon_roi_template.xlsx            Part1 제출 양식(식별칸만, 빈 표 + '안내')
  data/summary_template.xlsx               Part2 제출 양식(빈 1행 + '안내')
  data/coupon_roi_given.xlsx               ★분리형: Part2 입력용 '정답 쿠폰별 집계표'
  eval/answer_key/coupon_roi_answer.xlsx   Part1 정답(쿠폰별 집계표)
  eval/answer_key/summary_answer.xlsx      Part2 정답(전체 요약 1행)

[기여 규칙 / 집계 규칙 (rulebook — 안내시트에 명시)]
  · 쿠폰 성과 인정 주문 = 주문상태 '결제완료'만. '취소' 주문은 매출·할인 모두 제외.
  · 사용건수 = 결제완료 주문 수 / 매출합계 = 결제완료 매출액_원 합 / 할인합계 = 결제완료 할인액_원 합
  · 공헌이익 = 매출합계 × 0.3 (공헌이익률 30% 고정). 원 단위 반올림(round-half-up).
  · 순이익  = 공헌이익 − 할인합계 (음수 가능)
  · ROI(%)  = 순이익 / 할인합계 × 100. 소수 첫째 자리 반올림. 할인합계=0 → 0.0.
  · 적자여부 = 순이익 < 0 이면 '적자', 아니면 빈칸.
  · 주채널   = 그 쿠폰 결제완료 매출을 가장 많이 끌어온 유입채널(GA4 채널그룹).
  · 전체ROI  = 총순이익 / 총할인 × 100 (★가중. 쿠폰별 ROI의 단순평균이 아님)

[정답 도출 철학] spec.csv 숫자를 그대로 베끼지 않는다 — GA4 주문 로그를 합성한 뒤 *다시
  그룹바이*(regroup_metrics)해 지표를 계산한다. spec 숫자는 로그 합성·자기검증(cross_check)에만
  쓴다 → 독립검증·결정성 성립.

[고정 기준일/시드]
  ASSIGN_DATE = 2026-06-28 (주문일 합성용, 채점엔 미사용). datetime.now() 금지.
  random.seed(20260628). spec.csv만 바꿔 재실행하면 로그·양식·정답이 항상 정합 재생성.
"""
import csv
import sys
import random
import datetime
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

# ----------------------------------------------------------------------------
# 경로 / 기준일 / 시드 (결정성)
# ----------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]          # .../4.coupon_roi
DATA = ROOT / "data"
ANS  = ROOT / "eval" / "answer_key"
CSV_PATH = ANS / "spec.csv"
DATA.mkdir(parents=True, exist_ok=True)
ANS.mkdir(parents=True, exist_ok=True)

ASSIGN_DATE = datetime.date(2026, 6, 28)             # 고정 기준일(주문일 합성용)
random.seed(20260628)

ZERO_TYPE = ("none", "미사용", "할인0")
MARGIN_RATE = Decimal("0.3")                         # 공헌이익률 30% 고정

# GA4 세션 기본 채널그룹(유입채널)
CHANNELS = ["Organic Search", "Paid Search", "Email", "Direct",
            "Social", "Referral", "Display"]

# 집계표 칸 / 채점 필드
# 출력 순서: 쿠폰코드,사용건수,매출합계,할인합계,공헌이익,순이익,ROI,주채널,적자여부
P1_COLS = ["쿠폰코드", "사용건수", "매출합계", "할인합계",
           "공헌이익", "순이익", "ROI", "주채널", "적자여부"]
SUM_COLS = ["총사용건수", "총매출", "총할인", "총공헌이익", "총순이익", "전체ROI", "적자쿠폰수"]


# ----------------------------------------------------------------------------
# 1) 입력 파싱 헬퍼
# ----------------------------------------------------------------------------
def int_or_none(v):
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    if s == "":
        return None
    return int(float(s))


def yn(v, default="N"):
    s = (v or "").strip().upper()
    return default if s == "" else s


# ── 반올림 프리미티브 (Decimal · round-half-up) ──────────────────────────────
def margin1(rev):
    """공헌이익 = 매출 × 0.3 을 원 단위(정수) 반올림(round-half-up). 음수 매출 없음."""
    q = (Decimal(rev) * MARGIN_RATE).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(q)


def rate1(num, den):
    """율(%) = num/den*100 을 소수 첫째 자리 반올림. den==0 → 0.0. num 음수 허용(ROI)."""
    if den == 0:
        return 0.0
    q = (Decimal(num) * 100 / Decimal(den)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return float(q)


def lands_on_margin(rev):
    """매출×0.3 이 X.5원 반올림 경계(소수부가 정확히 0.5, half-up≠truncate)인지."""
    raw = Decimal(rev) * MARGIN_RATE
    return (raw - raw.to_integral_value(rounding=ROUND_DOWN)) == Decimal("0.5")


# ----------------------------------------------------------------------------
# 2) spec.csv 로드 (fail-loud 검증)
# ----------------------------------------------------------------------------
def load_spec():
    if not CSV_PATH.exists():
        sys.exit(
            f"[중단] 입력 파일이 없습니다: {CSV_PATH}\n"
            f"  INPUT_GUIDE.md를 참고해 spec.csv를 먼저 채우세요(헤더 고정)."
        )
    rows = []
    seen = set()
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            cid = (r.get("coupon_id") or "").strip()
            name = (r.get("name") or "").strip()
            if not cid and not name:
                continue   # 빈 행 무시
            if not (cid and name):
                sys.exit(f"[중단] 행 {i+2}: coupon_id·name은 비울 수 없습니다.")
            if cid in seen:
                sys.exit(f"[중단] {cid}: coupon_id 중복. 쿠폰은 유일해야 합니다.")
            seen.add(cid)

            use   = int_or_none(r.get("사용건수"))
            canc  = int_or_none(r.get("취소건수"))
            n_rev = int_or_none(r.get("정상매출_원"))
            n_dis = int_or_none(r.get("정상할인_원"))
            c_rev = int_or_none(r.get("취소매출_원"))
            c_dis = int_or_none(r.get("취소할인_원"))
            chan  = (r.get("주채널") or "").strip()
            zt    = (r.get("zero_type") or "none").strip() or "none"
            rb    = yn(r.get("round_boundary"))

            for fname, fval in (("사용건수", use), ("취소건수", canc),
                                ("정상매출_원", n_rev), ("정상할인_원", n_dis),
                                ("취소매출_원", c_rev), ("취소할인_원", c_dis)):
                if fval is None or fval < 0:
                    sys.exit(f"[중단] {cid}: {fname}는 0 이상 정수여야 합니다('{fval}').")

            # ── zero_type 일관성 ─────────────────────────────────────────────
            if zt not in ZERO_TYPE:
                sys.exit(f"[중단] {cid}: zero_type '{zt}'는 허용되지 않음({'|'.join(ZERO_TYPE)}).")
            if zt == "미사용":
                if use != 0 or n_rev != 0 or n_dis != 0:
                    sys.exit(f"[중단] {cid}: zero_type=미사용 이면 사용건수·정상매출·정상할인=0 이어야 함.")
            if zt == "할인0" and not (use > 0 and n_dis == 0):
                sys.exit(f"[중단] {cid}: zero_type=할인0 이면 사용건수>0·정상할인=0 이어야 함"
                         f" (사용={use}, 정상할인={n_dis}).")
            if use == 0 and zt != "미사용":
                sys.exit(f"[중단] {cid}: 사용건수=0 이면 zero_type=미사용 으로 표시하세요.")
            if use > 0 and n_dis == 0 and zt != "할인0":
                sys.exit(f"[중단] {cid}: 정상할인=0(사용>0)이면 zero_type=할인0 으로 표시하세요.")
            if zt == "none" and not (use > 0 and n_dis > 0):
                sys.exit(f"[중단] {cid}: zero_type=none 이면 사용건수>0·정상할인>0 이어야 함.")

            # ── 결제완료 매출 일관성 ─────────────────────────────────────────
            if use > 0 and n_rev <= 0:
                sys.exit(f"[중단] {cid}: 사용건수={use}>0 인데 정상매출_원={n_rev} (양수여야 함).")
            if use == 0 and (n_rev != 0 or n_dis != 0):
                sys.exit(f"[중단] {cid}: 사용건수=0 인데 정상매출/정상할인≠0.")

            # ── 취소 매출 일관성 ─────────────────────────────────────────────
            if canc == 0 and (c_rev != 0 or c_dis != 0):
                sys.exit(f"[중단] {cid}: 취소건수=0 인데 취소매출/취소할인≠0 (취소 없으면 0).")
            if canc > 0 and c_rev <= 0:
                sys.exit(f"[중단] {cid}: 취소건수={canc}>0 인데 취소매출_원={c_rev} (양수여야 함).")

            # ── 주채널 ───────────────────────────────────────────────────────
            if use > 0:
                if chan not in CHANNELS:
                    sys.exit(f"[중단] {cid}: 주채널 '{chan}'는 허용 채널이 아님({'|'.join(CHANNELS)}).")
            else:
                if chan != "":
                    sys.exit(f"[중단] {cid}: 미사용 쿠폰은 주채널을 비워야 합니다('{chan}').")

            # ── round_boundary ───────────────────────────────────────────────
            if rb not in ("Y", "N"):
                sys.exit(f"[중단] {cid}: round_boundary '{rb}'는 허용되지 않음(Y|N).")
            if rb == "Y" and zt != "none":
                sys.exit(f"[중단] {cid}: round_boundary=Y 는 정상 쿠폰(none)에만 둘 수 있습니다.")

            rows.append(dict(
                coupon_id=cid, name=name,
                사용건수=use, 취소건수=canc,
                정상매출=n_rev, 정상할인=n_dis, 취소매출=c_rev, 취소할인=c_dis,
                주채널=chan, zero_type=zt, round_boundary=rb, _seq=len(rows),
            ))
    if not rows:
        sys.exit(f"[중단] {CSV_PATH} 에 쿠폰 행이 없습니다.")
    return rows


# ----------------------------------------------------------------------------
# 3) GA4 주문 로그 합성 — spec → 1행=1주문
# ----------------------------------------------------------------------------
def distribute(total, n):
    """금액 total 을 n행에 분배(합 = total). 몫을 깔고 나머지를 앞에서부터 +1."""
    if n == 0:
        return []
    base = total // n
    rem = total - base * n
    return [base + (1 if k < rem else 0) for k in range(n)]


def build_log(specs):
    """GA4 주문 로그 행 리스트를 만든다. 1행=1주문(결제완료 또는 취소)."""
    log_rows = []
    oid = 1
    for c in specs:
        use, canc = c["사용건수"], c["취소건수"]
        주채널 = c["주채널"]
        others = [ch for ch in CHANNELS if ch != 주채널] if 주채널 else CHANNELS

        # ── 결제완료 주문 ──────────────────────────────────────────────────
        rev = distribute(c["정상매출"], use)
        dis = distribute(c["정상할인"], use)
        # 주채널이 다수(>2/3)를 가져가고 앞쪽(나머지 분배가 얹힌 큰 행)에 배치 → argmax 보장
        mc = use - (use // 3)
        for k in range(use):
            ch = 주채널 if k < mc else others[(k - mc) % len(others)]
            d = ASSIGN_DATE - datetime.timedelta(days=(c["_seq"] * 5 + k) % 60 + 1)
            log_rows.append([
                f"T{oid:08d}", c["coupon_id"], ch, "결제완료",
                rev[k], dis[k], d.isoformat(),
            ])
            oid += 1

        # ── 취소 주문(성과 제외 — 함정) ─────────────────────────────────────
        rev2 = distribute(c["취소매출"], canc)
        dis2 = distribute(c["취소할인"], canc)
        for k in range(canc):
            ch = CHANNELS[(c["_seq"] + k) % len(CHANNELS)]
            d = ASSIGN_DATE - datetime.timedelta(days=(c["_seq"] * 5 + k) % 60 + 1)
            log_rows.append([
                f"T{oid:08d}", c["coupon_id"], ch, "취소",
                rev2[k], dis2[k], d.isoformat(),
            ])
            oid += 1
    return log_rows


# ----------------------------------------------------------------------------
# 4) 정답 도출 — GA4 로그를 *다시 그룹바이*해 지표 계산(spec 숫자 직접 안 베낌)
# ----------------------------------------------------------------------------
def regroup_metrics(log_rows):
    """GA4 주문 로그(list) → 쿠폰코드별 집계 dict. '결제완료'만 인정. 정답의 단일 출처."""
    agg = {}
    order = []
    for (oid, cid, chan, status, amt, disc, day) in log_rows:
        if cid not in agg:
            agg[cid] = dict(사용건수=0, 매출합계=0, 할인합계=0, _chan={})
            order.append(cid)
        if status != "결제완료":
            continue   # 취소 주문 제외(기여 규칙)
        a = agg[cid]
        a["사용건수"] += 1
        a["매출합계"] += int(amt or 0)
        a["할인합계"] += int(disc or 0)
        a["_chan"][chan] = a["_chan"].get(chan, 0) + int(amt or 0)

    metrics = {}
    used_order = []
    for cid in order:
        a = agg[cid]
        if a["사용건수"] == 0:
            continue   # 결제완료가 0건(취소만 있던 쿠폰) → 미사용으로 main에서 보충
        used_order.append(cid)
        매출 = a["매출합계"]
        할인 = a["할인합계"]
        공헌 = margin1(매출)
        순익 = 공헌 - 할인
        # 주채널 = 결제완료 매출 argmax (동점 시 채널명 순; cross_check가 strict 강제)
        주채널 = max(a["_chan"].items(), key=lambda kv: (kv[1], kv[0]))[0]
        metrics[cid] = dict(
            사용건수=a["사용건수"], 매출합계=매출, 할인합계=할인,
            공헌이익=공헌, 순이익=순익, ROI=rate1(순익, 할인),
            주채널=주채널, 적자여부=("적자" if 순익 < 0 else ""),
            _chan=a["_chan"],
        )
    return used_order, metrics


def summarize(order, metrics):
    """전체 요약 1행. 전체ROI=총순이익/총할인(가중), 적자쿠폰수=순이익<0 쿠폰 수."""
    t_use = sum(metrics[c]["사용건수"] for c in order)
    t_rev = sum(metrics[c]["매출합계"] for c in order)
    t_dis = sum(metrics[c]["할인합계"] for c in order)
    t_mar = sum(metrics[c]["공헌이익"] for c in order)
    t_net = sum(metrics[c]["순이익"] for c in order)
    n_def = sum(1 for c in order if metrics[c]["순이익"] < 0)
    return dict(
        총사용건수=t_use, 총매출=t_rev, 총할인=t_dis, 총공헌이익=t_mar,
        총순이익=t_net, 전체ROI=rate1(t_net, t_dis), 적자쿠폰수=n_def,
    )


# ----------------------------------------------------------------------------
# 4.5) 자기검증 (fail-loud) — 로그 재집계 == spec 의도 / 경계·주채널 실재
# ----------------------------------------------------------------------------
def cross_check(specs, order, metrics, log_rows):
    spec_by = {c["coupon_id"]: c for c in specs}
    # ① 로그 재집계 건수·매출·할인이 spec 와 일치(합성 무결성)
    for cid in order:
        c = spec_by[cid]
        m = metrics[cid]
        pairs = (("사용건수", c["사용건수"]), ("매출합계", c["정상매출"]),
                 ("할인합계", c["정상할인"]))
        for fname, want in pairs:
            if m[fname] != want:
                sys.exit(f"[중단] 자기검증 실패 {cid}: {fname} spec={want} ≠ 로그재집계={m[fname]}. 합성 버그.")
    # ② 사용건수>0 쿠폰이 로그에 결제완료로 실재
    for c in specs:
        if c["사용건수"] > 0 and c["coupon_id"] not in metrics:
            sys.exit(f"[중단] 자기검증 실패 {c['coupon_id']}: 사용건수>0 인데 결제완료 로그에 없음.")
    # ③ 주채널 argmax 가 spec 과 일치 + strict(동점 아님)
    for cid in order:
        c = spec_by[cid]
        chan_rev = metrics[cid]["_chan"]
        top = max(chan_rev.values())
        winners = [ch for ch, v in chan_rev.items() if v == top]
        if len(winners) != 1:
            sys.exit(f"[중단] 자기검증 실패 {cid}: 주채널 매출 동점({winners}). 결정성 위반.")
        if winners[0] != c["주채널"]:
            sys.exit(f"[중단] 자기검증 실패 {cid}: 주채널 spec={c['주채널']} ≠ 로그argmax={winners[0]}.")
    # ④ round_boundary=Y 면 공헌이익(매출×0.3)이 실제 X.5원 경계에 와야 함(트랩 실재성)
    for c in specs:
        if c["round_boundary"] == "Y":
            if not lands_on_margin(c["정상매출"]):
                sys.exit(f"[중단] 자기검증 실패 {c['coupon_id']}: round_boundary=Y 인데 "
                         f"공헌이익이 X.5원 경계에 오지 않음(정상매출 끝자리 5 필요).")
    # ⑤ 취소 주문이 spec 취소건수만큼 로그에 실재(취소 함정의 실재성 보장)
    canc_log = {}
    for (oid, cid, chan, status, amt, disc, day) in log_rows:
        if status == "취소":
            canc_log[cid] = canc_log.get(cid, 0) + 1
    for c in specs:
        want = c["취소건수"]
        got = canc_log.get(c["coupon_id"], 0)
        if want != got:
            sys.exit(f"[중단] 자기검증 실패 {c['coupon_id']}: 취소건수 spec={want} ≠ 로그={got}. 합성 버그.")


# ----------------------------------------------------------------------------
# 5) 엑셀 산출
# ----------------------------------------------------------------------------
HDR = Font(bold=True, color="FFFFFF")
HDRFILL = PatternFill("solid", fgColor="161616")
GUIDE = PatternFill("solid", fgColor="F4F4F4")
LOG_COLS = ["주문ID", "쿠폰코드", "유입채널", "주문상태", "매출액_원", "할인액_원", "주문일"]


def style_header(ws, ncol):
    for c in range(1, ncol + 1):
        cell = ws.cell(1, c)
        cell.font = HDR
        cell.fill = HDRFILL
        cell.alignment = Alignment(vertical="center")


def write_table(path, title, cols, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = title
    ws.append(cols)
    style_header(ws, len(cols))
    for r in rows:
        ws.append(r)
    ws.freeze_panes = "A2"
    wb.save(path)


def metric_row(cid, m, answer):
    """Part1 쿠폰별 집계표 한 줄. answer=False면 쿠폰코드만, True면 지표 채움."""
    if not answer:
        return [cid, "", "", "", "", "", "", "", ""]
    return [cid, m["사용건수"], m["매출합계"], m["할인합계"], m["공헌이익"],
            m["순이익"], m["ROI"], m["주채널"], m["적자여부"]]


def build_metrics(path, order, metrics, answer):
    wb = openpyxl.Workbook()
    g = wb.active
    g.title = "안내"
    guide = [
        ["항목", "설명"],
        ["행 단위", "쿠폰 1개 = 1행. data/GA4_주문export.xlsx 를 쿠폰코드로 그룹바이"],
        ["입력", "data/GA4_주문export.xlsx (1행=1주문). 쿠폰코드별로 묶어 건수/합계를 집계"],
        ["★기여 규칙(중요)", "쿠폰 성과로 인정하는 주문 = 주문상태 '결제완료'만. "
                          "'취소' 주문은 매출·할인 모두 제외(세지 않는다)"],
        ["사용건수", "그 쿠폰의 '결제완료' 주문 수(건수, 정수)"],
        ["매출합계", "그 쿠폰 '결제완료' 주문의 매출액_원 합(정수)"],
        ["할인합계", "그 쿠폰 '결제완료' 주문의 할인액_원 합(정수)"],
        ["공헌이익", "매출합계 × 0.3 (공헌이익률 30%). 원 단위 반올림(round-half-up, .5는 올림)"],
        ["순이익", "공헌이익 − 할인합계 (음수일 수 있음, 정수)"],
        ["ROI", "순이익 / 할인합계 × 100. 소수 첫째 자리 반올림(예: 33.25 → 33.3)"],
        ["주채널", "그 쿠폰 '결제완료' 매출을 가장 많이 끌어온 유입채널(GA4 채널그룹 이름 그대로)"],
        ["적자여부", "순이익 < 0 이면 '적자', 아니면 빈칸"],
        ["★공헌이익 반올림", "매출합계×0.3 이 X.5원이면 올린다(예: 300001.5 → 300002). "
                         "버림(truncate)으로 내면 1원 어긋나 오답"],
        ["★할인 0(분모0)", "할인합계=0 쿠폰(예: 무료배송)은 ROI=0.0 (0으로 나누지 않음). 적자 아님"],
        ["★미사용 쿠폰", "결제완료가 0건인 쿠폰은 모든 수치=0, ROI=0.0, 주채널·적자여부 빈칸"],
        ["★건수·합계·이익은 정수", "사용건수·매출합계·할인합계·공헌이익·순이익은 정수 정확(허용오차 없음)"],
        ["행 순서", "채점에 영향 없음(쿠폰코드로 대조)"],
    ]
    for r in guide:
        g.append(r)
    g.cell(1, 1).font = Font(bold=True)
    g.cell(1, 2).font = Font(bold=True)
    for row in g.iter_rows(min_row=1, max_row=g.max_row, max_col=2):
        row[0].fill = GUIDE
    g.column_dimensions["A"].width = 22
    g.column_dimensions["B"].width = 86

    s = wb.create_sheet("집계표")
    s.append(P1_COLS)
    style_header(s, len(P1_COLS))
    for cid in order:
        s.append(metric_row(cid, metrics[cid], answer))
    s.freeze_panes = "A2"
    wb.save(path)


def build_summary(path, summary, answer):
    wb = openpyxl.Workbook()
    g = wb.active
    g.title = "안내"
    guide = [
        ["항목", "설명"],
        ["행 단위", "전체 요약 = 단 1행. 모든 쿠폰을 합산한 전사(全社) 성과"],
        ["입력", "data/coupon_roi_given.xlsx (★제공된 정답 집계표). 1단계 집계를 틀려도 2단계는 영향 없음"],
        ["총사용건수/총매출/총할인", "모든 쿠폰의 사용건수/매출합계/할인합계 합(정수)"],
        ["총공헌이익/총순이익", "모든 쿠폰의 공헌이익/순이익 합(정수)"],
        ["★전체ROI", "총순이익 / 총할인 × 100 (가중). 쿠폰별 ROI의 단순평균이 아니다 — "
                   "할인이 큰 쿠폰이 더 큰 가중을 갖는다. 소수 첫째 자리 반올림"],
        ["적자쿠폰수", "순이익 < 0 인 쿠폰의 개수(정수)"],
        ["★반올림/허용오차", "ROI는 소수 첫째 자리 반올림, 채점 허용오차 ±0.1. 합계·개수는 정수 정확"],
        ["★단순평균 함정", "전체ROI를 '쿠폰 ROI들의 평균'으로 내면 오답 — 반드시 총순이익/총할인"],
    ]
    for r in guide:
        g.append(r)
    g.cell(1, 1).font = Font(bold=True)
    g.cell(1, 2).font = Font(bold=True)
    for row in g.iter_rows(min_row=1, max_row=g.max_row, max_col=2):
        row[0].fill = GUIDE
    g.column_dimensions["A"].width = 22
    g.column_dimensions["B"].width = 86

    s = wb.create_sheet("전체요약")
    s.append(SUM_COLS)
    style_header(s, len(SUM_COLS))
    if answer:
        s.append([summary["총사용건수"], summary["총매출"], summary["총할인"],
                  summary["총공헌이익"], summary["총순이익"],
                  summary["전체ROI"], summary["적자쿠폰수"]])
    else:
        s.append(["", "", "", "", "", "", ""])
    s.freeze_panes = "A2"
    wb.save(path)


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def main():
    specs = load_spec()
    print(f"[1/4] spec.csv 로드: 쿠폰 {len(specs)}개")

    log_rows = build_log(specs)
    n_done = sum(1 for r in log_rows if r[3] == "결제완료")
    n_canc = sum(1 for r in log_rows if r[3] == "취소")
    print(f"[2/4] GA4 주문 로그 합성: {len(log_rows)}행 (결제완료 {n_done} / 취소 {n_canc})")

    order, metrics = regroup_metrics(log_rows)
    cross_check(specs, order, metrics, log_rows)  # fail-loud: 로그재집계==spec / 주채널·경계·취소 실재
    summary = summarize(order, metrics)
    nz = sum(1 for c in specs if c["사용건수"] == 0)
    print(f"[3/4] 정답 도출(로그 재집계): 쿠폰 {len(order)} 사용 / 미사용 {nz} (자기검증 통과)")
    print(f"      전체: 총매출 {summary['총매출']} / 총할인 {summary['총할인']} / "
          f"전체ROI(가중) {summary['전체ROI']} / 적자쿠폰 {summary['적자쿠폰수']}개")

    # raw GA4 로그(학생 입력 원본)
    write_table(DATA / "GA4_주문export.xlsx", "주문", LOG_COLS, log_rows)

    # 빈 양식·given·정답 모두 spec 순서(미사용 포함)로 쿠폰 행을 깐다.
    full_order = [c["coupon_id"] for c in specs]
    full_metrics = {}
    for c in specs:
        cid = c["coupon_id"]
        if cid in metrics:
            full_metrics[cid] = metrics[cid]
        else:  # 미사용 쿠폰(결제완료 0건) — 0/0.0/빈칸 으로 채움
            full_metrics[cid] = dict(사용건수=0, 매출합계=0, 할인합계=0, 공헌이익=0,
                                     순이익=0, ROI=0.0, 주채널="", 적자여부="")
    build_metrics(DATA / "coupon_roi_template.xlsx", full_order, full_metrics, answer=False)
    build_metrics(ANS  / "coupon_roi_answer.xlsx",   full_order, full_metrics, answer=True)
    # 분리형: Part2 입력용 정답 집계표 = Part1 정답과 동일 내용
    build_metrics(DATA / "coupon_roi_given.xlsx",    full_order, full_metrics, answer=True)
    # Part2 제출양식(빈) + 정답  — 요약은 full_metrics 기준(미사용 포함)
    full_summary = summarize(full_order, full_metrics)
    build_summary(DATA / "summary_template.xlsx", full_summary, answer=False)
    build_summary(ANS  / "summary_answer.xlsx",   full_summary, answer=True)
    print("[4/4] 엑셀 산출 완료: GA4 로그 / 집계양식+given / 요약양식 / 정답키 2")

    print("=" * 60)
    print("생성 요약")
    print("  쿠폰 수:", len(specs), "(미사용:", nz, ")")
    print("  GA4 주문 로그 행:", len(log_rows))
    print("  전체ROI(가중):", full_summary["전체ROI"], "%  적자쿠폰:", full_summary["적자쿠폰수"], "개")
    print("  총매출:", full_summary["총매출"], " 총할인:", full_summary["총할인"])
    print("=" * 60)


if __name__ == "__main__":
    main()
