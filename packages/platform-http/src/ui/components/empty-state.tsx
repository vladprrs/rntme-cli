export function EmptyState(props: { title: string; hint?: string; code?: string }) {
  return (
    <div class="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center">
      <p class="text-sm font-medium text-gray-900">{props.title}</p>
      {props.hint && <p class="mt-1 text-sm text-gray-600">{props.hint}</p>}
      {props.code && (
        <pre class="mx-auto mt-3 inline-block rounded bg-gray-100 px-3 py-1 text-xs text-gray-800">
          {props.code}
        </pre>
      )}
    </div>
  );
}
