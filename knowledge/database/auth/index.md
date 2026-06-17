# auth 스키마

정체성·조직·역할 도메인. 로그인 계정, 조직, 멤버십, 전역 역할, 초대 토큰을 관리한다.

- [users](./users.md) - 플랫폼 로그인 계정(정체성 엔티티)
- [user_roles](./user_roles.md) - 전역 역할 M:N 조인(admin·author·grader)
- [organizations](./organizations.md) - 조직(기업·대학) 엔티티
- [org_members](./org_members.md) - 사용자-조직 M:N 조인 및 조직 내 역할
- [invitations](./invitations.md) - 온보딩 초대·비밀번호 리셋용 1회성 토큰
