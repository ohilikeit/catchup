"""judge.py — 축당 1회, 실제 Anthropic Messages API 호출(LLM-only).

원칙(measurement-design §3, 작업 요구):
- 판사는 **항상 실제 LLM을 호출**한다. mock·오프라인 휴리스틱 모드 없음.
- 의미 분류는 전부 LLM이 한다. 정규식 의미 판정 없음.
- tools + tool_choice로 구조화 출력을 강제하고 tool_use.input을 결과로 읽는다.
- temperature=0(재현성).

스택: urllib.request(표준 라이브러리)만 사용. requests·pip 의존성 없음.
키: ANTHROPIC_API_KEY 환경변수 우선, 없으면 repo 루트 .env.secret에서 파싱.
키 값은 절대 출력·로그·커밋하지 않는다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from prompts import build_instruction, build_tool_schema

DEFAULT_BASE_URL = "https://api.anthropic.com"
DEFAULT_MODEL = "claude-haiku-4-5"
ANTHROPIC_VERSION = "2023-06-01"

# repo 루트의 .env.secret 을 상향 탐색으로 찾는다(폴더 깊이가 바뀌어도 동작).
def _find_env_secret() -> str | None:
    d = os.path.abspath(os.path.dirname(__file__))
    while True:
        cand = os.path.join(d, ".env.secret")
        if os.path.exists(cand):
            return cand
        parent = os.path.dirname(d)
        if parent == d:  # 파일시스템 루트 도달
            return None
        d = parent


_ENV_SECRET = _find_env_secret()


class JudgeError(RuntimeError):
    """LLM 호출/파싱 실패를 사용자에게 전달하기 위한 예외."""


def _strip_quotes(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
        return v[1:-1]
    return v


def _load_api_key() -> str:
    """ANTHROPIC_API_KEY를 env → .env.secret 순으로 로드. 키 값은 절대 노출하지 않는다."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key and key.strip():
        return key.strip()
    if _ENV_SECRET and os.path.exists(_ENV_SECRET):
        with open(_ENV_SECRET, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, _, val = line.partition("=")
                if name.strip() == "ANTHROPIC_API_KEY":
                    val = _strip_quotes(val)
                    if val:
                        return val
    raise JudgeError(
        "ANTHROPIC_API_KEY를 찾을 수 없습니다. 환경변수로 설정하거나 "
        f"{_ENV_SECRET} 에 'ANTHROPIC_API_KEY=...' 줄을 추가하세요."
    )


def _base_url() -> str:
    return os.environ.get("ANTHROPIC_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _model() -> str:
    return os.environ.get("MODEL", DEFAULT_MODEL)


def _render_conversation(session: dict[str, Any]) -> str:
    """전체 대화를 STUDENT/AI로 마킹해 문자열로 만든다.

    학생 턴에는 [u<번호>]를 붙여 turn_labels의 turn과 매핑되게 한다.
    AI 턴은 맥락으로만 제공(채점 대상 아님을 라벨로 명시).
    """
    user_index_by_turn = {
        t["index"]: t["user_index"] for t in session["user_turns"]
    }
    lines: list[str] = []
    for t in session["turns"]:
        if t["role"] == "user":
            uidx = user_index_by_turn.get(t["index"])
            lines.append(f"STUDENT [u{uidx}]: {t['text']}")
        else:
            lines.append(f"AI (맥락, 채점 안 함): {t['text']}")
    return "\n\n".join(lines)


def _post_messages(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Anthropic Messages API에 POST. 네트워크/HTTP/JSON 오류를 JudgeError로 변환."""
    url = f"{_base_url()}/v1/messages"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            pass
        # 모델 거부 등은 본문을 그대로 보고(verbatim) — 키 값은 본문에 없음
        raise JudgeError(
            f"Anthropic API HTTP {e.code} {e.reason}: {body}"
        ) from None
    except urllib.error.URLError as e:
        raise JudgeError(f"네트워크 오류: {e.reason}") from None
    except Exception as e:  # noqa: BLE001
        raise JudgeError(f"요청 실패: {e}") from None

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise JudgeError(f"API 응답 JSON 파싱 실패: {e}") from None


def _extract_tool_input(resp: dict[str, Any]) -> dict[str, Any]:
    """응답 content에서 tool_use 블록의 input(JSON 결과)을 꺼낸다."""
    content = resp.get("content")
    if not isinstance(content, list):
        raise JudgeError(f"예상치 못한 API 응답 구조: {json.dumps(resp)[:300]}")
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_use":
            inp = block.get("input")
            if isinstance(inp, dict):
                return inp
    # tool_use가 없으면(예: 모델이 텍스트로 답함) 오류
    raise JudgeError(
        "모델이 강제된 tool을 호출하지 않았습니다. "
        f"응답: {json.dumps(resp)[:300]}"
    )


def classify_axis(axis: str, session: dict[str, Any]) -> dict[str, Any]:
    """한 축에 대해 실제 LLM judge를 1회 호출하고 결과를 반환.

    반환: {axis, band, evidence[], coverage{scorable_turns, ok}, turn_labels[...]}
    실패 시 JudgeError를 올린다(run.py에서 처리).
    """
    api_key = _load_api_key()
    instruction = build_instruction(axis)
    tool = build_tool_schema(axis)
    conversation = _render_conversation(session)

    user_content = (
        instruction
        + "\n\n=== 대화 시작 ===\n\n"
        + conversation
        + "\n\n=== 대화 끝 ===\n\n"
        + "report_axis tool로 결과를 보고하라."
    )

    payload = {
        "model": _model(),
        "max_tokens": 2048,
        "temperature": 0,
        "tools": [tool],
        "tool_choice": {"type": "tool", "name": "report_axis"},
        "messages": [{"role": "user", "content": user_content}],
    }

    resp = _post_messages(payload, api_key)
    result = _extract_tool_input(resp)

    # 결과 정규화(필수 키 보강)
    band = result.get("band")
    if not band:
        raise JudgeError(f"[{axis}] 모델이 band를 반환하지 않았습니다: {result}")
    evidence = result.get("evidence") or []
    coverage = result.get("coverage") or {}
    if "ok" not in coverage:
        coverage = {
            "scorable_turns": coverage.get("scorable_turns", 0),
            "ok": False,
        }
    turn_labels = result.get("turn_labels") or []

    return {
        "axis": axis,
        "band": band,
        "evidence": evidence,
        "coverage": {
            "scorable_turns": int(coverage.get("scorable_turns", 0) or 0),
            "ok": bool(coverage.get("ok", False)),
        },
        "turn_labels": turn_labels,
    }
