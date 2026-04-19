export function renderTable(
  headers: string[],
  rows: string[][],
  opts?: { maxWidths?: number[] | undefined },
): string {
  const widths: number[] = headers.map((h, i) => {
    const cellMax = Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length));
    const cap = opts?.maxWidths?.[i];
    return cap ? Math.min(cellMax, cap) : cellMax;
  });

  const formatRow = (row: string[]) =>
    row.map((c, i) => truncate(c ?? '', widths[i] ?? 0).padEnd(widths[i] ?? 0)).join('  ');

  return [formatRow(headers), ...rows.map(formatRow)].join('\n');
}

function truncate(s: string, width: number): string {
  if (s.length <= width) return s;
  if (width <= 1) return s.slice(0, width);
  return s.slice(0, width - 1) + '…';
}
