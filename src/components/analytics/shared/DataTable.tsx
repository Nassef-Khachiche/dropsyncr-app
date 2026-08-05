import { type ReactNode } from 'react';

export interface DataTableColumn {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  /** Verbergt de kolom op smalle schermen. */
  hideOnMobile?: boolean;
  /** Vaste breedte, bijvoorbeeld '10rem' of '15%'. Zonder waarde verdeelt de kolom mee. */
  width?: string;
}

export function DataTable({
  columns,
  rows,
  emptyMessage,
}: {
  columns: DataTableColumn[];
  rows: Record<string, ReactNode>[];
  emptyMessage: string;
}) {
  const alignClass = (align?: string) =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="analytics-table min-w-[420px]">
        <thead>
          <tr className="border-b border-slate-100">
            {columns.map((column) => (
              <th
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
                className={`${alignClass(column.align)} ${column.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400 text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`${alignClass(column.align)} ${column.hideOnMobile ? 'hidden sm:table-cell' : ''}`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}