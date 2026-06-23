import 'server-only';
import { env } from '../env';

// LiteLLM 모델 allowlist — 게이트웨이 /v1/models 가 단일 근거(SSOT). docs/11 §3.
// ⭐ 회차 모델 선택지·서버측 재검증의 출처. 임의 모델 문자열 주입을 여기서 막는다(대원칙 5⑤).

interface ModelsResponse {
  data?: Array<{ id?: string }>;
}

/** 게이트웨이가 허용하는 모델 id 목록(litellm model_name form, 예: claude-haiku-4-5). 실패 시 throw. */
export async function listAllowedModels(): Promise<string[]> {
  const res = await fetch(`${env.litellmBaseUrl}/v1/models`, {
    headers: { authorization: `Bearer ${env.litellmMasterKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LiteLLM /v1/models 실패(${res.status}): ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as ModelsResponse;
  const ids = (body.data ?? [])
    .map((m) => (typeof m.id === 'string' ? m.id.trim() : ''))
    .filter((id): id is string => id.length > 0);
  return ids;
}

/** 모델이 allowlist 에 있는지 서버측 재검증 — 없으면 throw(클라 입력은 적대적, 대원칙 5⑤). */
export async function assertModelAllowed(model: string): Promise<void> {
  const list = await listAllowedModels();
  if (!list.includes(model)) throw new Error(`허용되지 않은 모델: ${model}`);
}
