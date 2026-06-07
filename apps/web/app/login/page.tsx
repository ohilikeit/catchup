'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Field, Input, Notification, Icon } from '@app/ui';

/* authService는 server-only라 클라이언트에서 import 불가 — 여기 직접 정의.
   데모 계정은 seed가 동일 비밀번호(DEMO_PASSWORD)로 bcrypt 해시를 심어둔다.
   ⭐ 데모 자격증명 노출(빠른 로그인·비번 helper)은 비-production에서만. production 빌드에선
   process.env.NODE_ENV가 인라인되어 DEMO_MODE=false → 관련 트리가 제거된다. */
const DEMO_MODE = process.env.NODE_ENV !== 'production';
const DEMO_PASSWORD = 'demo1234';
const DEMO_ACCOUNTS: { label: string; email: string; hint: string }[] = [
  { label: '학생', email: 'student1@univ-a.ac.kr', hint: 'examinee · A대학' },
  { label: '학교담당자', email: 'staff@univ-a.ac.kr', hint: 'org_admin · A대학' },
  { label: '내부 관리자', email: 'admin@catchup.io', hint: 'admin · 전체' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(json.data.home);
        router.refresh();
      } else {
        setError(json.error ?? '로그인에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo(demoEmail: string) {
    setEmail(demoEmail);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: demoEmail, password: DEMO_PASSWORD }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(json.data.home);
        router.refresh();
      } else {
        setError(json.error ?? '로그인에 실패했습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen grid md:grid-cols-2">
      {/* 좌측 shell 패널 */}
      <div className="hidden md:flex flex-col bg-shell text-shell-text p-09">
        <div className="flex items-center gap-03">
          <span className="w-8 h-8 bg-shell-accent flex items-center justify-center text-shell-text">
            <Icon name="arrow-up" size={20} />
          </span>
          <Link href="/" className="font-sans text-lg font-semibold no-underline text-shell-text hover:text-shell-text">
            CatchUP
          </Link>
        </div>
        <div className="mt-auto cds-heading-07">
          AI 업무역량을<br />
          <b className="font-semibold text-shell-accent-text">과정과 결과</b>로<br />
          평가합니다.
        </div>
        <div className="mt-06 cds-body-01 text-shell-text-muted max-w-[280px]">
          대학·기관과 계약해 응시자의 AI 활용 역량을
          객관적으로 측정·리포트합니다.
        </div>
        <div className="mt-06 font-mono text-xs text-shell-text-muted">
          CatchUP · AI 업무역량 평가 플랫폼
        </div>
      </div>

      {/* 우측 폼 */}
      <div className="flex items-center justify-center bg-layer-02 p-06">
        <div className="w-full max-w-[360px] flex flex-col gap-06">
          {/* 모바일 브랜드 */}
          <div className="md:hidden flex items-center gap-03 mb-02">
            <span className="w-7 h-7 bg-shell flex items-center justify-center">
              <Icon name="arrow-up" size={16} />
            </span>
            <span className="font-sans text-base font-semibold text-text-primary">CatchUP</span>
          </div>

          <div>
            <h1 className="cds-heading-05 text-text-primary">로그인</h1>
            <p className="cds-body-01 text-text-secondary mt-02">
              계정 정보를 입력하세요.
            </p>
          </div>

          {error && (
            <Notification kind="error" title="로그인 실패">
              {error}
            </Notification>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-05">
            <Field label="이메일">
              <Input
                lead="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="비밀번호" helper={DEMO_MODE ? `데모 계정 비밀번호: ${DEMO_PASSWORD}` : undefined}>
              <Input
                trail="view-off"
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <Button
              kind="primary"
              type="submit"
              icon="arrow-right"
              className="justify-between"
              disabled={loading}
            >
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </form>

          {/* 빠른 로그인 — 비-production(데모)에서만 노출 */}
          {DEMO_MODE && (
          <div className="border-t border-border-subtle-01 pt-05">
            <p className="cds-label-01 text-text-secondary mb-03">빠른 로그인 (데모)</p>
            <div className="flex flex-col gap-02">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleDemo(acc.email)}
                  disabled={loading}
                  className="flex items-center justify-between px-04 py-03 bg-layer-01 border border-border-subtle-01 hover:bg-layer-02 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="cds-heading-compact-01 text-text-primary">{acc.label}</span>
                  <span className="cds-helper-01 text-text-secondary">{acc.hint}</span>
                </button>
              ))}
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
