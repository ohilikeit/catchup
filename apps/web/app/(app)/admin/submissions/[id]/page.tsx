import { notFound } from 'next/navigation';
import { requireGlobalRole } from '@/lib/auth/guard';
import { getDetail } from '@/lib/services/submissionService';
import { Breadcrumb, Notification } from '@app/ui';
import {
  PageHead,
  Card,
  ComingSoon,
  SubmissionStatusTag,
  TrustTag,
} from '../../../_components/ui';

// admin/submissions/[id] — 제출 검증 상세. admin 전용.
// 평가 결과는 평가 모듈 소관(docs/1 §6) → ComingSoon.

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function fmtSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const KIND_LABEL: Record<string, string> = {
  chat_log: '대화 로그',
  artifact: '산출물',
};

const CAPTURED_VIA_LABEL: Record<string, string> = {
  proxy: '프록시',
};

export default async function SubmissionDetailPage({ params }: { params: { id: string } }) {
  await requireGlobalRole('admin');

  const result = await getDetail(params.id);
  if (!result) notFound();

  const { detail, files } = result;

  return (
    <>
      <Breadcrumb
        className="mb-05"
        items={[
          { label: '제출 현황', href: '/admin/submissions' },
          { label: detail.examineeName },
        ]}
      />
      <PageHead
        title={detail.examineeName}
        sub={`${detail.orgName} · ${detail.batchName}`}
      />

      {/* 메타 카드 */}
      <Card className="mb-05">
        <h2 className="cds-heading-compact-02 text-text-primary mb-05">제출 정보</h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-07 gap-y-03">
          <dt className="cds-label-01 text-text-secondary">상태</dt>
          <dd><SubmissionStatusTag status={detail.status} /></dd>

          <dt className="cds-label-01 text-text-secondary">신뢰</dt>
          <dd><TrustTag trust={detail.trust} /></dd>

          <dt className="cds-label-01 text-text-secondary">수집 경로</dt>
          <dd className="cds-body-01 text-text-primary">{CAPTURED_VIA_LABEL[detail.capturedVia] ?? detail.capturedVia}</dd>

          <dt className="cds-label-01 text-text-secondary">도구</dt>
          <dd className="cds-body-01 text-text-primary">{detail.tool ?? '—'}</dd>

          <dt className="cds-label-01 text-text-secondary">포맷 버전</dt>
          <dd className="cds-body-01 text-text-primary">{detail.chatFormatVersion}</dd>

          <dt className="cds-label-01 text-text-secondary">제출 시각</dt>
          <dd className="cds-body-01 text-text-primary">{fmtDate(detail.submittedAt)}</dd>

          <dt className="cds-label-01 text-text-secondary">승인 시각</dt>
          <dd className="cds-body-01 text-text-primary">{fmtDate(detail.acceptedAt)}</dd>
        </dl>

        {detail.validationError ? (
          <div className="mt-05">
            <Notification kind="error" title="검증 오류">
              {detail.validationError}
            </Notification>
          </div>
        ) : null}
      </Card>

      {/* 파일 목록 카드 */}
      <Card className="mb-05">
        <h2 className="cds-heading-compact-02 text-text-primary mb-05">파일 목록</h2>
        {files.length === 0 ? (
          <p className="cds-body-01 text-text-secondary">파일이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-subtle-01">
                  <th className="cds-label-01 text-text-secondary pb-03 pr-06">종류</th>
                  <th className="cds-label-01 text-text-secondary pb-03 pr-06">참조</th>
                  <th className="cds-label-01 text-text-secondary pb-03 pr-06">SHA256</th>
                  <th className="cds-label-01 text-text-secondary pb-03 pr-06">크기</th>
                  <th className="cds-label-01 text-text-secondary pb-03">MIME</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-b border-border-subtle-01 last:border-0">
                    <td className="cds-body-01 text-text-primary py-03 pr-06">
                      {KIND_LABEL[f.kind] ?? f.kind}
                    </td>
                    <td className="cds-body-01 text-text-primary py-03 pr-06 font-mono text-xs break-all max-w-[20ch]">
                      {f.ref}
                    </td>
                    <td className="cds-body-01 text-text-secondary py-03 pr-06 font-mono text-xs">
                      {f.sha256.slice(0, 12)}…
                    </td>
                    <td className="cds-body-01 text-text-primary py-03 pr-06 whitespace-nowrap">
                      {fmtSize(f.sizeBytes)}
                    </td>
                    <td className="cds-body-01 text-text-secondary py-03 text-xs">
                      {f.mime ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 평가 결과 — 평가 모듈 연결 전 자리표시 */}
      <ComingSoon
        title="평가 결과"
        message="평가 결과는 평가 모듈 연결 후 제공됩니다."
      />
    </>
  );
}
