import 'server-only';
import { env } from '../env';

// LiteLLM 가상키 발급/회수 — 게이트웨이 /key/generate·/key/delete 래퍼. docs/2 §3, docs/3 §3.
// ⭐ 진짜 Anthropic 키는 게이트웨이에만 있다. 앱은 master key 로 "예산제 가상키"를 발급해
//    슬롯 pod 에 주입할 뿐이며, 가상키는 max_budget·duration 으로 자해 반경이 제한된다.

interface KeyGenerateResponse {
  key?: string;
}

/** 가상키 1개 발급. maxBudgetUsd=null 이면 상한 없음(batches.llm_budget_usd 그대로). */
export async function generateVirtualKey(input: {
  alias: string;
  maxBudgetUsd: number | null;
  /** 키 수명(기본 24h) — 회차보다 길고 영구보다 짧게. */
  duration?: string;
}): Promise<string> {
  const res = await fetch(`${env.litellmBaseUrl}/key/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.litellmMasterKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      key_alias: input.alias,
      duration: input.duration ?? '24h',
      ...(input.maxBudgetUsd != null ? { max_budget: input.maxBudgetUsd } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LiteLLM /key/generate 실패(${res.status}): ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as KeyGenerateResponse;
  if (!body.key) throw new Error('LiteLLM /key/generate 응답에 key 가 없습니다.');
  return body.key;
}

/** 가상키 일괄 삭제(회차 close). best-effort — 실패해도 던지지 않고 에러 메시지 반환(null=성공). */
export async function deleteVirtualKeys(keys: string[]): Promise<string | null> {
  if (keys.length === 0) return null;
  try {
    const res = await fetch(`${env.litellmBaseUrl}/key/delete`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.litellmMasterKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ keys }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return `LiteLLM /key/delete 실패(${res.status}): ${text.slice(0, 300)}`;
    }
    return null;
  } catch (e: unknown) {
    return `LiteLLM /key/delete 호출 불가: ${e instanceof Error ? e.message : String(e)}`;
  }
}
