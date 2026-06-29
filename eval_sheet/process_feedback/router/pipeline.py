# -*- coding: utf-8 -*-
"""process-feedback 결정적 spine (overview.md §3·§4·§6.3).

  S2 route   : result.json(Map A) + 협업축(Map B) + ctx → routing_plan (probe·needsJudge)
  S3 fan-out : needsJudge 후보별 investigator (mock | http | task)
  S4 decide  : 입장게이트·mirror·쿼터·랭킹·선별 → part_decision
  S5 emit    : section03.jsonl (서술 슬롯은 비움 → synthesizer 가 채움. backend=mock 만 fixture 사용)

⚠️ 이 스킬은 **실제 attempt 입력을 요구한다. 데모/폴백 데이터는 코드에 없다.**
입력 번들(--inputs DIR)에 아래가 없으면 **하드 에러로 무엇이 없는지 요구하고 멈춘다**:
  result.json   (필수)  정본 결과 점수 — grade.py 산출
  turns.json    (필수)  chat-log user-turn 정본 {N: "발화"} — S1 전처리 산출(인용 출처)
  ctx.json      (필수)  스냅샷·턴 파생 신호(turnchunks 요약: overcome_*, total_turns, windows, cellDelta)
  process-axes.json     협업 5축 {score,cohortAvg,delta} — 없으면 --cold-start 로 명시해야 중립 폴백
backend=mock(테스트 전용)일 때만 --narration 으로 서술 fixture 를 주입한다.
"""
import argparse
import json
from pathlib import Path

from eval_sheet.process_feedback.router import catalog as C
from eval_sheet.process_feedback.router.mock_investigator import investigate
from eval_sheet.process_feedback.router import decide as D


class MissingInputError(SystemExit):
    """필수 입력 부재 — 스킬은 폴백하지 않고 요구한다."""


REQUIRED = {
    "result.json": "정본 결과 점수(grade.py 산출). 채점이 끝난 attempt 라야 한다.",
    "turns.json": "chat-log user-turn 정본 {N:'발화'}. S1 전처리(chat-log.v1.json 정규화) 산출.",
    "ctx.json": "스냅샷·턴 파생 신호(turnchunks 요약). S1 전처리(재채점·청킹) 산출.",
}


# ── 입력 로드 + result.json 평탄화 ────────────────────────────────────────────
def _flatten_result(r: dict) -> dict:
    R = {}
    for part in ("part1", "part2"):
        for k, v in (r.get(part) or {}).items():
            R[f"{part}.{k}"] = v
            if k == "필드별":
                for fk, fv in (v or {}).items():
                    R[f"{part}.필드별.{fk}"] = fv
    for k, v in (r.get("score") or {}).items():
        R[f"score.{k}"] = v
    return R


def load_inputs(d: Path, cold_start=False, narration_path=None):
    d = Path(d)
    # ── 필수 입력 검증: 없으면 폴백 없이 요구하고 멈춘다 ──────────────────────
    missing = [f"  - {name}: {why}" for name, why in REQUIRED.items() if not (d / name).exists()]
    if missing:
        raise MissingInputError(
            "이 스킬은 실제 attempt 입력을 요구합니다(데모 폴백 없음). "
            f"다음 입력이 '{d}' 에 없습니다 — 먼저 해소하세요:\n" + "\n".join(missing) +
            "\n→ S1 전처리(재채점·청킹·chat-log 정규화)를 먼저 돌리거나, 채점이 끝난 attemptId 를 확인하세요.")

    def j(name):
        return json.loads((d / name).read_text(encoding="utf-8"))

    axes_p = d / "process-axes.json"
    if axes_p.exists():
        axes = j("process-axes.json")
    elif cold_start:
        axes = {}  # Map B 중립 폴백 — 운영자가 --cold-start 로 명시 인정한 경우만
    else:
        raise MissingInputError(
            "process-axes.json(과정 점수 5축)이 없습니다. 코호트가 없는 콜드스타트라면 "
            "--cold-start 로 명시하세요(그래야 Map B 를 중립 폴백). 임의 폴백은 하지 않습니다.")

    result = j("result.json")
    narration = {}
    if narration_path:                       # backend=mock(테스트) 전용 서술 fixture
        narration = json.loads(Path(narration_path).read_text(encoding="utf-8"))
    return {
        "result": result, "R": _flatten_result(result),
        "axes": axes, "ctx": j("ctx.json"), "turns": j("turns.json"),
        "narration": narration,
    }


# ── S2 라우팅: 카탈로그 fireWhen 순회 → probe ─────────────────────────────────
def route(inp) -> list:
    R, ctx, axes = inp["R"], inp["ctx"], inp["axes"]
    ctx = {**ctx, "total_turns": ctx.get("total_turns", len(inp["turns"]))}
    probes = []
    for label, t in C.CATALOG.items():
        try:
            fired = bool(t.fire_when(R, ctx))
        except Exception:
            fired = False
        if not fired:
            continue
        axis = _pick_axis(t, axes)
        probes.append({
            "id": f"P{len(probes)+1}", "label": label, "kind": t.kind, "tier": t.tier,
            "scoreRefs": [t.src_field] if t.src_field else None,
            "scoreLinked": t.score_linked,
            "evidenceNeed": list(t.evidence_need),
            "axisRef": axis,
            "axisBoost": _axis_boost(t, axis),
            "needsJudge": t.tier in (C.TIER_HY, C.TIER_B) and not _absent_form(label),
            "mirror": t.mirror,
        })
    probes = _evidence_gate(probes, ctx)
    return probes


def _pick_axis(t, axes):
    for name in t.axis_affinity:
        if name in axes:
            a = axes[name]
            return {"name": name, "delta": a.get("delta", 0.0)}
    return None


def _axis_boost(t, axis):
    if not axis:
        return 1.0
    delta = axis.get("delta", 0.0)
    aligned = (t.kind == C.STRENGTH and delta >= 0) or (t.kind in (C.WEAKNESS, C.SUGGEST) and delta < 0)
    return 1.0 + min(abs(delta) / 10.0, 0.5) if aligned else 1.0


def _absent_form(label):
    return label in ("NO_FINAL_VERIFY", "NO_RULE_RESTATE", "NO_INTERMEDIATE_SAMPLE",
                     "ONE_SHOT_DUMP", "MANUAL_EDIT_HEAVY", "REWRITE_CHURN")


def _evidence_gate(probes, ctx):
    """§3.5 fan-out 전 증거-가용성 게이트. 통과 못 하면 강등/드롭."""
    kept = []
    for p in probes:
        if p["tier"] == C.TIER_A:
            p["evidenceReady"] = True
        elif p["tier"] == C.TIER_HY:
            has = ctx.get("evidence", {}).get(p["label"], True)  # 데모: ctx가 명시 안 하면 가용 가정
            p["evidenceReady"] = bool(has)
            if not has:
                p["tier"], p["needsJudge"] = "T2", False         # score-only 강등
        else:  # B
            has = ctx.get("evidence", {}).get(p["label"], True)
            if not has:
                continue                                          # 드롭(발명 금지)
            p["evidenceReady"] = True
        kept.append(p)
    return kept


# ── S3 fan-out ────────────────────────────────────────────────────────────────
def build_packet(p, inp):
    label = p["label"]
    cands = [label] + ([p["mirror"]] if p["mirror"] else [])
    dlg = []
    for tn, win in inp["ctx"].get("windows", {}).get(label, []):
        dlg.append({"userTurn": tn, "text": inp["turns"].get(str(tn), ""), "ref": f"turns#{tn}"})
    return {
        "candidateId": p["id"], "label": label, "candidateTypes": cands,
        "dialogueWindow": dlg,
        "cellDelta": inp["ctx"].get("cellDelta", {}).get(label, []),
        "evidenceAbsence": _absent_form(label),
        "resultRefs": p.get("scoreRefs") or [],
    }


def gather_findings(probes, inp, out: Path, backend):
    """needsJudge 후보의 judge 결과를 모은다.
      mock     : 같은 프로세스에서 결정적 키워드 휴리스틱(테스트 전용).
      task/http: python은 Claude Task·LiteLLM을 띄우지 않는다 → 패킷을 out/packets/ 에 쓰고,
                 오케스트레이터가 out/findings/<cid>.json 에 저장한 결과를 읽는다(없으면 missing 반환).
    반환: (findings, missing_cids)"""
    need = [p for p in probes if p.get("needsJudge")]
    findings, missing = {}, []
    if backend == "mock":
        for p in need:
            findings[p["id"]] = investigate(build_packet(p, inp))
        return findings, missing

    pdir, fdir = out / "packets", out / "findings"
    pdir.mkdir(parents=True, exist_ok=True)
    for p in need:
        (pdir / f"{p['id']}.json").write_text(
            json.dumps(build_packet(p, inp), ensure_ascii=False, indent=2), encoding="utf-8")
        fp = fdir / f"{p['id']}.json"
        if fp.exists():
            findings[p["id"]] = json.loads(fp.read_text(encoding="utf-8"))
        else:
            missing.append(p["id"])
    return findings, missing


# ── 실행 ──────────────────────────────────────────────────────────────────────
def run(inputs_dir, out_dir, backend, generated_at, cold_start=False, narration_path=None):
    if backend == "mock" and not narration_path:
        raise SystemExit("backend=mock 은 테스트 전용이며 --narration <fixture> 가 필요합니다. "
                         "실제 실행은 --backend task|http 로 synthesizer 가 서술을 생성합니다.")
    inp = load_inputs(Path(inputs_dir), cold_start=cold_start, narration_path=narration_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    probes = route(inp)
    (out / "routing_plan.json").write_text(
        json.dumps({"probes": probes, "deterministic": True}, ensure_ascii=False, indent=2), encoding="utf-8")

    findings, missing = gather_findings(probes, inp, out, backend)
    if missing:
        # 핸드오프: 오케스트레이터가 investigator(task) / LiteLLM(http)로 패킷을 판정해야 진행 가능
        (out / "pending_investigations.json").write_text(
            json.dumps({"missing": missing, "packets": "packets/", "writeTo": "findings/<cid>.json"},
                       ensure_ascii=False, indent=2), encoding="utf-8")
        raise SystemExit(
            f"⏸ judge 미완: {len(missing)}건. out/packets/ 의 패킷을 backend={backend}로 판정해 "
            f"out/findings/<cid>.json 에 저장한 뒤 동일 명령을 재실행하세요(대상: {', '.join(missing)}). "
            f"investigator 프롬프트=references/investigator.md.")

    if backend == "mock":
        fdir = out / "findings"
        fdir.mkdir(exist_ok=True)
        for cid, f in findings.items():
            (fdir / f"{cid}.json").write_text(json.dumps(f, ensure_ascii=False, indent=2), encoding="utf-8")

    decision = D.decide(probes, findings, inp)
    (out / "part_decision.json").write_text(
        json.dumps(decision, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = D.emit_jsonl(decision, inp, generated_at=generated_at)
    (out / "section03.jsonl").write_text("\n".join(json.dumps(l, ensure_ascii=False) for l in lines) + "\n",
                                         encoding="utf-8")
    print(f"✓ {len(probes)} probes · {len(findings)} judged · "
          f"{sum(1 for l in lines if l['type']=='item')} items → {out/'section03.jsonl'}")
    return out / "section03.jsonl"


def main():
    ap = argparse.ArgumentParser(description="섹션03 피드백 생성 — 실제 attempt 입력 필수(데모 폴백 없음)")
    ap.add_argument("--inputs", required=True, help="실제 attempt 입력 번들 디렉터리")
    ap.add_argument("--out", required=True)
    ap.add_argument("--backend", required=True, choices=["task", "http", "mock"],
                    help="task|http=실서술(synthesizer) · mock=테스트 전용(--narration 필요)")
    ap.add_argument("--generated-at", required=True, help="ISO8601 — 호출자가 주입(스크립트는 시계 안 씀)")
    ap.add_argument("--cold-start", action="store_true", help="process-axes 부재를 명시 인정(Map B 중립)")
    ap.add_argument("--narration", default=None, help="backend=mock 전용 서술 fixture 경로")
    a = ap.parse_args()
    run(a.inputs, a.out, backend=a.backend, generated_at=a.generated_at,
        cold_start=a.cold_start, narration_path=a.narration)


if __name__ == "__main__":
    main()
