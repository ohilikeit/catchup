'use client';
import { useRef, useState, useTransition } from 'react';
import { Button, Modal, Field, Input, Select } from '@app/ui';
import { useToast } from '@app/core';
import { uploadProblemAction } from './actions';

// 문제 버전 업로드(admin). 로스터 업로드(AdminBatchesClient)와 동형: Modal + useToast + useTransition.
// scaffold 필수. 제출은 server action(uploadProblemAction)이 revalidate로 목록 갱신.

export function AdminProblemUpload() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    startTransition(async () => {
      try {
        const { code, version, normalize } = await uploadProblemAction(fd);
        setOpen(false);
        form.reset();
        const notes = [`파일 ${normalize.fileCount}개`];
        if (normalize.flattened > 0) notes.push(`wrapping 폴더 ${normalize.flattened}겹 평탄화`);
        if (normalize.droppedJunk > 0) notes.push(`불필요 항목 ${normalize.droppedJunk}개 제거`);
        toast({
          kind: 'success',
          title: '문제 버전이 업로드되었습니다.',
          message: `${code} v${version} 등록 — ${notes.join(' · ')}.`,
        });
      } catch (e) {
        toast({ kind: 'error', title: '업로드 실패', message: String((e as Error).message) });
      }
    });
  }

  return (
    <>
      <Button kind="primary" size="field" icon="add" onClick={() => setOpen(true)}>
        문제 업로드
      </Button>

      {open && (
        <Modal
          title="문제 업로드"
          primaryLabel={pending ? '업로드 중...' : '업로드'}
          secondaryLabel="취소"
          onClose={() => setOpen(false)}
          onPrimary={handleSubmit}
        >
          <form ref={formRef} className="flex flex-col gap-05">
            <Field label="문제 코드" helper="영소문자·숫자·-·_ (예: planning-a1). 같은 코드로 올리면 새 버전이 추가됩니다.">
              <Input name="code" placeholder="planning-a1" />
            </Field>
            <Field label="직무(role_track)">
              <Select name="roleTrack">
                <option value="planning">planning</option>
                <option value="dev">dev</option>
                <option value="marketing">marketing</option>
              </Select>
            </Field>
            <Field label="문제 제목">
              <Input name="title" placeholder="예: 사용자 온보딩 플로우 설계" />
            </Field>
            <Field
              label="스캐폴드 파일 (필수)"
              helper="zip 또는 tgz(tar.gz). 서버가 정리·평탄화 후 표준 tgz로 저장합니다 — 폴더째 묶어도 됩니다."
            >
              <input
                type="file"
                name="scaffold"
                accept=".zip,.tgz,.tar.gz,application/zip,application/gzip"
                className="block w-full cds-body-01 text-text-primary file:mr-04 file:border file:border-border-strong-01 file:bg-layer-01 file:px-04 file:py-02 file:cds-label-01 file:text-text-primary hover:file:bg-layer-02"
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
