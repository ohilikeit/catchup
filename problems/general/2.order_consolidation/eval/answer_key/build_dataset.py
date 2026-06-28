# -*- coding: utf-8 -*-
"""
다채널 주문 통합(취합/통합) 과제 — 데이터셋/정답 생성기 (단일 입력 = orders.csv)

[아키타입] 취합/통합 (Set(행)+Exact(정규화 셀) 채점). "행을 보존하며 합친다".
  채널 3곳(웹·전화·제휴)의 주문 파일은 양식(컬럼명·날짜형식·금액표기)이 제각각이다.
  같은 주문번호가 여러 채널에 중복 등장한다(dedup 대상). 이들을 표준 스키마 한 표로
  통합·중복제거·정규화한다. 한 채널에만 있는 주문도 보존한다.

[입력]
  eval/answer_key/orders.csv   ★ canonical 1행=1주문(단일 진실 소스). 헤더(정확히):
    order_id,고객명,상품명,수량,금액_원,주문일,channels,표기변형,결측
    · channels = 파이프구분(web|partner|phone 중 1~다). 2개 이상이면 그 주문이 여러
      소스에 중복 렌더(dedup 대상). 한 채널만이면 단일 채널 전용(보존 대상).
    · 표기변형 = none | 상품명공백 | 고객명공백  (해당 텍스트에 앞뒤 공백 주입 → trim 함정)
    · 결측     = none | 금액결측 | 주문일결측    (그 칸을 전 채널에서 빈값으로 → 빈칸 보존 함정)

[양식이 다른 3소스 — 코드가 canonical을 각 소스 스키마/형식으로 렌더]
  data/웹주문.xlsx     주문번호, 고객명, 상품, 수량, 금액(천단위 콤마 문자열 "1,200,000"), 주문일시(YYYY-MM-DD HH:MM)
  data/전화주문.csv    order_id, name, item, qty, amount(정수), date(YYYY/MM/DD)
  data/제휴주문.xlsx   협력사주문ID, 구매자, 품목, 개수, 결제액(정수), 일자(MM/DD/YYYY)

[표준 스키마 (정답 = 통합 주문표, Part1 단일 산출)]
  주문번호, 고객명, 상품명, 수량, 금액_원(정수), 주문일(YYYY-MM-DD), 출처채널

[통합 규칙 (rulebook — 안내시트에 명시)]
  · dedup : 같은 주문번호가 여러 채널 → 1행. 출처채널 = 등장 채널을 정렬·파이프결합("partner|web").
  · 값 충돌 시 우선순위 : web > partner > phone (높은 우선순위 채널 값을 택한다).
  · 정규화 : 날짜 3형식 → YYYY-MM-DD, 금액 콤마 제거→정수, 앞뒤 공백 trim, 컬럼명 표준화.
  · 한 채널만의 주문도 보존한다.

[고정 기준일/시드]
  ASSIGN_DATE = 2026-06-28 (웹 주문일시 시각 합성 등에 사용, 날짜 채점엔 미사용). datetime.now() 금지.
  random.seed(20260628). orders.csv만 바꿔 재실행하면 3소스·양식·정답이 항상 정합 재생성.

[정답 도출 철학] orders.csv를 직접 베끼지 않는다 — 생성된 3소스를 *다시 파싱*하고 통합 규칙을
  *다시 적용*해(정규화·dedup·우선순위) 통합표를 재구성한다(consolidate). canonical 플래그는
  데이터 생성과 자기검증(cross-check)에만 쓴다 → 결정성·독립검증 성립.
"""
import csv
import sys
import random
import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

# ----------------------------------------------------------------------------
# 경로 / 기준일 / 시드 (결정성 3종)
# ----------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]          # .../2.order_consolidation
DATA = ROOT / "data"
ANS  = ROOT / "eval" / "answer_key"
CSV_PATH = ANS / "orders.csv"
DATA.mkdir(parents=True, exist_ok=True)
ANS.mkdir(parents=True, exist_ok=True)

ASSIGN_DATE = datetime.date(2026, 6, 28)             # 고정 기준일
random.seed(20260628)

# ── 통합 규칙(rulebook) 상수 ────────────────────────────────────────────────
PRIORITY = {"web": 0, "partner": 1, "phone": 2}      # 값 충돌 시 우선순위(낮을수록 우선)
CHANNELS = set(PRIORITY)
VARIANTS = {"none", "상품명공백", "고객명공백"}
MISSING  = {"none", "금액결측", "주문일결측"}

STD_COLS = ["주문번호", "고객명", "상품명", "수량", "금액_원", "주문일", "출처채널"]


# ----------------------------------------------------------------------------
# 1) 입력/정규화 헬퍼 (학생이 적용할 정규화 = 정답 도출에도 동일 적용)
# ----------------------------------------------------------------------------
def int_or_none(v):
    """빈칸/None → None, 그 외 정수로(콤마·공백 제거)."""
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    if s == "":
        return None
    return int(float(s))


def to_std_date(s):
    """날짜 3형식 → YYYY-MM-DD. 빈칸 → ''. (웹 주문일시의 시각은 떼어낸다.)"""
    s = ("" if s is None else str(s)).strip()
    if s == "":
        return ""
    if " " in s:                       # 'YYYY-MM-DD HH:MM' → 날짜부만
        s = s.split()[0]
    if "-" in s:                       # 이미 YYYY-MM-DD
        return s
    if "/" in s:
        a, b, c = s.split("/")
        if len(a) == 4:                # YYYY/MM/DD
            return f"{a}-{b.zfill(2)}-{c.zfill(2)}"
        return f"{c}-{a.zfill(2)}-{b.zfill(2)}"   # MM/DD/YYYY
    return s


def trim_text(s):
    """앞뒤 공백 trim(내부 공백은 보존 — 읽기 좋은 정답)."""
    return ("" if s is None else str(s)).strip()


# ----------------------------------------------------------------------------
# 2) orders.csv 로드 (fail-loud 검증)
# ----------------------------------------------------------------------------
def load_orders():
    if not CSV_PATH.exists():
        sys.exit(f"[중단] 입력 파일이 없습니다: {CSV_PATH}\n  INPUT_GUIDE.md 참고해 orders.csv를 먼저 채우세요(헤더 고정).")
    rows, seen = [], set()
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            oid = (r.get("order_id") or "").strip()
            if not oid:
                if any((r.get(k) or "").strip() for k in ("고객명", "상품명", "channels")):
                    sys.exit(f"[중단] 행 {i+2}: order_id가 비었습니다.")
                continue            # 빈 행 무시
            if oid in seen:
                sys.exit(f"[중단] {oid}: order_id 중복 — canonical 주문은 유일해야 합니다.")
            seen.add(oid)

            name = (r.get("고객명") or "").strip()
            prod = (r.get("상품명") or "").strip()
            if not name or not prod:
                sys.exit(f"[중단] {oid}: 고객명·상품명은 비울 수 없습니다.")

            qty = int_or_none(r.get("수량"))
            if qty is None or qty <= 0:
                sys.exit(f"[중단] {oid}: 수량은 양의 정수여야 합니다('{r.get('수량')}').")

            chans = [c.strip() for c in (r.get("channels") or "").split("|") if c.strip()]
            if not chans:
                sys.exit(f"[중단] {oid}: channels는 비울 수 없습니다(web|partner|phone 중 1~다).")
            for c in chans:
                if c not in CHANNELS:
                    sys.exit(f"[중단] {oid}: 알 수 없는 채널 '{c}' (허용: web|partner|phone).")
            if len(set(chans)) != len(chans):
                sys.exit(f"[중단] {oid}: channels 내 채널 중복 — {chans}.")

            variant = (r.get("표기변형") or "none").strip() or "none"
            missing = (r.get("결측") or "none").strip() or "none"
            if variant not in VARIANTS:
                sys.exit(f"[중단] {oid}: 표기변형 '{variant}' 허용 안 됨({'|'.join(sorted(VARIANTS))}).")
            if missing not in MISSING:
                sys.exit(f"[중단] {oid}: 결측 '{missing}' 허용 안 됨({'|'.join(sorted(MISSING))}).")

            amount = int_or_none(r.get("금액_원"))
            date_s = to_std_date(r.get("주문일"))
            # ── 입력 모순 fail-loud (결측 ↔ 값 모순 차단) ────────────────────
            if missing == "금액결측" and amount is not None:
                sys.exit(f"[중단] {oid}: 결측=금액결측인데 금액_원={amount} (빈칸이어야 함).")
            if missing != "금액결측" and (amount is None or amount <= 0):
                sys.exit(f"[중단] {oid}: 금액_원은 양의 정수여야 합니다('{r.get('금액_원')}').")
            if missing == "주문일결측" and date_s != "":
                sys.exit(f"[중단] {oid}: 결측=주문일결측인데 주문일={date_s} (빈칸이어야 함).")
            if missing != "주문일결측" and date_s == "":
                sys.exit(f"[중단] {oid}: 주문일은 비울 수 없습니다(결측=주문일결측이 아니면).")

            rows.append(dict(
                order_id=oid, 고객명=name, 상품명=prod, 수량=qty,
                금액_원=amount, 주문일=date_s,
                channels=chans, 표기변형=variant, 결측=missing,
                _seq=len(rows),
            ))
    if not rows:
        sys.exit(f"[중단] {CSV_PATH} 에 주문 행이 없습니다.")
    return rows


# ----------------------------------------------------------------------------
# 3) 3소스 렌더 — canonical → (웹/전화/제휴) 각 스키마·형식으로. 표기변형·결측·값충돌 주입.
# ----------------------------------------------------------------------------
def pad_spaces(text):
    """앞뒤 공백 주입(표기변형 함정). trim 정규화로 사라짐."""
    return " " * random.randint(1, 2) + text + " " * random.randint(1, 2)


def fmt_comma(n):
    return "" if n is None else f"{n:,}"


def fmt_web_dt(date_s):
    if date_s == "":
        return ""
    return f"{date_s} {random.randint(8,19):02d}:{random.randint(0,59):02d}"


def fmt_slash_ymd(date_s):           # 전화: YYYY/MM/DD
    if date_s == "":
        return ""
    y, m, d = date_s.split("-")
    return f"{y}/{m}/{d}"


def fmt_slash_mdy(date_s):           # 제휴: MM/DD/YYYY
    if date_s == "":
        return ""
    y, m, d = date_s.split("-")
    return f"{m}/{d}/{y}"


def shift_date(date_s, days):
    if date_s == "":
        return ""
    d = datetime.date.fromisoformat(date_s) + datetime.timedelta(days=days)
    return d.isoformat()


def build_sources(orders):
    """canonical → 3소스 행 리스트(웹/전화/제휴). 다채널이면 같은 주문번호를 여러 소스에 렌더하고
       비우선 채널에 값 충돌(우선순위 함정)을 주입한다. 출력은 학생이 보는 셀 그대로(문자열 포함)."""
    web_rows, phone_rows, partner_rows = [], [], []
    conflict_n = 0
    for c in orders:
        present = c["channels"]
        winner = min(present, key=PRIORITY.get)

        # 값 충돌 주입 대상 필드(결측 필드는 제외). 다채널일 때만.
        conflict_field = None
        if len(present) >= 2:
            cand = ["금액", "수량", "주문일"]
            if c["결측"] == "금액결측":
                cand.remove("금액")
            if c["결측"] == "주문일결측":
                cand.remove("주문일")
            if cand:
                conflict_field = random.choice(cand)
                conflict_n += 1

        for ch in sorted(present, key=PRIORITY.get):
            is_winner = (ch == winner)
            name, prod = c["고객명"], c["상품명"]
            qty, amount, date_s = c["수량"], c["금액_원"], c["주문일"]

            # 표기변형(앞뒤 공백) — 모든 채널 렌더에 적용(trim 함정)
            if c["표기변형"] == "고객명공백":
                name = pad_spaces(name)
            elif c["표기변형"] == "상품명공백":
                prod = pad_spaces(prod)

            # 값 충돌 — 비우선 채널만 다른 값(우선순위 함정). 우선 채널 = canonical 그대로.
            if conflict_field and not is_winner:
                if conflict_field == "금액" and amount is not None:
                    amount = amount + random.choice([50000, -30000, 77000, -12000, 100000])
                elif conflict_field == "수량":
                    qty = qty + random.choice([1, 2, 3])
                elif conflict_field == "주문일" and date_s != "":
                    date_s = shift_date(date_s, random.choice([1, -1, 2, -2]))

            if ch == "web":
                web_rows.append([c["order_id"], name, prod, qty, fmt_comma(amount), fmt_web_dt(date_s)])
            elif ch == "phone":
                phone_rows.append([c["order_id"], name, prod, qty,
                                   "" if amount is None else amount, fmt_slash_ymd(date_s)])
            elif ch == "partner":
                partner_rows.append([c["order_id"], name, prod, qty,
                                     "" if amount is None else amount, fmt_slash_mdy(date_s)])
    return web_rows, phone_rows, partner_rows, conflict_n


# ----------------------------------------------------------------------------
# 4) 정답 도출 — 3소스를 *다시 파싱* + 통합 규칙 *재적용* (orders.csv 직접 안 읽음)
# ----------------------------------------------------------------------------
def parse_sources(web_rows, phone_rows, partner_rows):
    """3소스 셀 → 표준 정규화 레코드(주문번호별 채널 출현). 학생 정규화와 동일 규칙."""
    recs = []
    for r in web_rows:
        recs.append(dict(주문번호=str(r[0]).strip(), 고객명=trim_text(r[1]), 상품명=trim_text(r[2]),
                         수량=int_or_none(r[3]), 금액_원=int_or_none(r[4]), 주문일=to_std_date(r[5]),
                         channel="web"))
    for r in phone_rows:
        recs.append(dict(주문번호=str(r[0]).strip(), 고객명=trim_text(r[1]), 상품명=trim_text(r[2]),
                         수량=int_or_none(r[3]), 금액_원=int_or_none(r[4]), 주문일=to_std_date(r[5]),
                         channel="phone"))
    for r in partner_rows:
        recs.append(dict(주문번호=str(r[0]).strip(), 고객명=trim_text(r[1]), 상품명=trim_text(r[2]),
                         수량=int_or_none(r[3]), 금액_원=int_or_none(r[4]), 주문일=to_std_date(r[5]),
                         channel="partner"))
    return recs


def consolidate(recs):
    """주문번호로 그룹 → 1행. 값 = 우선순위(web>partner>phone) 채널 값. 출처채널 = 정렬·파이프결합."""
    groups = {}
    for rec in recs:
        groups.setdefault(rec["주문번호"], []).append(rec)
    out = {}
    for oid, g in groups.items():
        g_sorted = sorted(g, key=lambda x: PRIORITY[x["channel"]])
        win = g_sorted[0]                                  # 최우선 채널
        chans = "|".join(sorted({x["channel"] for x in g}))   # 알파벳 정렬
        out[oid] = dict(
            주문번호=oid, 고객명=win["고객명"], 상품명=win["상품명"],
            수량=win["수량"], 금액_원=win["금액_원"], 주문일=win["주문일"],
            출처채널=chans,
        )
    return out


def expected_from_canonical(orders):
    """canonical 플래그가 의도한 통합행(자기검증 전용)."""
    exp = {}
    for c in orders:
        exp[c["order_id"]] = dict(
            주문번호=c["order_id"], 고객명=c["고객명"], 상품명=c["상품명"],
            수량=c["수량"], 금액_원=c["금액_원"], 주문일=c["주문일"],
            출처채널="|".join(sorted(set(c["channels"]))),
        )
    return exp


def _cmp_cell(v):
    """비교용 정규화(빈칸/None 통일)."""
    if v is None:
        return ""
    return str(v).replace(" ", "")


def cross_check(consolidated, expected):
    """소스 재구성(consolidate) == 플래그 의도(expected) 자기검증. 불일치=생성기 버그 → 중단."""
    if set(consolidated) != set(expected):
        miss = set(expected) - set(consolidated)
        extra = set(consolidated) - set(expected)
        sys.exit(f"[중단] 자기검증 실패: 주문번호 집합 불일치. 누락={sorted(miss)[:5]} 유령={sorted(extra)[:5]}")
    for oid in expected:
        a, b = consolidated[oid], expected[oid]
        for col in STD_COLS:
            if _cmp_cell(a[col]) != _cmp_cell(b[col]):
                sys.exit(f"[중단] 자기검증 실패 {oid}: '{col}' 재구성={a[col]!r} ≠ 의도={b[col]!r}. 생성기/입력 모순.")


# ----------------------------------------------------------------------------
# 5) 엑셀/CSV 산출
# ----------------------------------------------------------------------------
HDR = Font(bold=True, color="FFFFFF")
HDRFILL = PatternFill("solid", fgColor="161616")
GUIDE = PatternFill("solid", fgColor="F4F4F4")

WEB_COLS     = ["주문번호", "고객명", "상품", "수량", "금액", "주문일시"]
PHONE_COLS   = ["order_id", "name", "item", "qty", "amount", "date"]
PARTNER_COLS = ["협력사주문ID", "구매자", "품목", "개수", "결제액", "일자"]


def style_header(ws, ncol):
    for c in range(1, ncol + 1):
        cell = ws.cell(1, c)
        cell.font = HDR
        cell.fill = HDRFILL
        cell.alignment = Alignment(vertical="center")


def write_xlsx(path, title, cols, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = title
    ws.append(cols)
    style_header(ws, len(cols))
    for r in rows:
        ws.append(r)
    ws.freeze_panes = "A2"
    wb.save(path)


def write_csv(path, cols, rows):
    with Path(path).open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)


def std_row(rec):
    """통합표 한 줄(표준 스키마, 정답값)."""
    return [rec["주문번호"], rec["고객명"], rec["상품명"],
            "" if rec["수량"] is None else rec["수량"],
            "" if rec["금액_원"] is None else rec["금액_원"],
            rec["주문일"] or "", rec["출처채널"]]


def build_consolidated(path, ordered_recs, answer):
    """통합 주문표. answer=False → 빈 양식 + '안내'(+예시행). True → 정답 채움."""
    wb = openpyxl.Workbook()
    g = wb.active
    g.title = "안내"
    guide = [
        ["항목", "설명"],
        ["할 일", "웹·전화·제휴 3개 주문 파일을 표준 한 표로 통합한다. 같은 주문번호가 여러 채널에 "
                "중복으로 있으면 1행으로 합친다(중복 제거). 한 채널에만 있는 주문도 빠짐없이 넣는다."],
        ["입력 파일", "data/웹주문.xlsx · data/전화주문.csv · data/제휴주문.xlsx (양식이 셋 다 다름)"],
        ["행 단위", "통합 주문 1건 = 주문번호 1개. 결과 표에 주문번호는 딱 한 번만 나온다."],
        ["표준 컬럼(7칸)", "주문번호 · 고객명 · 상품명 · 수량 · 금액_원 · 주문일 · 출처채널"],
        ["컬럼명 표준화", "웹: 주문번호/고객명/상품/수량/금액/주문일시 · 전화: order_id/name/item/qty/amount/date "
                       "· 제휴: 협력사주문ID/구매자/품목/개수/결제액/일자 → 모두 위 표준 컬럼으로 맞춘다."],
        ["★중복 제거", "같은 주문번호가 여러 채널에 있으면 1행으로 합친다(여러 줄로 두면 감점)."],
        ["★출처채널", "그 주문이 등장한 채널을 알파벳순으로 정렬해 파이프(|)로 잇는다. 예) web+partner → 'partner|web'."],
        ["★값 충돌 우선순위", "같은 주문번호인데 채널마다 값이 다르면(금액·수량·날짜 등) 우선순위 높은 채널 값을 택한다: "
                          "web > partner > phone. (예: 웹 금액과 전화 금액이 다르면 웹 금액)"],
        ["날짜 정규화", "주문일은 YYYY-MM-DD로 통일한다. 웹 'YYYY-MM-DD HH:MM'(시각 떼기) · 전화 'YYYY/MM/DD' "
                     "· 제휴 'MM/DD/YYYY' 를 모두 변환."],
        ["금액 정규화", "금액_원은 정수로. 웹의 천단위 콤마 '1,200,000' → 1200000 (콤마 제거)."],
        ["공백 정규화", "고객명·상품명의 앞뒤 공백은 제거(trim)한다."],
        ["★빈칸 보존", "원본에 금액/주문일이 비어 있으면 그 칸을 비운다. 0과 빈칸은 다르다(빈칸을 0으로 채우면 감점)."],
        ["행 순서", "채점에 영향 없음(주문번호로 대조). 중복 행은 1개로 간주."],
        ["예시", "아래 '통합주문' 시트의 예시 행 참고(실제 답 아님, 채점 시 무시)."],
    ]
    for r in guide:
        g.append(r)
    g.cell(1, 1).font = Font(bold=True)
    g.cell(1, 2).font = Font(bold=True)
    for row in g.iter_rows(min_row=1, max_row=g.max_row, max_col=2):
        row[0].fill = GUIDE
    g.column_dimensions["A"].width = 20
    g.column_dimensions["B"].width = 90

    s = wb.create_sheet("통합주문")
    s.append(STD_COLS)
    style_header(s, len(STD_COLS))
    if answer:
        for rec in ordered_recs:
            s.append(std_row(rec))
    else:
        s.append(["예시ORD-0001", "홍길동", "예시 상품", 1, 10000, "2026-06-01", "partner|web"])
    s.freeze_panes = "A2"
    wb.save(path)


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def main():
    orders = load_orders()
    print(f"[1/4] orders.csv 로드: canonical 주문 {len(orders)}건")

    web_rows, phone_rows, partner_rows, conflict_n = build_sources(orders)
    print(f"[2/4] 3소스 렌더: 웹 {len(web_rows)} / 전화 {len(phone_rows)} / 제휴 {len(partner_rows)} 행"
          f" (값충돌 주입 {conflict_n}건)")

    # 정답 도출: 소스 재파싱 → 통합 규칙 재적용
    recs = parse_sources(web_rows, phone_rows, partner_rows)
    consolidated = consolidate(recs)
    expected = expected_from_canonical(orders)
    cross_check(consolidated, expected)        # fail-loud 자기검증
    single = sum(1 for c in orders if len(c["channels"]) == 1)
    multi = len(orders) - single
    print(f"[3/4] 통합 도출: 통합행 {len(consolidated)}건 (단일채널 {single} / 다채널 {multi}) — 자기검증 통과")

    ordered = [consolidated[c["order_id"]] for c in orders]   # 출력 순서 = canonical 순

    # 3소스 (학생 입력 원본)
    write_xlsx(DATA / "웹주문.xlsx",   "웹주문",   WEB_COLS,     web_rows)
    write_csv(DATA / "전화주문.csv",   PHONE_COLS, phone_rows)
    write_xlsx(DATA / "제휴주문.xlsx", "제휴주문", PARTNER_COLS, partner_rows)
    # 제출 양식(빈) + 정답
    build_consolidated(DATA / "consolidated_template.xlsx", ordered, answer=False)
    build_consolidated(ANS  / "consolidated_answer.xlsx",   ordered, answer=True)
    print("[4/4] 산출 완료: 3소스(웹xlsx/전화csv/제휴xlsx) / 통합양식 / 통합정답")

    n_blank_amt = sum(1 for r in ordered if r["금액_원"] is None)
    n_blank_dt  = sum(1 for r in ordered if not r["주문일"])
    print("=" * 60)
    print("생성 요약")
    print("  canonical 주문:", len(orders))
    print("  통합 정답 행:", len(ordered))
    print("  소스 행 합계(중복 포함):", len(web_rows) + len(phone_rows) + len(partner_rows))
    print("  단일채널 / 다채널:", single, "/", multi)
    print("  값충돌 주입:", conflict_n)
    print("  금액 빈칸 / 주문일 빈칸:", n_blank_amt, "/", n_blank_dt)
    print("=" * 60)


if __name__ == "__main__":
    main()
