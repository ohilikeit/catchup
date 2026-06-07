// 정규화 대화로그 계약 fixture (P0). docs/1 §5.0·§6("accepted/rejected fixture + validator").
// 평가·BYOD 스크립트는 외부에서 만들지만, "이 입력은 통과/거부되어야 한다"는 계약은 여기에 고정한다.
// runContractCheck()로 validator가 계약을 지키는지 자가검증(테스트 러너 도입 전의 경량 보증).

import { validateChatLog, type NormalizedChatLog } from './chatLog';

const SHA = 'sha256:' + 'a'.repeat(64);

/** 통과해야 하는 정상 로그. */
export const ACCEPTED_FIXTURE: NormalizedChatLog = {
  version: 1,
  tool: 'claude-code',
  model: 'claude-opus-4',
  messages: [
    { id: 'm0', index: 0, role: 'user', content: '기획서를 작성해줘', ts: '2026-09-01T01:00:00.000Z' },
    { id: 'm1', index: 1, role: 'assistant', content: '네, 초안을 만들겠습니다…', ts: '2026-09-01T01:00:05.000Z', tool_calls: [] },
  ],
  meta: { attemptId: 'attempt-123', source: 'proxy', sourceHash: SHA },
};

/** 각각 거부되어야 하는 변형(사유 라벨 포함). */
export const REJECTED_FIXTURES: { label: string; input: unknown }[] = [
  { label: 'index 불연속', input: { ...ACCEPTED_FIXTURE, messages: [{ ...ACCEPTED_FIXTURE.messages[0], index: 5 }] } },
  { label: '잘못된 role', input: { ...ACCEPTED_FIXTURE, messages: [{ ...ACCEPTED_FIXTURE.messages[0], role: 'system' }] } },
  { label: 'sourceHash 형식 오류', input: { ...ACCEPTED_FIXTURE, meta: { ...ACCEPTED_FIXTURE.meta, sourceHash: 'nothex' } } },
  { label: 'version 불일치', input: { ...ACCEPTED_FIXTURE, version: 2 } },
  { label: 'messages 빈 배열', input: { ...ACCEPTED_FIXTURE, messages: [] } },
  { label: '루트 비객체', input: 'not-an-object' },
];

export interface ContractReport {
  ok: boolean;
  failures: string[];
}

/** validator가 계약(accepted→ok, rejected→fail)을 지키는지 검사. */
export function runContractCheck(): ContractReport {
  const failures: string[] = [];

  const acc = validateChatLog(ACCEPTED_FIXTURE, ACCEPTED_FIXTURE.meta.attemptId);
  if (!acc.ok) failures.push(`ACCEPTED_FIXTURE가 거부됨: ${acc.errors.join('; ')}`);

  for (const { label, input } of REJECTED_FIXTURES) {
    const r = validateChatLog(input);
    if (r.ok) failures.push(`REJECTED("${label}")가 통과됨 — 거부되어야 함.`);
  }

  // attemptId 불일치도 거부되어야 함
  const mismatch = validateChatLog(ACCEPTED_FIXTURE, 'different-attempt');
  if (mismatch.ok) failures.push('attemptId 불일치가 통과됨 — 거부되어야 함.');

  return { ok: failures.length === 0, failures };
}
