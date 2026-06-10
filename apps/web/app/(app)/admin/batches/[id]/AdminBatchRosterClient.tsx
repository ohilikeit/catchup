'use client';
import { useState, useTransition } from 'react';
import { DataTable, Button, Modal, Field, Input, type Column } from '@app/ui';
import { useToast } from '@app/core';
import type { RosterItem } from '@/lib/db/repositories/attempts';
import type { ExamineeCandidate } from '@/lib/db/repositories/users';
import { AttemptStatusTag, SubmissionStatusTag } from '../../../_components/ui';
import { extendDeadlineAction, voidAttemptAction, forceSubmitAction, addStudentAction } from './actions';

interface IssuedCred { name: string; email: string; tempPassword: string }

function fmt(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

type RowAction =
  | { type: 'extend'; item: RosterItem }
  | { type: 'void'; item: RosterItem }
  | { type: 'forceSubmit'; item: RosterItem };

export function AdminBatchRosterClient({
  batchId,
  roster,
  candidates,
  canOperate,
}: {
  batchId: string;
  roster: RosterItem[];
  /** "기존 사용자에서 선택" 후보(전체 사용자 + 회차 이력). 선택 시 계정·비번 유지, 이 회차 응시만 추가. */
  candidates: ExamineeCandidate[];
  canOperate: boolean;
}) {
  const { toast } = useToast();
  const [modal, setModal] = useState<RowAction | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [issued, setIssued] = useState<IssuedCred | null>(null); // 발급된 임시비번 1회 표시
  const [pending, startTransition] = useTransition();

  function handleAddStudent(input: { name: string; email: string; externalId: string }) {
    startTransition(async () => {
      try {
        const r = await addStudentAction(batchId, input);
        setShowAdd(false);
        const c = r.issued[0];
        if (c) {
          setIssued({ name: c.name, email: c.email, tempPassword: c.tempPassword });
        } else if (r.created > 0) {
          toast({ kind: 'success', title: '추가 완료', message: '기존 계정에 이 회차 응시를 추가했습니다(비밀번호 유지).' });
        } else if (r.skipped > 0) {
          toast({ kind: 'info', title: '이미 등록됨', message: '이 학생은 이미 이 회차에 등록돼 있습니다.' });
        } else {
          toast({ kind: 'error', title: '추가 실패', message: '이름/이메일을 확인하세요.' });
        }
      } catch (e) {
        toast({ kind: 'error', title: '추가 실패', message: String((e as Error).message) });
      }
    });
  }

  function handleExtend(attemptId: string, minutes: number) {
    startTransition(async () => {
      try {
        await extendDeadlineAction(batchId, attemptId, minutes);
        setModal(null);
        toast({ kind: 'success', title: '연장 완료', message: `${minutes}분 연장되었습니다.` });
      } catch (e) {
        toast({ kind: 'error', title: '연장 실패', message: String((e as Error).message) });
      }
    });
  }

  function handleVoid(attemptId: string, reason: string) {
    startTransition(async () => {
      try {
        await voidAttemptAction(batchId, attemptId, reason);
        setModal(null);
        toast({ kind: 'success', title: '무효 처리 완료', message: '응시가 무효 처리되었습니다.' });
      } catch (e) {
        toast({ kind: 'error', title: '무효 처리 실패', message: String((e as Error).message) });
      }
    });
  }

  function handleForceSubmit(attemptId: string) {
    startTransition(async () => {
      try {
        await forceSubmitAction(batchId, attemptId);
        setModal(null);
        toast({ kind: 'success', title: '강제 제출 완료', message: '응시가 제출 상태로 마감되었습니다.' });
      } catch (e) {
        toast({ kind: 'error', title: '강제 제출 실패', message: String((e as Error).message) });
      }
    });
  }

  const columns: Array<Column<RosterItem>> = [
    { key: 'examineeName', header: '응시자', sortable: true },
    {
      key: 'examineeEmail' as keyof RosterItem,
      header: '아이디(이메일)',
      render: (r) => <span className="cds-code-01 text-text-secondary">{r.examineeEmail ?? '—'}</span>,
    },
    ...(canOperate
      ? [
          {
            key: 'tempPassword' as keyof RosterItem,
            header: '임시 비밀번호',
            render: (r: RosterItem) => <TempPasswordCell value={r.tempPassword} />,
          },
        ]
      : []),
    {
      key: 'status',
      header: '응시 상태',
      render: (r) => <AttemptStatusTag status={r.status} />,
    },
    {
      key: 'submissionStatus',
      header: '제출 상태',
      render: (r) => <SubmissionStatusTag status={r.submissionStatus} />,
    },
    {
      key: 'submittedAt',
      header: '제출 시각',
      render: (r) => fmt(r.submittedAt),
    },
    ...(canOperate
      ? [
          {
            key: 'actions' as keyof RosterItem,
            header: '',
            className: 'w-64 text-right',
            render: (r: RosterItem) => (
              <span className="flex items-center gap-02 justify-end">
                {(r.status === 'ready' || r.status === 'running') && (
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModal({ type: 'forceSubmit', item: r });
                    }}
                  >
                    강제 제출
                  </Button>
                )}
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ type: 'extend', item: r });
                  }}
                >
                  연장
                </Button>
                <Button
                  kind="danger"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ type: 'void', item: r });
                  }}
                >
                  무효
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      {canOperate && (
        <div className="flex justify-end mb-04">
          <Button kind="secondary" size="sm" icon="add" onClick={() => setShowAdd(true)}>
            학생 추가
          </Button>
        </div>
      )}

      <DataTable
        title="응시자 로스터"
        columns={columns}
        rows={roster}
        getRowId={(r) => r.attemptId}
      />

      {showAdd && (
        <AddStudentModal
          pending={pending}
          candidates={candidates}
          rosterEmails={new Set(roster.map((r) => r.examineeEmail).filter((e): e is string => !!e))}
          onClose={() => setShowAdd(false)}
          onSubmit={handleAddStudent}
        />
      )}

      {issued && <IssuedModal cred={issued} onClose={() => setIssued(null)} />}

      {modal?.type === 'extend' && (
        <ExtendModal
          item={modal.item}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={(minutes) => handleExtend(modal.item.attemptId, minutes)}
        />
      )}

      {modal?.type === 'void' && (
        <VoidModal
          item={modal.item}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={(reason) => handleVoid(modal.item.attemptId, reason)}
        />
      )}

      {modal?.type === 'forceSubmit' && (
        <ForceSubmitModal
          item={modal.item}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={() => handleForceSubmit(modal.item.attemptId)}
        />
      )}
    </>
  );
}

/* ── 강제 제출 모달 ─────────────────────────────────────────────────────────── */
function ForceSubmitModal({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: RosterItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title={`강제 제출 — ${item.examineeName}`}
      primaryLabel={pending ? '처리 중...' : '강제 제출'}
      secondaryLabel="취소"
      onClose={onClose}
      onPrimary={onSubmit}
    >
      <p className="cds-body-01 text-text-secondary">
        이 응시를 지금 즉시 <b>제출</b> 상태로 마감합니다. 진행 중이거나 대기 중인 응시에만 적용되며,
        이후 학생은 더 이상 진행할 수 없습니다. 되돌릴 수 없습니다.
      </p>
    </Modal>
  );
}

/* ── 연장 모달 ─────────────────────────────────────────────────────────────── */
function ExtendModal({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: RosterItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState('30');

  function handlePrimary() {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return;
    onSubmit(m);
  }

  return (
    <Modal
      title={`마감 연장 — ${item.examineeName}`}
      primaryLabel={pending ? '처리 중...' : '연장'}
      onClose={onClose}
      onPrimary={handlePrimary}
    >
      <Field label="연장 시간(분)" helper="1~600분 사이로 입력하세요.">
        <Input
          type="number"
          value={minutes}
          min="1"
          max="600"
          onChange={(e) => setMinutes(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

/* ── 무효 모달 ─────────────────────────────────────────────────────────────── */
function VoidModal({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item: RosterItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Modal
      title={`응시 무효 — ${item.examineeName}`}
      primaryLabel={pending ? '처리 중...' : '무효 처리'}
      onClose={onClose}
      onPrimary={() => onSubmit(reason)}
      danger
    >
      <p className="cds-body-01 text-text-secondary mb-05">
        이 응시를 무효 처리합니다. 제출 완료된 응시는 무효 처리할 수 없습니다.
      </p>
      <Field label="사유(선택)">
        <Input
          placeholder="예: 부정행위 의심"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

/* ── 임시비번 셀: 가림/보기 토글 + 복사 ─────────────────────────────────────── */
function TempPasswordCell({ value }: { value: string | null }) {
  const { toast } = useToast();
  const [shown, setShown] = useState(false);
  if (!value) return <span className="text-text-helper">— (변경됨)</span>;
  return (
    <span className="flex items-center gap-02">
      <span className="cds-code-01">{shown ? value : '••••••••'}</span>
      <Button kind="ghost" size="sm" onClick={() => setShown((s) => !s)}>
        {shown ? '가리기' : '보기'}
      </Button>
      <Button
        kind="ghost"
        size="sm"
        icon="copy"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          toast({ kind: 'success', title: '복사됨', message: '임시 비밀번호를 복사했습니다.' });
        }}
      >
        복사
      </Button>
    </span>
  );
}

/* ── 학생 1명 추가 모달 ─────────────────────────────────────────────────────── */
function AddStudentModal({
  pending,
  candidates,
  rosterEmails,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  candidates: ExamineeCandidate[];
  /** 이미 이 회차 로스터에 있는 이메일(중복 추가 방지 표시). */
  rosterEmails: Set<string>;
  onClose: () => void;
  onSubmit: (input: { name: string; email: string; externalId: string }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [externalId, setExternalId] = useState('');
  const [query, setQuery] = useState('');

  // 기존 사용자 검색(이름/이메일 부분일치, 상위 8명). 선택하면 아래 입력칸이 채워진다.
  const q = query.trim().toLowerCase();
  const matches =
    q.length === 0
      ? []
      : candidates
          .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
          .slice(0, 8);

  function pick(c: ExamineeCandidate) {
    setName(c.name);
    setEmail(c.email);
    setExternalId(c.externalId ?? '');
    setQuery('');
  }

  return (
    <Modal
      title="학생 추가"
      primaryLabel={pending ? '추가 중...' : '추가'}
      secondaryLabel="취소"
      onClose={onClose}
      onPrimary={() => onSubmit({ name: name.trim(), email: email.trim(), externalId: externalId.trim() })}
    >
      <p className="cds-body-01 text-text-secondary mb-05">
        이 회차에 학생 1명을 등록합니다. 신규 계정이면 <b>임시 비밀번호</b>가 발급됩니다(아이디=이메일).
        기존 계정이면 이 회차 응시만 추가됩니다(아이디·비밀번호 그대로 — 다회차 누적).
      </p>
      <div className="flex flex-col gap-04">
        <Field label="기존 사용자에서 선택" helper="이름 또는 이메일로 검색해 선택하면 아래 칸이 채워집니다.">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색: 이름 또는 이메일" />
        </Field>
        {q.length > 0 && (
          <ul className="border border-border-subtle-01 bg-layer-01 max-h-[220px] overflow-auto -mt-03">
            {matches.map((c) => {
              const already = rosterEmails.has(c.email);
              return (
                <li key={c.id} className="border-b border-border-subtle-01 last:border-b-0">
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => pick(c)}
                    className="w-full text-left px-04 py-03 flex items-center justify-between gap-04 hover:bg-layer-hover-01 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="min-w-0 truncate">
                      <span className="cds-body-compact-01 text-text-primary">{c.name}</span>
                      <span className="cds-helper-01 text-text-secondary ml-03">{c.email}</span>
                    </span>
                    <span className="shrink-0 cds-helper-01 text-text-secondary">
                      {already
                        ? '이미 이 회차에 등록됨'
                        : c.batchNames.length > 0
                          ? c.batchNames.join(' · ')
                          : '응시 이력 없음'}
                    </span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 && (
              <li className="px-04 py-03 cds-helper-01 text-text-secondary">
                일치하는 사용자가 없습니다 — 아래에 직접 입력하면 신규 계정이 생성됩니다.
              </li>
            )}
          </ul>
        )}
        <Field label="이름">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
        </Field>
        <Field label="이메일(아이디)">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@univ.ac.kr" />
        </Field>
        <Field label="학번(선택)">
          <Input value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="2026-0001" />
        </Field>
      </div>
    </Modal>
  );
}

/* ── 발급 자격증명 표시(신규 계정) ─────────────────────────────────────────── */
function IssuedModal({ cred, onClose }: { cred: IssuedCred; onClose: () => void }) {
  const { toast } = useToast();
  const text = `이메일: ${cred.email}\n임시 비밀번호: ${cred.tempPassword}`;
  return (
    <Modal title="계정 발급 완료" primaryLabel="닫기" onClose={onClose} onPrimary={onClose}>
      <p className="cds-body-01 text-text-secondary mb-05">
        <b>{cred.name}</b> 님의 계정이 발급되었습니다. 아래 정보를 학생에게 전달하세요.
        (임시 비밀번호는 로스터 표에서 언제든 다시 볼 수 있습니다.)
      </p>
      <div className="bg-layer-02 border border-border-subtle-01 p-05 flex flex-col gap-02">
        <div className="flex justify-between"><span className="text-text-secondary">아이디</span><span className="cds-code-01">{cred.email}</span></div>
        <div className="flex justify-between"><span className="text-text-secondary">임시 비밀번호</span><span className="cds-code-01">{cred.tempPassword}</span></div>
      </div>
      <div className="flex justify-end mt-04">
        <Button kind="ghost" size="sm" icon="copy" onClick={() => { navigator.clipboard?.writeText(text); toast({ kind: 'success', title: '복사됨', message: '계정 정보를 복사했습니다.' }); }}>
          복사
        </Button>
      </div>
    </Modal>
  );
}
