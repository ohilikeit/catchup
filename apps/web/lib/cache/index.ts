import 'server-only';
// 캐시 계층 공개 진입점. route/service는 cacheService와 TTL만 import(redis 직접 사용 금지).
export { cacheService } from './cacheService';
export { TTL, type TtlKey } from './ttl';
export { pingRedis } from './redis';
