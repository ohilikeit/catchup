"""features.py — LLM 라벨 + 발화 길이에 대한 결정적 카운트/집계(앵커 입력).

원칙(measurement-design §3: "LLM이 의미를 분류하고, 규칙이 센다/점수 매긴다"):
- 여기서는 **정규식 의미 판정을 절대 하지 않는다.** 의미는 judge.py가 이미 라벨로 줬다.
- 합법적인 결정적 산술만 한다: 턴 세기, LLM 라벨 세기, 발화 길이 중앙값.
- ① 앵커 입력 = LLM이 라벨한 pre-build 계획 턴 수(과거의 planning_keywords 정규식 신호는 제거).
"""

from __future__ import annotations

from typing import Any


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2 == 1:
        return float(s[mid])
    return (s[mid - 1] + s[mid]) / 2.0


def _token_estimate(text: str) -> float:
    """문자 길이/4 토큰 추정(외부 토크나이저 없이 결정적)."""
    return len(text) / 4.0


def compute_features(
    session: dict[str, Any], judges: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """user_turns + 축별 judge 결과(turn_labels)로부터 결정적 피처를 만든다.

    judges: {axis: classify_axis(...) 결과}
    반환: 각 축 앵커가 쓰는 카운트/집계 dict.
    """
    user_turns = session["user_turns"]
    total_turns = len(user_turns)

    # ── ③ 소통: 길이 중앙값(문자·토큰추정). 정규식 아님, 순수 산술. ──
    char_lengths = [float(len(t["text"])) for t in user_turns]
    token_lengths = [_token_estimate(t["text"]) for t in user_turns]
    prompt_length_median_chars = _median(char_lengths)
    prompt_length_median_tokens = _median(token_lengths)

    # ── ① 계획성: LLM이 라벨한 pre-build 계획 턴 수(키워드율 제거) ──
    planning_labels = (judges.get("planning") or {}).get("turn_labels") or []
    # 계획정의/맥락설정 라벨 학생 턴 수 = pre_build_planning_turns
    pre_build_planning_turns = sum(
        1
        for lab in planning_labels
        if lab.get("intent") in ("계획정의", "맥락설정")
    )

    # ── ② 위임: scope 라벨 집계 ──
    deleg_labels = (judges.get("delegation") or {}).get("turn_labels") or []
    directive_labels = [
        lab for lab in deleg_labels if lab.get("is_directive") is True
    ]
    directive_count = len(directive_labels)
    whole_count = sum(
        1 for lab in directive_labels if lab.get("scope") == "전체위임"
    )
    decomposition_count = sum(
        1
        for lab in directive_labels
        if lab.get("scope") in ("부분작업", "단일수정")
    )
    whole_delegation_rate = (
        (whole_count / directive_count) if directive_count > 0 else 0.0
    )

    # ── ④ 관여: phase / intent 라벨 집계 ──
    eng_labels = (judges.get("engagement") or {}).get("turn_labels") or []
    scorable_count = len(eng_labels)  # 스코어 가능 학생 발화 수
    why_count = sum(
        1 for lab in eng_labels if lab.get("intent") == "understanding_seek"
    )
    post_error_count = sum(
        1 for lab in eng_labels if lab.get("phase") == "post_error"
    )
    post_success_labels = [
        lab for lab in eng_labels if lab.get("phase") == "post_success"
    ]
    # 완료 후 이해/정리 발화(동률 분해 보조 앵커)
    post_success_refine_count = sum(
        1
        for lab in post_success_labels
        if lab.get("intent") in ("understanding_seek", "cleanup_refine")
    )
    why_rate = (why_count / scorable_count) if scorable_count > 0 else 0.0

    return {
        # 공통
        "total_turns": total_turns,
        # ③
        "prompt_length_median": prompt_length_median_chars,
        "prompt_length_median_chars": prompt_length_median_chars,
        "prompt_length_median_tokens": prompt_length_median_tokens,
        # ①
        "pre_build_planning_turns": pre_build_planning_turns,
        # ②
        "directive_count": directive_count,
        "whole_delegation_rate": whole_delegation_rate,
        "decomposition_count": decomposition_count,
        # ④
        "scorable_count": scorable_count,
        "why_rate": why_rate,
        "why_count": why_count,
        "post_error_count": post_error_count,
        "post_success_refine_count": post_success_refine_count,
    }
