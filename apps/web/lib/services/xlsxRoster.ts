import 'server-only';
import ExcelJS from 'exceljs';
import type { RosterRow } from './batchService';

// 로스터 .xlsx 파서. 학교가 보낸 엑셀(이름·학번·이메일)을 RosterRow[]로 정규화.
// docs/1 §4(로스터 import). ⭐ 학번은 텍스트로 강제(leading zero·과학표기 깨짐 방지).
//
// 헤더는 학교마다 다르므로 한/영 별칭으로 매핑. 첫 행을 헤더로 사용.

const HEADER_ALIASES: Record<keyof RosterRow, string[]> = {
  name: ['이름', '성명', '학생명', '학생이름', 'name', 'student'],
  email: ['이메일', '메일', '이메일주소', 'email', 'mail', 'e-mail'],
  externalId: ['학번', '학번호', '고유번호', '번호', 'id', 'studentid', 'student_id', 'externalid', 'external_id'],
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]/g, '');
}

/** 셀 값을 문자열로(숫자 학번도 텍스트 보존). */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    // 하이퍼링크/리치텍스트/수식 결과 등
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v && v.result != null) return String(v.result).trim();
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    return String(v).trim();
  }
  return String(v).trim();
}

export interface ParseResult {
  rows: RosterRow[];
  errors: string[];
}

/** 업로드된 .xlsx 버퍼 → RosterRow[]. 헤더 인식 실패/빈 시트는 errors로. */
export async function parseRosterXlsx(buffer: ArrayBuffer): Promise<ParseResult> {
  const errors: string[] = [];
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { rows: [], errors: ['엑셀 파일을 읽을 수 없습니다(.xlsx 형식인지 확인하세요).'] };
  }

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) return { rows: [], errors: ['시트가 비어 있거나 데이터 행이 없습니다.'] };

  // 1행 = 헤더 → 컬럼 인덱스 매핑
  const headerRow = ws.getRow(1);
  const colOf: Partial<Record<keyof RosterRow, number>> = {};
  headerRow.eachCell((cell, col) => {
    const h = norm(cellText(cell));
    (Object.keys(HEADER_ALIASES) as (keyof RosterRow)[]).forEach((key) => {
      if (colOf[key] === undefined && HEADER_ALIASES[key].some((a) => norm(a) === h)) {
        colOf[key] = col;
      }
    });
  });

  if (colOf.name === undefined || colOf.email === undefined) {
    return {
      rows: [],
      errors: [
        `헤더에서 '이름'과 '이메일' 컬럼을 찾지 못했습니다. 1행에 이름/이메일(학번 선택) 헤더가 필요합니다.`,
      ],
    };
  }

  const rows: RosterRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row.getCell(colOf.name));
    const email = cellText(row.getCell(colOf.email));
    const externalId = colOf.externalId ? cellText(row.getCell(colOf.externalId)) : '';
    if (!name && !email && !externalId) continue; // 완전 빈 행 skip
    if (!name || !email) {
      errors.push(`${r}행: 이름/이메일 누락 — 건너뜀`);
      continue;
    }
    rows.push({ name, email, externalId: externalId || null });
  }

  return { rows, errors };
}
