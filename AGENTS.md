# AGENTS.md

<!-- Entry point for AI coding agents (https://agents.md). Keep under 150 lines.
     Orient and link — do not duplicate content that lives in context/. -->

## Project

BLC-31: a Hyperledger Fabric consortium (BLCFounder + member institutions) that lets
active member institutions issue and verify educational certificates on a shared
ledger, governed by a propose/vote membership process.

## Commands

```bash
cd backend && npm install && npm run build && npm run test && npm run lint  # NestJS, one instance per institution (.env.<org>)
cd frontend && npm install && npm run build && npm run lint                 # Next.js
cd network && ./scripts/network.sh up                                       # bring up orderers/peers/CouchDB/channel
cd network && ./scripts/chaincode.sh deploy <institution-cc|certificate-cc>  # deploy/upgrade a chaincode
```

Note: `backend`'s `npm run test` now runs one real spec file (`ApiKeyGuard`'s
`READ_ONLY_API_KEY` behavior, added 2026-08-12) — everything else in
`backend/src` still has zero coverage. `backend`'s `npm run lint` still
finds no `eslint` at all (not installed, no config) — see
`context/codebase/TESTING.md` before trusting either result.

## Before you work

Read the context relevant to your task — do not guess:

| Need | Read |
|---|---|
| What the product does, domain terms | `context/product/PRODUCT.md`, `context/product/DOMAIN.md` (created 2026-08-12, `confidence: low`, pending real PM/PO review) |
| Architecture, module boundaries | `context/codebase/ARCHITECTURE.md`, `STRUCTURE.md` |
| How we write code here | `context/codebase/CONVENTIONS.md`, `context/rules/general.md` |
| How to test | `context/codebase/TESTING.md` |
| Past decisions and why | `context/decisions/` |
| Known traps and fragile areas | `context/codebase/CONCERNS.md` |
| Doc-vs-code conflicts already found | `context/CONFLICTS.md`, `context/ARCHIVE-INDEX.md` |
| Current behavior of a capability | `openspec/specs/` |
| Exact commands / real incident history | `docs/BUILD_LOG.md`, `docs/ERROR_LOG.md` |

## Workflow

- Non-trivial work goes through an OpenSpec change (`openspec/changes/<id>/`). Implement from `tasks.md`, one atomic commit per task.
- If a requirement is ambiguous or needs a product decision, add it to `## Open questions` in the change's `proposal.md` and stop that thread — never invent a product answer.
- After completing work, use the `capture-learning` skill if something surprising happened.

## Hard rules

1. Never commit secrets, keys, or `.env*` files.
2. Never `rm -rf` or otherwise delete inside `crypto/ca-servers/<org>/` once that org's MSP is channel-committed — there is no safe partial/per-org fix past that point. The only safe recovery is `network.sh down --wipe` (a full network wipe-and-redo).
3. `Institution.Status == "active"` (institution-cc) is the single point of authorization gating `ProposeNewMember`/`CastVote`/`IssueCertificate` across both chaincodes. Treat any change that can flip it, or any credential that can reach vote quorum, as security-critical — never give an automated agent a login capable of completing a real vote/proposal unless that is explicitly the task.
4. If a task hands you specific login credentials, use exactly those — never substitute a different, more-privileged account's credentials found elsewhere in the repo, even if easier.
5. Do not modify `context/` or `openspec/specs/` silently — context updates go through PRs (`context-gardener`).
6. Do not disable or skip failing tests to make CI pass; fix or escalate.
7. Follow `context/rules/general.md` — it is loaded for a reason.
8. When code contradicts a context file (or a context file contradicts another), flag it — do not pick one silently.
