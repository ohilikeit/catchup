'use client';
import { useState } from 'react';
import {
  Button,
  Field,
  Input,
  Select,
  Checkbox,
  Radio,
  Toggle,
  Tag,
  Notification,
  Tile,
  Menu,
  Icon,
  CARBON_ICONS,
  type IconName,
} from '@app/ui';
import { useToast } from '@app/core';

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-border-subtle-01 py-09">
      <h2 className="cds-heading-04 text-text-primary">{title}</h2>
      <p className="cds-body-01 text-text-secondary mt-02 mb-06 max-w-[60ch]">{subtitle}</p>
      {children}
    </section>
  );
}

const GRAY = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const BLUE = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const RED = [10, 20, 30, 40, 50, 60, 70, 80, 90];

function Ramp({ name, steps }: { name: string; steps: number[] }) {
  return (
    <div>
      <div className="cds-label-01 text-text-secondary mb-02 uppercase">{name}</div>
      <div className="flex">
        {steps.map((s) => (
          <div key={s} className="flex-1 min-w-0">
            <div
              className="h-12"
              style={{ background: `var(--${name.toLowerCase()}-${s})` }}
            />
            <div className="cds-code-01 text-text-secondary pt-01 text-center">{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ICON_NAMES = Object.keys(CARBON_ICONS) as IconName[];

export function Gallery() {
  const { toast } = useToast();
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState('white');
  const [toggle, setToggle] = useState(true);
  const [tags, setTags] = useState(['Active', 'Admin', 'Verified']);

  return (
    <div className="mx-auto max-w-[1056px] px-07 pb-13">
      {/* Hero */}
      <div className="py-10">
        <Tag color="blue">Built on IBM Carbon</Tag>
        <h1 className="cds-heading-06 text-text-primary mt-04">CatchUP Design System</h1>
        <p className="cds-body-02 text-text-secondary mt-03 max-w-[64ch]">
          A productive, enterprise design system. One interactive blue, a neutral gray
          architecture, sharp corners, and the IBM Plex type family. Every component below is
          exported from <code className="cds-code-02 text-text-primary">@app/ui</code> and themed
          through semantic tokens — toggle dark mode in the header to see them re-theme with zero
          component changes.
        </p>
        <div className="flex gap-03 mt-05">
          <Button kind="primary" icon="arrow-right" asChild>
            <a href="/console">Open the Console kit</a>
          </Button>
          <Button kind="tertiary" icon="launch" asChild>
            <a href="#components">Jump to components</a>
          </Button>
        </div>
      </div>

      {/* Colors */}
      <Section
        id="colors"
        title="Color"
        subtitle="A neutral gray architecture carries the UI; a single interactive blue (#0f62fe) is the only loud color. Status is a fixed quartet."
      >
        <div className="flex flex-col gap-05">
          <Ramp name="Gray" steps={GRAY} />
          <Ramp name="Blue" steps={BLUE} />
          <Ramp name="Red" steps={RED} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-subtle-01 border border-border-subtle-01 mt-06">
          {[
            ['Error', '--support-error'],
            ['Success', '--support-success'],
            ['Warning', '--support-warning'],
            ['Info', '--support-info'],
          ].map(([label, v]) => (
            <div key={label} className="bg-layer-02 p-04">
              <div className="h-08 mb-03" style={{ background: `var(${v})` }} />
              <div className="cds-heading-compact-01 text-text-primary">{label}</div>
              <div className="cds-code-01 text-text-secondary">{v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Type */}
      <Section
        id="type"
        title="Typography"
        subtitle="The Carbon Productive scale — small, tight, functional. Big headings get lighter (weight 300), never heavier. IBM Plex Sans / Mono / Serif."
      >
        <div className="flex flex-col gap-04">
          <div className="cds-heading-07 text-text-primary">Heading 07 · 54/300</div>
          <div className="cds-heading-05 text-text-primary">Heading 05 · 32/400</div>
          <div className="cds-heading-03 text-text-primary">Heading 03 · 20/400</div>
          <div className="cds-heading-compact-02 text-text-primary">Heading compact 02 · 16/600</div>
          <div className="cds-body-02 text-text-primary">
            Body 02 · 16/400 — the quick brown fox jumps over the lazy dog.
          </div>
          <div className="cds-body-01 text-text-secondary">
            Body 01 · 14/400 — the quick brown fox jumps over the lazy dog.
          </div>
          <div className="cds-code-02 text-text-primary">Code 02 · IBM Plex Mono · id_8f3a21</div>
        </div>
      </Section>

      {/* Components anchor */}
      <div id="components" />

      {/* Buttons */}
      <Section
        id="buttons"
        title="Buttons"
        subtitle="Five kinds, three sizes. Feedback is color-only — buttons never scale or bounce. The trailing icon sits hard-right (Carbon's wide gap)."
      >
        <div className="flex flex-wrap gap-03 items-center">
          <Button kind="primary">Primary</Button>
          <Button kind="secondary">Secondary</Button>
          <Button kind="tertiary">Tertiary</Button>
          <Button kind="ghost">Ghost</Button>
          <Button kind="danger">Danger</Button>
          <Button kind="primary" disabled>
            Disabled
          </Button>
        </div>
        <div className="flex flex-wrap gap-03 items-center mt-04">
          <Button kind="primary" icon="add">
            Create
          </Button>
          <Button kind="primary" size="field" icon="download">
            Download
          </Button>
          <Button kind="tertiary" size="sm">
            Small
          </Button>
          <Button kind="primary" iconOnly icon="settings" aria-label="Settings" />
          <Button kind="ghost" iconOnly icon="overflow-vertical" aria-label="More" />
        </div>
      </Section>

      {/* Forms */}
      <Section
        id="forms"
        title="Form controls"
        subtitle="Carbon's signature filled-underline fields, plus selection controls. Loud 2px blue focus ring throughout."
      >
        <div className="grid md:grid-cols-2 gap-06 max-w-[680px]">
          <Field label="Workspace name" helper="Shown to everyone in the workspace.">
            <Input placeholder="Acme Inc." defaultValue="CatchUP" />
          </Field>
          <Field label="Search">
            <Input lead="search" placeholder="Find users" />
          </Field>
          <Field label="Email" error="Enter a valid email address.">
            <Input trail="error-filled" defaultValue="not-an-email" error />
          </Field>
          <Field label="Region">
            <Select options={['US East', 'US West', 'EU Central', 'AP Southeast']} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-09 mt-06">
          <div className="flex flex-col gap-03">
            <div className="cds-label-01 text-text-secondary uppercase">Checkbox</div>
            <Checkbox checked={check} onChange={(e) => setCheck(e.target.checked)}>
              Email notifications
            </Checkbox>
            <Checkbox defaultChecked>Product updates</Checkbox>
            <Checkbox>Marketing</Checkbox>
          </div>
          <div className="flex flex-col gap-03">
            <div className="cds-label-01 text-text-secondary uppercase">Radio · theme</div>
            {['white', 'gray-10', 'gray-100'].map((v) => (
              <Radio
                key={v}
                name="theme"
                checked={radio === v}
                onChange={() => setRadio(v)}
              >
                {v}
              </Radio>
            ))}
          </div>
          <div className="flex flex-col gap-03">
            <div className="cds-label-01 text-text-secondary uppercase">Toggle</div>
            <Toggle checked={toggle} onChange={(e) => setToggle(e.target.checked)}>
              {toggle ? 'Enabled' : 'Disabled'}
            </Toggle>
          </div>
        </div>
      </Section>

      {/* Tags */}
      <Section
        id="tags"
        title="Tags"
        subtitle="Rounded chips for status and metadata; dismissible filter tags for active filters."
      >
        <div className="flex flex-wrap gap-02 items-center">
          <Tag color="gray">Gray</Tag>
          <Tag color="blue">Blue</Tag>
          <Tag color="green" icon="checkmark-filled">
            Active
          </Tag>
          <Tag color="red">Error</Tag>
          <Tag color="purple">Purple</Tag>
          <Tag color="teal">Teal</Tag>
        </div>
        <div className="flex flex-wrap gap-02 items-center mt-04">
          {tags.map((t) => (
            <Tag key={t} onDismiss={() => setTags((prev) => prev.filter((x) => x !== t))}>
              {t}
            </Tag>
          ))}
          {tags.length === 0 && (
            <span className="cds-body-01 text-text-secondary">All filters cleared.</span>
          )}
        </div>
      </Section>

      {/* Notifications */}
      <Section
        id="notifications"
        title="Notifications"
        subtitle="Inline notifications and bottom-right toasts. Status is communicated with filled icons + support colors — never emoji."
      >
        <div className="flex flex-col gap-03 max-w-[640px]">
          <Notification kind="error" title="Upload failed.">
            The file exceeds the 25 MB limit.
          </Notification>
          <Notification kind="success" title="Changes saved.">
            Your workspace settings were updated.
          </Notification>
          <Notification kind="warning" title="Approaching limit.">
            You have used 90% of your seats.
          </Notification>
          <Notification kind="info" title="New version available.">
            Refresh to get the latest.
          </Notification>
        </div>
        <div className="flex gap-03 mt-04">
          <Button
            kind="tertiary"
            size="field"
            onClick={() =>
              toast({ kind: 'success', title: 'Saved.', message: 'A toast appears bottom-right.' })
            }
          >
            Show success toast
          </Button>
          <Button
            kind="tertiary"
            size="field"
            onClick={() =>
              toast({ kind: 'error', title: 'Removed.', message: 'Access was revoked.' })
            }
          >
            Show error toast
          </Button>
        </div>
      </Section>

      {/* Tiles + Menu */}
      <Section
        id="tiles"
        title="Tiles & menus"
        subtitle="Tiles are flat rectangles — square corners, no resting shadow. Menus are floating layers, the only place shadows appear."
      >
        <div className="grid md:grid-cols-3 gap-04 items-start">
          <Tile clickable>
            <div className="cds-heading-compact-01 text-text-primary">Clickable tile</div>
            <div className="cds-body-01 text-text-secondary mt-02">Hover steps the background.</div>
          </Tile>
          <Tile selectable selected>
            <div className="cds-heading-compact-01 text-text-primary">Selected tile</div>
            <div className="cds-body-01 text-text-secondary mt-02">2px inset blue ring.</div>
          </Tile>
          <Menu
            items={[
              { label: 'Edit', icon: 'edit' },
              { label: 'Duplicate', icon: 'copy' },
              'separator',
              { label: 'Delete', icon: 'trash', danger: true },
            ]}
          />
        </div>
      </Section>

      {/* Icons */}
      <Section
        id="icons"
        title="Iconography"
        subtitle={`The IBM Carbon icon set — ${ICON_NAMES.length} monoline glyphs on a 32-grid, recolored via currentColor.`}
      >
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-px bg-border-subtle-01 border border-border-subtle-01">
          {ICON_NAMES.map((name) => (
            <div
              key={name}
              className="bg-layer-02 flex flex-col items-center gap-02 py-04 px-02 text-icon-primary"
            >
              <Icon name={name} size={20} />
              <span className="cds-code-01 text-text-secondary text-center truncate w-full">
                {name}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
