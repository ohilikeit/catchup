import 'server-only';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

// 비밀번호 해시·검증·임시비번 생성. reference/05(bcrypt, 평문 저장 금지).
// ⭐ 평문 비밀번호는 절대 저장하지 않는다 — 해시만 DB에. 임시비번 평문은 발급 순간 1회만 노출.

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// 사람이 받아적기 좋은 임시비번: 혼동 문자(0/O/1/l/I) 제외. 약 10자.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';

/** 전달용 임시 비밀번호 생성(평문). 호출부는 hash해서 저장하고 평문은 1회만 전달에 쓴다. */
export function genTempPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
