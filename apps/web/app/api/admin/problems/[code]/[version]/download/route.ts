import { getSession } from '@/lib/auth/session';
import { problemsRepo } from '@/lib/db';
import { getScaffoldArchive } from '@/lib/services/problemService';

// GET /api/admin/problems/[code]/[version]/download — 스캐폴드 아카이브 다운로드(admin 전용).
// presigned URL 대신 서버 스트리밍: MinIO endpoint(클러스터 내부 호스트)가 브라우저에서
// 해석되지 않으므로 web 이 받아 흘려보낸다(스캐폴드는 소형 — 상한은 problemService 가 강제).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: { code: string; version: string } },
) {
  const session = await getSession();
  if (!session || !session.globalRoles.includes('admin')) {
    return new Response('forbidden', { status: 403 });
  }

  const versions = await problemsRepo.listVersionsByCode(decodeURIComponent(params.code));
  const version = versions.find((v) => String(v.version) === params.version);
  if (!version) return new Response('not found', { status: 404 });

  try {
    const archive = await getScaffoldArchive(version.publicScaffoldRef);
    const filename = version.publicScaffoldRef.split('/').pop() ?? 'scaffold.tgz';
    return new Response(new Uint8Array(archive), {
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'content-length': String(archive.length),
      },
    });
  } catch (e: unknown) {
    return new Response(e instanceof Error ? e.message : 'download failed', { status: 500 });
  }
}
