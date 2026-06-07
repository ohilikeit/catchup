// ⭐ 정규화 대화 로그 포맷 v1 (linchpin). docs/1 §5.0.
// 프록시(hosted)·BYOD 스크립트 *둘 다* 이 스키마로 출력 → 평가 모듈은 이 한 포맷만 소비.
// "스크립트 구현은 외부지만 출력 계약 검증은 플랫폼 책임"(docs/1 §5.0) → 이 validator가 그 책임.
//
// 의존성 없는 순수 검증기(프로젝트에 JSON Schema 런타임이 없음 — 단순함은 의도된 선택, 대원칙 ③).
// 실패는 received → rejected, validation_error에 사유. 통과는 accepted 후보.

export const CHAT_FORMAT_VERSION = 1 as const;

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  index: number;
  role: ChatRole;
  content: string;
  ts: string;
  tool_calls?: unknown[];
  attachments?: unknown[];
}

export interface ChatMeta {
  attemptId: string;
  source: 'proxy' | 'export-script';
  sourceHash: string; // "sha256:..."
}

export interface NormalizedChatLog {
  version: 1;
  tool: string;
  model?: string;
  messages: ChatMessage[];
  meta: ChatMeta;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** 통과 시 채워지는 파생 정보(repository 적재용). */
  derived?: { tool: string; messageCount: number; source: ChatMeta['source'] };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 정규화 대화 로그 검증. 형태(shape)·필수필드·타입·일관성(index 연속, role 화이트리스트)을 본다.
 * @param expectedAttemptId 서버가 아는 attemptId — meta.attemptId와 불일치면 거부(위조/오배치 방어, 대원칙 ⑤).
 */
export function validateChatLog(input: unknown, expectedAttemptId?: string): ValidationResult {
  const errors: string[] = [];

  if (!isObj(input)) return { ok: false, errors: ['루트가 객체가 아닙니다.'] };

  if (input.version !== CHAT_FORMAT_VERSION) {
    errors.push(`version은 ${CHAT_FORMAT_VERSION} 이어야 합니다(받은 값: ${String(input.version)}).`);
  }
  if (typeof input.tool !== 'string' || input.tool.length === 0) {
    errors.push('tool은 비어있지 않은 문자열이어야 합니다.');
  }
  if (input.model !== undefined && typeof input.model !== 'string') {
    errors.push('model은 문자열이어야 합니다(선택).');
  }

  // messages
  if (!Array.isArray(input.messages)) {
    errors.push('messages는 배열이어야 합니다.');
  } else {
    if (input.messages.length === 0) errors.push('messages가 비어 있습니다(최소 1개).');
    input.messages.forEach((m, i) => {
      if (!isObj(m)) {
        errors.push(`messages[${i}]가 객체가 아닙니다.`);
        return;
      }
      if (typeof m.id !== 'string' || m.id.length === 0) errors.push(`messages[${i}].id 누락/빈값.`);
      if (m.index !== i) errors.push(`messages[${i}].index는 ${i} 이어야 합니다(연속·0기반).`);
      if (m.role !== 'user' && m.role !== 'assistant') errors.push(`messages[${i}].role은 user|assistant.`);
      if (typeof m.content !== 'string') errors.push(`messages[${i}].content는 문자열.`);
      if (typeof m.ts !== 'string' || Number.isNaN(Date.parse(m.ts))) errors.push(`messages[${i}].ts는 ISO 시각.`);
      if (m.tool_calls !== undefined && !Array.isArray(m.tool_calls)) errors.push(`messages[${i}].tool_calls는 배열.`);
      if (m.attachments !== undefined && !Array.isArray(m.attachments)) errors.push(`messages[${i}].attachments는 배열.`);
    });
  }

  // meta
  const meta = input.meta;
  if (!isObj(meta)) {
    errors.push('meta가 객체가 아닙니다.');
  } else {
    if (typeof meta.attemptId !== 'string' || meta.attemptId.length === 0) errors.push('meta.attemptId 누락.');
    if (meta.source !== 'proxy' && meta.source !== 'export-script') errors.push('meta.source는 proxy|export-script.');
    if (typeof meta.sourceHash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(meta.sourceHash)) {
      errors.push('meta.sourceHash는 "sha256:<64 hex>" 형식.');
    }
    if (expectedAttemptId !== undefined && meta.attemptId !== expectedAttemptId) {
      errors.push('meta.attemptId가 서버가 아는 attempt와 불일치(위조/오배치 거부).');
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const log = input as unknown as NormalizedChatLog;
  return {
    ok: true,
    errors: [],
    derived: { tool: log.tool, messageCount: log.messages.length, source: log.meta.source },
  };
}
