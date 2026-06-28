# -*- coding: utf-8 -*-
"""
이메일 캠페인 성과 집계 과제 — 데이터셋/정답 생성기 (단일 입력 = spec.csv)

[아키타입] 집계/분석 (Computed, ±ε 허용오차 채점). "정형 로그 → 그룹별 요약 지표".
  발송 로그(1행=1발송)를 campaign_id로 그룹바이해 캠페인별 성과표 + 전체 요약 1행을 집계한다.
  합계·건수 = 정수 정확(Exact), 율·평균 = 소수 첫째 자리 반올림(±0.1 허용오차).

[입력]
  eval/answer_key/spec.csv  ★ 시나리오 명세(단일 진실 소스). 헤더(정확히):
    campaign_id,name,발송수,오픈수,클릭수,전환수,매출합계_원,zero_denom,round_boundary
    · 퍼널 단조성(fail-loud): 전환수 <= 클릭수 <= 오픈수 <= 발송수. 위반 시 즉시 종료.
    · zero_denom: none | 발송0 | 오픈0.
        발송0 → 발송수=0(빈 캠페인). 모든 율=0.0, ARPU=0.
        오픈0 → 발송수>0 이지만 오픈수=0(아무도 안 엶). 율은 정상 계산(0.0).
    · round_boundary(Y/N): Y면 그 캠페인의 어떤 율이 X.X5 반올림 경계에 오도록 설계됨(자기검증).
    · 매출합계_원: 전환 행에 분배(합 = 매출합계). 전환수=0이면 매출합계=0(fail-loud).

[출력]
  data/발송로그.xlsx                       raw 로그(1행=1발송):
                  발송ID,campaign_id,수신자ID,발송일,오픈여부(Y/N),클릭여부(Y/N),전환여부(Y/N),매출액_원
  data/campaign_metrics_template.xlsx      Part1 제출 양식(식별칸만, 빈 표 + '안내')
  data/summary_template.xlsx               Part2 제출 양식(빈 1행 + '안내')
  data/campaign_metrics_given.xlsx         ★분리형: Part2 입력용 '정답 캠페인별 집계표'
  eval/answer_key/campaign_metrics_answer.xlsx  Part1 정답(캠페인별 집계표)
  eval/answer_key/summary_answer.xlsx           Part2 정답(전체 요약 1행)

[집계 규칙 (rulebook — 안내시트에 명시)]
  · 오픈율 = 오픈수/발송수×100, 클릭율 = 클릭수/발송수×100, 전환율 = 전환수/발송수×100
  · ARPU  = 매출합계/발송수
  · 반올림: 소수 첫째 자리(반올림, round-half-up). 채점 허용오차 ±0.1. 합계·건수는 정수 정확.
  · 분모 0(발송0): 모든 율 = 0.0, ARPU = 0.
  · 전체 전환율 = 총전환/총발송 (★가중. 캠페인 전환율의 단순평균이 아님)
  · 전체 ARPU  = 총매출/총발송

[정답 도출 철학] spec.csv의 숫자를 그대로 베끼지 않는다 — 생성된 발송로그를 *다시 그룹바이*해
  지표를 계산한다(regroup_metrics). spec 숫자는 로그 합성과 자기검증(cross_check)에만 쓴다 →
  독립검증·결정성 성립.

[고정 기준일/시드]
  ASSIGN_DATE = 2026-06-28 (발송일 합성용, 채점엔 미사용). datetime.now() 금지.
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
ROOT = Path(__file__).resolve().parents[2]          # .../2.email_campaign_metrics
DATA = ROOT / "data"
ANS  = ROOT / "eval" / "answer_key"
CSV_PATH = ANS / "spec.csv"
DATA.mkdir(parents=True, exist_ok=True)
ANS.mkdir(parents=True, exist_ok=True)

ASSIGN_DATE = datetime.date(2026, 6, 28)             # 고정 기준일(발송일 합성용)
random.seed(20260628)

ZERO_DENOM = ("none", "발송0", "오픈0")

# 집계표 칸 / 채점 필드
# 출력 순서: campaign_id,발송수,오픈수,클릭수,전환수,오픈율,클릭율,전환율,매출합계,ARPU
P1_COLS = ["campaign_id", "발송수", "오픈수", "클릭수", "전환수",
           "오픈율", "클릭율", "전환율", "매출합계", "ARPU"]
SUM_COLS = ["총발송", "총오픈", "총클릭", "총전환", "전체전환율", "총매출", "전체ARPU"]


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


# ── 반올림(round-half-up, 소수 첫째 자리) ───────────────────────────────────
def rate1(num, den):
    """율(%) = num/den*100 을 소수 첫째 자리 반올림. den==0 → 0.0."""
    if den == 0:
        return 0.0
    q = (Decimal(num) * 100 / Decimal(den)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return float(q)


def arpu1(rev, den):
    """ARPU = rev/den 을 소수 첫째 자리 반올림. den==0 → 0.0."""
    if den == 0:
        return 0.0
    q = (Decimal(rev) / Decimal(den)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return float(q)


def lands_on_boundary(num, den):
    """num/den*100 이 X.X5 반올림 경계(둘째 소수가 정확히 5, half-up≠truncate)인지."""
    if den == 0:
        return False
    raw = Decimal(num) * 100 / Decimal(den)
    scaled = raw * 10  # 1-decimal 스케일
    return (scaled - scaled.to_integral_value(rounding=ROUND_DOWN)) == Decimal("0.5")


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
            cid = (r.get("campaign_id") or "").strip()
            name = (r.get("name") or "").strip()
            if not cid and not name:
                continue   # 빈 행 무시
            if not (cid and name):
                sys.exit(f"[중단] 행 {i+2}: campaign_id·name은 비울 수 없습니다.")
            if cid in seen:
                sys.exit(f"[중단] {cid}: campaign_id 중복. 캠페인은 유일해야 합니다.")
            seen.add(cid)

            send  = int_or_none(r.get("발송수"))
            opens = int_or_none(r.get("오픈수"))
            clk   = int_or_none(r.get("클릭수"))
            conv  = int_or_none(r.get("전환수"))
            rev   = int_or_none(r.get("매출합계_원"))
            zd    = (r.get("zero_denom") or "none").strip() or "none"
            rb    = yn(r.get("round_boundary"))

            for fname, fval in (("발송수", send), ("오픈수", opens), ("클릭수", clk),
                                ("전환수", conv), ("매출합계_원", rev)):
                if fval is None or fval < 0:
                    sys.exit(f"[중단] {cid}: {fname}는 0 이상 정수여야 합니다('{fval}').")

            # ── 퍼널 단조성 fail-loud ────────────────────────────────────────
            if not (conv <= clk <= opens <= send):
                sys.exit(f"[중단] {cid}: 퍼널 단조성 위반 — "
                         f"전환({conv})<=클릭({clk})<=오픈({opens})<=발송({send}) 이어야 합니다.")

            # ── zero_denom 일관성 ────────────────────────────────────────────
            if zd not in ZERO_DENOM:
                sys.exit(f"[중단] {cid}: zero_denom '{zd}'는 허용되지 않음({'|'.join(ZERO_DENOM)}).")
            if zd == "발송0" and send != 0:
                sys.exit(f"[중단] {cid}: zero_denom=발송0 인데 발송수={send} (0이어야 함).")
            if zd == "오픈0" and not (send > 0 and opens == 0):
                sys.exit(f"[중단] {cid}: zero_denom=오픈0 이면 발송수>0·오픈수=0 이어야 함"
                         f" (발송={send}, 오픈={opens}).")
            if send == 0 and zd != "발송0":
                sys.exit(f"[중단] {cid}: 발송수=0 이면 zero_denom=발송0 으로 표시하세요.")

            # ── 매출↔전환 일관성 ─────────────────────────────────────────────
            if conv == 0 and rev != 0:
                sys.exit(f"[중단] {cid}: 전환수=0 인데 매출합계_원={rev} (전환 없으면 매출 0).")
            if conv > 0 and rev <= 0:
                sys.exit(f"[중단] {cid}: 전환수={conv}>0 인데 매출합계_원={rev} (양수여야 함).")
            if rb not in ("Y", "N"):
                sys.exit(f"[중단] {cid}: round_boundary '{rb}'는 허용되지 않음(Y|N).")

            rows.append(dict(
                campaign_id=cid, name=name,
                발송수=send, 오픈수=opens, 클릭수=clk, 전환수=conv,
                매출합계=rev, zero_denom=zd, round_boundary=rb, _seq=len(rows),
            ))
    if not rows:
        sys.exit(f"[중단] {CSV_PATH} 에 캠페인 행이 없습니다.")
    return rows


# ----------------------------------------------------------------------------
# 3) 발송로그 합성 — spec → 1행=1발송
# ----------------------------------------------------------------------------
def distribute_revenue(total, n):
    """매출 total 을 전환 n행에 분배(합 = total). 몫을 깔고 나머지를 앞에서부터 +1."""
    if n == 0:
        return []
    base = total // n
    rem  = total - base * n
    out = [base + (1 if k < rem else 0) for k in range(n)]
    return out


def build_log(specs):
    """발송로그 행 리스트 + 거래(campaign) 객체 리스트를 만든다."""
    log_rows = []
    sid = 1
    for c in specs:
        send, opens, clk, conv = c["발송수"], c["오픈수"], c["클릭수"], c["전환수"]
        rev_each = distribute_revenue(c["매출합계"], conv)
        # 오픈/클릭/전환은 퍼널 부분집합: 앞쪽 conv행=전환(=클릭=오픈), 그다음 click, open ...
        # 행 인덱스 0..send-1, open: 0..opens-1, click: 0..clk-1, conv: 0..conv-1
        day_jitter = [(c["_seq"] * 7 + j) % 30 + 1 for j in range(send)]
        for j in range(send):
            is_open = j < opens
            is_clk  = j < clk
            is_conv = j < conv
            amount  = rev_each[j] if is_conv else 0
            d = ASSIGN_DATE - datetime.timedelta(days=day_jitter[j])
            log_rows.append([
                f"S{sid:07d}", c["campaign_id"], f"{c['campaign_id']}-U{j+1:05d}",
                d.isoformat(),
                "Y" if is_open else "N",
                "Y" if is_clk else "N",
                "Y" if is_conv else "N",
                amount,
            ])
            sid += 1
    return log_rows


# ----------------------------------------------------------------------------
# 4) 정답 도출 — 발송로그를 *다시 그룹바이*해 지표 계산(spec 숫자 직접 안 베낌)
# ----------------------------------------------------------------------------
def regroup_metrics(log_rows):
    """발송로그(list) → campaign_id별 집계 dict. 정답의 단일 출처."""
    agg = {}
    order = []
    for (sid, cid, uid, day, op, ck, cv, amt) in log_rows:
        if cid not in agg:
            agg[cid] = dict(발송수=0, 오픈수=0, 클릭수=0, 전환수=0, 매출합계=0)
            order.append(cid)
        a = agg[cid]
        a["발송수"] += 1
        if op == "Y":
            a["오픈수"] += 1
        if ck == "Y":
            a["클릭수"] += 1
        if cv == "Y":
            a["전환수"] += 1
        a["매출합계"] += int(amt or 0)
    metrics = {}
    for cid in order:
        a = agg[cid]
        send = a["발송수"]
        metrics[cid] = dict(
            발송수=send, 오픈수=a["오픈수"], 클릭수=a["클릭수"], 전환수=a["전환수"],
            매출합계=a["매출합계"],
            오픈율=rate1(a["오픈수"], send),
            클릭율=rate1(a["클릭수"], send),
            전환율=rate1(a["전환수"], send),
            ARPU=arpu1(a["매출합계"], send),
        )
    return order, metrics


def summarize(order, metrics):
    """전체 요약 1행. 전체전환율=총전환/총발송(가중), 전체ARPU=총매출/총발송."""
    t_send = sum(metrics[c]["발송수"] for c in order)
    t_open = sum(metrics[c]["오픈수"] for c in order)
    t_clk  = sum(metrics[c]["클릭수"] for c in order)
    t_conv = sum(metrics[c]["전환수"] for c in order)
    t_rev  = sum(metrics[c]["매출합계"] for c in order)
    return dict(
        총발송=t_send, 총오픈=t_open, 총클릭=t_clk, 총전환=t_conv,
        전체전환율=rate1(t_conv, t_send), 총매출=t_rev, 전체ARPU=arpu1(t_rev, t_send),
    )


# ----------------------------------------------------------------------------
# 4.5) 자기검증 (fail-loud) — 로그 재집계 == spec 의도 / 경계 플래그 일치
# ----------------------------------------------------------------------------
def cross_check(specs, order, metrics):
    spec_by = {c["campaign_id"]: c for c in specs}
    # ① 로그 재집계 건수·매출이 spec 와 일치해야 한다(합성 무결성)
    for cid in order:
        c = spec_by[cid]
        m = metrics[cid]
        for f in ("발송수", "오픈수", "클릭수", "전환수", "매출합계"):
            if c[f] != m[f]:
                sys.exit(f"[중단] 자기검증 실패 {cid}: {f} spec={c[f]} ≠ 로그재집계={m[f]}. 합성 버그.")
    # ② 모든 spec 캠페인이 로그에 존재(발송0 빈 캠페인 제외 — 로그 행 0)
    for c in specs:
        if c["발송수"] > 0 and c["campaign_id"] not in metrics:
            sys.exit(f"[중단] 자기검증 실패 {c['campaign_id']}: 발송>0 인데 로그에 없음.")
    # ③ round_boundary=Y 면 어떤 율이 실제 X.X5 경계에 와야 한다(트랩 실재성)
    for c in specs:
        if c["round_boundary"] == "Y":
            send = c["발송수"]
            hit = (lands_on_boundary(c["오픈수"], send) or
                   lands_on_boundary(c["클릭수"], send) or
                   lands_on_boundary(c["전환수"], send))
            if not hit:
                sys.exit(f"[중단] 자기검증 실패 {c['campaign_id']}: round_boundary=Y 인데 "
                         f"어떤 율도 X.X5 경계에 오지 않음. 카운트를 조정하세요.")


# ----------------------------------------------------------------------------
# 5) 엑셀 산출
# ----------------------------------------------------------------------------
HDR = Font(bold=True, color="FFFFFF")
HDRFILL = PatternFill("solid", fgColor="161616")
GUIDE = PatternFill("solid", fgColor="F4F4F4")
LOG_COLS = ["발송ID", "campaign_id", "수신자ID", "발송일",
            "오픈여부", "클릭여부", "전환여부", "매출액_원"]


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
    """Part1 캠페인별 집계표 한 줄. answer=False면 campaign_id만, True면 지표 채움."""
    if not answer:
        return [cid, "", "", "", "", "", "", "", "", ""]
    return [cid, m["발송수"], m["오픈수"], m["클릭수"], m["전환수"],
            m["오픈율"], m["클릭율"], m["전환율"], m["매출합계"], m["ARPU"]]


def build_metrics(path, order, metrics, answer):
    wb = openpyxl.Workbook()
    g = wb.active
    g.title = "안내"
    guide = [
        ["항목", "설명"],
        ["행 단위", "캠페인 1개 = 1행. data/발송로그.xlsx 를 campaign_id로 그룹바이"],
        ["입력", "data/발송로그.xlsx (1행=1발송). campaign_id별로 묶어 건수/합계를 집계"],
        ["발송수", "그 캠페인의 발송로그 행 수(건수, 정수)"],
        ["오픈수/클릭수/전환수", "오픈여부/클릭여부/전환여부 = Y 인 행 수(건수, 정수)"],
        ["매출합계", "그 캠페인 발송로그의 매출액_원 합(정수)"],
        ["오픈율", "오픈수 / 발송수 × 100. 소수 첫째 자리 반올림(예: 33.25 → 33.3)"],
        ["클릭율", "클릭수 / 발송수 × 100. 소수 첫째 자리 반올림"],
        ["전환율", "전환수 / 발송수 × 100. 소수 첫째 자리 반올림"],
        ["ARPU", "매출합계 / 발송수. 소수 첫째 자리 반올림(발송 1건당 평균매출)"],
        ["★반올림", "소수 첫째 자리에서 반올림(round-half-up). 0.5는 올린다(33.25→33.3). 채점 허용오차 ±0.1"],
        ["★분모 0(발송0)", "발송수=0 인 캠페인은 모든 율=0.0, ARPU=0 (0으로 나누지 않음)"],
        ["★건수·합계는 정수", "발송수·오픈수·클릭수·전환수·매출합계는 정수 정확(허용오차 없음)"],
        ["행 순서", "채점에 영향 없음(campaign_id로 대조)"],
    ]
    for r in guide:
        g.append(r)
    g.cell(1, 1).font = Font(bold=True)
    g.cell(1, 2).font = Font(bold=True)
    for row in g.iter_rows(min_row=1, max_row=g.max_row, max_col=2):
        row[0].fill = GUIDE
    g.column_dimensions["A"].width = 22
    g.column_dimensions["B"].width = 82

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
        ["행 단위", "전체 요약 = 단 1행. 모든 캠페인을 합산한 전사(全社) 성과"],
        ["입력", "data/campaign_metrics_given.xlsx (★제공된 정답 집계표). 1단계 집계를 틀려도 2단계는 영향 없음"],
        ["총발송/총오픈/총클릭/총전환", "모든 캠페인의 발송수/오픈수/클릭수/전환수 합(정수)"],
        ["총매출", "모든 캠페인 매출합계의 합(정수)"],
        ["★전체전환율", "총전환 / 총발송 × 100 (가중). 캠페인별 전환율의 단순평균이 아니다 — "
                      "발송수가 큰 캠페인이 더 큰 가중을 갖는다. 소수 첫째 자리 반올림"],
        ["전체ARPU", "총매출 / 총발송. 소수 첫째 자리 반올림"],
        ["★반올림/허용오차", "율·평균은 소수 첫째 자리 반올림, 채점 허용오차 ±0.1. 합계는 정수 정확"],
        ["★단순평균 함정", "전체전환율을 '캠페인 전환율들의 평균'으로 내면 오답 — 반드시 총전환/총발송"],
    ]
    for r in guide:
        g.append(r)
    g.cell(1, 1).font = Font(bold=True)
    g.cell(1, 2).font = Font(bold=True)
    for row in g.iter_rows(min_row=1, max_row=g.max_row, max_col=2):
        row[0].fill = GUIDE
    g.column_dimensions["A"].width = 22
    g.column_dimensions["B"].width = 82

    s = wb.create_sheet("전체요약")
    s.append(SUM_COLS)
    style_header(s, len(SUM_COLS))
    if answer:
        s.append([summary["총발송"], summary["총오픈"], summary["총클릭"], summary["총전환"],
                  summary["전체전환율"], summary["총매출"], summary["전체ARPU"]])
    else:
        s.append(["", "", "", "", "", "", ""])
    s.freeze_panes = "A2"
    wb.save(path)


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def main():
    specs = load_spec()
    print(f"[1/4] spec.csv 로드: 캠페인 {len(specs)}개")

    log_rows = build_log(specs)
    print(f"[2/4] 발송로그 합성: {len(log_rows)}행 (1행=1발송)")

    order, metrics = regroup_metrics(log_rows)
    cross_check(specs, order, metrics)     # fail-loud: 로그재집계 == spec / 경계 실재
    summary = summarize(order, metrics)
    nz = sum(1 for c in specs if c["발송수"] == 0)
    print(f"[3/4] 정답 도출(로그 재집계): 캠페인 {len(order)} / 발송0 {nz} (자기검증 통과)")
    print(f"      전체: 총발송 {summary['총발송']} / 총전환 {summary['총전환']} / "
          f"전체전환율(가중) {summary['전체전환율']} / 전체ARPU {summary['전체ARPU']}")

    # raw 로그(학생 입력 원본) — 발송0 캠페인도 집계표엔 나오지만 로그엔 행 0
    write_table(DATA / "발송로그.xlsx", "발송로그", LOG_COLS, log_rows)
    # Part1 제출양식(빈) + 정답
    # 빈 양식·given·정답 모두 spec 순서(발송0 포함)로 캠페인 행을 깐다.
    full_order = [c["campaign_id"] for c in specs]
    full_metrics = {}
    for c in specs:
        cid = c["campaign_id"]
        if cid in metrics:
            full_metrics[cid] = metrics[cid]
        else:  # 발송0 빈 캠페인 — 로그 행이 없으니 0/0.0 으로 채움
            full_metrics[cid] = dict(발송수=0, 오픈수=0, 클릭수=0, 전환수=0, 매출합계=0,
                                     오픈율=0.0, 클릭율=0.0, 전환율=0.0, ARPU=0.0)
    build_metrics(DATA / "campaign_metrics_template.xlsx", full_order, full_metrics, answer=False)
    build_metrics(ANS  / "campaign_metrics_answer.xlsx",   full_order, full_metrics, answer=True)
    # 분리형: Part2 입력용 정답 집계표 = Part1 정답과 동일 내용
    build_metrics(DATA / "campaign_metrics_given.xlsx",    full_order, full_metrics, answer=True)
    # Part2 제출양식(빈) + 정답  — 요약은 full_metrics 기준(발송0 포함)
    full_summary = summarize(full_order, full_metrics)
    build_summary(DATA / "summary_template.xlsx", full_summary, answer=False)
    build_summary(ANS  / "summary_answer.xlsx",   full_summary, answer=True)
    print("[4/4] 엑셀 산출 완료: 발송로그 / 집계양식+given / 요약양식 / 정답키 2")

    print("=" * 60)
    print("생성 요약")
    print("  캠페인 수:", len(specs), "(발송0:", nz, ")")
    print("  발송로그 행:", len(log_rows))
    print("  전체전환율(가중):", full_summary["전체전환율"], "%  전체ARPU:", full_summary["전체ARPU"])
    print("  총매출:", full_summary["총매출"])
    print("=" * 60)


if __name__ == "__main__":
    main()
