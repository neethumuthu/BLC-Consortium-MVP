## Why

**Retroactive change — created after the code was already written and
committed (`5177ce7`), per a Ring 2 review finding on PR #18**: shipping a
new UI capability with no `openspec/changes/` folder backing it violates
`context/rules/general.md` rule 5 ("No code without a change-id") /
`AGENTS.md` hard rule #5. Creating this now, honestly labeled as
after-the-fact, rather than pretending the process was followed correctly
the first time.

The actual motivation, unchanged from when the code was written: while
doing a Stage F human-review pass on the `institution-directory` spec,
found that `GET /institutions/:id` had zero UI path at all — the only
existing page was the list. That capability's requirement ("Look up a
single institution by MSP ID") was already spec'd; this change only
exposes it through the UI, it doesn't change what's required.

## What Changes

- New page: `frontend/src/app/(dashboard)/institutions/[id]/page.tsx`.
- List page rows link to it.

No requirement text changes — `openspec/specs/institution-directory/spec.md`'s
"Look up a single institution" requirement already covers this behavior
regardless of surface (API or UI); this change only adds the UI surface.
`skip_specs: true` set accordingly.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — see above)

## Impact

- `frontend/src/app/(dashboard)/institutions/[id]/page.tsx` (new)
- `frontend/src/app/(dashboard)/institutions/page.tsx` (rows linked)
