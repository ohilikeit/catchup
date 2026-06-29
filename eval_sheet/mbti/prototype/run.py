"""run.py — CLI: python3 run.py <transcript.jsonl>

항상 라이브(실제 Anthropic API). mock·오프라인 모드 없음.
파이프라인: parse → 4× LLM judge → features → score → §6.2 JSON emit.

사용:
    python3 run.py fixtures/architect.jsonl

오류:
    파일 없음 → "파일을 읽을 수 없습니다: <path> (ENOENT)" exit 1
    키 없음/네트워크/모델 거부 → 한글 메시지 + 원문 exit 1
"""

from __future__ import annotations

import json
import sys
from typing import Any

from features import compute_features
from judge import JudgeError, classify_axis
from parse import parse_transcript
from prompts import AXES, PROMPT_VERSION
from score import display_pole, score_axis, type_letter
from judge import _model  # noqa: PLC2701  (모델 id를 메타에 기록)


def _build_output(attempt_id: str, axes_out: dict[str, Any]) -> dict[str, Any]:
    """§6.2 최종 산출. 게이트된 축은 type_code 슬롯에 '—'."""
    letters: list[str] = []
    for axis in AXES:
        ax = axes_out[axis]
        if ax.get("score") is None:
            letters.append("—")
        else:
            letters.append(type_letter(axis, ax["score"]))
    type_code = "-".join(letters)

    return {
        "attempt_id": attempt_id,
        "type_code": type_code,
        "axes": axes_out,
        "scoring_meta": {
            "model": _model(),
            "prompt_version": PROMPT_VERSION,
            "cohort_n": 1,
            "residualized_vs_passfail": False,
            "internal_only": True,
            "mode": "live",
        },
    }


def run(path: str) -> dict[str, Any]:
    session = parse_transcript(path)

    # 4× LLM judge(축당 1콜). 한 콜이라도 실패하면 전체 중단(라이브 보장).
    judges: dict[str, dict[str, Any]] = {}
    for axis in AXES:
        judges[axis] = classify_axis(axis, session)

    features = compute_features(session, judges)

    axes_out: dict[str, Any] = {}
    for axis in AXES:
        axes_out[axis] = score_axis(axis, judges[axis], features)

    attempt_id = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return _build_output(attempt_id, axes_out)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("사용법: python3 run.py <transcript.jsonl>", file=sys.stderr)
        return 1
    path = argv[1]

    try:
        result = run(path)
    except FileNotFoundError:
        print(f"파일을 읽을 수 없습니다: {path} (ENOENT)", file=sys.stderr)
        return 1
    except JudgeError as e:
        print(f"LLM 채점 실패: {e}", file=sys.stderr)
        return 1
    except KeyError as e:
        print(f"필수 키가 없습니다: {e}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
