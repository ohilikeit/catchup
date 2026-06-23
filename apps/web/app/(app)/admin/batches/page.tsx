import type { Metadata } from 'next';
import { requireGlobalRole } from '@/lib/auth/guard';
import { listForViewer } from '@/lib/services/batchService';
import { listAllowedModels } from '@/lib/litellm/models';
import { organizationsRepo, problemsRepo } from '@/lib/db';
import { PageHead } from '../../_components/ui';
import { AdminBatchesClient } from './AdminBatchesClient';

export const metadata: Metadata = { title: '회차 관리' };

// admin/batches — 사내 admin 전용. 전체 회차 목록 + 개설/상태변경/로스터 import.

/** allowlist 조회 — 게이트웨이 불통 시에도 페이지가 렌더되도록 기본값으로 폴백. */
async function fetchAllowedModels(): Promise<string[]> {
  try {
    const models = await listAllowedModels();
    return models.length > 0 ? models : ['claude-haiku-4-5'];
  } catch {
    return ['claude-haiku-4-5'];
  }
}

export default async function AdminBatchesPage() {
  const session = await requireGlobalRole('admin');

  const [batches, orgs, versionOptions, allowedModels] = await Promise.all([
    listForViewer(session),
    organizationsRepo.listActive(),
    problemsRepo.listVersionOptions(),
    fetchAllowedModels(),
  ]);

  return (
    <>
      <PageHead title="회차 관리" sub="전체 시험 회차를 관리합니다." />
      <AdminBatchesClient
        batches={batches}
        orgs={orgs}
        versionOptions={versionOptions}
        allowedModels={allowedModels}
      />
    </>
  );
}
