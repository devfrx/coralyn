/**
 * Logica pura del DataTable (sort, paginazione, label conteggio). Volutamente NON un
 * composable: un solo consumatore oggi (il componente). Estrarre solo al secondo uso reale.
 */
export type SortDir = 'asc' | 'desc';

export type DataTableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  numeric?: boolean;
  sortable?: boolean;
  sortValue?: (row: Record<string, unknown>) => string | number;
  wrap?: 'wrap' | 'nowrap' | 'truncate';
  maxWidth?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
};

export function sortRows<T>(rows: readonly T[], accessor: (row: T) => unknown, dir: SortDir): T[] {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((x, y) => {
    const a = accessor(x);
    const b = accessor(y);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const c =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'it', { numeric: true, sensitivity: 'base' });
    return sign * c;
  });
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function countLabel(total: number, window?: { page: number; pageSize: number }): string {
  if (!window || total === 0) return `${total} ${total === 1 ? 'riga' : 'righe'}`;
  const start = (window.page - 1) * window.pageSize + 1;
  const end = Math.min(window.page * window.pageSize, total);
  return `${start}–${end} di ${total}`;
}
