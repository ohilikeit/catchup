import 'server-only';
import { query, queryOne } from '../pool';

// organizations repository — SQL을 여기에만 가두는 패턴의 레퍼런스 구현.
// 근거: reference/02 §14(파라미터 바인딩·행 매퍼·동적 UPDATE·RETURNING), reference/01 §5(SQL은 repository에만).
// 다른 엔티티 repository는 해당 기능을 만들 때 이 형태를 그대로 따른다.

/** 앱이 쓰는 도메인 모델(camelCase). DB의 snake_case와 분리된다. */
export interface Organization {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** DB 행(snake_case) — repository 밖으로 새지 않는다. */
interface OrganizationRow {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** 행 매퍼: snake_case → camelCase 변환을 이 한 곳에 가둔다. */
function mapRow(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findById(id: string): Promise<Organization | null> {
  const row = await queryOne<OrganizationRow>(
    'SELECT * FROM auth.organizations WHERE id = $1',
    [id],
  );
  return row ? mapRow(row) : null;
}

/** 활성 조직만(soft delete 존중, reference/02 §11). */
export async function listActive(): Promise<Organization[]> {
  const rows = await query<OrganizationRow>(
    'SELECT * FROM auth.organizations WHERE is_active ORDER BY created_at DESC',
  );
  return rows.map(mapRow);
}

export async function create(input: { name: string; code?: string | null }): Promise<Organization> {
  // RETURNING *: INSERT 후 추가 SELECT 없이 트리거가 채운 값까지 한 번에 수신(reference/02 §14).
  const row = await queryOne<OrganizationRow>(
    'INSERT INTO auth.organizations (name, code) VALUES ($1, $2) RETURNING *',
    [input.name, input.code ?? null],
  );
  return mapRow(row!);
}

/**
 * 동적 UPDATE 빌더(PATCH 정석): undefined가 아닌 필드만 SET.
 * "미전송"(키 없음)과 "null 설정"(명시적 null)을 구분한다(reference/02 §14).
 */
export async function update(
  id: string,
  patch: { name?: string; code?: string | null; isActive?: boolean },
): Promise<Organization | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (patch.name !== undefined) { sets.push(`name = $${i++}`); params.push(patch.name); }
  if (patch.code !== undefined) { sets.push(`code = $${i++}`); params.push(patch.code); }
  if (patch.isActive !== undefined) { sets.push(`is_active = $${i++}`); params.push(patch.isActive); }

  if (sets.length === 0) return findById(id); // 변경할 필드 없음

  params.push(id);
  const row = await queryOne<OrganizationRow>(
    `UPDATE auth.organizations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    params,
  );
  return row ? mapRow(row) : null;
}

/** soft delete: 물리 삭제 대신 비활성화(시험 기록 보존, reference/02 §11). */
export async function deactivate(id: string): Promise<Organization | null> {
  return update(id, { isActive: false });
}
