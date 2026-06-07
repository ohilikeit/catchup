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
