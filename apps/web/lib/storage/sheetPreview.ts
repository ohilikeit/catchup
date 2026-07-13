import 'server-only';
import ExcelJS from 'exceljs';

// xlsx 미리보기 파서 — 스캐폴드에 든 엑셀(문제 데이터·정답키 등)을 관리자 검수 화면에서 표로 보여준다.
// 학생 경로와 무관한 서버 전용 검수용. 상한(행·열)으로 대형 시트/압축폭탄을 방어(대원칙 ⑤).
// xlsxRoster.ts 와 같은 exceljs 로드 패턴. 여기선 첫 시트만이 아니라 전 시트를 얕게 훑는다.

const MAX_ROWS = 200; // 시트당 표시 행 상한
const MAX_COLS = 40; // 행당 표시 열 상한

export interface SheetData {
  name: string;
  rows: string[][];
  /** 시트의 실제 행 수(상한 초과 판단용). */
  totalRows: number;
  truncated: boolean;
}

/** exceljs CellValue → 표시 문자열. 수식·리치텍스트·하이퍼링크·날짜를 안전하게 평탄화. */
function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? '').join('');
    if ('result' in o && o.result != null) return String(o.result); // 수식 → 계산값
    if ('text' in o && o.text != null) return String(o.text); // 하이퍼링크
    if ('error' in o && o.error != null) return String(o.error);
    return '';
  }
  return String(v);
}

/** xlsx 버퍼 → 시트별 rows. exceljs가 못 읽으면 던진다(호출부가 binary로 강등). */
export async function parseSheets(buffer: Buffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  return wb.worksheets.map((ws) => {
    const rows: string[][] = [];
    let maxCol = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= MAX_ROWS) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > MAX_COLS) return;
        cells[colNumber - 1] = cellText(cell.value);
      });
      for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
      maxCol = Math.max(maxCol, cells.length);
      rows.push(cells);
    });
    // 행마다 열 수를 맞춰 사각형으로(테이블 렌더가 rowspan 없이 그리도록).
    for (const r of rows) while (r.length < maxCol) r.push('');
    return { name: ws.name, rows, totalRows: ws.rowCount, truncated: ws.rowCount > MAX_ROWS };
  });
}
