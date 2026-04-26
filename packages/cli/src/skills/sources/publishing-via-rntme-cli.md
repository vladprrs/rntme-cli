---
name: publishing-via-rntme-cli
description: Use after composing-blueprint when the project blueprint dry-run passes and you want to upload a project version.
---

## What you're building
No artifact. A successful `rntme project publish` call that uploads the project blueprint, returns a project version seq, and echoes a bundle digest matching the local dry-run.

## Checklist
1. Final dry-run from blueprint root: `rntme project publish --dry-run --org <org> --project <project> .`.
2. Confirm credentials: `rntme whoami` prints org + scopes and the token has `version:publish`.
3. `rntme project publish --org <org> --project <project> .` expects a created project version seq.
4. Re-run the same publish. It should be an idempotent replay with the same seq and digest.
5. `rntme project version show --org <org> --project <project> <seq>` confirms the digest and summary.
6. `rntme project version list --org <org> --project <project>` shows the uploaded seq first.

## Red flags
| Thought | Reality |
|---|---|
| "I'll skip dry-run — publish will catch it" | Server validation is authoritative, but dry-run is faster feedback and catches local packaging issues. |
| "422 means retry" | No — 422 means fix the bundle. 409 is the retry case. |
| "I'll force-overwrite with --force" | There is no force mode. `(project_id, bundleDigest)` is idempotent by design; re-run is safe. |
| "I'll tag production here" | Track 1 publishes immutable project versions only. Promotion/tagging is not part of this flow. |

## Worked example

```bash
$ rntme project publish --dry-run --org acme --project product-catalog .
✓ project bundle valid (services=app, digest=c3a1...d9e2)

$ rntme whoami
{ org: acme, account: you@acme.com, role: admin }

$ rntme project publish --org acme --project product-catalog .
✓ published project version seq=3 (bundleDigest=c3a1...d9e2)

$ rntme project publish --org acme --project product-catalog .
✓ idempotent replay seq=3 (same bundleDigest)

$ rntme project version show --org acme --project product-catalog 3
seq=3, createdAt=..., digest=c3a1...d9e2
```

## Exit-code table

| Exit | Meaning | Action |
|---|---|---|
| 0 | success | — |
| 2 | config/credentials problem | check flags/config, `rntme login --token -` |
| 3 | auth failed | refresh PAT |
| 4 | forbidden/scope | widen token scopes |
| 5 | not found / archived | check org/project slugs |
| 6 | validation failed (local or server) | fix the blueprint per nested error codes |
| 7 | concurrent publish | re-run; idempotency-key protects |
| 8 | rate limited | wait and retry |
| 9 | network error | retry |
| 10 | 5xx from platform | retry |

## Anti-patterns
- Committing credentials into the repo (use `rntme login`).
- Publishing from a nested service directory instead of the project blueprint root.
- Treating version seq as a service-level version; seq is scoped to the project.

## Validation & self-review
Exit when: `rntme project version show <seq>` returns the just-published project version with the expected digest.

## Next step
Terminal. If iterating: return to the relevant designing-* or composing-blueprint skill, edit, dry-run, re-publish.
