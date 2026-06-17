# Operations Knowledge

제품 & 운영 지식 — AI 테스트 평가 플랫폼의 시험 환경, 서빙, k8s, 스토리지 파이프라인, 구현 계획.

- [how-it-works](./how-it-works.md) - 회차별 시험 환경의 전체 동작 원리 (슬롯 상태머신, hot/cold path 분리, 자원 통제)
- [web-platform-planning](./web-platform-planning.md) - 웹 플랫폼 제품 기획 (사이트맵, 역할 모델, 데이터 모델, 제공 어댑터 분리 원칙)
- [exam-environment](./exam-environment.md) - hosted 어댑터 인프라 상세 (code-server, LiteLLM 게이트웨이, GitOps 0↔50 스케일, 보안)
- [k8s-skeleton](./k8s-skeleton.md) - S2 k3s/ArgoCD 매니페스트 초안 (StatefulSet, NetworkPolicy, Helm chart 구조, 레포 분리)
- [exam-serving](./exam-serving.md) - 시험 서빙 아키텍처 운영팀 개요 (장애 복구, 디버깅 참조, 관리자 대시보드, 헬스 3층)
- [storage-submission-pipeline](./storage-submission-pipeline.md) - 스토리지 3계층(PVC·MinIO·Postgres), 제출 파이프라인, 재접속 안전망
- [implementation-plan](./implementation-plan.md) - Phase 0~4 구현 로드맵 (현황 스냅샷, 환경 3계층 전략, 횡단 원칙)
