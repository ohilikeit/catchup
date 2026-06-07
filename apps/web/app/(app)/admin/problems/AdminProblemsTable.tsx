'use client';
import { DataTable, Tag, type Column } from '@app/ui';
import type { ProblemWithVersions } from '@/lib/db/repositories/problems';

const ROLE_TRACK_LABEL: Record<string, string> = {
  planning: '기획',
  dev: '개발',
  marketing: '마케팅',
};

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString('ko-KR', { dateStyle: 'medium' });
}

export function AdminProblemsTable({ rows }: { rows: ProblemWithVersions[] }) {
  const columns: Array<Column<ProblemWithVersions>> = [
    { key: 'code', header: '코드', sortable: true },
    { key: 'title', header: '제목', sortable: true },
    {
      key: 'roleTrack',
      header: '직무',
      sortable: true,
      render: (r) => (
        <Tag color="purple">{ROLE_TRACK_LABEL[r.roleTrack] ?? r.roleTrack}</Tag>
      ),
    },
    {
      key: 'versionCount',
      header: '버전수',
      sortable: true,
      render: (r) => String(r.versionCount),
    },
    {
      key: 'latestVersion',
      header: '최신버전',
      render: (r) =>
        r.latestVersion != null ? `v${r.latestVersion}` : '—',
    },
    {
      key: 'isActive',
      header: '상태',
      sortable: true,
      render: (r) =>
        r.isActive ? (
          <Tag color="green" icon="checkmark-filled">활성</Tag>
        ) : (
          <Tag color="gray">비활성</Tag>
        ),
    },
    { key: 'createdAt', header: '등록일', render: (r) => fmt(r.createdAt) },
  ];

  return (
    <DataTable
      title="문제 목록"
      columns={columns}
      rows={rows}
      getRowId={(r) => r.code}
    />
  );
}
