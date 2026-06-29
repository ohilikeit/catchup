# -*- coding: utf-8 -*-
"""S4 종합 + S5 emit (overview.md §3.6·§3.9·§7).

입장게이트 → present 화해 → mirror 배타 → 트랙쿼터 → 정규화 score_loss 랭킹 → 파트당 ≤2 → JSONL.
점수·랭킹키는 절대 노출 안 함(내부). 서술 슬롯은 mock=narration 템플릿 / live=synthesizer.
"""
from eval_sheet.process_feedback.router import catalog as C

_CONF = {"high": 0.85, "med": 0.6, "low": 0.35}
_FIELD_UNIT = 50 / 8  # part1 한 필드 만점 기여 = 6.25 (overview §3.2)


def _rel_severity(p, R):
    """자기 지표군 내 0..1 상대심각도 (교차지표 비교가능성 §3.6)."""
    sf = (p.get("scoreRefs") or [None])[0]
    if not sf:
        return 0.0
    if sf.startswith("part1.필드별."):
        name = sf.split(".")[-1]
        acc = R.get(f"part1.필드별.{name}")
        return (1 - acc) if acc is not None else 0.0
    if sf == "part1.셀정확도":
        return 1 - (R.get("part1.셀정확도") or 1)
    if sf == "part2.F1" or sf.startswith("part2.FN") or sf.startswith("part2.FP"):
        return 1 - (R.get("part2.F1") or 1)
    if "무결성" in sf:
        viol = len(R.get("part2.유령계약") or []) + len(R.get("part2.허용외대상유형") or [])
        return min(viol * 0.5 / 10, 1.0)
    return 0.3  # 강점 만점 필드 등 기본


def decide(probes, findings, inp):
    R, ctx = inp["R"], inp["ctx"]
    cands = []
    for p in probes:
        f = findings.get(p["id"])
        # judge-present 화해 (§3.6.5)
        if p.get("needsJudge"):
            if not f or not f.get("present"):
                if p["tier"] in (C.TIER_HY, "T2"):
                    p = {**p, "tier": "T2"}        # score-only 강등(점수 흔적이 진실)
                else:
                    continue                        # B 드롭
            conf = _CONF.get((f or {}).get("confidence", "low"), 0.35)
            label = (f or {}).get("verdict") or p["label"]
        else:
            conf, label = 0.8, p["label"]

        t = C.CATALOG[label]
        cand = {
            "part": t.kind, "label": label, "tier": p.get("tier", t.tier),
            "scoreLinked": t.score_linked,
            "scoreRefs": p.get("scoreRefs") if t.score_linked else None,
            "axisRef": p.get("axisRef"),
            "confidence": conf, "axisBoost": p.get("axisBoost", 1.0),
            "overcome": ctx.get(f"overcome_{_field_of(t)}", False),
            "relSeverity": _rel_severity(p, R),
            "mirror": t.mirror,
        }
        if not _entry_gate(cand, R, ctx):
            continue
        cand["priority"] = _priority(cand)
        cands.append(cand)

    selected = {b: _select(cands, b) for b in (C.STRENGTH, C.WEAKNESS, C.SUGGEST)}
    selected = _mirror_exclusion(selected)
    return {
        "headlineScore": {"총점(100)": R.get("score.총점(100)")},
        "decision": selected,
        "audit": {"probes": len(probes), "judged": len(findings),
                  "selected": {k: len(v) for k, v in selected.items()}},
    }


def _field_of(t):
    return (t.src_field or "").split(".")[-1]


def _entry_gate(c, R, ctx):
    if c["part"] in (C.STRENGTH, C.WEAKNESS):
        if not c["scoreRefs"]:
            return False
        sf = c["scoreRefs"][0]
        if c["part"] == C.STRENGTH:
            if sf.startswith("part1.필드별."):
                return R.get(sf) == 1.0 or c["overcome"]   # part1 필드: 만점 또는 극복
            return True   # part2/score 기반 강점은 fire_when 이 양성상태(무결성=10 등)를 이미 보장
        if c["part"] == C.WEAKNESS:
            return c["relSeverity"] > 0 or bool(R.get(sf))
    if c["part"] == C.SUGGEST:
        return c["scoreRefs"] is None
    return False


def _priority(c):
    base = c["relSeverity"] * c["confidence"] * c["axisBoost"]
    if c["part"] == C.STRENGTH:
        return base * (1 + (0.5 if c["overcome"] else 0))
    if c["part"] == C.SUGGEST:
        return c["confidence"]  # 점수무관: 신호강도 근사
    return base


def _select(cands, part):
    C_ = [c for c in cands if c["part"] == part]
    # dedupe by label (최고 priority)
    by_label = {}
    for c in sorted(C_, key=lambda x: -x["priority"]):
        by_label.setdefault(c["label"], c)
    C_ = list(by_label.values())
    # 트랙 쿼터(weakness part1/part2 최소 1) — §3.6
    C_.sort(key=lambda x: -x["priority"])
    if part == C.WEAKNESS:
        return _quota(C_)
    return C_[:2]


def _quota(C_):
    def track(c):
        sf = (c.get("scoreRefs") or [""])[0]
        return "part1" if sf.startswith("part1") else "part2"
    p1 = [c for c in C_ if track(c) == "part1"]
    p2 = [c for c in C_ if track(c) == "part2"]
    if p1 and p2:
        return [p1[0], p2[0]]
    return C_[:2]


def _mirror_exclusion(selected):
    """같은 라벨이 강점·보완 양쪽에 mirror로 겹치면 한쪽만(§3.6). 데모: 라벨쌍 충돌만 처리."""
    s_labels = {c["label"] for c in selected[C.STRENGTH]}
    selected[C.WEAKNESS] = [c for c in selected[C.WEAKNESS]
                            if C.MIRRORS.get(c["label"]) not in s_labels]
    return selected


# ── S5 emit JSONL ─────────────────────────────────────────────────────────────
def emit_jsonl(decision, inp, generated_at="1970-01-01T00:00:00Z"):
    R, axes = inp["R"], inp["axes"]
    meta = {
        "type": "meta", "attemptId": inp["ctx"].get("attemptId", "att_demo"),
        "problem": inp["ctx"].get("problem", "general/3.contract_expiry_tracking"),
        "generatedAt": generated_at, "pipelineVersion": "s03-v3",
        "headlineScore": decision["headlineScore"],
        "totalTurns": inp["ctx"].get("total_turns", len(inp["turns"])),
        "axes": axes, "audit": decision["audit"],
    }
    lines = [meta]
    for bucket in (C.STRENGTH, C.WEAKNESS, C.SUGGEST):
        for i, c in enumerate(decision["decision"][bucket], 1):
            lines.append(_item(bucket, i, c, inp))
    return lines


def _item(bucket, order, c, inp):
    """결정적 사실(scoreRefs·인용 ref)을 박은 item **스켈레톤**을 낸다.
    서술 슬롯(context/title/workflow.text/action_steps/prompts)은 **비운다** →
    실제 실행은 synthesizer(LLM)가 채운다. backend=mock(테스트)만 narration fixture로 주입."""
    nar = inp["narration"].get(c["label"])  # mock 전용. 실제 실행이면 None
    if nar is not None:
        return {
            "type": "item", "bucket": bucket, "order": order, "label": c["label"],
            "tier": c["tier"], "scoreLinked": c["scoreLinked"], "scoreRefs": c["scoreRefs"],
            "axisRef": c.get("axisRef"), "needsNarration": False,
            "context": nar.get("context", c["label"]), "title": nar.get("title", c["label"]),
            "workflow": _fill_refs(nar.get("workflow", []), inp),
            "action_steps": nar.get("action_steps", []), "prompts": nar.get("prompts", []),
            "evidence": nar.get("evidence", {"quoteRefs": [], "cellDeltaRefs": [],
                                             "scorePointers": c["scoreRefs"] or []}),
        }
    # 실제 실행: 서술 비움 + synthesizer 가 채울 결정적 근거(인용 ref·점수 포인터)만 주입
    return {
        "type": "item", "bucket": bucket, "order": order, "label": c["label"],
        "tier": c["tier"], "scoreLinked": c["scoreLinked"], "scoreRefs": c["scoreRefs"],
        "axisRef": c.get("axisRef"), "needsNarration": True,
        "context": None, "title": None,
        "workflow": [{"role": r, "text": None, "ref": None} for r in ("요청", "AI 처리", "결과")],
        "action_steps": [], "prompts": [],
        "injected": {"quoteRefs": _quote_refs(c, inp), "scorePointers": c["scoreRefs"] or []},
        "evidence": {"quoteRefs": _quote_refs(c, inp), "cellDeltaRefs": [],
                     "scorePointers": c["scoreRefs"] or []},
    }


def _quote_refs(c, inp):
    """라우팅 윈도우에서 이 후보의 인용 출처 turns#N 만 결정적으로 추린다(텍스트는 synthesizer 가 주입)."""
    wins = inp["ctx"].get("windows", {}).get(c["label"], [])
    return [f"turns#{tn}" for tn, _ in wins]


def _fill_refs(workflow, inp):
    """요청 행 text를 turns 정본 substring으로 강제(인용 주입; G1 충족)."""
    out = []
    for row in workflow:
        r = dict(row)
        if r.get("role") == "요청" and r.get("ref", "").startswith("turns#"):
            tn = r["ref"].split("#")[1]
            src = inp["turns"].get(str(tn))
            if src and r.get("text") and r["text"] not in src:
                r["text"] = src  # 정본 우선(데모): 인용은 항상 실제 발화
        out.append(r)
    return out
