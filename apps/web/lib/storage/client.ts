import 'server-only';
import * as Minio from 'minio';
import { env } from '../env';

// 단일 MinIO 클라이언트(프로세스당 1개). lib/cache/redis.ts 와 같은 패턴.
//
// ⚠️ 지연 생성: 모듈 import 시점에 만들지 않는다(빌드 타임엔 env가 없음).
// 첫 사용에서 getStorage()가 생성·메모이즈. Next dev HMR 누적 방지를 위해 globalThis 캐시.
declare global {
  // eslint-disable-next-line no-var
  var __catchupMinio: Minio.Client | undefined;
}

export function getStorage(): Minio.Client {
  if (!globalThis.__catchupMinio) {
    globalThis.__catchupMinio = new Minio.Client({
      endPoint: env.minioEndpoint,
      port: env.minioPort,
      useSSL: env.minioUseSSL,
      accessKey: env.minioAccessKey,
      secretKey: env.minioSecretKey,
    });
  }
  return globalThis.__catchupMinio;
}
