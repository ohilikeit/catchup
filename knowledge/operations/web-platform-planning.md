---
type: Product Spec
title: 웹 플랫폼 기획 & 개발 Planning
description: AI 업무역량 평가 플랫폼의 웹 제품 뼈대(마케팅·응시·결과조회·관리) 기획 및 개발 순서 정리.
resource: file:///docs/1-web-platform-planning.md
tags: [product, sitemap, roles, schema, submission, delivery-adapter]
timestamp: 2026-06-17T00:00:00Z
---

# 웹 플랫폼 기획 & 개발 Planning

## 핵심 한 줄

3개 셸(마케팅 / 시험 런타임 / 대시보드) · 3개 청중(학생 / 학교담당자 / 관리자), 단일 Next.js 앱.
뼈대의 진짜 seam = **"accepted된 정규화 Submission(+불변 problem version + 출처/신뢰 메타)"**.
제공 방식(hosted)과 평가·리포트는 이 seam 바깥의 교체·후속 모듈이라, 바뀌어도 스키마·역할·대시보드·웹 기획은 그대로.

## 제품 개요

대학 교직원과 계약해 취업 준비생에게 AI 업무활용역량을 평가하는 상품.
- **차별점**: 상용 코딩 에이전트(Claude Code 등)를 시험에서 그대로 허용 — 높은 자유도가 진짜 실력을 드러냄
- **평가 2기둥**: AI 채팅 평가 50 + 결과(산출물) 평가 50
- **규모**: 동시 응시 최대 50명/회차, 9월 오픈, 2개 대학 계약 완료
- **지금 범위 = 뼈대**: 평가·리포트는 별도 외부 시스템(AI-TEST 평가 시스템) 소관

## 사이트맵 — 3 셸 / 3 청중

```
(marketing)/          # 공개. 랜딩·how-it-works·curriculum·sample-report
login/                # 통합 로그인 → 역할별 홈
change-password/      # 첫 로그인 임시비번 강제 변경
(exam)/               # 학생 시험 런타임. 풀스크린
  exam/[attemptId]/intro · page · done
(app)/                # 로그인 후. 영속 대시보드 셸
  my/exams · lecture · reports/[id]           # 학생
  org/dashboard · students(/[id]) · batches(/[id])  # org_admin
  admin/orgs · batches(/[id]) · students · problems · submissions(/[id])  # admin
```

`showcase/` · `console/`은 dev 전용, 프로덕션 미노출.

## 역할 모델

| 역할 | 보는 범위 | 핵심 |
|---|---|---|
| `examinee` | 자기 시험·자기 리포트 | 응시 |
| `org_admin` | **자기 대학의** 학생·현황만 | 조직 스코프 |
| `admin` | 전체 + 관리 | 사내 풀권한 |
| `author`, `grader` | (별도 평가 모듈) | 역할만 예약 |

- 전역 역할: `auth.user_roles` (M:N)
- 조직 범위 권한: `auth.org_members.org_role` — org 쿼리는 `org_id IN (내가 org_admin인 org들)`로 강제
- **온보딩**: 관리자 사전 발급형 — 로스터 CSV import → 임시비번 발급 → 첫 로그인 시 `change-password` 강제
- 이메일 소유 인증: 의도적 미구현(전달 채널 신뢰)

## 데이터 모델 핵심 결정

**schema 경계**:
- `auth`: organizations, org_members, users
- `exam`: problems, problem_versions(불변 스냅샷), batches, attempts, submissions, submission_files, attempt_events
- `hosted`: slots — **코어와 분리된 어댑터 전용 schema**
- `grading`: 별도 모듈 (코어에 없음)
- `ops`: roster_imports, roster_import_rows

**핵심 설계 결정**:
- `attempts.status`: `ready|running|submitted|expired|void` — 평가 상태 없음(grading 모듈 소관)
- `attempts.deadline_at`: 서버 강제(클라 시계 불신). 제출 API가 트랜잭션에서 재판정
- `submissions.trust = 'verified'`: 서버가 어댑터 신원으로만 산출(클라 입력 불가)
- `submissions.captured_via = 'proxy'`: hosted 프록시 캡처 단일 (BYOD 폐기, `0009_drop_byod.sql`)
- `hosted.slots.attempt_id UNIQUE`: 1 attempt = 1 slot 강제. slot_no는 attempts 테이블에 없음
- `problem_versions` 불변: 회차에 FK로 고정, 재현·공정성 보장
- CASCADE 축소: org/batch/problem은 `ON DELETE RESTRICT` + `is_active` soft-delete. "같이 죽는" attempt→submissions/events에만 CASCADE

## 제공 방식과 코어의 분리 (Delivery Adapter)

```
코어: 정체성/역할/org · 회차/응시 · submissions
                │
    계약: attempt → accepted Submission
                │
         [hosted] proxy, verified
                │
    후속 모듈: 평가·리포트 → 대시보드/웹
```

- 하류(평가·리포트·대시보드·웹)는 제공 방식을 모름
- 전달방식은 hosted 단일 (BYOD 폐기 확정)
- 어댑터 계약만 지키면 하류는 무변경

**정규화 대화 로그 포맷 v1** (linchpin):
```json
{ "version":1, "tool":"claude-code", "model":"...",
  "messages":[{"id":"...","index":0,"role":"user|assistant","content":"...","ts":"...","tool_calls":[...],"attachments":[...]}],
  "meta":{"attemptId":"...","source":"proxy","sourceHash":"sha256:..."} }
```
계약 파일: `contracts/chat-log.v1.json` + accepted/rejected fixture + CI contract test = P0.

## 페이지 우선순위

| 우선 | 화면 |
|---|---|
| P0 | `exam/[attemptId]`(hosted)+intro/done, `login`, `change-password`, `admin/batches` 개설+로스터 import, 정규화 포맷 validator+fixture |
| P1 | `org/dashboard`, `org/students(/[id])`, `org/batches/[id]`, `(marketing)` 랜딩+sample-report |
| P2 | `my/exams`, `my/lecture`, `admin/orgs`, `admin/students`, `admin/submissions(/[id])` |
| P3 | `admin/problems`, `how-it-works`, `curriculum` |
| — | `my/reports/[id]` — 평가·리포트 모듈 소관 |

## 구현 현황 (2026-06)

| 영역 | 상태 |
|---|---|
| DB 스키마 | 완료 (0003~0014 마이그레이션) |
| 인증 (bcrypt + HMAC 세션) | 완료 |
| `my/exams`, `org/dashboard`, `org/students(/[id])`, `org/batches(/[id])` | 완료(실데이터) |
| `admin/batches(/[id])` | 완료 (개설·로스터 import·운영 액션) |
| `admin/submissions(/[id])` | 검증 현황 구현 |
| `exam/[id]` hosted | 화면 자리표시(인프라 로컬 검증 완료, alpha 미배포) |
| 평가·리포트 모듈 | 이 사이트 밖 (외부 AI-TEST 시스템) |
| `sample-report` | 완료(외부 리포트 예시 정적 재현) |

## 스코프 경계

**In (뼈대)**: 3청중 웹, 코어 DB, hosted 어댑터 플랫폼 측, 정규화 포맷 검증, 로스터 import·온보딩.

**Out (별도/보류)**:
- 평가·평가 리포트 모듈 → 외부 AI-TEST 시스템
- hosted 인프라 상세 → `docs/2-exam-environment.md`
- 출제 작성 도구, 기획 외 직무, 구독 선물(API 키), per-student 동적 오케스트레이터

# Citations

- 원본: `docs/1-web-platform-planning.md`
- DB 스키마 마이그레이션: `db/migrations/` (0003~0014)
- 역할 참조: `docs/reference/04-user-role.md`
- 페이지 라우팅: `docs/reference/06-page-routing.md`
- 관련: [exam-environment](/operations/exam-environment.md), [implementation-plan](/operations/implementation-plan.md)
- DB 설계 원칙: [platform master checklist](/platform/master-checklist.md)
