import 'server-only';
import { withTransaction } from '../db';
import * as usersRepo from '../db/repositories/users';
import * as orgsRepo from '../db/repositories/organizations';
import { hashPassword, genTempPassword } from '../auth/password';

// staffService — 담당자(org_admin) 계정 발급. 사전 발급형 온보딩의 담당자 측(docs/1 §2).
// admin이 학교·기관 담당자 계정을 만든다: 신규면 임시비번 발급(bcrypt 해시 저장, 평문 1회 노출),
// 기존 이메일이면 비번은 두고 해당 org의 org_admin 권한만 부여(승격).

export type IssueOrgAdminResult =
  | { ok: true; created: boolean; email: string; tempPassword: string | null }
  | { ok: false; error: string };

export async function issueOrgAdmin(input: {
  orgId: string;
  fullName: string;
  email: string;
}): Promise<IssueOrgAdminResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!input.orgId) return { ok: false, error: '대학(기관)을 선택하세요.' };
  if (!fullName) return { ok: false, error: '담당자 이름을 입력하세요.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: '올바른 이메일을 입력하세요.' };

  const org = await orgsRepo.findById(input.orgId);
  if (!org || !org.isActive) return { ok: false, error: '대학(기관)을 찾을 수 없습니다.' };

  return withTransaction(async (client) => {
    // 신규 계정에만 줄 임시비번을 미리 준비(생성된 경우에만 노출).
    const tempPassword = genTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const { userId, created } = await usersRepo.upsertByEmailTx(client, { email, fullName, passwordHash });
    await usersRepo.addOrgAdminMembershipTx(client, { orgId: input.orgId, userId });
    return { ok: true, created, email, tempPassword: created ? tempPassword : null };
  });
}
