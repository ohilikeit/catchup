# `section03.jsonl` — 출력 계약 (렌더 입력)

> 섹션 03 피드백의 최종 결정적 산출물. **JSONL**(한 줄 = 한 JSON object). 병렬 investigator가 줄 단위로
> append 가능하고, 종합기(S5)가 검증 통과분만 남겨 최종본을 만든다. `render/render_html.py`가 이 파일을
> 읽어 V2.0 리포트 HTML 섹션 03(`.guide-card`)을 채운다.

## 1. 줄 종류

| `type` | 개수 | 역할 |
|---|---|---|
| `meta` | 1 (첫 줄) | attempt 식별·헤드라인 점수(정본)·협업축·감사 메타 |
| `item` | 0~6 | 피드백 카드 1개. bucket별 ≤2 |

세 버킷이 모두 나올 필요는 없다(빈 버킷 허용). 억지 생성 금지(불변식 7).

## 2. `meta` 줄

```jsonc
{
  "type": "meta",
  "attemptId": "att_demo",
  "problem": "general/3.contract_expiry_tracking",
  "generatedAt": "2026-06-29T00:00:00Z",   // 워커가 주입(스크립트는 Date 사용 안 함)
  "pipelineVersion": "s03-v3",
  "graderVersion": "contract-grade-1",
  "resultSha256": "…",                      // 정본 result.json 봉인 해시 (감사)
  "headlineScore": { "총점(100)": 83.7 },   // ★ 학생 노출 점수는 이것만 (정본 앵커)
  "totalTurns": 30,                          // chat-log user-turn 수
  "axes": {                                  // 과정 점수(협업 5축). 부재 시 전부 delta:0
    "문제정의":   { "score": 9.0, "cohortAvg": 8.5, "delta":  0.5 },
    "AI출력검토": { "score": 9.0, "cohortAvg": 8.5, "delta":  0.5 },
    "실행환경관리":{ "score": 7.0, "cohortAvg": 7.6, "delta": -0.6 },
    "완성및가치": { "score": 8.4, "cohortAvg": 8.0, "delta":  0.4 },
    "불확실성관리":{ "score": 7.8, "cohortAvg": 7.9, "delta": -0.1 }
  },
  "audit": { "probes": 3, "needsJudge": 1, "droppedByEvidenceGate": 1, "droppedByMirror": 1,
             "selected": { "strength": 1, "weakness": 1, "suggestion": 1 } }
}
```

## 3. `item` 줄 (렌더되는 카드)

```jsonc
{
  "type": "item",
  "bucket": "strength",            // strength | weakness | suggestion
  "order": 1,                       // 버킷 내 노출 순서(1·2)
  "label": "DERIVE_FIELD",          // 카탈로그 닫힌 라벨(감사·dedupe·mirror 키)
  "tier": "Hybrid",                 // A | Hybrid | B | T2(score-only) | process_only — 감사용
  "scoreLinked": true,              // strength/weakness=true, suggestion=false (G3 불변식)
  "scoreRefs": ["part1.필드별.종료일"],   // strength/weakness 필수, suggestion=null
  "axisRef": { "name": "완성및가치", "delta": 0.4 },  // 보강 축(없으면 null)

  // ── 렌더되는 본문 ───────────────────────────────────────────────
  "context": "과제 1 · 종료일 도출",        // .guide-context (≤24자 권장)
  "title": "종료일이 비어도 시작일·기간으로 직접 계산하게 한 방식을 계속 쓰세요",  // .guide-title (h4)
  "workflow": [                              // .guide-workflow-list (요청→AI 처리→결과 3행 고정)
    { "role": "요청",   "text": "종료일 없는 건 시작일에서 계산해줘", "ref": "turns#14" },   // text=chat-log substring(인용)
    { "role": "AI 처리", "text": "빈 종료일을 시작일+계약기간으로 계산해 채웠습니다.", "ref": "turnchunks[0]" },
    { "role": "결과",   "text": "해당 계약들의 종료일이 정답과 일치해 계약대장 점수에 반영됐습니다.", "ref": "part1.필드별.종료일" }
  ],
  "action_steps": [                          // .guide-action-list (활용 방법)
    "값이 비는 칸은 어떤 규칙으로 채울지 먼저 정합니다.",
    "AI에게 계산 규칙을 명시해 직접 도출하도록 요청합니다.",
    "도출 결과를 정답 기준과 한 번 대조합니다."
  ],
  "prompts": [                               // .guide-prompt-list (바로 활용할 문장)
    "빈 칸은 비워두지 말고 시작일과 기간으로 계산해서 채워줘.",
    "계산이 필요한 칸은 근거 규칙을 말해주고 값을 채워줘."
  ],

  // ── 렌더 안 됨 / 감사·게이트 전용 ───────────────────────────────
  "evidence": {
    "quoteRefs":    ["turns#14"],                          // G1: workflow.text의 인용 출처(substring 대조)
    "cellDeltaRefs":["after#9.종료일.CT-2025-028"],        // diff 출처
    "scorePointers":["part1.필드별.종료일"]                // G2: 점수 숫자 출처
  }
}
```

## 4. 렌더 매핑 (V2.0 HTML)

| JSONL | V2.0 DOM | 비고 |
|---|---|---|
| `bucket=strength` | `<h3>1. 계속 활용할 방식</h3>` 아래 | |
| `bucket=weakness` | `<h3>2. 보완하면 좋은 방식</h3>` 아래 | |
| `bucket=suggestion` | `<h3>3. 새롭게 시도할 방식</h3>` 아래 | suggestion은 `scoreLinked=false`라 점수 문구 금지 |
| `context` | `.guide-context` | |
| `title` | `.guide-title` (h4) | |
| `workflow[]` | `.guide-workflow-list` → `<dt>{role}</dt><dd>{text}</dd>` | 3행 고정 |
| `action_steps[]` | `.guide-action-list` `<li>` | |
| `prompts[]` | `.guide-prompt-list` `<li>` | |

## 5. 불변식(렌더 전 `gates.py` 재검사)

- **G1 인용:** 모든 `workflow[].role=="요청"` 의 `text` ⊂ 해당 `turns#N` user 발화(공백정규화).
- **G2 점수:** `결과` dd·title 속 숫자는 `scoreRefs`가 가리키는 `result.json` 값과 일치(ε). LLM이 숫자 창작 금지.
- **G3 분류:** `scoreLinked=true ⇒ scoreRefs≠null` / `false ⇒ scoreRefs=null` & 점수 문구 없음.
- **G4 무근거 스캐너:** 산문 칸(title·action·prompts)에서 숫자·"N번째"·"%"·필드명 탐지 시 출처 대조.
- **GB1 증거해소:** `evidence.*Refs` 모든 ref가 실재(미해소 1개라도 카드 드롭).
- **그라운딩 금칙:** 컬럼 영문화·가짜 한글 명명범위 수식 예시 금지(overview §2). 인과는 "이 셀/대상이 틀려 점수가 이만큼".

> 위반 카드는 **드롭**(빈 버킷 허용). 점수·인용은 주입이라 환각면이 선제로 0에 가깝고, 게이트는 최종 안전망.
