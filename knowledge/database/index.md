# Database — PostgreSQL 스키마 카탈로그

단일 PostgreSQL 인스턴스에 도메인별 schema로 분리된 테이블 목록이다(reference/02 §1).

- [auth](./auth/index.md) - 정체성·조직·역할 (users, organizations, org_members, user_roles, invitations)
- [exam](./exam/index.md) - 코어 시험 도메인 (problems, problem_versions, batches, attempts, submissions, submission_files, attempt_events)
- [hosted](./hosted/index.md) - hosted 어댑터 전용 (slots, entry_queue)
- [ops](./ops/index.md) - 운영 도구 (roster_imports, roster_import_rows)

마이그레이션 이력: [_migrations.md](./_migrations.md)
