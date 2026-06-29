# -*- coding: utf-8 -*-
"""mock investigator — LLM 없이 결정적 키워드 휴리스틱으로 verdict 방출 (overview §6.3 폴백).

mock = http = task 세 backend가 동일 입출력 계약(schema §5.3)을 공유한다(mbti judge.py 선례).
verdict는 반드시 packet.candidateTypes 안에서만 나온다 — 밖이면 RuntimeError(밴드검증 동치).
"""
import re

# 라벨별 키워드(요청 발화/근거). 슬라이스에 신호가 있으면 그 라벨을 지지.
_KEYWORDS = {
    "DERIVE_FIELD":   ["계산", "구해", "도출", "시작일", "기간", "더해", "edate"],
    "COMPUTE_MISS":   ["비워", "그냥", "빈칸", "모르"],
    "EMPTY_RESPECT":  ["비워", "공란", "해당없", "없으면 비"],
    "OVERFILL":       ["0", "별도", "임의", "채워"],
    "SPEC_GROUNDING": ["조항", "자동연장", "갱신 규칙", "원문", "근거"],
    "RULE_UNDERREAD": ["대충", "아마", "그럴듯", "빠르게"],
    "SELF_AUDIT":     ["검증", "대조", "확인", "맞는지", "점검"],
    "INCREMENTAL_CHECK": ["먼저", "샘플", "1건", "일부", "테스트"],
    "NO_FINAL_VERIFY": [],   # 부재 신호 — present는 packet.evidence로 결정
}


def investigate(packet: dict) -> dict:
    cid = packet["candidateId"]
    types = packet["candidateTypes"]
    text = " ".join(m.get("text", "") for m in packet.get("dialogueWindow", []))
    text_l = text.lower()

    scored = []
    for label in types:
        kws = _KEYWORDS.get(label, [])
        hits = sum(1 for k in kws if k.lower() in text_l)
        scored.append((hits, label))
    scored.sort(reverse=True)
    best_hits, best = scored[0]

    # 증거가 전무하면 present=false (발명 금지)
    has_cell = bool(packet.get("cellDelta"))
    present = best_hits > 0 or has_cell
    if not present:
        # NO_FINAL_VERIFY류 '부재'형은 evidence_absence 플래그로만 present
        if packet.get("evidenceAbsence"):
            best, present = types[0], True

    conf = "high" if best_hits >= 2 else ("med" if best_hits == 1 else "low")
    cited = [m["ref"] for m in packet.get("dialogueWindow", []) if m.get("ref")]
    cited += [d["ref"] for d in packet.get("cellDelta", []) if d.get("ref")]

    verdict = best if present else None
    if verdict is not None and verdict not in types:
        raise RuntimeError(f"verdict {verdict} ∉ candidateTypes {types}")  # 밴드검증 동치

    return {
        "candidateId": cid,
        "verdict": verdict,
        "present": present,
        "confidence": conf,
        "evidenceCited": cited,
        "rationale": f"mock: 키워드 {best_hits}건" + (" + cellDelta" if has_cell else ""),
        "labelDowngradeTo": None,
    }
