export function canonicalize(def: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (def === null || typeof def !== 'object') return JSON.stringify(def);
  if (seen.has(def as object)) return '"<cycle>"';
  seen.add(def as object);
  const keys = Object.keys(def as object).filter((k) => k !== 'description').sort();
  const parts = keys.map((k) => {
    const v = (def as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && '_def' in (v as object)) return `${JSON.stringify(k)}:${canonicalize((v as { _def: unknown })._def, seen)}`;
    if (typeof v === 'function') return `${JSON.stringify(k)}:"<fn>"`;
    if (Array.isArray(v)) return `${JSON.stringify(k)}:[${v.map((x) => (x && typeof x === 'object' && '_def' in (x as object) ? canonicalize((x as { _def: unknown })._def, seen) : canonicalize(x, seen))).join(',')}]`;
    if (v && typeof v === 'object') return `${JSON.stringify(k)}:${canonicalize(v, seen)}`;
    return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  });
  return `{${parts.join(',')}}`;
}
