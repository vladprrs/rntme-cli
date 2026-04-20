---
name: publishing-via-rntme-cli
description: Use after composing-manifest when the bundle passes rntme validate and you want to publish. Walks validate → publish → tag → verify, with error-code mapping.
---

## What you're building
No artifact. A successful `rntme publish` call that returns a version seq, sets requested tags, and echoes a bundleDigest matching the local digest.

## Checklist
1. Final `rntme validate` from service root — exit 0, no warnings.
2. Confirm credentials: `rntme whoami` — prints org + scopes; matches rntme.json's org.
3. `rntme publish --tag <name> --message "<what changed>"` — expects 201 with seq.
4. Re-run the same publish — expects 200 "idempotent replay", same seq.
5. `rntme version show <seq>` — confirm bundleDigest matches local.
6. If additional tags: `rntme tag set <name> <seq>` (atomic, server-side).

## Red flags
| Thought | Reality |
|---|---|
| "I'll skip validate — publish will catch it" | Server validate IS authoritative but local validate is faster feedback. |
| "422 means retry" | No — 422 means fix the bundle. 409 is the retry case. |
| "I'll force-overwrite with --force" | There is no --force for publish. `(service_id, bundleDigest)` is idempotent by design; re-run is always safe. |
| "I'll delete a tag to move it" | Use `rntme tag set` — atomic. Delete-then-set is racy. |

## Worked example

```bash
$ rntme validate
✓ bundle valid (7 artifacts, bundleDigest=c3a1...d9e2)

$ rntme whoami
{ org: acme, account: you@acme.com, role: admin }

$ rntme publish --tag preview --message "add Comment aggregate"
✓ published seq=3 (bundleDigest=c3a1...d9e2) tag=preview

$ rntme publish --tag preview
✓ idempotent replay seq=3 (same bundleDigest)

$ rntme version show 3
seq=3, publishedAt=..., tags=[preview], digest=c3a1...d9e2
```

## Exit-code table

| Exit | Meaning | Action |
|---|---|---|
| 0 | success | — |
| 2 | config/credentials problem | check rntme.json, `rntme login --token -` |
| 3 | auth failed | refresh PAT |
| 4 | forbidden/scope | widen token scopes |
| 5 | not found / archived | check project/service slugs |
| 6 | validation failed (local or server) | fix the artifact per nested error codes |
| 7 | concurrent publish | re-run; idempotency-key protects |
| 8 | rate limited | wait and retry |
| 9 | network error | retry |
| 10 | 5xx from platform | retry |

## Anti-patterns
- Committing credentials into the repo (use `rntme login`).
- Publishing without a `--message` for non-trivial changes (audit log needs it).
- Using `--previous-version-seq` without reading its meaning (it's a race-guard, not a rollback).

## Validation & self-review
Exit when: `rntme version show <seq>` returns the just-published version with the expected tags.

## Next step
Terminal. If iterating: return to the relevant designing-* skill, edit, re-validate, re-publish.
