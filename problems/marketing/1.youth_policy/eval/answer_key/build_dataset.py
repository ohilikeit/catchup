# -*- coding: utf-8 -*-
"""
청년정책 타게팅 과제 — 데이터셋/정답 생성기 (단일 입력 = policies.csv)

[입력]
  eval/answer_key/policies.csv   ★ 사용자가 실제 정책 데이터로 채우는 단일 진실 소스.
                                 헤더(정확히):
                                 policy_id,name,field,poster_file,region,age_min,age_max,
                                 employment,company_size,income_max_month,income_median_pct,
                                 income_year_max,no_house,enroll_status,marital,matchable,
                                 apply_start,apply_end
                                 · company_size : 기업규모 요건(예 '중소기업'). 비면 무관.
                                 · income_max_month : 본인 월소득 절대 상한(원). 비면 무관.
                                 · income_median_pct : 가구 기준중위소득 비율(%). 비면 무관.
                                   상한은 회원 '가구원수'별로 달라진다(median_cap). income_max_month와 별개 축.
                                 · income_year_max : 연 소득 상한(원). 비면 무관(월소득과 별개 축).
                                 · matchable : 'Y'(기본)|'N'. N=회원 명단으로 자격을 확인 불가한
                                   정책 → 아무에게도 추천하지 않음(매칭 0건, 의도된 결함).
  데이터/1_포스터/*                실제 정책 홍보 포스터(사용자가 직접 넣음).
                                 ── 이 스크립트는 이 폴더를 절대 만들거나 지우거나 건드리지 않는다.

[출력]
  데이터/2_회원명단.xlsx               회원 DB (약 1,000명, 정책 axes 기반 경계 함정 자동 포함)
  데이터/1_정책정리표_제출용.xlsx      Part1 제출 양식(식별칸만 채운 빈 표 + '안내' 시트)
  데이터/2_추천리스트_제출용.xlsx      Part2 제출 양식(빈 표 + '안내' + 예시행)
  eval/answer_key/1_정책정리표_정답.xlsx   Part1 정답(eval 내부라 영어 유지)
  eval/answer_key/2_추천리스트_정답.xlsx      Part2 정답 ((회원ID,정책ID) 매칭 전부, 영어 유지)

[고정 기준일]
  ASSIGN_DATE = 2026-06-28 (신입 마케터가 과제를 받은 날). datetime.now() 절대 금지.
  ★ 신청 날짜는 보지 않는다(자격만). apply_start/apply_end는 참고용으로 남아 있을 뿐
    매칭/채점에 쓰지 않는다. 매칭 대상 정책 = matchable!='N' 인 모든 정책.
  ASSIGN_DATE는 오직 '만 나이' 계산에만 쓴다(날짜 필터 없음).

policies.csv만 바꿔서 재실행하면 회원 DB·양식·정답이 항상 정합하게 재생성된다.
"""
import csv
import sys
import random
import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

# ----------------------------------------------------------------------------
# 경로 / 기준일 / 시드
# ----------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]          # .../1.youth_policy
DATA = ROOT / "데이터"
ANS  = ROOT / "eval" / "answer_key"
CSV_PATH = ANS / "policies.csv"
# 주의: 데이터/1_포스터/ 의 실제 포스터는 사용자가 넣는다 → 코드는 손대지 않는다.
DATA.mkdir(parents=True, exist_ok=True)
ANS.mkdir(parents=True, exist_ok=True)

# ── 과제 부여 기준일(고정) ─────────────────────────────────────────────────
# 이 상수 하나만 고정돼 있으면 만 나이·매칭 정답이 언제 재생성해도 동일하다.
# (신청 날짜 필터는 없다 — ASSIGN_DATE는 만 나이 계산에만 쓴다.)
ASSIGN_DATE = datetime.date(2026, 6, 28)                  # ← 고정 기준일(만 나이용)
random.seed(20260628)

# 서울 25 자치구 (지역 매칭의 기준 집합)
SEOUL25 = ["종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구",
           "강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구",
           "구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구"]

# 시도별 자치구 풀 (회원 거주지 합성·비매칭 주소 생성에 사용)
SIDO_GU = {
    "서울특별시": SEOUL25,
    "경기도": ["고양시 덕양구", "성남시 분당구", "수원시 영통구", "부천시 원미구"],
    "인천광역시": ["부평구", "남동구"],
}
# 서울 자치구별 동 (표기 변형 함정 생성용)
DONG = {g: [g[:-1] + "1동", g[:-1] + "2동", "중앙동"] for g in SEOUL25}

SURNAME = list("김이박최정강조윤장임한오서신권황안송류전홍")
GIVEN = ["민준","서연","도윤","지우","예준","하은","시우","지민","주원","서아","건우","수빈",
         "현우","지호","유진","준서","채원","지훈","다은","승현","나윤","우진","서윤","동현"]
EDU = ["고졸", "대학재학", "대졸", "대학원졸"]
# 재학상태 / 혼인여부 — 정책의 학력(enroll)·혼인(marital) 요건과 교집합을 이루는 회원 속성
ENROLL_POOL = ["재학", "휴학", "졸업", "비학생", "졸업", "비학생"]   # 졸업/비학생 비중 ↑
MARITAL_POOL = ["미혼", "미혼", "미혼", "기혼"]
# 기업규모(company_size 축) — 미취업자는 '없음', 그 외(재직/단기근로)는 아래 풀에서 무작위
COMPANY_POOL = ["중소기업", "중소기업", "중견기업", "대기업", "공공기관"]
# 연소득(원)(income_year_max 축) — 월소득과 별개 축
INCOME_YEAR_POOL = [0, 18_000_000, 28_000_000, 36_000_000, 45_000_000,
                    52_000_000, 60_000_000, 75_000_000, 90_000_000]

# 가구원수별 '기준 중위소득'(월, 원) — 2025년 보건복지부 고시값. 고정 상수(결정성 1급).
# income_median_pct 축은 '월소득 절대상한'과 달리 가구원수에 따라 상한이 달라진다
# (예: 중위소득 150% 상한 = 이 표의 값 × 1.5). 회원 '가구원수' 컬럼과 짝을 이룬다.
MEDIAN_INCOME = {1: 2_392_013, 2: 3_932_658, 3: 5_025_353, 4: 6_097_773,
                 5: 7_108_192, 6: 8_064_805, 7: 8_988_428}


def median_income(household):
    """가구원수 → 기준 중위소득(월, 원). 7인 초과는 1인 증가당 (7인-6인)만큼 가산(복지부 산식)."""
    if household in MEDIAN_INCOME:
        return MEDIAN_INCOME[household]
    step = MEDIAN_INCOME[7] - MEDIAN_INCOME[6]
    return MEDIAN_INCOME[7] + step * (household - 7)


def median_cap(household, pct):
    """가구원수 household, 비율 pct(%) → 월 소득 상한(원, 원단위 반올림 = 0.5 올림)."""
    return (median_income(household) * pct + 50) // 100


# ----------------------------------------------------------------------------
# 1) 입력 파싱 헬퍼
# ----------------------------------------------------------------------------
def int_or_none(v):
    """빈칸/None → None, 그 외 정수로(콤마·공백 제거)."""
    if v is None:
        return None
    s = str(v).replace(",", "").strip()
    if s == "":
        return None
    return int(float(s))


# ── 지역 파싱(일반화): 시도/자치구를 주소 문자열에서 뽑아낸다 ───────────────
# 비서울 시도 키워드 → 정식명. (서울 자치구명 substring보다 먼저 검사해야
#  '부산광역시 중구'·'경기도 강서구' 등이 서울로 오판정되지 않는다.)
NONSEOUL_SIDO = {
    "경기": "경기도", "인천": "인천광역시", "부산": "부산광역시", "대구": "대구광역시",
    "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시", "세종": "세종특별자치시",
    "강원": "강원특별자치도", "충청북": "충청북도", "충북": "충청북도",
    "충청남": "충청남도", "충남": "충청남도", "전라북": "전북특별자치도", "전북": "전북특별자치도",
    "전라남": "전라남도", "전남": "전라남도", "경상북": "경상북도", "경북": "경상북도",
    "경상남": "경상남도", "경남": "경상남도", "제주": "제주특별자치도",
}


def detect_sido(addr):
    """주소(또는 정책 region) 문자열에서 시도를 판별한다."""
    if not addr:
        return None
    for key, full in NONSEOUL_SIDO.items():   # 명시적 비서울 시도 우선
        if key in addr:
            return full
    if "서울" in addr or any(g in addr for g in SEOUL25):
        return "서울특별시"
    for tok in addr.split():                  # 일반 폴백: 시도형 접미사 토큰
        if tok.endswith(("특별자치시", "특별자치도", "특별시", "광역시", "도")):
            return tok
    return None


def detect_gu(addr):
    """주소(또는 정책 district)에서 자치구 토큰을 뽑는다.
       서울25를 우선 보고, 없으면 '구'로 끝나는 토큰(비서울 일반구 등)을 본다."""
    if not addr:
        return None
    for g in SEOUL25:
        if g in addr:
            return g
    for tok in addr.split():
        if tok.endswith("구"):
            return tok
    return None


def parse_policy_region(region_str):
    """정책 region을 3형식으로 일반화: 전국 / <시도> / <시도> <자치구>.
       반환: dict(nation=bool, sido=str|None, district=str|None)
       district는 원문(예: '관악구' 또는 '고양시 덕양구')을 보존한다."""
    s = (region_str or "").strip()
    if s == "" or s == "전국":
        return dict(nation=True, sido=None, district=None)
    toks = s.split()
    sido = detect_sido(s) or toks[0]
    district = " ".join(toks[1:]) if len(toks) > 1 else None
    return dict(nation=False, sido=sido, district=district)


def region_match(member_addr, region_parsed):
    """회원 거주지가 정책 지역 요건을 만족하는지.
       전국→통과 / 시도만→시도 일치 / 시도+자치구→시도 AND 자치구 일치."""
    if region_parsed["nation"]:
        return True
    if detect_sido(member_addr) != region_parsed["sido"]:
        return False
    if region_parsed["district"] is None:
        return True
    member_gu = detect_gu(member_addr)
    policy_gu = detect_gu(region_parsed["district"]) or region_parsed["district"]
    return member_gu == policy_gu


# ----------------------------------------------------------------------------
# 2) policies.csv 로드
# ----------------------------------------------------------------------------
def load_policies():
    if not CSV_PATH.exists():
        sys.exit(
            f"[중단] 입력 파일이 없습니다: {CSV_PATH}\n"
            f"  INPUT_GUIDE.md를 참고해 policies.csv를 먼저 채우세요(헤더 고정)."
        )
    rows = []
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            pid = (r.get("policy_id") or "").strip()
            if not pid:
                continue   # 빈 행 무시
            region_raw = (r.get("region") or "").strip()
            if not region_raw:   # 빈 region이 조용히 '전국'이 되어 대량 오발송하는 것 방지(fail loud)
                sys.exit(f"[중단] {pid}: region이 비어 있습니다. '전국'·'서울특별시'·'서울특별시 관악구' "
                         f"처럼 명시하세요(빈칸 금지).")
            emp_raw = (r.get("employment") or "").strip() or "무관"
            if emp_raw not in ("무관", "미취업", "재직"):
                sys.exit(f"[중단] {pid}: employment '{emp_raw}'는 허용되지 않음(무관|미취업|재직).")
            matchable = ((r.get("matchable") or "").strip().upper() or "Y")
            if matchable not in ("Y", "N"):
                sys.exit(f"[중단] {pid}: matchable '{matchable}'는 허용되지 않음(Y|N).")
            # matchable=N 정책도 회원 명단으로 '측정 가능한' 자격(거주지·연령·본인 월소득 등)은
            # 정책표에 남길 수 있다 — 추천 0건을 만드는 '확인 불가 게이트'는 회원 컬럼이 아예 없는
            # 항목(부모/배우자 소득·자산, 학자금대출 보유, 자녀 수 등)이기 때문이다. 따라서 소득 칸을
            # 강제로 비우지 않는다(matchable=N → member_passes가 즉시 False라 어차피 0 추천).
            rows.append(dict(
                id=pid,
                name=(r.get("name") or "").strip(),
                field=(r.get("field") or "").strip(),
                poster=(r.get("poster_file") or "").strip(),   # 참조용(생성엔 미사용)
                region_raw=region_raw,
                region=parse_policy_region(region_raw),
                age_min=int_or_none(r.get("age_min")),
                age_max=int_or_none(r.get("age_max")),
                employment=emp_raw,
                company_size=((r.get("company_size") or "").strip()),   # 비면 무관
                income_max=int_or_none(r.get("income_max_month")),
                income_median_pct=int_or_none(r.get("income_median_pct")),  # 가구 기준중위소득 %, 비면 무관
                income_year_max=int_or_none(r.get("income_year_max")),   # 연소득 상한(원), 비면 무관
                no_house=((r.get("no_house") or "").strip().upper() == "Y"),
                enroll=((r.get("enroll_status") or "").strip() or "무관"),    # 무관|재학|졸업
                marital=((r.get("marital") or "").strip() or "무관"),         # 무관|미혼|신혼부부
                matchable=matchable,   # Y|N (N=판별불가 → 추천 0건)
                start=(r.get("apply_start") or "").strip(),
                end=(r.get("apply_end") or "").strip(),
            ))
    if not rows:
        sys.exit(f"[중단] {CSV_PATH} 에 정책 행이 없습니다.")
    return rows


# ----------------------------------------------------------------------------
# 3) 회원 합성 — 정책 axes를 읽어 generic 경계 케이스 생성(하드코딩 금지)
# ----------------------------------------------------------------------------
def manage(birth):
    """기준일(ASSIGN_DATE) 기준 만 나이. 생일 안 지났으면 -1."""
    a = ASSIGN_DATE.year - birth.year
    if (ASSIGN_DATE.month, ASSIGN_DATE.day) < (birth.month, birth.day):
        a -= 1
    return a


def birth_for_age(age):
    """기준일에 정확히 만 `age`세가 되도록 생년월일 생성(생일은 이미 지난 1~5월)."""
    return datetime.date(ASSIGN_DATE.year - age,
                         random.randint(1, 5), random.randint(1, 28))


def birth_unpassed(manage_target):
    """기준일에 '생일이 아직 안 지난'(7~12월생) 회원으로, **만 나이 = manage_target**.
       단순 출생연도 빼기(2026 - 출생연도)로 풀면 manage_target+1 이 나와 틀린다 — 만 나이 함정."""
    return datetime.date(ASSIGN_DATE.year - 1 - manage_target,
                         random.randint(7, 12), random.randint(1, 28))


def birth_random(age):
    """일반 회원용: 출생월을 1~12월 무작위로(생일 경과/미경과 섞임) → 단순 빼기 함정이 모집단에 실재."""
    return datetime.date(ASSIGN_DATE.year - age,
                         random.randint(1, 12), random.randint(1, 28))


def seoul_addr(gu):
    """서울 자치구 주소를 표기 변형(서울특별시/서울/시 생략 등)으로 생성 — 정규화 함정."""
    dong = random.choice(DONG.get(gu, ["중앙동"]))
    return random.choice([
        f"서울특별시 {gu} {dong}",
        f"서울 {gu} {dong}",
        f"서울시 {gu}",
        f"{gu} {dong}",          # 시 표기 생략(자치구명만)
    ])


def make_address(sido, district):
    """(시도, 자치구) → 회원 주소 문자열."""
    if sido == "서울특별시":
        gu = detect_gu(district) or district
        return seoul_addr(gu)
    return f"{sido} {district} 중앙동"


def matching_address(p):
    """정책 p의 지역 요건을 만족하는 회원 주소."""
    reg = p["region"]
    if reg["nation"]:
        return seoul_addr(random.choice(SEOUL25))
    sido = reg["sido"]
    district = reg["district"]
    if district is None:                       # 시도만 지정 → 그 시도의 임의 자치구
        pool = SIDO_GU.get(sido, [])
        district = random.choice(pool) if pool else ""
    return make_address(sido, district)


def nonmatching_address(p):
    """정책 p의 지역 요건을 만족하지 않는 회원 주소(전국 정책은 진짜 불일치가 없어 다른 시도로 다양화)."""
    reg = p["region"]
    if reg["nation"]:
        return "경기도 고양시 덕양구 화정동"     # 전국엔 불일치 없음 → 지리적 다양성용
    sido = reg["sido"]
    district = reg["district"]
    if district is not None:                   # 같은 시도, 다른 자치구
        gu = detect_gu(district)
        if sido == "서울특별시":
            other = random.choice([g for g in SEOUL25 if g != gu])
            return seoul_addr(other)
        pool = [d for d in SIDO_GU.get(sido, []) if detect_gu(d) != gu]
        return make_address(sido, random.choice(pool)) if pool else make_address(sido, district)
    # 시도만 지정 → 다른 시도
    others = [s for s in SIDO_GU if s != sido]
    osido = random.choice(others) if others else "경기도"
    return make_address(osido, random.choice(SIDO_GU[osido]))


def passing_age(p):
    """정책 p의 연령 요건을 확실히 만족하는 나이 하나."""
    lo, hi = p["age_min"], p["age_max"]
    if lo is not None and hi is not None:
        return (lo + hi) // 2
    if lo is not None:
        return lo + 3
    if hi is not None:
        return max(hi - 3, 19)
    return 30


def passing_income(p):
    """정책 p의 소득 요건을 만족하는 월소득."""
    return p["income_max"] if p["income_max"] is not None else 2_000_000


def passing_enroll(p):
    """정책 p의 학력(재학) 요건을 만족하는 재학상태."""
    return {"재학": "재학", "졸업": "졸업"}.get(p["enroll"], "졸업")  # 무관이면 졸업도 통과


def passing_marital(p):
    """정책 p의 혼인 요건을 만족하는 혼인여부."""
    return {"신혼부부": "기혼", "미혼": "미혼"}.get(p["marital"], "미혼")


def passing_emp(p):
    """정책 p의 취업 요건을 만족하는 취업상태(다른 경계 회원이 통과해야 할 값).
       기업규모 요건이 있고 취업은 무관인 정책은, 통과 회원이 회사값을 가질 수 있도록 '재직'으로."""
    if p["company_size"] and p["employment"] == "무관":
        return "재직"
    return {"미취업": "미취업", "재직": "재직"}.get(p["employment"], "미취업")


def passing_company(p):
    """정책 p의 기업규모 요건을 만족하는 기업규모(다른 경계 회원의 통과값).
       company_size 요구 → 그 값. 무관 → 취업이 미취업이면 '없음', 아니면 회사값(중소기업)."""
    if p["company_size"]:
        return p["company_size"]
    return "없음" if p["employment"] == "미취업" else "중소기업"


def passing_income_year(p):
    """정책 p의 연소득 요건을 만족하는 연소득(다른 경계 회원의 통과값)."""
    return p["income_year_max"] if p["income_year_max"] is not None else 0


_members = []
_mid = [1]


def add_member(age, addr, emp, income, owned, enroll=None, marital=None,
               edu=None, household=None, birth=None, company=None, income_year=None):
    """회원 1명 추가. owned=주택소유여부('예'|'아니오').
       enroll=재학상태(None이면 무작위), marital=혼인여부(None이면 무작위).
       company=기업규모(None이면 취업상태 규칙으로: 미취업→'없음', 그 외→풀에서 무작위).
       income_year=연소득(원)(None이면 풀에서 무작위).
       birth 지정 시 그 생년월일을 그대로 사용(만 나이 경계 함정용), 아니면 age로 생성."""
    if birth is None:
        birth = birth_for_age(age)
    if company is None:
        company = "없음" if emp == "미취업" else random.choice(COMPANY_POOL)
    if income_year is None:
        income_year = random.choice(INCOME_YEAR_POOL)
    n = _mid[0]
    rec = {
        "회원ID": f"M{n:04d}",
        "이름": random.choice(SURNAME) + random.choice(GIVEN),
        "생년월일": birth.isoformat(),
        "성별": random.choice(["남", "여"]),
        "거주지": addr,
        "취업상태": emp,
        "기업규모": company,
        "월소득(원)": income,
        "연소득(원)": income_year,
        "최종학력": edu or random.choice(EDU),
        "재학상태": enroll or random.choice(ENROLL_POOL),
        "혼인여부": marital or random.choice(MARITAL_POOL),
        "주택소유여부": owned,
        "가구원수": household or random.choice([1, 1, 1, 2, 3]),
        "이메일": f"user{n:04d}@example.com",
        "가입일": random.choice(["2025-11-02", "2026-01-15", "2026-03-20",
                              "2026-05-30", "2026-06-10"]),
    }
    _members.append(rec)
    _mid[0] += 1


def plant_boundaries(p):
    """정책 p의 각 axis(나이·소득·지역·취업·무주택)에 대해 경계 회원을 generic하게 심는다.
       경계 외 다른 axis는 모두 '통과' 값으로 두어, 그 경계가 매칭 결과를 실제로 가르게 한다."""
    base_addr = matching_address(p)        # 지역 통과 기준 주소
    base_age = passing_age(p)
    base_inc = passing_income(p)
    pe = passing_enroll(p)                  # 다른 경계 회원이 통과해야 할 학력/혼인/취업 값
    pm = passing_marital(p)
    pemp = passing_emp(p)                    # 정책이 미취업/재직을 요구하면 그 값으로 통과시킴
    pco = passing_company(p)                 # 기업규모 통과값(company_size 또는 회사값/'없음')
    piy = passing_income_year(p)             # 연소득 통과값(income_year_max 이하)

    def m(age, addr, owned, emp=None, income=None, enroll=pe, marital=pm, birth=None,
          company=None, income_year=None, household=None):
        eff_emp = emp or pemp
        # 다른 axis 통과값에 기업규모/연소득 포함: 미취업이면 '없음', 아니면 통과 회사값.
        if company is None:
            company = "없음" if eff_emp == "미취업" else pco
        add_member(age, addr, eff_emp, base_inc if income is None else income,
                   owned, enroll=enroll, marital=marital, birth=birth,
                   company=company, income_year=piy if income_year is None else income_year,
                   household=household)

    # (A) 나이 경계: age_min-1 / age_min / age_max / age_max+1 (정의된 방향만)
    age_targets = []
    if p["age_min"] is not None:
        age_targets += [p["age_min"] - 1, p["age_min"]]
    if p["age_max"] is not None:
        age_targets += [p["age_max"], p["age_max"] + 1]
    for ta in age_targets:
        if ta < 0:
            continue
        m(ta, matching_address(p), "아니오")

    # (A') 생일 미경과(7~12월생) 경계 — '단순 출생연도 빼기'로 풀면 틀리는 만 나이 함정
    if p["age_max"] is not None:
        # 만 나이 = age_max(정답=포함), 단순 빼기는 age_max+1(오답=제외) → 누락(FN) 유발
        m(0, matching_address(p), "아니오", birth=birth_unpassed(p["age_max"]))
    if p["age_min"] is not None and p["age_min"] - 1 >= 0:
        # 만 나이 = age_min-1(정답=제외), 단순 빼기는 age_min(오답=포함) → 오발송(FP) 유발
        m(0, matching_address(p), "아니오", birth=birth_unpassed(p["age_min"] - 1))

    # (B) 소득 경계: income_max(통과) / income_max+1(탈락)
    if p["income_max"] is not None:
        for inc in (p["income_max"], p["income_max"] + 1):
            m(base_age, matching_address(p), "아니오", income=inc)

    # (B') 가구 중위소득 경계: 가구원수별로 상한이 달라진다 → 여러 가구원수에서 통과/탈락을 심는다.
    #      같은 월소득이라도 가구원수가 작으면 탈락·크면 통과(가구원수에 따른 금액 계산을 강제).
    if p["income_median_pct"] is not None:
        for hh in (1, 3):
            cap = median_cap(hh, p["income_median_pct"])
            m(base_age, matching_address(p), "아니오", income=cap, household=hh)       # 통과
            m(base_age, matching_address(p), "아니오", income=cap + 1, household=hh)   # 탈락

    # (C) 지역: 일치 1 + 불일치 1 (다른 axis는 통과)
    m(base_age, base_addr, "아니오")
    m(base_age, nonmatching_address(p), "아니오")

    # (D) 취업: 미취업 / 단기근로 / 재직 — 정책 취업요건에 따라 통과/탈락이 갈림
    for emp in ("미취업", "단기근로", "재직"):
        m(base_age, matching_address(p), "아니오", emp=emp)

    # (E) 무주택: 정책이 요구하면 소유 예/아니오 두 케이스
    if p["no_house"]:
        for owned in ("예", "아니오"):
            m(base_age, matching_address(p), owned)

    # (F) 학력/재학 경계: 정책이 재학/졸업을 요구할 때 각 상태 한 명씩
    if p["enroll"] in ("재학", "졸업"):
        for st in ("재학", "휴학", "졸업", "비학생"):
            m(base_age, matching_address(p), "아니오", enroll=st)

    # (G) 혼인 경계: 정책이 신혼부부/미혼을 요구할 때 미혼·기혼 두 케이스
    if p["marital"] in ("신혼부부", "미혼"):
        for ms in ("미혼", "기혼"):
            m(base_age, matching_address(p), "아니오", marital=ms)

    # (H) 연소득 경계: income_year_max(통과) / income_year_max+1(탈락)
    if p["income_year_max"] is not None:
        for iy in (p["income_year_max"], p["income_year_max"] + 1):
            m(base_age, matching_address(p), "아니오", income_year=iy)

    # (I) 기업규모 경계: 일치(통과)·불일치(탈락). 취업=재직, 다른 axis 통과.
    if p["company_size"]:
        miss = "대기업" if p["company_size"] != "대기업" else "중소기업"
        m(base_age, matching_address(p), "아니오", emp="재직", company=p["company_size"])
        m(base_age, matching_address(p), "아니오", emp="재직", company=miss)


def synthesize_members(policies, target_count=1000):
    """정책 경계 함정 + 일반 무작위 회원으로 회원 DB를 구성한다."""
    _members.clear()          # 같은 프로세스에서 재호출해도 누적되지 않게 초기화(결정성)
    _mid[0] = 1
    random.seed(20260628)     # 재호출 시에도 동일 난수 시퀀스
    for p in policies:
        if p["matchable"] == "N":
            continue   # 판별불가 정책 → 어차피 0매칭 → 경계 회원을 심지 않음
        plant_boundaries(p)

    # 일반 무작위 회원으로 약 target_count명까지 채운다(전 시도/자치구 + 비매칭 지역 커버).
    all_addr_makers = [lambda: seoul_addr(random.choice(SEOUL25))]
    for sido, gus in SIDO_GU.items():
        if sido == "서울특별시":
            continue
        all_addr_makers.append(lambda s=sido, g=gus: make_address(s, random.choice(g)))
    while len(_members) < target_count:
        a = random.randint(17, 42)
        add_member(
            a,
            random.choice(all_addr_makers)(),
            random.choice(["미취업", "재직", "단기근로"]),
            random.choice([0, 1_200_000, 1_800_000, 2_400_000,
                           2_900_000, 3_300_000, 3_700_000, 4_500_000]),
            random.choice(["아니오", "아니오", "아니오", "예"]),
            birth=birth_random(a),   # 출생월 1~12 무작위 → 생일 경과/미경과 혼재
        )
    return _members


# ----------------------------------------------------------------------------
# 4) 매칭 정답 계산 (matchable!='N' 정책 대상, 9조건 동시 통과 — 날짜 무관)
# ----------------------------------------------------------------------------
def member_passes(m, p):
    # 판별불가 정책: 회원 명단으로 자격을 확인할 수 없음 → 어떤 회원도 통과 못 함(추천 0건).
    if p["matchable"] == "N":
        return False
    a = manage(datetime.date.fromisoformat(m["생년월일"]))
    if p["age_min"] is not None and a < p["age_min"]:
        return False
    if p["age_max"] is not None and a > p["age_max"]:
        return False
    if not region_match(m["거주지"], p["region"]):
        return False
    if p["employment"] == "미취업" and m["취업상태"] not in ("미취업", "단기근로"):
        return False
    if p["employment"] == "재직" and m["취업상태"] not in ("재직", "단기근로"):
        return False
    if p["company_size"] and m["기업규모"] != p["company_size"]:
        return False
    if p["income_max"] is not None and (m["월소득(원)"] or 0) > p["income_max"]:
        return False
    if p["income_median_pct"] is not None:
        cap = median_cap(m["가구원수"] or 1, p["income_median_pct"])
        if (m["월소득(원)"] or 0) > cap:
            return False
    if p["income_year_max"] is not None and (m["연소득(원)"] or 0) > p["income_year_max"]:
        return False
    if p["no_house"] and m["주택소유여부"] != "아니오":
        return False
    if p["enroll"] == "재학" and m["재학상태"] not in ("재학", "휴학"):
        return False
    if p["enroll"] == "졸업" and m["재학상태"] != "졸업":
        return False
    if p["marital"] == "신혼부부" and m["혼인여부"] != "기혼":
        return False
    if p["marital"] == "미혼" and m["혼인여부"] != "미혼":
        return False
    return True


# ----------------------------------------------------------------------------
# 5) 엑셀 산출 (회원DB / 제출양식 / 정답키)
# ----------------------------------------------------------------------------
HDR = Font(bold=True, color="FFFFFF")
HDRFILL = PatternFill("solid", fgColor="161616")
GUIDE = PatternFill("solid", fgColor="F4F4F4")

MEMBER_COLS = ["회원ID", "이름", "생년월일", "성별", "거주지", "취업상태", "기업규모",
               "월소득(원)", "연소득(원)", "최종학력", "재학상태", "혼인여부",
               "주택소유여부", "가구원수", "이메일", "가입일"]
P1COLS = ["정책ID", "정책명", "분야", "거주지요건", "연령_최소", "연령_최대", "취업요건",
          "기업규모요건", "월소득상한(원)", "월소득_중위소득기준(%)", "연소득상한(원)",
          "무주택요건", "학력요건", "혼인요건"]


def style_header(ws, ncol):
    for c in range(1, ncol + 1):
        cell = ws.cell(1, c)
        cell.font = HDR
        cell.fill = HDRFILL
        cell.alignment = Alignment(vertical="center")


def write_members(members):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "회원"
    ws.append(MEMBER_COLS)
    style_header(ws, len(MEMBER_COLS))
    for m in members:
        ws.append([m[c] for c in MEMBER_COLS])
    ws.freeze_panes = "A2"
    wb.save(DATA / "2_회원명단.xlsx")


def p1_row(p, answer):
    """Part1 행. answer=False면 식별칸(ID/명/분야)만, True면 정답 채움.
       신청 날짜는 보지 않는다 — 자격 10칸(거주/연령/취업/기업규모/월소득/연소득/무주택/학력/혼인)만."""
    if not answer:
        return [p["id"], p["name"], p["field"]] + [""] * 11
    return [
        p["id"], p["name"], p["field"],
        p["region_raw"],
        p["age_min"] if p["age_min"] is not None else "",
        p["age_max"] if p["age_max"] is not None else "",
        p["employment"] if p["employment"] != "무관" else "",
        p["company_size"] if p["company_size"] else "",
        p["income_max"] if p["income_max"] is not None else "",
        p["income_median_pct"] if p["income_median_pct"] is not None else "",
        p["income_year_max"] if p["income_year_max"] is not None else "",
        "필요" if p["no_house"] else "",
        p["enroll"] if p["enroll"] != "무관" else "",
        p["marital"] if p["marital"] != "무관" else "",
    ]


def build_p1(path, policies, answer):
    wb = openpyxl.Workbook()
    g = wb.active
    g.title = "안내"
    guide = [
        ["항목", "설명"],
        ["행 단위", "정책 1건 (데이터/1_포스터/ 의 공고문 전부)"],
        ["입력", "데이터/1_포스터/ 의 실제 정책 포스터·공고문(PDF·이미지)"],
        ["★날짜 안 봄", "신청 날짜(신청시작·신청마감)는 보지 않는다. 마감일이 언제든 무관 — 자격 조건만 추출한다"],
        ["채점 칸", "거주지요건, 연령_최소/연령_최대, 취업요건, 기업규모요건, 월소득상한(원), 월소득_중위소득기준(%), 연소득상한(원), 무주택요건, 학력요건, 혼인요건"],
        ["거주지요건", "허용값: '전국' 또는 '서울특별시' 또는 '서울특별시 관악구'(시도/자치구). 포스터 그대로. 예: 전국"],
        ["연령_최소/연령_최대", "형식: 만 나이 정수. 포스터에 하한/상한 없으면 빈칸. 예: 19 / 34"],
        ["취업요건", "허용값: '무관'·'미취업'·'재직'(미취업/재직 모두 단기근로 허용). 무관이면 빈칸. 예: 재직"],
        ["기업규모요건", "허용값: 포스터의 기업규모 문구 그대로(예: '중소기업'). 무관/언급 없으면 빈칸. 예: 중소기업"],
        ["월소득상한(원)", "형식: 본인 월소득 절대 상한(원, 정수). 포스터에 '본인 월소득 ○○만원 이하'처럼 금액이 명시될 때만. 없으면 빈칸 (0과 빈칸은 다름). 예: 2550000"],
        ["월소득_중위소득기준(%)", "포스터 소득요건이 '(가구) 기준 중위소득 ○○% 이하'면 그 퍼센트 숫자만 적는다. 가구원수별 실제 금액은 Part2에서 계산(2_추천리스트의 '소득기준표' 참고). 없으면 빈칸. 예: 150"],
        ["연소득상한(원)", "형식: 연 소득 상한(원, 정수). 월소득과 별개 축. 포스터에 없으면 빈칸. 예: 75000000"],
        ["무주택요건", "허용값: '필요' 또는 빈칸. 예: 필요"],
        ["학력요건", "허용값: '재학'(대학·대학원 재학/휴학)·'졸업'(졸업 후)·빈칸(무관). 예: 재학"],
        ["혼인요건", "허용값: '신혼부부'·'미혼'·빈칸(무관). 예: 미혼"],
        ["빈칸 규칙", "빈칸 = 제약 없음(무관). 0과 빈칸은 다르다 — 무관 칸에 0이나 '무관' 글자를 넣지 말고 비운다"],
        ["★확인 불가 규칙", "포스터에 안 나오거나 회원 명단(2_회원명단.xlsx 컬럼)으로 잴 수 없는 자격 칸은 비운다(억지 숫자=오답). "
                          "명단으로 자격을 끝까지 확인할 수 없는 정책은 Part2에서도 아무에게도 추천하지 않는다 — 확실할 때만"],
        ["정책명·분야", "참조용(채점 대상 아님). 이미 채워져 있음"],
    ]
    for r in guide:
        g.append(r)
    g.cell(1, 1).font = Font(bold=True)
    g.cell(1, 2).font = Font(bold=True)
    for row in g.iter_rows(min_row=1, max_row=g.max_row, max_col=2):
        row[0].fill = GUIDE
    g.column_dimensions["A"].width = 16
    g.column_dimensions["B"].width = 74

    s = wb.create_sheet("정책정리")
    s.append(P1COLS)
    style_header(s, len(P1COLS))
    for p in policies:
        s.append(p1_row(p, answer))
    s.freeze_panes = "A2"
    wb.save(path)


def build_p2(path, matches, answer, median_pcts=()):
    wb = openpyxl.Workbook()
    g = wb.active
    g.title = "안내"
    guide = [
        ["항목", "설명"],
        ["행 단위", "회원 한 명과 추천할 정책 하나를 짝지은 한 줄"],
        ["입력", "데이터/2_회원명단.xlsx + Part1에서 정리한 정책표(자격만, 날짜 무관)"],
        ["회원ID", "2_회원명단.xlsx의 회원 식별자(M0001 …)"],
        ["추천정책ID", "자격이 맞는 정책의 정책ID"],
        ["기록 규칙", "한 회원이 한 정책의 자격 조건을 '모두' 통과하면 그 (회원,정책)을 한 줄. "
                    "어떤 정책에도 안 맞는 회원은 적지 않음. 신청 날짜는 보지 않음(자격만)"],
        ["── 자격 판정 규칙 ──", "아래를 모두 통과해야 추천. 정책표 칸이 비어 있으면(무관) 그 조건은 보지 않는다"],
        ["나이", "회원 만 나이가 정책 연령(연령_최소~연령_최대, 양끝 포함) 안. "
                "만 나이 = 기준일(2026-06-28) 기준이며, 생일이 아직 안 지났으면 한 살 뺀다(연도만 빼면 틀림)"],
        ["거주지", "거주지요건이 '전국'=모든 회원 / 시도(예 서울특별시)=그 시도 거주자 / "
                  "시도+자치구(예 서울특별시 관악구)=그 자치구 거주자. 회원 주소 표기가 제각각이어도 시·도와 자치구로 판단"],
        ["취업", "취업요건 '미취업'=회원 취업상태가 미취업 또는 단기근로 / '재직'=재직 또는 단기근로 / 빈칸=모두 통과"],
        ["기업규모", "기업규모요건이 있으면(예 중소기업) 회원 기업규모가 그 값과 같아야 통과 / 빈칸=모두"],
        ["월소득(본인상한)", "월소득상한(원)이 있으면 회원 월소득(원)이 그 이하(같으면 통과) / 빈칸=모두"],
        ["월소득(중위소득%)", "정책에 '월소득_중위소득기준(%)'가 있으면, 회원 '가구원수'에 해당하는 상한 금액 이하라야 통과(같으면 통과). "
                          "상한 = 이 파일 '소득기준표' 시트에서 그 가구원수·그 % 칸의 금액. 가구원수가 크면 상한도 커진다 / 빈칸=모두"],
        ["연소득", "연소득상한(원)이 있으면 회원 연소득(원)이 그 이하(같으면 통과). 월소득과 별개 / 빈칸=모두"],
        ["★소득기준표", "이 파일의 '소득기준표' 시트에 가구원수별 기준 중위소득(월)과 비율별(예 150%) 상한 금액이 계산돼 있다. "
                     "중위소득 % 정책은 회원 가구원수로 이 표를 찾아 상한을 정한다(직접 계산: 기준중위소득×%÷100, 원단위 반올림)"],
        ["무주택", "무주택요건이 '필요'면 회원 주택소유여부가 '아니오' / 빈칸=모두"],
        ["학력", "학력요건 '재학'=회원 재학상태가 재학 또는 휴학 / '졸업'=졸업 / 빈칸=모두"],
        ["혼인", "혼인요건 '신혼부부'=회원 혼인여부 기혼 / '미혼'=미혼 / 빈칸=모두"],
        ["★확인 불가 정책", "회원 명단(2_회원명단.xlsx의 컬럼)만으로는 자격을 끝까지 확인할 수 없는 정책이 섞여 있을 수 있다. "
                          "그런 정책은 아무에게도 추천하지 않는다 — 확실할 때만 추천하고, 무리하면 오발송(FP)이다"],
        ["행 순서", "채점에 영향 없음. 중복 행은 1개로 간주"],
        ["예시", "아래 '타게팅' 시트의 예시 행 참고(실제 답 아님, 채점 시 무시)"],
    ]
    for r in guide:
        g.append(r)
    g.cell(1, 1).font = Font(bold=True)
    g.cell(1, 2).font = Font(bold=True)
    for row in g.iter_rows(min_row=1, max_row=g.max_row, max_col=2):
        row[0].fill = GUIDE
    g.column_dimensions["A"].width = 16
    g.column_dimensions["B"].width = 74

    s = wb.create_sheet("타게팅")
    s.append(["회원ID", "추천정책ID"])
    style_header(s, 2)
    if answer:
        for mid_, pid in sorted(set(matches)):
            s.append([mid_, pid])
    else:
        s.append(["예시M0001", "YP01"])
    s.freeze_panes = "A2"

    # 소득기준표 — 가구 중위소득 % 정책의 가구원수별 월 상한(참고 표, 학생이 그대로 사용).
    pcts = sorted(median_pcts)
    if pcts:
        t = wb.create_sheet("소득기준표")
        header = ["가구원수", "기준중위소득(월,원)"] + [f"중위소득{pct}%_월상한(원)" for pct in pcts]
        t.append(header)
        style_header(t, len(header))
        for hh in range(1, 8):
            t.append([hh, median_income(hh)] + [median_cap(hh, pct) for pct in pcts])
        t.append(["8인 이상", "1인 늘 때마다 (7인-6인)만큼 가산"]
                 + ["가구원수로 직접 계산: 기준중위소득×%÷100, 원단위 반올림" if i == 0 else ""
                    for i in range(len(pcts))])
        t.freeze_panes = "A2"
        t.column_dimensions["A"].width = 12
        for col in ("B", "C", "D", "E", "F"):
            t.column_dimensions[col].width = 24
    wb.save(path)


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def main():
    policies = load_policies()
    print(f"[1/4] policies.csv 로드: 정책 {len(policies)}건")

    members = synthesize_members(policies)
    print(f"[2/4] 회원 {len(members)}명 합성(정책 axes 기반 경계 함정 포함)")

    # 매칭 대상 = matchable!='N' 인 모든 정책(신청 날짜 무관, 판별불가 정책은 추천 0건).
    targets = [p for p in policies if p["matchable"] != "N"]
    matches = []
    for m in members:
        for p in targets:
            if member_passes(m, p):
                matches.append((m["회원ID"], p["id"]))
    print(f"[3/4] 매칭 {len(matches)}건 "
          f"(대상 정책 {len(targets)}개, 회원 {len(set(x[0] for x in matches))}명 발송)")

    median_pcts = sorted({p["income_median_pct"] for p in policies
                          if p["income_median_pct"] is not None})

    write_members(members)
    build_p1(DATA / "1_정책정리표_제출용.xlsx", policies, answer=False)
    build_p1(ANS  / "1_정책정리표_정답.xlsx",   policies, answer=True)
    build_p2(DATA / "2_추천리스트_제출용.xlsx", matches, answer=False, median_pcts=median_pcts)
    build_p2(ANS  / "2_추천리스트_정답.xlsx",   matches, answer=True,  median_pcts=median_pcts)
    print("[4/4] 엑셀 산출 완료: members / 제출양식 2 / 정답키 2")

    # ── 생성 요약 ───────────────────────────────────────────────────────────
    per_policy = {p["id"]: sum(1 for x in matches if x[1] == p["id"]) for p in targets}
    print("=" * 60)
    print("생성 요약")
    print("  대상 정책(matchable!=N):", [p["id"] for p in targets])
    print("  정책별 매칭 수:", per_policy)
    print("  회원 수:", len(members))
    print("=" * 60)


if __name__ == "__main__":
    main()
