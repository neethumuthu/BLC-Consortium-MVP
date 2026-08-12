---
name: spec-onboard-replacement
description: Bulk-scan every HTTP-reachable backend route against openspec/specs/ and generate first-draft spec coverage for whatever is missing, classifying each gap as a new capability (direct stub) vs. a missing requirement in an already-formalized spec (real propose->apply->archive change). Complementary to OpenSpec's own /opsx:onboard, not a substitute for it - onboard is a single-task guided tutorial (~15-20 min, teaches the workflow rhythm on one small task); this is an unattended, exhaustive coverage sweep across the whole codebase. Invoked deliberately, never wired into CI.
---

# Spec-onboard replacement

**Correction, 2026-08-12, same day this was first written:** an earlier pass
through this project incorrectly concluded `/opsx:onboard` was entirely
absent from `@fission-ai/openspec`. That was wrong, and worth stating
plainly rather than quietly fixing: the test that produced it
(`openspec config profile workflows`/`expanded`, guessing named presets)
probed the wrong mechanism. The real path — confirmed by reproducing a
maintainer's fix for issue #1001 on `Fission-AI/OpenSpec` — is:

```bash
openspec config set profile custom
openspec config set workflows '["new","continue","onboard","propose","explore","apply","update","sync","archive"]'
openspec update
```

This generates `.claude/commands/opsx/onboard.md` and
`.claude/skills/openspec-onboard/SKILL.md` for real (confirmed on this
project, 2026-08-12). There was never an upstream gap to file an issue
about — a full read of the resulting `openspec-onboard` skill confirms it
though: **it's a guided tutorial for one small task, not a bulk scanner.**
Its own "Task Selection" phase looks for TODO/FIXME comments, missing
tests, and similar single-file quick wins — it has no step that
cross-references every route in a codebase against every existing spec.
That's a different job, which is what this skill actually does. The two
tools are complementary, not competing — `/opsx:onboard` for learning the
workflow on one task; this skill for an exhaustive coverage sweep.

## Step 1 — Scan every HTTP-reachable route

Find every controller and every route on it:

```bash
find backend/src -iname "*.controller.ts"
grep -n "@Controller\|@Get\|@Post\|@Patch\|@Put\|@Delete" backend/src/**/*.controller.ts
```

For each route, trace it to the actual chaincode function or service method it
calls — read the controller method body, not just the decorator. This is
"HTTP-reachable" in the strict sense used throughout this project: a route
exists and something calls it, not "this chaincode function looks like it
should have one."

## Step 2 — Determine what's correctly out of scope

Cross-check every exported chaincode function (both `certificate-cc` and
`institution-cc`) against the route list from Step 1. Any function with NO
controller method calling it is out of scope — same precedent already
established for `RegisterInstitution` (bootstrap-only, invoked via
`org-add.sh`, never through the REST API) and `InitLedger` (chaincode
lifecycle init, never called after deployment). State the reason for each
exclusion explicitly; do not silently drop them from the report.

```bash
grep -rn "^func (s \*SmartContract)" chaincode/institution-cc/*.go chaincode/certificate-cc/*.go | grep -v _test
```

## Step 3 — Cross-reference against existing specs

Read every file under `openspec/specs/*/spec.md` in full — not a keyword
grep. For each HTTP-reachable route from Step 1, determine one of three
states by actually reading each spec's Requirements section, not just
matching on capability name or route path:

- **A. Already covered** — an existing requirement's scenarios describe this
  route's actual behavior (success case + realistic failure modes).
- **B. No spec exists for this capability area at all** — nothing in
  `openspec/specs/` addresses this domain.
- **C. A spec exists for this capability area, but doesn't cover this
  specific route** — the capability is already formalized (has gone through
  a real `propose → apply → archive` cycle at some point), it just has a gap.
  **This is not the same as B.** Getting this distinction right is the whole
  point of this skill — treating C like B (a fresh low-confidence stub)
  would be wrong, and treating B like C (forcing a real change through the
  full pipeline for a capability with zero prior spec) is needless overhead.

  The concrete test: does `openspec/specs/<capability>/spec.md` already
  exist and have at least one `### Requirement:` in the same domain as this
  route? If yes, it's C. If the capability directory doesn't exist at all,
  it's B.

## Step 4 — STOP. Report the scan before generating anything

Present a table: route → chaincode/service function → status (A/B/C/excluded)
→ reason. Do this every time this skill runs, unconditionally — never skip
straight to generation, even on a re-run where the previous scan already
established most of the routes. Wait for explicit confirmation before Step 5.

## Step 5 — Generate, per the Step 3 classification

**For B (no spec exists):** write a new stub directly at
`openspec/specs/<capability-path>/spec.md`, matching `certificate-lifecycle`
and `institution-directory`'s exact shape:
- Frontmatter: `last_verified`, `source: code-derived, unreviewed`,
  `confidence: low`, `owner: unassigned — needs a human review pass before
  this confidence bumps`.
- A `## Purpose` section stating plainly this is a code-derived stub from a
  bulk coverage sweep, not a reconstructed spec — it still needs the same
  human review pass a real `/opsx:onboard`-guided or `/opsx:propose`-driven
  spec would get.
- `## Requirements` grounded in the actual route/service/chaincode behavior —
  read the real code for each one, the same way `certificate-lifecycle` and
  `institution-directory` were built. Every requirement needs at least one
  `#### Scenario:`.
- Run `openspec validate <capability> --type spec --strict` before
  considering it done. A plain-prose "one-paragraph stub" (the literal
  wording OpenSpec's own docs use for this case) will fail validation — it
  requires real Requirements/Scenarios, confirmed directly against the
  current CLI. Write minimal-but-real ones, not prose.

**For C (spec exists, missing a requirement):** do NOT write into
`openspec/specs/` directly. Create a real OpenSpec change instead:

```bash
openspec new change "<kebab-case-name>"
```

- `proposal.md`: Why (the gap found), Modified Capabilities naming the exact
  existing capability path — never New Capabilities for this case.
- Delta spec at `openspec/changes/<name>/specs/<capability>/spec.md`, using
  `## ADDED Requirements` (or `## MODIFIED Requirements` if an existing
  requirement's behavior itself needs correcting, per that operation's own
  rules) — never a bare `## Purpose` section, that only applies to brand-new
  capabilities and gets ignored by archive for an existing one.
- `design.md`: skip if none of its own inclusion criteria apply (routine
  documentation-only additions usually don't need it) — but don't skip it
  reflexively; check.
- `tasks.md`: verification tasks (confirm each behavior against real code,
  live-verify against a running network if practical), then the sync+archive
  steps as the final two tasks.
- **Stop here.** Do not auto-apply or auto-archive. Flag it in the Step 6
  report as "proposed, needs propose→apply→archive to complete" and let a
  human or a separate deliberate action drive it through — these deltas can
  touch an already-shipped, already-trusted spec, and deserve the same
  individual scrutiny `governance-proposal-lookup` got, not silent batch
  application.

**Ambiguous cases (either state):** if the correct requirement content has
more than one reasonable interpretation — the same shape as the
password-change scope question earlier in this project (shared credential
vs. per-user accounts) — do not guess. Write an explicit `## Open Questions`
section (in the stub's Purpose area for B, or in the proposal's own section
for C) naming the specific alternatives, and list it separately in the Step
6 report. Move on to the next route; do not block the whole run on one
ambiguous case.

## Step 6 — Final summary report

- Routes that already had coverage (A) — listed, not just counted.
- Routes given a new stub spec (B) — file paths.
- Routes given a new proposed change (C) — change names, explicitly marked
  not yet applied/archived.
- Routes correctly excluded — with the specific reason for each.
- Ambiguous routes flagged with Open Questions — the full list, not folded
  into the B/C counts.

Never mark anything as "done" or "complete" in this report. Every generated
artifact — stub or change — is a first draft awaiting human review, the same
way `certificate-lifecycle`/`institution-directory` still are and
`governance-proposal-lookup` was before it went through the real pipeline.

## Working conventions

- One-shot, deliberately invoked. Never wire this into a GitHub Actions
  workflow or any automated trigger — a bulk sweep that writes spec files or
  opens changes needs a human deciding when to run it, same as any other
  spec-authoring action in this project.
- Re-running this skill later should re-scan everything, not just diff since
  last time — routes get added, specs get formalized (B becomes A, or a
  previously-generated C change gets archived and its capability moves from
  "has a gap" to "covered") between runs, and the classification in Step 3
  needs to reflect current reality, not a cached memory of an earlier scan.
