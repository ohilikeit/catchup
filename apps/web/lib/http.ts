import 'server-only';
import { NextResponse } from 'next/server';

// 표준 API 응답 봉투. 프론트 fetch 래퍼가 success 하나로 일괄 에러 처리(reference/01 §3).
//   { success: true,  data }
//   { success: false, error: { code, message } }

export type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(
  code: string,
  message: string,
  status = 400,
): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}
