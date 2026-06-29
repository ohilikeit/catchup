# -*- coding: utf-8 -*-
"""24유형 피드백 카탈로그 — 라우팅 메타를 데이터로 (overview.md §3.1·§5.2).

각 유형은 자기 정의에 "어느 점수 신호에서 발화하는가(fireWhen)"를 들고 있어 라우팅이 결정적이다.
규칙은 코드에 하드코딩하지 않는다 — 유형 추가 = 이 표만 수정(assignment-factory '축↔데이터 1:1' 철학).

contract_expiry_tracking 그라운딩. 타 문제 이식 = fireWhen/srcField/evidenceNeed만 교체(§8).

fireWhen 은 result.json(평탄화 dict 'R')에 대한 술어 람다다. 평탄화 키 예:
  R["part1.필드별.종료일"], R["part2.FN샘플"], R["part2.유령계약"], R["score.총점(100)"]
스냅샷 파생 신호(overcomeΔ 등)는 ctx(turnchunks 요약)로 받는다.
"""
from dataclasses import dataclass, field
from typing import Callable, Optional

TIER_A = "A"            # 순수 결정적 (result.json 자체가 증거)
TIER_HY = "Hybrid"      # A 앵커 + B 확인 (슬라이스 신호 필요)
TIER_B = "B"            # 내용검증 (대화/내용 read 필요)

STRENGTH, WEAKNESS, SUGGEST = "strength", "weakness", "suggestion"

LEDGER_FIELDS = ["계약명", "거래상대방", "계약유형", "시작일",
                 "종료일", "계약금액", "자동갱신", "갱신통지일"]


@dataclass(frozen=True)
class CatalogType:
    label: str
    kind: str                       # strength | weakness | suggestion
    tier: str                       # A | Hybrid | B
    src_field: Optional[str]        # 닿는 result.json 포인터(점수연결); 제안은 None
    fire_when: Callable             # (R, ctx) -> bool  (R=평탄화 result, ctx=파생신호 dict)
    evidence_need: tuple = ()       # fan-out 전 증거게이트가 요구하는 슬라이스 신호
    axis_affinity: tuple = ()       # 보강 과정축(Map B)
    mirror: Optional[str] = None    # 같은 필드 반대극(§3.6)
    score_linked: bool = True       # strength/weakness=True, suggestion=False


def _f(R, key, default=None):
    return R.get(key, default)


def _field_acc(R, name):
    return R.get(f"part1.필드별.{name}")


# ── 강점 8 ────────────────────────────────────────────────────────────────────
STRENGTHS = [
    CatalogType("DERIVE_FIELD", STRENGTH, TIER_HY, "part1.필드별.종료일",
        fire_when=lambda R, c: (_field_acc(R, "종료일") or 0) >= 0.8 and c.get("overcome_종료일", False),
        evidence_need=("dialogue:계산지시", "cellDelta:종료일 빈칸→날짜"),
        axis_affinity=("완성및가치", "문제정의"), mirror="COMPUTE_MISS"),
    CatalogType("EMPTY_RESPECT", STRENGTH, TIER_HY, "part1.필드별.계약금액",
        fire_when=lambda R, c: (_field_acc(R, "계약금액") or 0) == 1.0 and c.get("has_blank_금액", False),
        evidence_need=("columnContext:계약금액 열",), axis_affinity=("불확실성관리",), mirror="OVERFILL"),
    CatalogType("FORMAT_NORMALIZE", STRENGTH, TIER_B, None,   # 점수무관으로 분리(교정 D)
        fire_when=lambda R, c: c.get("mixed_format_unified", False),
        evidence_need=("columnContext:표기 통일",), axis_affinity=("실행환경관리",), score_linked=False),
    CatalogType("BOUNDARY_PROBE", STRENGTH, TIER_A, "part2.F1",
        fire_when=lambda R, c: (_f(R, "part2.F1") or 0) >= 0.99
                               and not c.get("boundary_in_fpfn", False),
        axis_affinity=("문제정의",), mirror="BOUNDARY_SKIP"),
    CatalogType("SPEC_GROUNDING", STRENGTH, TIER_HY, "part2.F1",
        fire_when=lambda R, c: (_f(R, "part2.누락_FN수") or 0) == 0 and (_f(R, "part2.오탐_FP수") or 0) == 0
                               and c.get("has_갱신_계약", True),
        evidence_need=("dialogue:조항 재진술",), axis_affinity=("문제정의", "AI출력검토"), mirror="RULE_UNDERREAD"),
    CatalogType("INTEGRITY_CLEAN", STRENGTH, TIER_A, "score.Part2_무결성(10)",
        fire_when=lambda R, c: not _f(R, "part2.유령계약") and not _f(R, "part2.허용외대상유형")
                               and (_f(R, "part2.제출대상수") or 0) > 0,
        axis_affinity=("AI출력검토",), mirror="VERIFY_SKIP"),
    CatalogType("INCREMENTAL_CHECK", STRENGTH, TIER_B, "score.총점(100)",
        fire_when=lambda R, c: c.get("sample_before_bulk", False),
        evidence_need=("dialogue:샘플 먼저", "snapshot:샘플→전체 순서"), axis_affinity=("완성및가치",)),
    CatalogType("SELF_AUDIT", STRENGTH, TIER_HY, "score.총점(100)",
        fire_when=lambda R, c: c.get("late_recovery_delta", 0) > 0 and c.get("verify_utterance_late", False),
        evidence_need=("dialogue:검증 발화", "snapshot:후반 Δ>0"), axis_affinity=("AI출력검토",)),
]

# ── 보완 8 (7개 Pure-A) ───────────────────────────────────────────────────────
WEAKNESSES = [
    CatalogType("COMPUTE_MISS", WEAKNESS, TIER_A, "part1.필드별.종료일",
        fire_when=lambda R, c: (_field_acc(R, "종료일") or 1) < 1.0
                               and _has_blank_submit(R, "종료일"),
        axis_affinity=("완성및가치",), mirror="DERIVE_FIELD"),
    CatalogType("OVERFILL", WEAKNESS, TIER_A, "part1.필드별.계약금액",
        fire_when=lambda R, c: (_field_acc(R, "계약금액") or 1) < 1.0
                               and _has_overfill(R, "계약금액"),
        axis_affinity=("불확실성관리",), mirror="EMPTY_RESPECT"),
    CatalogType("FORMAT_MISMATCH", WEAKNESS, TIER_HY, "part1.셀정확도",
        fire_when=lambda R, c: c.get("norm_failed_cells", 0) > 0,
        evidence_need=("cellDelta:표기 오답",), axis_affinity=("실행환경관리",), mirror="FORMAT_NORMALIZE"),
    CatalogType("BOUNDARY_SKIP", WEAKNESS, TIER_A, "part2.F1",
        fire_when=lambda R, c: _boundary_in(R),
        axis_affinity=("문제정의",), mirror="BOUNDARY_PROBE"),
    CatalogType("RULE_UNDERREAD", WEAKNESS, TIER_A, "part2.FN샘플",
        fire_when=lambda R, c: (_f(R, "part2.누락_FN수") or 0) > 0,
        axis_affinity=("문제정의", "AI출력검토"), mirror="SPEC_GROUNDING"),
    CatalogType("VERIFY_SKIP", WEAKNESS, TIER_A, "score.Part2_무결성(10)",
        fire_when=lambda R, c: bool(_f(R, "part2.유령계약")) or bool(_f(R, "part2.허용외대상유형")),
        axis_affinity=("AI출력검토",), mirror="INTEGRITY_CLEAN"),
    CatalogType("OVER_INFER", WEAKNESS, TIER_A, "part2.FP샘플",
        fire_when=lambda R, c: (_f(R, "part2.오탐_FP수") or 0) > 0,
        axis_affinity=("불확실성관리",)),
    CatalogType("EXTRACTION_ERROR", WEAKNESS, TIER_A, "part1.셀정확도",
        fire_when=lambda R, c: any((_field_acc(R, f) or 1) < 1.0
                                   for f in ["계약명", "거래상대방", "계약유형", "시작일", "자동갱신", "갱신통지일"]),
        axis_affinity=("실행환경관리",)),
]

# ── 제안 8 (점수무관, 주로 B) ─────────────────────────────────────────────────
SUGGESTIONS = [
    CatalogType("NO_FINAL_VERIFY", SUGGEST, TIER_B, None,
        fire_when=lambda R, c: not c.get("verify_utterance_late", False),
        evidence_need=("dialogue:후미 검증 부재",), axis_affinity=("AI출력검토",), score_linked=False),
    CatalogType("PREVIEW_FIRST_ABSENT", SUGGEST, TIER_HY, None,
        fire_when=lambda R, c: c.get("first_change_is_bulk", False),
        evidence_need=("snapshot:첫 변화 전체",), axis_affinity=("완성및가치",), score_linked=False),
    CatalogType("REWRITE_CHURN", SUGGEST, TIER_A, None,
        fire_when=lambda R, c: c.get("rewrite_cadence", 0) >= 3 and abs(c.get("churn_delta", 0)) < 1e-6,
        axis_affinity=("실행환경관리",), score_linked=False),
    CatalogType("ONE_SHOT_DUMP", SUGGEST, TIER_A, None,
        fire_when=lambda R, c: c.get("total_turns", 99) <= 3,
        axis_affinity=("불확실성관리",), score_linked=False),
    CatalogType("MANUAL_EDIT_HEAVY", SUGGEST, TIER_A, None,
        fire_when=lambda R, c: c.get("manual_edit_ratio", 0) >= 0.5,
        axis_affinity=("실행환경관리",), score_linked=False),
    CatalogType("NO_RULE_RESTATE", SUGGEST, TIER_B, None,
        fire_when=lambda R, c: not c.get("rule_restated", True),
        evidence_need=("dialogue:규칙 재진술 부재",), axis_affinity=("문제정의",), score_linked=False),
    CatalogType("NO_INTERMEDIATE_SAMPLE", SUGGEST, TIER_B, None,
        fire_when=lambda R, c: not c.get("sample_before_bulk", False),
        evidence_need=("snapshot:중간 샘플 부재",), axis_affinity=("완성및가치",), score_linked=False),
    CatalogType("LATE_STRUCTURE", SUGGEST, TIER_B, None,
        fire_when=lambda R, c: c.get("per_item_processing", False),
        evidence_need=("code:파이프라인 부재",), axis_affinity=("문제정의",), score_linked=False),
]

CATALOG = {t.label: t for t in (STRENGTHS + WEAKNESSES + SUGGESTIONS)}
MIRRORS = {t.label: t.mirror for t in CATALOG.values() if t.mirror}


# ── result.json 보조 술어 (오답상세 샘플 기반, lossy 주의 §1) ───────────────────
def _has_blank_submit(R, field_name):
    for row in R.get("part1.오답상세", []) or []:
        if row.get("필드") == field_name and (row.get("제출") in ("", None)):
            return True
    return False


def _has_overfill(R, field_name):
    for row in R.get("part1.오답상세", []) or []:
        if row.get("필드") == field_name and str(row.get("제출")).strip() in ("0", "별도") \
           and (row.get("정답") in ("", None)):
            return True
    return False


def _boundary_in(R):
    """경계 계약(잔여 60/61·통지 30/31)이 FP/FN 샘플에 등장 — 데모는 표식만 사용."""
    pool = (R.get("part2.FP샘플", []) or []) + (R.get("part2.FN샘플", []) or [])
    return any("경계" in str(x) for x in pool)
