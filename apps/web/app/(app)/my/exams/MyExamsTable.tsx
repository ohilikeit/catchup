'use client';
import Link from 'next/link';
import { DataTable, Button, type Column } from '@app/ui';
import type { MyExamItem } from '@/lib/db/repositories/attempts';
import { AttemptStatusTag, SubmissionStatusTag } from '../../_components/ui';

// 내 시험 표(클라이언트). 컬럼 render는 함수라 클라 경계 안에서 정의.
// 응시 액션: ready/running → 시험 진입(intro), 그 외는 상태만.

function fmt(d: Date | null): string {
  return d ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function MyExamsTable({ rows }: { rows: MyExamItem[] }) {
  const columns: Array<Column<MyExamItem>> = [
    { key: 'problemTitle', header: '과제', sortable: true },
    { key: 'orgName', header: '대학', sortable: true },
    { key: 'batchName', header: '회차' },
    { key: 'status', header: '상태', sortable: true, render: (r) => <AttemptStatusTag status={r.status} /> },
    { key: 'submissionStatus', header: '제출', render: (r) => <SubmissionStatusTag status={r.submissionStatus} /> },
    { key: 'deadlineAt', header: '마감', className: 'tabular-nums', sortValue: (r) => (r.deadlineAt ? new Date(r.deadlineAt).getTime() : 0), render: (r) => fmt(r.deadlineAt) },
    {
      key: 'action',
      header: '',
      className: 'w-48 text-right',
      render: (r) => (
        <div className="flex items-center justify-end gap-03">
          {r.status === 'submitted' ? (
            <Button kind="ghost" size="sm" asChild>
              <Link href={`/my/reports/${r.attemptId}`}>리포트</Link>
            </Button>
          ) : null}
          {/* 시작은 회차가 open 일 때만(서버 startExam 과 동일). running 은 이미 시작된 응시라 이어서 진입 허용. */}
          {r.status === 'running' ? (
            <Button kind="primary" size="sm" asChild icon="arrow-right">
              <Link href={`/exam/${r.attemptId}/intro`}>이어서</Link>
            </Button>
          ) : r.status === 'ready' && r.batchStatus === 'open' ? (
            <Button kind="primary" size="sm" asChild icon="arrow-right">
              <Link href={`/exam/${r.attemptId}/intro`}>시작</Link>
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return <DataTable title="시험 목록" columns={columns} rows={rows} getRowId={(r) => r.attemptId} />;
}
