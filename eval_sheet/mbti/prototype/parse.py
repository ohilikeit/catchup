"""parse.py — Claude Code 트랜스크립트(JSONL) → 학생/AI 턴 리스트.

측정면은 학생 발화(role=user)뿐(measurement-design §1·§2). 이 모듈은 JSONL을
펼쳐 순서·타임스탬프·텍스트를 가진 턴 리스트를 만든다.

규칙(NO regex semantic detection):
- assistant 텍스트 = text 블록만 이어붙이고 tool_use 블록은 **버린다**(§1: tool_use=AI 행동, 측정 제외).
- 에러/완료/관여 phase 같은 **의미 판정은 절대 여기서 하지 않는다** — 그건 LLM judge의 몫(④).
  이 파일에는 정규식이 없다.
"""

from __future__ import annotations

import json
from typing import Any


def _text_from_content(content: Any) -> str:
    """메시지 content를 평탄화해 텍스트만 남긴다.

    - 문자열이면 그대로.
    - 블록 리스트면 type=='text' 블록의 text만 이어붙이고, tool_use/tool_result 등은 버린다.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    t = block.get("text", "")
                    if isinstance(t, str) and t.strip():
                        parts.append(t.strip())
                # tool_use / tool_result / thinking 등은 의도적으로 드롭(§1)
            elif isinstance(block, str) and block.strip():
                parts.append(block.strip())
        return "\n".join(parts).strip()
    return str(content).strip()


def _normalize_record(rec: dict[str, Any]) -> tuple[str, Any, Any] | None:
    """다양한 JSONL 스키마를 (role, content, ts)로 정규화.

    지원 형태:
      1) 평면: {"role": "...", "content": ..., "ts": ...}
      2) 중첩: {"type": "user"/"assistant", "message": {"role","content"}, "timestamp": ...}
    role이 user/assistant가 아니면 None.
    """
    role = rec.get("role")
    content = rec.get("content")
    ts = rec.get("ts", rec.get("timestamp"))

    # 중첩(Claude Code 세션 로그) 형태
    if role is None and isinstance(rec.get("message"), dict):
        msg = rec["message"]
        role = msg.get("role", rec.get("type"))
        content = msg.get("content")
        ts = ts if ts is not None else rec.get("timestamp")

    if role is None:
        role = rec.get("type")

    if role not in ("user", "assistant"):
        return None
    return role, content, ts


def parse_transcript(path: str) -> dict[str, Any]:
    """JSONL 파일 → {turns, user_turns}.

    각 turn: {role, index, ts, text}
    - index는 전체 턴(user+assistant) 순서 인덱스(0-base).
    - user_turns는 학생 발화만 골라 user_index를 별도로 부여한 리스트.
    빈 텍스트(텍스트 블록이 하나도 없는) 턴은 제외한다.

    파일이 없으면 FileNotFoundError를 그대로 올린다(run.py가 처리).
    """
    turns: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                # 깨진 라인은 건너뛴다(부분 트랜스크립트 견고성)
                continue
            if not isinstance(rec, dict):
                continue
            norm = _normalize_record(rec)
            if norm is None:
                continue
            role, content, ts = norm
            text = _text_from_content(content)
            if not text:
                # 텍스트가 전혀 없는 턴(예: tool_use만 있는 assistant 턴)은 제외
                continue
            turns.append(
                {
                    "role": role,
                    "index": len(turns),
                    "ts": ts,
                    "text": text,
                }
            )

    user_turns: list[dict[str, Any]] = []
    for t in turns:
        if t["role"] == "user":
            ut = dict(t)
            ut["user_index"] = len(user_turns)
            user_turns.append(ut)

    return {"turns": turns, "user_turns": user_turns}
