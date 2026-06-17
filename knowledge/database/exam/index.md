# exam 스키마

코어 시험 도메인. 문제·버전·회차·응시·제출·이벤트 로그를 관리한다.

- [problems](./problems.md) - 문제 룩업(직무 트랙별, TEXT PK)
- [problem_versions](./problem_versions.md) - 문제 불변 스냅샷(재현성·공정성)
- [batches](./batches.md) - 시험 회차(조직·문제버전·운영모드·예산 포함)
- [attempts](./attempts.md) - 응시 기록(수험생 1인의 응시 세션)
- [submissions](./submissions.md) - 제출물 메타데이터(평가 모듈의 단일 입구)
- [submission_files](./submission_files.md) - 제출 파일 메타(오브젝트 스토리지 참조)
- [attempt_events](./attempt_events.md) - 응시 감사/관측 이벤트 로그(append-only)
