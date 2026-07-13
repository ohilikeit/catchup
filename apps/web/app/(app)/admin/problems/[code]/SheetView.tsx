import { Icon } from '@app/ui';

// xlsx 미리보기(admin 검수). 시트별로 행번호 + 표를 그린다. 첫 행은 헤더로 강조.
// 넓은 시트는 가로 스크롤(whitespace-nowrap). 상한 초과 시 "앞 N행" 안내.

interface Sheet {
  name: string;
  rows: string[][];
  totalRows: number;
  truncated: boolean;
}

export function SheetView({ sheets }: { sheets: Sheet[] }) {
  if (sheets.length === 0) {
    return <div className="px-06 py-08 cds-body-compact-01 text-text-secondary">읽을 수 있는 시트가 없습니다.</div>;
  }
  return (
    <div className="flex flex-col gap-05 p-05">
      {sheets.map((sheet) => (
        <div key={sheet.name}>
          <div className="flex items-center gap-02 mb-02 cds-label-01 text-text-secondary">
            <Icon name="data" size={16} />
            <span className="text-text-primary">{sheet.name}</span>
            <span className="cds-helper-01">
              · {sheet.totalRows}행{sheet.truncated ? ` (앞 ${sheet.rows.length}행 표시)` : ''}
            </span>
          </div>
          {sheet.rows.length === 0 ? (
            <div className="border border-border-subtle-01 px-04 py-04 cds-helper-01 text-text-secondary">빈 시트</div>
          ) : (
            <div className="overflow-x-auto border border-border-subtle-01">
              <table className="border-collapse cds-code-01 w-max min-w-full">
                <tbody>
                  {sheet.rows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? '' : 'hover:bg-layer-hover-01'}>
                      <td className="border border-border-subtle-01 bg-layer-01 px-02 py-01 text-right text-text-secondary select-none">
                        {ri + 1}
                      </td>
                      {row.map((cell, ci) =>
                        ri === 0 ? (
                          <th
                            key={ci}
                            className="border border-border-subtle-01 bg-layer-01 px-03 py-02 text-left text-text-primary whitespace-nowrap"
                          >
                            {cell}
                          </th>
                        ) : (
                          <td
                            key={ci}
                            className="border border-border-subtle-01 px-03 py-02 text-text-primary whitespace-nowrap"
                          >
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
