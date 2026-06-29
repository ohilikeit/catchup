"""prompts.py — 4축 LLM judge 프롬프트 + 축별 tool input_schema.

핵심 원칙(measurement-design §1·§3·§5):
- 학생의 user 턴만 채점한다. AI 텍스트는 학생 발화의 *의미를 해석*하기 위한 맥락일 뿐
  절대 채점하지 않는다.
- LLM은 **의미를 분류**한다(라벨 + 밴드). 자유 숫자(0–100)는 내지 않는다 — 숫자는 규칙(score.py)이 매긴다.
- 출력은 tool input_schema로 **구조화 강제**한다(judge.py가 tool_choice로 강제).
- ④ 관여의 phase(general/post_error/post_success)는 정규식이 아니라 **이 judge가 대화 맥락에서** 판정한다.

프롬프트 버전: mbti-judge@proto2
"""

from __future__ import annotations

PROMPT_VERSION = "mbti-judge@proto2"

# 모든 프롬프트가 공유하는 채점 규약 머리말.
_COMMON_HEADER = """당신은 코딩 세션 트랜스크립트에서 **학생의 성향**을 측정하는 채점기다.

엄수할 철칙:
1. 채점 대상은 오직 **학생 발화(STUDENT 턴)** 다. AI 발화(AI 턴)는 학생 발화의 의미를
   해석하기 위한 **맥락**일 뿐, 그 자체로는 절대 채점하지 않는다.
2. 너는 의미를 **분류**만 한다. 0~100 같은 자유 점수를 내지 마라 — 밴드(이산 라벨)와
   턴별 라벨, 근거 인용만 낸다.
3. 근거(evidence)는 반드시 학생 발화에서 인용한다.
4. 신호가 부족하면 coverage.ok=false로 정직하게 보고한다. 없는 신호를 지어내지 마라.

아래는 한 세션의 대화다. STUDENT/AI로 화자가 표시돼 있고, 각 STUDENT 턴에는
[u<번호>]로 user 인덱스가 붙어 있다(이 번호로 turn_labels의 turn을 가리킨다).
"""

# ── ① 계획성 (planning) — P(설계자) ↔ E(탐험가) ──────────────────────────────
PLANNING_INSTRUCTION = """[축 ①: 계획성 — 설계자(P) ↔ 탐험가(E)]

측정 구간: 세션 시작부터 학생이 첫 '생성요청'(만들어줘/구현해줘 류) 발화를 던지기 **직전까지**
(pre-build 도입 구간). 경계는 AI가 도구를 언제 실행했는지가 아니라, 학생이 언제 "만들어줘"라고
말했는지로 끊는다.

핵심 질문: 학생은 만들라고 말하기 전에 먼저 **말로 계획·구조·요구사항**을 세웠는가,
곧장 만들라고 했는가?

각 pre-build 학생 턴(첫 생성요청 이전 턴들)에 intent를 라벨링하라:
- 계획정의: 요구사항·구조·제약·범위·단계를 말로 정리(P 신호)
- 맥락설정: 만들 대상의 배경/목표를 설명하나 본격 설계는 아님
- 생성요청: "만들어줘/구현해줘" 식의 산출 지시(여기서 pre-build 종료)
- 기타: 인사·잡담(카운트 제외)
그리고 그 턴이 파일/기능/모듈/화면을 **열거**하는 구조 스케치이면 has_structure_sketch=true.

밴드(band) 선택:
- strong_P: 첫 턴이 계획정의이고 생성요청 전 계획정의 턴 다수(≥3) 또는 구조 스케치 존재
- lean_P:   첫 턴이 계획정의/맥락설정이고 생성요청 전 계획정의 턴 1~2개, 또는 계획 신호 뚜렷
- mixed:    짧은 맥락 한두 줄 뒤 바로 생성요청, 또는 양쪽 약한 신호
- lean_E:   거의 곧장 생성요청이나 한 줄짜리 가벼운 맥락이 선행
- strong_E: 첫 발화가 곧장 생성요청이고 pre-build 계획 발화 0

turn_labels에는 pre-build 학생 턴만 담는다(첫 생성요청 턴까지 포함, 그 이후 턴은 제외).
coverage.scorable_turns = 분류 가능했던 pre-build 학생 턴 수.
"""

# ── ② 위임 스타일 (delegation) — D(지휘자) ↔ G(위임가) ───────────────────────
DELEGATION_INSTRUCTION = """[축 ②: 위임 스타일 — 지휘자(D) ↔ 위임가(G)]

이 축은 '누가 손으로 코드를 짰나'가 아니라 **학생이 일을 어떻게 말로 나눠 맡기는가**(위임 화법)를 본다.

핵심 질문: 학생은 일을 **잘게 쪼개 구체적으로 지시**(지휘자)하는가, **통째로 위임**(위임가)하는가?

각 학생 턴을 라벨링하라:
- is_directive: 그 발화가 위임/요청성 지시인가(true) 아니면 단순 질문·잡담(false)인가. false면 scope/specificity는 생략.
- scope ∈ {전체위임, 부분작업, 단일수정}: 발화가 요구하는 작업 덩어리 크기.
    전체위임="앱 전부 알아서 만들어줘"류 / 부분작업=한 기능·화면 단위 / 단일수정=특정 함수·줄·조건 하나.
- specificity ∈ {구체단계적, 추상}: 어느 함수/파일/조건을 어떻게 바꿀지 명시(구체단계적)인가, "알아서 다 해줘"(추상)인가.

밴드(band) 선택(고-% 극=지휘자):
- strong_D: 위임성 발화 대부분이 단일수정/부분작업·구체 지시(통째 위임률 낮음, 분해 지시 다수)
- lean_D:   쪼갠 지시 우세, 가끔 통째 위임
- mixed:    통째 위임과 쪼갠 지시 비슷
- lean_G:   통째 위임 우세, 간헐적 부분 지시
- strong_G: 거의 모든 위임성 발화가 "전체 알아서" 추상 통째 위임, 분해 거의 0

turn_labels에는 학생 턴을 담되 is_directive=true인 턴 위주로(분모). coverage.scorable_turns = is_directive=true 턴 수.
"""

# ── ③ 소통 (communication) — S(정밀가) ↔ C(대화가) ──────────────────────────
COMMUNICATION_INSTRUCTION = """[축 ③: 소통 — 정밀가(S) ↔ 대화가(C)]

핵심 질문: 한 번에 길고 빽빽하게 담아 보내는가(정밀가), 짧게 자주 주고받는가(대화가)?
길이·턴수의 산술은 규칙이 따로 센다 — 너는 **요구항목 열거**와 **오류 보고 정밀도**만 라벨링한다.

각 학생 턴을 라벨링하라:
- requirements: 그 발화가 담은 **독립된 요구·제약 항목 수**(정수). 한 발화에 여러 요구를 묶을수록 정밀가 신호.
- error_report_precision ∈ {로그첨부, 증상묘사, 해당없음}: 오류를 보고하는 발화라면 로그 전문을 붙였는가(로그첨부),
    "안 돼요" 식 증상 한 줄인가(증상묘사), 오류 보고가 아니면 해당없음.

밴드(band) 선택(고-% 극=정밀가):
- strong_S: 발화가 길고 턴 수 적음, 한 발화에 여러 요구, 오류 시 로그 전문
- lean_S:   대체로 길게 묶어 보내나 짧은 후속이 일부
- mixed:    길이·빈도 중간이거나 장·단 혼재
- lean_C:   대체로 짧고 자주, 요구를 한두 개씩 나눠 전달
- strong_C: 발화가 짧고 턴 수 많음, 한 번에 한 가지, 오류는 증상만

turn_labels에는 모든 학생 턴을 담는다. coverage.scorable_turns = 학생 턴 수.
"""

# ── ④ 언어적 관여 (engagement) — M(장인) ↔ R(실용가) ────────────────────────
ENGAGEMENT_INSTRUCTION = """[축 ④: 언어적 관여 — 장인(M) ↔ 실용가(R)]

핵심 질문: "왜·어떻게 동작하는가"를 말로 캐묻고 결과 후에도 이해·정리를 잇는가(장인M),
결과만 얻으면 멈추는가(실용가R)?

먼저 대화 맥락에서 각 학생 턴의 **phase**를 너 스스로 판정하라(정규식 금지, 맥락으로만):
- post_error: 직전 AI 발화가 에러/실패를 announce한 직후의 학생 발화
- post_success: 직전 AI 발화가 완료/성공을 announce한 직후의 학생 발화
- general: 그 외
에러·완료 시점은 **AI 발화 텍스트**로만 식별한다(파일·grade 같은 비채팅 이벤트는 없다).

그리고 각 학생 턴의 intent를 라벨링하라:
- understanding_seek: 원리/왜/어떻게/근거를 캐묻는 발화
- cause_probe: 에러 직후 원인을 탐구하는 발화
- cleanup_refine: 완료 후 정리·개선을 잇는 발화
- retry_rollback: 에러 직후 "그냥 다시 해줘/되돌려" 식 재요청
- terminate: 완료 즉시 종료/만족하고 멈춤
- other: 그 외

밴드(band) 선택(고-% 극=장인):
- strong_M: understanding_seek 비율 높음(약 25%+), 에러 직후 cause_probe 우세, 완료 후에도 이해/정리 지속
- lean_M:   원리 질문 산발적(약 10%+) 또는 에러 직후 1회 이상 cause_probe
- mixed:    원리 질문 드묾(<10%), 에러·완료 후 반응 혼재 또는 신호 희박
- lean_R:   거의 결과 지향, 에러 직후 retry_rollback 우세, 원리 질문 0~1회
- strong_R: 원리 질문 0, 에러 직후 전부 retry_rollback, 완료 즉시 terminate

coverage 게이트(축 ④는 자주 게이트된다):
- 세션 동안 에러가 한 번도 표면화되지 않았고(phase=post_error 0건) AND understanding_seek 0건이면 → coverage.ok=false.
- 스코어 가능 학생 발화 < 4면 → coverage.ok=false.
turn_labels에는 모든 학생 턴을 phase·intent와 함께 담는다. coverage.scorable_turns = 학생 턴 수.
"""

# 축별 밴드 코드(score.py BAND_CODES와 일치해야 함; 낮은 % → 높은 % 순)
_BAND_ENUMS = {
    "planning": ["strong_E", "lean_E", "mixed", "lean_P", "strong_P"],
    "delegation": ["strong_G", "lean_G", "mixed", "lean_D", "strong_D"],
    "communication": ["strong_C", "lean_C", "mixed", "lean_S", "strong_S"],
    "engagement": ["strong_R", "lean_R", "mixed", "lean_M", "strong_M"],
}

# 축별 turn_labels 항목 스키마(properties)
_TURN_LABEL_PROPS = {
    "planning": {
        "turn": {"type": "integer", "description": "학생 user 인덱스 [u<번호>]"},
        "intent": {
            "type": "string",
            "enum": ["계획정의", "맥락설정", "생성요청", "기타"],
        },
        "has_structure_sketch": {"type": "boolean"},
    },
    "delegation": {
        "turn": {"type": "integer", "description": "학생 user 인덱스 [u<번호>]"},
        "is_directive": {"type": "boolean"},
        "scope": {
            "type": "string",
            "enum": ["전체위임", "부분작업", "단일수정"],
            "description": "is_directive=true일 때만",
        },
        "specificity": {
            "type": "string",
            "enum": ["구체단계적", "추상"],
            "description": "is_directive=true일 때만",
        },
    },
    "communication": {
        "turn": {"type": "integer", "description": "학생 user 인덱스 [u<번호>]"},
        "requirements": {
            "type": "integer",
            "description": "이 발화가 담은 독립 요구·제약 항목 수",
        },
        "error_report_precision": {
            "type": "string",
            "enum": ["로그첨부", "증상묘사", "해당없음"],
        },
    },
    "engagement": {
        "turn": {"type": "integer", "description": "학생 user 인덱스 [u<번호>]"},
        "phase": {
            "type": "string",
            "enum": ["general", "post_error", "post_success"],
        },
        "intent": {
            "type": "string",
            "enum": [
                "understanding_seek",
                "cause_probe",
                "cleanup_refine",
                "retry_rollback",
                "terminate",
                "other",
            ],
        },
    },
}

_REQUIRED_TURN_KEYS = {
    "planning": ["turn", "intent"],
    "delegation": ["turn", "is_directive"],
    "communication": ["turn", "requirements"],
    "engagement": ["turn", "phase", "intent"],
}

_INSTRUCTIONS = {
    "planning": PLANNING_INSTRUCTION,
    "delegation": DELEGATION_INSTRUCTION,
    "communication": COMMUNICATION_INSTRUCTION,
    "engagement": ENGAGEMENT_INSTRUCTION,
}

AXES = ("planning", "delegation", "communication", "engagement")


def build_instruction(axis: str) -> str:
    """축 프롬프트 본문(머리말 + 축별 지시)을 만든다."""
    if axis not in _INSTRUCTIONS:
        raise ValueError(f"unknown axis: {axis}")
    return _COMMON_HEADER + "\n" + _INSTRUCTIONS[axis]


def build_tool_schema(axis: str) -> dict:
    """축별 강제 출력 tool 정의(input_schema 포함).

    judge.py가 이 tool 하나를 tool_choice로 강제 → tool_use.input을 JSON 결과로 읽는다.
    """
    if axis not in _BAND_ENUMS:
        raise ValueError(f"unknown axis: {axis}")
    return {
        "name": "report_axis",
        "description": (
            f"{axis} 축 채점 결과를 보고한다. band(이산 밴드)와 학생 턴별 라벨, "
            "근거 인용, coverage만 낸다. 0~100 자유 점수는 내지 않는다."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "band": {
                    "type": "string",
                    "enum": _BAND_ENUMS[axis],
                    "description": "이 축의 5밴드 중 하나",
                },
                "evidence": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "밴드를 뒷받침하는 학생 발화 인용(2~6개)",
                },
                "coverage": {
                    "type": "object",
                    "properties": {
                        "scorable_turns": {"type": "integer"},
                        "ok": {"type": "boolean"},
                    },
                    "required": ["scorable_turns", "ok"],
                },
                "turn_labels": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": _TURN_LABEL_PROPS[axis],
                        "required": _REQUIRED_TURN_KEYS[axis],
                    },
                },
            },
            "required": ["band", "evidence", "coverage", "turn_labels"],
        },
    }
