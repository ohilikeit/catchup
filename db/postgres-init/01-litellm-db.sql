-- LiteLLM 전용 논리 DB/롤 — 메인 PostgreSQL 안에 흡수(철칙 1: 단일 인스턴스, 분리된 DB).
-- docs/3 §0·§7: S1의 별도 litellm-db 폐기 → 메인 postgres에 litellm 전용 DB.
--
-- ⚠️ 이 스크립트는 docker-entrypoint-initdb.d 로 마운트되어 "빈 데이터 디렉터리 최초 init"에만 실행된다.
--    기존 볼륨(이미 init된 postgres)에는 실행되지 않으므로, setup.sh의 멱등 ensure 단계가 보장한다.
--
-- LiteLLM 스키마(가상키·spend 테이블)는 게이트웨이 컨테이너의 prisma가 이 DB 안에서 자체 관리한다
-- (우리 db/migrations 와 완전히 분리 — 백업/마이그레이션 정책만 별도).
CREATE ROLE litellm LOGIN PASSWORD 'litellm';
CREATE DATABASE litellm OWNER litellm;
