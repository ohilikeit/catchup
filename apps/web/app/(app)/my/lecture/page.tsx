import type { Metadata } from 'next';
import { requireAudience } from '@/lib/auth/guard';
import { PageHead } from '../../_components/ui';
import { LecturePlayer } from './LecturePlayer';

export const metadata: Metadata = { title: '강의' };

// my/lecture — 모든 회차 공통 인터넷 강의(바이브코딩). 지금은 목데이터 껍데기.
// 추후 확장: 강의/챕터/진도를 DB(예: learn schema)로, 동영상은 스토리지/스트리밍 연동.

export default async function LecturePage() {
  await requireAudience('examinee');
  return (
    <>
      <PageHead title="강의" sub="시험 전에 들어야 하는 공통 바이브코딩 강의입니다." />
      <LecturePlayer />
    </>
  );
}
