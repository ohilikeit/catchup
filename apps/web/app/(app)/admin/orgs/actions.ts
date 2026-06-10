'use server';
import { revalidatePath } from 'next/cache';
import { requireGlobalRole } from '@/lib/auth/guard';
import { organizationsRepo } from '@/lib/db';
import { issueOrgAdmin, type IssueOrgAdminResult } from '@/lib/services/staffService';

export async function createOrgAction(formData: FormData) {
  await requireGlobalRole('admin');
  const name = (formData.get('name') as string | null)?.trim();
  const code = (formData.get('code') as string | null)?.trim() || null;
  if (!name) throw new Error('대학명은 필수입니다.');
  await organizationsRepo.create({ name, code });
  revalidatePath('/admin/orgs');
}

export async function deactivateOrgAction(id: string) {
  await requireGlobalRole('admin');
  await organizationsRepo.deactivate(id);
  revalidatePath('/admin/orgs');
}

/**
 * 대학 하드 삭제 — 멤버·회차가 모두 0일 때만(이력 보존). 의존이 있으면 비활성화로 유도.
 * service 없이 repo 가드(orgs deactivate 와 동형) — countDependents 로 선판정 후 삭제.
 */
export async function deleteOrgAction(id: string): Promise<{ ok: boolean; message: string }> {
  await requireGlobalRole('admin');
  const dep = await organizationsRepo.countDependents(id);
  if (dep.members > 0 || dep.batches > 0) {
    return {
      ok: false,
      message: `소속 인원 ${dep.members}명·회차 ${dep.batches}건이 있어 삭제할 수 없습니다. 비활성화로 내리세요.`,
    };
  }
  await organizationsRepo.deleteOrg(id);
  revalidatePath('/admin/orgs');
  return { ok: true, message: '대학을 삭제했습니다.' };
}

/** 담당자(org_admin) 계정 발급. 결과(임시비번 1회 노출)를 클라에 반환. */
export async function issueOrgAdminAction(formData: FormData): Promise<IssueOrgAdminResult> {
  await requireGlobalRole('admin');
  const orgId = (formData.get('orgId') as string | null) ?? '';
  const fullName = (formData.get('fullName') as string | null) ?? '';
  const email = (formData.get('email') as string | null) ?? '';
  const result = await issueOrgAdmin({ orgId, fullName, email });
  if (result.ok) revalidatePath('/admin/orgs');
  return result;
}
