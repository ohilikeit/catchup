'use client';
import { useMemo, useState } from 'react';
import NextLink from 'next/link';
import { Icon } from '@app/ui';

// 스캐폴드 파일트리(admin 검수). 서버가 넘긴 flat 목록을 계층 트리로 세우고 폴더 접기를 지원한다.
// 파일 선택은 여전히 쿼리(?file=)로 서버 미리보기를 태운다(page.tsx가 렌더) — 트리 UI만 클라이언트.

interface Entry {
  path: string;
  size: number;
  isDir: boolean;
}
interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: TreeNode[];
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
  for (const n of nodes) if (n.isDir) sortNodes(n.children);
  return nodes;
}

function buildTree(entries: Entry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, size: 0, children: [] };
  const dirs = new Map<string, TreeNode>([['', root]]);

  function ensureDir(dirPath: string): TreeNode {
    const existing = dirs.get(dirPath);
    if (existing) return existing;
    const parts = dirPath.split('/');
    const parent = ensureDir(parts.slice(0, -1).join('/'));
    const node: TreeNode = { name: parts[parts.length - 1]!, path: dirPath, isDir: true, size: 0, children: [] };
    parent.children.push(node);
    dirs.set(dirPath, node);
    return node;
  }

  for (const e of entries) {
    if (e.isDir) {
      ensureDir(e.path);
      continue;
    }
    const parts = e.path.split('/');
    const parent = ensureDir(parts.slice(0, -1).join('/'));
    parent.children.push({ name: parts[parts.length - 1]!, path: e.path, isDir: false, size: e.size, children: [] });
  }
  return sortNodes(root.children);
}

interface ScaffoldTreeProps {
  entries: Entry[];
  /** `/admin/problems/<code>` — 파일 링크 베이스. */
  base: string;
  version: number;
  /** 현재 선택된 파일 경로(하이라이트). */
  activePath: string | null;
}

export function ScaffoldTree({ entries, base, version, activePath }: ScaffoldTreeProps) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  // 선택된 파일의 조상 폴더는 펼쳐 보이게 — 그 외는 기본 펼침, 사용자가 접는다.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number) {
    const pad = { paddingLeft: `${8 + depth * 14}px` };
    if (node.isDir) {
      const isCollapsed = collapsed.has(node.path);
      return (
        <li key={node.path}>
          <button
            type="button"
            onClick={() => toggle(node.path)}
            style={pad}
            className="w-full flex items-center gap-02 pr-05 py-02 cds-code-01 text-text-secondary hover:bg-layer-hover-01 text-left"
          >
            <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={16} />
            <Icon name="folder" size={16} />
            <span className="truncate">{node.name}</span>
          </button>
          {!isCollapsed && node.children.length > 0 && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
        </li>
      );
    }
    const active = node.path === activePath;
    return (
      <li key={node.path}>
        <NextLink
          href={`${base}?v=${version}&file=${encodeURIComponent(node.path)}`}
          scroll={false}
          style={pad}
          className={`flex items-center justify-between gap-03 pr-05 py-02 cds-code-01 hover:bg-layer-hover-01 ${
            active ? 'bg-layer-hover-01 text-text-primary' : 'text-link-primary'
          }`}
        >
          <span className="flex items-center gap-02 min-w-0">
            <Icon name="document" size={16} />
            <span className="truncate">{node.name}</span>
          </span>
          <span className="text-text-secondary shrink-0 cds-helper-01">{fmtBytes(node.size)}</span>
        </NextLink>
      </li>
    );
  }

  return <ul>{tree.map((n) => renderNode(n, 0))}</ul>;
}
