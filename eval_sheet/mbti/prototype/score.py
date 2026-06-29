"""score.py — Stage 2 규칙 채점(밴드 → 연속 %) + 커버리지 게이트 + 표시 규약.

measurement-design §3 표준식(부호 반전 없음):
    a_raw : 그 축의 채팅 파생 앵커. 항상 "고-% 극"으로 갈수록 커지게 정의.
    a     = clamp((a_raw − c_lo) / (c_hi − c_lo), 0, 1)   # 밴드 내 상대 정규화
    score = jround(lo + a·(hi − lo))                       # jround = floor(x+0.5)

§4·§5 커버리지 게이트: 신호 없는 축은 50%가 아니라 score=null + "측정불가".
§2 표시 규약: 우세 극 + max(score, 100−score) 강도.

콜드스타트(cohort_n=1): [c_lo,c_hi]는 합리적 기본값(밴드 내 상대 폭 0.2)을 쓴다 —
a = clamp((a_raw − c_lo)/0.2, 0, 1). a_raw는 0~1로 정규화돼 들어온다.
"""

from __future__ import annotations

import math
from typing import Any

# 축별 밴드 코드(낮은 % → 높은 %). prompts._BAND_ENUMS와 일치.
BAND_CODES = {
    "planning": ["strong_E", "lean_E", "mixed", "lean_P", "strong_P"],
    "delegation": ["strong_G", "lean_G", "mixed", "lean_D", "strong_D"],
    "communication": ["strong_C", "lean_C", "mixed", "lean_S", "strong_S"],
    "engagement": ["strong_R", "lean_R", "mixed", "lean_M", "strong_M"],
}

# 5밴드 % 범위(연속): 0-20 / 20-40 / 40-60 / 60-80 / 80-100
BAND_RANGES = [(0, 20), (20, 40), (40, 60), (60, 80), (80, 100)]

# 축별 극 글자(저-% 극, 고-% 극)
AXIS_POLES = {
    "planning": ("E", "P"),       # 탐험가 ↔ 설계자
    "delegation": ("G", "D"),     # 위임가 ↔ 지휘자
    "communication": ("C", "S"),  # 대화가 ↔ 정밀가
    "engagement": ("R", "M"),     # 실용가 ↔ 장인
}

# 극 글자 → 한글 이름
POLE_NAMES = {
    "P": "설계자", "E": "탐험가",
    "D": "지휘자", "G": "위임가",
    "S": "정밀가", "C": "대화가",
    "M": "장인", "R": "실용가",
}


def jround(x: float) -> int:
    """floor(x + 0.5) — 설계 §3의 결정적 반올림."""
    return int(math.floor(x + 0.5))


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def band_range(axis: str, band: str) -> tuple[int, int]:
    """축·밴드 코드 → (lo, hi) % 범위."""
    codes = BAND_CODES[axis]
    if band not in codes:
        raise ValueError(f"[{axis}] 알 수 없는 밴드: {band}")
    return BAND_RANGES[codes.index(band)]


# ── 축별 앵커 a_raw 계산(항상 고-% 극으로 증가, 0~1 정규화) ────────────────
def _anchor_planning(f: dict[str, Any]) -> float:
    # ① 앵커 = 정규화된 pre_build_planning_turns만(키워드율 제거)
    return clamp(min(f["pre_build_planning_turns"], 4) / 4.0, 0.0, 1.0)


def _anchor_delegation(f: dict[str, Any]) -> float:
    # a_raw = 0.7·(1 − whole_delegation_rate) + 0.3·(min(decomp,6)/6)
    return clamp(
        0.7 * (1.0 - f["whole_delegation_rate"])
        + 0.3 * (min(f["decomposition_count"], 6) / 6.0),
        0.0,
        1.0,
    )


def _anchor_communication(f: dict[str, Any]) -> float:
    # 코호트 없으면(콜드스타트) 길이를 결정적으로 0~1로 매핑.
    # L = 길이중앙값(문자)를 0~600자 구간으로, T = 1 − 턴수(0~20)정규화.
    # 길이가 턴수보다 신뢰도 높아 0.6/0.4 가중(§5).
    length = f["prompt_length_median_chars"]
    L = clamp(length / 600.0, 0.0, 1.0)
    turns = f["total_turns"]
    T = 1.0 - clamp(turns / 20.0, 0.0, 1.0)
    return clamp(0.6 * L + 0.4 * T, 0.0, 1.0)


def _anchor_engagement(f: dict[str, Any]) -> float:
    # a_raw = clamp(why_rate/0.30, 0,1) + post_success 이해/정리 1건당 +0.05(상한 1)
    base = clamp(f["why_rate"] / 0.30, 0.0, 1.0)
    bonus = 0.05 * f["post_success_refine_count"]
    return clamp(base + bonus, 0.0, 1.0)


_ANCHORS = {
    "planning": _anchor_planning,
    "delegation": _anchor_delegation,
    "communication": _anchor_communication,
    "engagement": _anchor_engagement,
}

# 콜드스타트 밴드-상대 정규화: a = clamp((a_raw − c_lo)/0.2, 0, 1).
# 각 밴드의 a_raw 참조 하한 c_lo를 밴드 순서에 따라 0,0.2,...,0.8로 둔다(폭 0.2).
_BAND_CLO = {0: 0.0, 1: 0.2, 2: 0.4, 3: 0.6, 4: 0.8}


def _band_relative_a(axis: str, band: str, a_raw: float) -> float:
    idx = BAND_CODES[axis].index(band)
    c_lo = _BAND_CLO[idx]
    return clamp((a_raw - c_lo) / 0.2, 0.0, 1.0)


# ── 커버리지 게이트(§4·§5) ────────────────────────────────────────────────
def _gate_reason(
    axis: str, judge: dict[str, Any], f: dict[str, Any]
) -> str | None:
    """게이트되면 한글 사유 문자열, 아니면 None."""
    cov = judge.get("coverage") or {}
    total = f["total_turns"]

    if axis == "planning":
        # (a) 분류 가능 pre-build 학생 턴 0, (b) 전체 학생 턴 < 2, (c) coverage 0/false
        if total < 2:
            return "전체 학생 발화 < 2 — 판정 근거 부족"
        if cov.get("scorable_turns", 0) <= 0 or not cov.get("ok", False):
            return "분류 가능한 도입 발화 없음 — 판정 근거 부족"
        return None

    if axis == "delegation":
        # 위임성 발화 < 3 또는 전체 학생 턴 < 4
        if total < 4:
            return "전체 학생 발화 < 4 — 판정 근거 부족"
        if f["directive_count"] < 3:
            return "지시성 발화 < 3 — 판정 근거 부족"
        return None

    if axis == "communication":
        # total_turns < 3
        if total < 3:
            return "전체 학생 발화 < 3 — 길이·턴수 분포 무의미"
        return None

    if axis == "engagement":
        # (a) post_error 0 AND understanding_seek 0, (b) 스코어 가능 발화 < 4
        if f["scorable_count"] < 4:
            return "스코어 가능 발화 < 4 — 판정 근거 부족"
        if f["post_error_count"] == 0 and f["why_count"] == 0:
            return (
                f"이 세션: 에러 {f['post_error_count']}건 · "
                f"understanding_seek {f['why_count']}건 — 판정 근거 없음"
            )
        # 게이트는 §5의 결정적 규칙(post_error/why_count, scorable_count)이 단독 판정한다.
        # LLM coverage.ok는 신호일 뿐, 결정적 게이트 조건을 통과하면 측정한다(예: 에러는
        # 났으나 retry만 한 sprinter → Strong R로 측정, 게이트 아님).
        return None

    return None


def _ci(score: int) -> list[int]:
    """간이 CI(±8, 0~100 클램프). 콜드스타트 n=1 넓은 불확실성 표기."""
    lo = max(0, score - 8)
    hi = min(100, score + 8)
    return [lo, hi]


def display_pole(axis: str, score: int) -> tuple[str, int]:
    """§2 표시 규약: score≥50이면 고-% 극, 아니면 저-% 극. 강도=max(score,100−score)."""
    low_pole, high_pole = AXIS_POLES[axis]
    if score >= 50:
        return POLE_NAMES[high_pole], score
    return POLE_NAMES[low_pole], 100 - score


def type_letter(axis: str, score: int) -> str:
    """축 글자(고-% 극이면 그 글자, 아니면 저-% 극 글자)."""
    low_pole, high_pole = AXIS_POLES[axis]
    return high_pole if score >= 50 else low_pole


def score_axis(
    axis: str, judge: dict[str, Any], f: dict[str, Any]
) -> dict[str, Any]:
    """한 축의 최종 점수 dict(게이트되면 score=null + reason)."""
    reason = _gate_reason(axis, judge, f)
    if reason is not None:
        return {
            "score": None,
            "band": judge.get("band"),
            "coverage": "insufficient",
            "reason": reason,
            "evidence": judge.get("evidence", []),
        }

    band = judge["band"]
    lo, hi = band_range(axis, band)
    a_raw = _ANCHORS[axis](f)
    a = _band_relative_a(axis, band, a_raw)
    score = jround(lo + a * (hi - lo))
    score = int(clamp(score, 0, 100))

    pole, strength = display_pole(axis, score)
    return {
        "pole": pole,
        "score": score,
        "strength": strength,
        "band": band,
        "ci": _ci(score),
        "coverage": "ok",
        "evidence": judge.get("evidence", []),
    }
