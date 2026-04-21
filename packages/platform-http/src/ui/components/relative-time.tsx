const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
  { unit: 'second', ms: 1000 },
];

function relative(value: Date, now: Date = new Date()): string {
  const diff = value.getTime() - now.getTime();
  const abs = Math.abs(diff);
  for (const u of UNITS) {
    if (abs >= u.ms) {
      return RTF.format(Math.round(diff / u.ms), u.unit);
    }
  }
  return 'just now';
}

export function RelativeTime(props: { value: Date | string | null | undefined }) {
  if (!props.value) return <span class="text-gray-400">—</span>;
  const d = typeof props.value === 'string' ? new Date(props.value) : props.value;
  const iso = d.toISOString();
  return (
    <time datetime={iso} title={iso} class="text-gray-600">
      {relative(d)}
    </time>
  );
}
