-- 0001_init_schemas — 도메인별 schema namespace + 공유 트리거 함수
-- 근거: reference/02 §1(단일 DB + schema 분리), §4(updated_at 자동 트리거).
-- 경계를 이름으로 드러낸다(대원칙 ①): public에 다 넣지 않고 도메인별 schema로 가른다.

CREATE SCHEMA IF NOT EXISTS auth;     -- 정체성 + 조직
CREATE SCHEMA IF NOT EXISTS exam;     -- 문제/회차/응시/제출 = 코어
CREATE SCHEMA IF NOT EXISTS hosted;   -- hosted 어댑터 전용(BYOD면 미사용)
CREATE SCHEMA IF NOT EXISTS ops;      -- 운영(로스터 import 등)
-- grading schema는 평가·리포트 모듈(별도 트랙)이 소유 → 뼈대에서 생성하지 않음(docs/1 §8).

-- 공유 updated_at 트리거 함수 1개(단일 DB이므로 public에). 앱 코드 믿지 말고 DB가 갱신.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
