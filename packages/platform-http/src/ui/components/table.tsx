import type { JSX } from 'hono/jsx/jsx-runtime';

export type DataRow = {
  key: string;
  cells: readonly (string | number | JSX.Element)[];
};

export function DataTable(props: { headers: readonly string[]; rows: readonly DataRow[] }) {
  return (
    <div class="overflow-hidden rounded-md border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {props.headers.map((h) => (
              <th scope="col" class="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          {props.rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((cell) => (
                <td class="px-3 py-2 align-top">{cell as JSX.Element}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
