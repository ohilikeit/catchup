'use client';
import { useState } from 'react';
import {
  AppHeader,
  SideNav,
  Modal,
  Breadcrumb,
  MetricGrid,
  MetricTile,
  DataTable,
  Button,
  Field,
  Input,
  Select,
  Radio,
  Toggle,
  Tag,
  Notification,
  Icon,
  type SideNavItem,
  type Column,
} from '@app/ui';
import { useToast } from '@app/core';

/* ---- data model -------------------------------------------------------- */
interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  status: 'Active' | 'Invited';
}

const SEED_USERS: User[] = [
  { id: 'u1', name: 'Mina Park', email: 'mina@catchup.io', role: 'Admin', status: 'Active' },
  { id: 'u2', name: 'Jo Daniels', email: 'jo@catchup.io', role: 'Editor', status: 'Active' },
  { id: 'u3', name: 'Sam Rivera', email: 'sam@catchup.io', role: 'Viewer', status: 'Invited' },
  { id: 'u4', name: 'Lena Cho', email: 'lena@catchup.io', role: 'Editor', status: 'Active' },
];

const NAV: SideNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'users', label: 'Users', icon: 'user' },
  { id: 'data', label: 'Data sources', icon: 'data' },
  { id: 'activity', label: 'Activity', icon: 'time' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/* ====================================================================== */
export default function ConsolePage() {
  const { toast } = useToast();
  const [loggedIn, setLoggedIn] = useState(false);
  const [page, setPage] = useState('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers] = useState<User[]>(SEED_USERS);
  const [modal, setModal] = useState<'add' | { type: 'delete'; user: User } | null>(null);

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;

  const activeLabel = NAV.find((n) => n.id === page)?.label ?? 'Overview';

  function addUser(name: string, email: string, role: User['role']) {
    setUsers((prev) => [
      ...prev,
      { id: `u${prev.length + 1}-${name}`, name, email, role, status: 'Invited' },
    ]);
    setModal(null);
    toast({ kind: 'success', title: 'Invitation sent.', message: `${name} was invited.` });
  }

  function removeUser(user: User) {
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    setModal(null);
    toast({ kind: 'error', title: 'Access removed.', message: `${user.name} was removed.` });
  }

  return (
    <div className="flex flex-col h-screen bg-layer-01">
      <AppHeader
        nav={['Console', 'Insights', 'Docs']}
        active="Console"
        onMenu={() => setCollapsed((c) => !c)}
        user="MP"
      />
      <div className="flex flex-1 min-h-0">
        <SideNav items={NAV} active={page} onSelect={setPage} collapsed={collapsed} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-07 pt-07 pb-10 max-w-[1056px]">
            <Breadcrumb
              items={[
                { label: 'CatchUP', onClick: () => setPage('overview') },
                { label: activeLabel },
              ]}
              className="mb-03"
            />
            {page === 'overview' && <Overview />}
            {page === 'users' && (
              <Users
                users={users}
                onAdd={() => setModal('add')}
                onDelete={(u) => setModal({ type: 'delete', user: u })}
              />
            )}
            {page === 'settings' && <Settings onSaved={() => toast({ kind: 'success', title: 'Saved.', message: 'Settings updated.' })} />}
            {(page === 'data' || page === 'activity') && <EmptyState label={activeLabel} />}
          </div>
        </main>
      </div>

      {modal === 'add' && <AddUserModal onClose={() => setModal(null)} onAdd={addUser} />}
      {modal && typeof modal === 'object' && modal.type === 'delete' && (
        <Modal
          title="Remove access"
          danger
          primaryLabel="Remove access"
          onClose={() => setModal(null)}
          onPrimary={() => removeUser(modal.user)}
        >
          <p className="cds-body-01 text-text-primary">
            Remove <b>{modal.user.name}</b> from this workspace? They will lose access immediately.
            This can&rsquo;t be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}

/* ---- Login ------------------------------------------------------------- */
function Login({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col bg-shell text-shell-text p-09">
        <div className="flex items-center gap-03">
          <span className="w-8 h-8 bg-shell-accent flex items-center justify-center text-shell-text">
            <Icon name="arrow-up" size={20} />
          </span>
          <span className="font-sans text-lg font-semibold">
            CatchUP <span className="font-normal">Console</span>
          </span>
        </div>
        <div className="mt-auto cds-heading-07">
          Manage your workspace<br />
          with <b className="font-semibold text-shell-accent-text">clarity</b>.
        </div>
        <div className="mt-06 font-mono text-xs text-shell-text-muted">
          v0.1.0 · built on IBM Carbon foundations
        </div>
      </div>
      <div className="flex items-center justify-center bg-layer-02 p-06">
        <form
          className="w-[320px] flex flex-col gap-06"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
        >
          <div>
            <h1 className="cds-heading-05 text-text-primary">Log in</h1>
            <p className="cds-body-01 text-text-secondary mt-02">
              Use any values — this is a prototype.
            </p>
          </div>
          <Field label="Email">
            <Input lead="email" type="email" placeholder="you@catchup.io" defaultValue="mina@catchup.io" />
          </Field>
          <Field label="Password">
            <Input trail="view-off" type="password" defaultValue="password" />
          </Field>
          <Button kind="primary" type="submit" icon="arrow-right" className="justify-between">
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ---- Overview ---------------------------------------------------------- */
function Overview() {
  return (
    <>
      <PageHead title="Overview" sub="Workspace health at a glance." />
      <MetricGrid className="mb-07">
        <MetricTile label="Active users" value="1,284" icon="user" delta="+12% this week" trend="up" />
        <MetricTile label="Assessments" value="342" icon="document" delta="+5%" trend="up" />
        <MetricTile label="Avg. score" value="78.4" icon="analytics" delta="-1.2%" trend="down" />
        <MetricTile label="Pending" value="17" icon="time" delta="3 overdue" />
      </MetricGrid>
      <div className="flex flex-col gap-03 max-w-[680px]">
        <Notification kind="info" title="Scheduled maintenance.">
          The grading service will pause for ~5 minutes tonight at 23:00 UTC.
        </Notification>
        <Notification kind="success" title="All systems operational.">
          No incidents in the last 30 days.
        </Notification>
      </div>
    </>
  );
}

/* ---- Users ------------------------------------------------------------- */
function Users({
  users,
  onAdd,
  onDelete,
}: {
  users: User[];
  onAdd: () => void;
  onDelete: (u: User) => void;
}) {
  const columns: Array<Column<User>> = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (u) => (
        <span className="flex items-center gap-03">
          <span className="w-7 h-7 rounded-pill bg-layer-accent-01 text-text-secondary flex items-center justify-center font-sans text-[11px] font-semibold flex-[0_0_auto]">
            {initials(u.name)}
          </span>
          {u.name}
        </span>
      ),
    },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (u) => <Tag color={u.role === 'Admin' ? 'blue' : 'gray'}>{u.role}</Tag>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (u) =>
        u.status === 'Active' ? (
          <Tag color="green" icon="checkmark-filled">
            Active
          </Tag>
        ) : (
          <Tag color="gray" icon="time">
            Invited
          </Tag>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (u) => (
        <Button
          kind="ghost"
          size="sm"
          iconOnly
          icon="trash"
          aria-label={`Remove ${u.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(u);
          }}
        />
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Access management"
        sub="Add users and assign roles to control what they can see."
        action={
          <Button kind="primary" size="field" icon="add" onClick={onAdd}>
            Invite user
          </Button>
        }
      />
      <DataTable
        title="Users"
        columns={columns}
        rows={users}
        getRowId={(u) => u.id}
        toolbar={
          <>
            <Button kind="ghost" size="field" iconOnly icon="search" aria-label="Search" />
            <Button kind="ghost" size="field" iconOnly icon="filter" aria-label="Filter" />
            <Button kind="primary" size="field" icon="add" onClick={onAdd}>
              Invite
            </Button>
          </>
        }
      />
    </>
  );
}

function AddUserModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, email: string, role: User['role']) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<User['role']>('Viewer');
  return (
    <Modal
      title="Invite user"
      primaryLabel="Send invite"
      onClose={onClose}
      onPrimary={() => onAdd(name || 'New User', email || 'new@catchup.io', role)}
    >
      <Field label="Full name">
        <Input placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email">
        <Input
          lead="email"
          placeholder="jane@catchup.io"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Role">
        <Select
          options={['Admin', 'Editor', 'Viewer']}
          value={role}
          onChange={(e) => setRole(e.target.value as User['role'])}
        />
      </Field>
    </Modal>
  );
}

/* ---- Settings ---------------------------------------------------------- */
function Settings({ onSaved }: { onSaved: () => void }) {
  const [theme, setTheme] = useState('white');
  const [emailNotif, setEmailNotif] = useState(true);
  const [weekly, setWeekly] = useState(false);
  return (
    <>
      <PageHead
        title="Settings"
        sub="Workspace preferences and defaults."
        action={
          <Button kind="primary" size="field" icon="checkmark" onClick={onSaved}>
            Save changes
          </Button>
        }
      />
      <div className="bg-layer-02 border border-border-subtle-01 p-06 mb-04">
        <h3 className="cds-heading-compact-02 text-text-primary mb-01">Workspace</h3>
        <p className="cds-body-01 text-text-secondary mb-05">Basic information for your team.</p>
        <div className="grid md:grid-cols-2 gap-06">
          <Field label="Workspace name">
            <Input defaultValue="CatchUP" />
          </Field>
          <Field label="Default region">
            <Select options={['US East', 'US West', 'EU Central', 'AP Southeast']} />
          </Field>
        </div>
      </div>
      <div className="bg-layer-02 border border-border-subtle-01 p-06 mb-04">
        <h3 className="cds-heading-compact-02 text-text-primary mb-01">Appearance</h3>
        <p className="cds-body-01 text-text-secondary mb-05">Default theme for new members.</p>
        <div className="flex gap-07">
          {['white', 'gray-10', 'gray-100'].map((t) => (
            <Radio key={t} name="wtheme" checked={theme === t} onChange={() => setTheme(t)}>
              {t}
            </Radio>
          ))}
        </div>
      </div>
      <div className="bg-layer-02 border border-border-subtle-01 p-06">
        <h3 className="cds-heading-compact-02 text-text-primary mb-01">Notifications</h3>
        <p className="cds-body-01 text-text-secondary mb-05">How your team hears from us.</p>
        <Row label="Email notifications" desc="Activity that needs your attention.">
          <Toggle checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
        </Row>
        <Row label="Weekly digest" desc="A summary every Monday morning.">
          <Toggle checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
        </Row>
      </div>
    </>
  );
}

/* ---- shared bits ------------------------------------------------------- */
function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-04 mb-07">
      <div>
        <h1 className="cds-heading-05 text-text-primary">{title}</h1>
        <p className="cds-body-01 text-text-secondary mt-02">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-04 border-t border-border-subtle-01">
      <div>
        <div className="cds-body-01 text-text-primary">{label}</div>
        <div className="cds-helper-01 text-text-secondary mt-[2px]">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <>
      <PageHead title={label} sub="This surface isn't part of the source design." />
      <div className="bg-layer-02 border border-border-subtle-01 py-13 flex flex-col items-center text-center">
        <span className="text-icon-secondary">
          <Icon name="folder" size={32} />
        </span>
        <div className="cds-heading-compact-02 text-text-primary mt-04">Nothing here yet</div>
        <div className="cds-body-01 text-text-secondary mt-02 max-w-[40ch]">
          {label} was intentionally left as an empty state rather than invented — it has no source
          in the Figma file.
        </div>
      </div>
    </>
  );
}
