import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 모노레포 루트의 단일 .env.secret 을 로드한다(마이그레이션 러너와 동일한 정보원).
// next dev 는 apps/web 에서 실행되어 루트 .env.secret 을 못 보므로 여기서 명시적으로 읽는다.
// process.env 에 이미 있는 값은 덮어쓰지 않음(CI/배포 주입 우선).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '../../.env.secret') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build-less internal packages: Next compiles their raw src directly.
  transpilePackages: ['@app/ui', '@app/core'],
};

export default nextConfig;
