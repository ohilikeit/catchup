'use client';
import { useState, useTransition } from 'react';
import { DataTable, Button, Modal, Field, Input, Select, Tag, Notification, type Column } from '@app/ui';
import { useToast } from '@app/core';
import type { OrgWithCounts } from '@/lib/db/repositories/organizations';
import type { IssueOrgAdminResult } from '@/lib/services/staffService';
import { createOrgAction, deactivateOrgAction, issueOrgAdminAction } from './actions';

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString('ko-KR', { dateStyle: 'medium' });
}

type IssuedOk = Extract<IssueOrgAdminResult, { ok: true }>;

export function AdminOrgsClient({ orgs }: { orgs: OrgWithCounts[] }) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [showStaff, setShowStaff] = useState(false);
  const [staffResult, setStaffResult] = useState<IssuedOk | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      try {
        await createOrgAction(formData);
        setShowAdd(false);
        toast({ kind: 'success', title: '대학이 추가되었습니다.', message: '새 기관이 목록에 추가되었습니다.' });
      } catch (e) {
        toast({ kind: 'error', title: '추가 실패', message: String((e as Error).message) });
      }
    });
  }

  function handleIssueStaff(formData: FormData) {
    startTransition(async () => {
      const res = await issueOrgAdminAction(formData);
      if (res.ok) {
        setStaffResult(res); // 모달 유지 → 임시비번 1회 노출
        toast({
          kind: 'success',
          title: '담당자 계정이 처리되었습니다.',
          message: res.created ? '신규 계정 발급 — 임시 비밀번호를 전달하세요.' : '기존 계정에 담당자 권한을 부여했습니다.',
        });
      } else {
        toast({ kind: 'error', title: '발급 실패', message: res.error });
      }
    });
  }

  function closeStaff() {
    setShowStaff(false);
    setStaffResult(null);
  }

  function handleDeactivate(id: string, name: string) {
    startTransition(async () => {
      try {
        await deactivateOrgAction(id);
        toast({ kind: 'success', title: '비활성화되었습니다.', message: `${name}을(를) 비활성 처리했습니다.` });
      } catch {
        toast({ kind: 'error', title: '비활성화 실패', message: '잠시 후 다시 시도하세요.' });
      }
    });
  }

  const columns: Array<Column<OrgWithCounts>> = [
    { key: 'name', header: '기관명', sortable: true },
    { key: 'code', header: '코드', render: (r) => r.code ?? '—' },
    { key: 'staffCount', header: '담당자', sortable: true, render: (r) => String(r.staffCount) },
    { key: 'studentCount', header: '학생', sortable: true, render: (r) => String(r.studentCount) },
    { key: 'batchCount', header: '회차', sortable: true, render: (r) => String(r.batchCount) },
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
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      render: (r) =>
        r.isActive ? (
          <Button
            kind="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleDeactivate(r.id, r.name);
            }}
          >
            비활성화
          </Button>
        ) : null,
    },
  ];

  const activeOrgs = orgs.filter((o) => o.isActive);

  return (
    <>
      <DataTable
        title="기관 목록"
        columns={columns}
        rows={orgs}
        getRowId={(r) => r.id}
        toolbar={
          <>
            <Button kind="ghost" size="field" icon="user" onClick={() => setShowStaff(true)}>
              담당자 발급
            </Button>
            <Button kind="primary" size="field" icon="add" onClick={() => setShowAdd(true)}>
              기관 추가
            </Button>
          </>
        }
      />

      {showAdd && (
        <AddOrgModal pending={pending} onClose={() => setShowAdd(false)} onSubmit={handleCreate} />
      )}

      {showStaff && (
        <IssueStaffModal
          orgs={activeOrgs}
          pending={pending}
          result={staffResult}
          onClose={closeStaff}
          onSubmit={handleIssueStaff}
        />
      )}
    </>
  );
}

function AddOrgModal({
  pending,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  function handlePrimary() {
    const fd = new FormData(document.getElementById('add-org-form') as HTMLFormElement);
    onSubmit(fd);
  }

  return (
    <Modal
      title="기관 추가"
      primaryLabel={pending ? '저장 중...' : '추가'}
      onClose={onClose}
      onPrimary={handlePrimary}
    >
      <form id="add-org-form" className="flex flex-col gap-05">
        <Field label="기관명">
          <Input name="name" placeholder="예: 한국대학교" autoFocus />
        </Field>
        <Field label="코드 (선택)">
          <Input name="code" placeholder="예: KNU" />
        </Field>
      </form>
    </Modal>
  );
}

/* ── 담당자(org_admin) 발급 — 결과(임시비번) 1회 노출 ──────────────────────── */
function IssueStaffModal({
  orgs,
  pending,
  result,
  onClose,
  onSubmit,
}: {
  orgs: OrgWithCounts[];
  pending: boolean;
  result: IssuedOk | null;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  // 발급 완료 → 자격증명 노출(평문 임시비번은 지금만).
  if (result) {
    return (
      <Modal title="담당자 발급 완료" primaryLabel="닫기" secondaryLabel="닫기" onClose={onClose} onPrimary={onClose}>
        {result.created ? (
          <>
            <Notification kind="success" title="신규 담당자 계정이 발급되었습니다.">
              아래 임시 비밀번호는 <b>지금만</b> 표시됩니다. 담당자에게 전달 후 첫 로그인에서 변경하도록 안내하세요.
            </Notification>
            <div className="bg-layer-01 border border-border-subtle-01 p-05 flex flex-col gap-03">
              <Row k="이메일" v={result.email} mono />
              <Row k="임시 비밀번호" v={result.tempPassword ?? '—'} mono />
            </div>
          </>
        ) : (
          <Notification kind="info" title="기존 계정에 담당자 권한을 부여했습니다.">
            {result.email} 은 이미 계정이 있어 비밀번호는 변경하지 않았고, 선택한 기관의 담당자 권한만 부여했습니다.
          </Notification>
        )}
      </Modal>
    );
  }

  if (orgs.length === 0) {
    return (
      <Modal title="담당자 발급" primaryLabel="닫기" secondaryLabel="닫기" onClose={onClose} onPrimary={onClose}>
        <Notification kind="warning" title="활성 기관이 없습니다.">
          먼저 기관을 추가한 뒤 담당자를 발급하세요.
        </Notification>
      </Modal>
    );
  }

  function handlePrimary() {
    const fd = new FormData(document.getElementById('issue-staff-form') as HTMLFormElement);
    onSubmit(fd);
  }

  return (
    <Modal
      title="담당자 발급"
      primaryLabel={pending ? '발급 중...' : '발급'}
      onClose={onClose}
      onPrimary={handlePrimary}
    >
      <form id="issue-staff-form" className="flex flex-col gap-05">
        <Field label="기관">
          <Select name="orgId">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="담당자 이름">
          <Input name="fullName" placeholder="예: 김담당" autoFocus />
        </Field>
        <Field label="이메일" helper="이 이메일이 로그인 아이디가 됩니다.">
          <Input name="email" lead="email" type="email" placeholder="staff@org.ac.kr" />
        </Field>
      </form>
    </Modal>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-04">
      <span className="cds-label-01 text-text-secondary">{k}</span>
      <span className={`cds-body-01 text-text-primary ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  );
}
