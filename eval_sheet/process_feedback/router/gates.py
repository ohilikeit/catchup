# -*- coding: utf-8 -*-
"""G1~G4·GB1 결정적 게이트 (overview §7 / schema §5). 렌더 전 section03.jsonl item 재검사.

점수·인용은 주입이라 환각면이 선제로 0에 가깝고, 게이트는 최종 안전망이다.
위반 카드는 드롭(빈 버킷 허용). 반환: (kept_items, dropped[{label,gate,why}]).
"""
import re

_NUM = re.compile(r"\d+(?:\.\d+)?%?|\d+\s*번째")


def _norm(s):
    return re.sub(r"\s+", "", s or "")


def check(items, inp):
    turns = {str(k): v for k, v in inp.get("turns", {}).items()}
    R = inp.get("R", {})
    kept, dropped = [], []
    for it in items:
        g = _check_one(it, turns, R)
        (dropped if g else kept).append(it if not g else {"label": it.get("label"), **g})
    return kept, dropped


def _check_one(it, turns, R):
    # G1 인용: 요청 행 text ⊂ 해당 turns#N (공백정규화)
    for row in it.get("workflow", []):
        if row.get("role") == "요청" and row.get("ref", "").startswith("turns#"):
            tn = row["ref"].split("#")[1]
            src = turns.get(tn)
            if src is None or _norm(row.get("text", "")) not in _norm(src):
                return {"gate": "G1", "why": f"인용이 turns#{tn} substring 아님"}
    # G3 분류 불변식
    if it.get("scoreLinked") and not it.get("scoreRefs"):
        return {"gate": "G3", "why": "scoreLinked=true인데 scoreRefs 없음"}
    if not it.get("scoreLinked") and it.get("scoreRefs"):
        return {"gate": "G3", "why": "suggestion인데 scoreRefs 있음"}
    # G4 무근거 스캐너: suggestion 산문에 숫자/“N번째”/% 금지(점수무관)
    if not it.get("scoreLinked"):
        prose = " ".join([it.get("title", "")] + it.get("action_steps", []) + it.get("prompts", []))
        if _NUM.search(prose):
            return {"gate": "G4", "why": "제안 산문에 무근거 숫자"}
    # GB1 증거해소: 요청 인용 ref가 실재
    for ref in it.get("evidence", {}).get("quoteRefs", []):
        if ref.startswith("turns#") and turns.get(ref.split("#")[1]) is None:
            return {"gate": "GB1", "why": f"{ref} 미해소"}
    return None
