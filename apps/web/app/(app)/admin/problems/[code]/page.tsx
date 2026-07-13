import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb, Button, Notification, Tag } from '@app/ui';
import { requireGlobalRole } from '@/lib/auth/guard';
import { problemsRepo } from '@/lib/db';
import { listScaffoldFiles, previewScaffoldFile } from '@/lib/services/problemService';
import { PageHead, EmptyState } from '../../../_components/ui';
import { ScaffoldReplace } from './ScaffoldReplace';
import { ProblemDangerZone } from './ProblemDangerZone';
import { ScaffoldTree } from './ScaffoldTree';
import { MarkdownView } from './MarkdownView';
import { SheetView } from './SheetView';

export const metadata: Metadata = { title: '문제 상세' };

// admin/problems/[code] — 업로드된 문제(스캐폴드)를 눈으로 검수하는 상세 페이지.
// 서버 컴포넌트만으로 동작: 버전 선택(?v=)·파일 선택(?file=)을 쿼리로 받아 MinIO 아카이브를
// 서버에서 열어 목록/내용을 렌더한다(problemService 미리보기 — 학생 경로와 완전 분리).

const ROLE_TRACK_LABEL: Record<string, string> = {
  planning: '기획',
  dev: '개발',
  marketing: '마케팅',
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export default async function AdminProblemDetailPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { v?: string; file?: string };
}) {
  await requireGlobalRole('admin');
  const code = decodeURIComponent(params.code);
  const problem = await problemsRepo.findProblemByCode(code);
  if (!problem) notFound();
  const versions = await problemsRepo.listVersionsByCode(code);
  const usedByBatch = await problemsRepo.isUsedByBatch(code);

  const selected = versions.find((x) => String(x.version) === searchParams.v) ?? versions[0] ?? null;
  const listing = selected ? await listScaffoldFiles(selected.publicScaffoldRef) : null;
  const filePath = searchParams.file ?? null;
  const preview =
    selected && filePath ? await previewScaffoldFile(selected.publicScaffoldRef, filePath) : null;

  const base = `/admin/problems/${encodeURIComponent(code)}`;

  return (
    <>
      <Breadcrumb items={[{ label: '문제 관리', href: '/admin/problems' }, { label: problem.title }]} />
      <PageHead
        title={problem.title}
        sub={`${problem.code} · ${ROLE_TRACK_LABEL[problem.roleTrack] ?? problem.roleTrack} · 버전 ${versions.length}개`}
        action={
          selected ? (
            <div className="flex flex-wrap items-center gap-03">
              <ScaffoldReplace versionId={selected.id} version={selected.version} problemCode={code} />
              <Button kind="secondary" size="field" icon="download" asChild>
                <a href={`/api/admin/problems/${encodeURIComponent(code)}/${selected.version}/download`}>
                  스캐폴드 다운로드
                </a>
              </Button>
            </div>
          ) : undefined
        }
      />

      {versions.length === 0 || !selected ? (
        <EmptyState icon="document" title="업로드된 버전이 없습니다" message="문제 목록에서 새 버전을 업로드하세요." />
      ) : (
        <div className="flex flex-col gap-05">
          {/* 버전 선택 + 메타 */}
          <div className="flex items-center gap-03 flex-wrap">
            <span className="cds-label-01 text-text-secondary">버전</span>
            {versions.map((v) => (
              <NextLink key={v.id} href={`${base}?v=${v.version}`}>
                <Tag color={v.version === selected.version ? 'blue' : 'gray'}>v{v.version}</Tag>
              </NextLink>
            ))}
            <span className="cds-helper-01 text-text-secondary ml-auto">
              sha256 {selected.scaffoldSha256.slice(0, 12)}… ·{' '}
              {new Date(selected.publishedAt).toLocaleString('ko-KR', {
                timeZone: 'Asia/Seoul',
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>

          {listing?.error ? (
            <Notification kind="warning" title="미리보기를 열 수 없습니다">
              {listing.error} — 미리보기는 .tgz(tar.gz)만 지원합니다. 위의 다운로드로 내용을 확인하세요.
            </Notification>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] border border-border-subtle-01">
              {/* 좌: 파일 트리(계층 + 접기) */}
              <div className="bg-layer-01 border-b md:border-b-0 md:border-r border-border-subtle-01 max-h-[600px] overflow-auto">
                <div className="px-05 py-03 border-b border-border-subtle-01 cds-helper-01 text-text-secondary sticky top-0 bg-layer-01">
                  스캐폴드 파일 {listing?.entries.filter((e) => !e.isDir).length ?? 0}개
                </div>
                {listing && (
                  <ScaffoldTree
                    entries={listing.entries}
                    base={base}
                    version={selected.version}
                    activePath={filePath}
                  />
                )}
              </div>

              {/* 우: 파일 내용 */}
              <div className="bg-layer-02 min-h-[320px] max-h-[600px] overflow-auto min-w-0">
                {!preview ? (
                  <div className="px-06 py-08 cds-body-compact-01 text-text-secondary">
                    왼쪽에서 파일을 선택하면 내용이 여기에 표시됩니다.
                  </div>
                ) : preview.kind === 'missing' ? (
                  <div className="px-06 py-08 cds-body-compact-01 text-text-secondary">
                    아카이브에서 해당 경로를 찾을 수 없습니다.
                  </div>
                ) : preview.kind === 'error' ? (
                  <div className="px-06 py-08 cds-body-compact-01 text-support-error">{preview.message}</div>
                ) : (
                  <>
                    <div className="px-05 py-03 border-b border-border-subtle-01 cds-helper-01 text-text-secondary sticky top-0 bg-layer-02 flex items-center justify-between gap-03 z-10">
                      <span className="truncate">{filePath}</span>
                      <span className="shrink-0">
                        {fmtBytes(preview.size)}
                        {(preview.kind === 'text' || preview.kind === 'markdown') && preview.truncated
                          ? ' · 앞 256KB만 표시'
                          : ''}
                      </span>
                    </div>
                    {preview.kind === 'text' ? (
                      <pre className="px-05 py-04 cds-code-01 text-text-primary whitespace-pre-wrap break-words">
                        {preview.text}
                      </pre>
                    ) : preview.kind === 'markdown' ? (
                      <MarkdownView text={preview.text} />
                    ) : preview.kind === 'sheet' ? (
                      <SheetView sheets={preview.sheets} />
                    ) : preview.kind === 'image' ? (
                      <div className="p-05 flex justify-center bg-layer-01">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview.dataUri} alt={filePath ?? ''} className="max-w-full h-auto" />
                      </div>
                    ) : (
                      <div className="px-06 py-08 cds-body-compact-01 text-text-secondary">
                        바이너리 파일입니다 — 미리보기는 텍스트·마크다운·이미지·xlsx만 지원합니다. 위의 다운로드로
                        확인하세요.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <ProblemDangerZone
        code={problem.code}
        title={problem.title}
        isActive={problem.isActive}
        usedByBatch={usedByBatch}
      />
    </>
  );
}
