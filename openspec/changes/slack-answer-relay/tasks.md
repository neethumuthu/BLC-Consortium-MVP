## 1. Phase 0 — relay service, buildable and testable with zero Slack dependency

- [x] 1.1 Scaffold `slack-relay/` (`package.json`, `tsconfig.json`) matching `backend/`'s toolchain conventions (TypeScript, Jest+ts-jest, `node dist/main.js` production entrypoint)
- [x] 1.2 Implement Slack request-signature verification (HMAC-SHA256 `v0=`, timestamp replay-window check)
- [x] 1.3 Implement `url_verification` challenge handling
- [x] 1.4 Implement event filtering (no subtype, correct PM user, must be threaded)
- [x] 1.5 Implement parent-message link resolution with multi-issue disambiguation (explicit `#n` mention, then distinctive-word overlap, else refuse to guess)
- [x] 1.6 Implement two-layer dedup: in-memory `event_id`, disk-persisted per-thread relay record
- [x] 1.7 Implement the GitHub comment relay (`@claude <reply text>`) and the Slack ✅ reaction
- [x] 1.8 Wire it together in `main.ts` (Express app, raw-body capture for signature verification, `/slack/events` + `/healthz`)
- [x] 1.9 Unit tests against synthetic payloads: valid reply, tampered/expired/missing signature, wrong user, edited-message subtype, single-link parent, multi-link parent with and without a disambiguating hint, duplicate `event_id`, already-relayed thread, no-issue-link parent — all passing (43/43, see 1.12/1.13)
- [x] 1.10 Verify the production build compiles (`npm run build` → `dist/main.js`)
- [x] 1.11 ~~Fix `ai-pr-review.yml`'s missing PR-vs-tracking-issue exclusion guard~~ — pulled out and landed directly on `main` instead, not as part of this change (bundling it here broke Ring 2 review of this PR entirely — GitHub Actions won't run a modified workflow file against the PR that changes it)
- [x] 1.12 Ring 2 review findings, addressed:
  - **[should-fix]** Slack HTML-escapes `&`/`<`/`>` and wraps links/mentions in its own markup (`<url|label>`, `<@U123>`, `<!here>`); relaying that verbatim would corrupt the GitHub comment and contradicted this change's own "posts the same comment a human would type" claim. Added `slackText.ts` (`slackTextToPlainText`) and applied it to the reply text before both disambiguation matching and the GitHub comment body. 9 new tests (`slackText.spec.ts` + one `relayHandler.spec.ts` regression test): 35/35 passing.
  - **[nit]** `slack-relay/package.json`'s `lint` script referenced `eslint`, which isn't installed and has no config — same known gap `TESTING.md` already documents for `backend/`. Dropped the script rather than carrying a second copy of a known-broken command.
  - **[nit]** general.md rule 6 (one atomic commit per task) not followed for tasks 1.1–1.10 — acknowledged, not restructured; matches existing precedent in this repo (e.g. the institution-detail-page PR) for not rewriting already-pushed history purely for retroactive commit-granularity tidiness.
- [x] 1.13 Second Ring 2 review pass, findings addressed:
  - **[should-fix]** `linkResolver`'s issue-link matching wasn't scoped to `config.githubOwner`/`config.githubRepo` — a stray cross-repo link in a thread could become a disambiguation candidate and resolve to the wrong repo's issue number. `resolveIssueNumber`/`extractCandidates` now take `owner`/`repo` and only match links to that exact repo. 2 new regression tests in `linkResolver.spec.ts`.
  - **[should-fix]** No test coverage for `main.ts`'s HTTP-layer wiring (signature enforcement, `url_verification`, immediate-ack). Split the Express app into `app.ts` (`createApp`, testable directly) with `main.ts` now just wiring config + calling `app.listen`. Added `app.spec.ts` (supertest): 401 on missing/wrong signature, 200 + challenge echo on `url_verification`, immediate 200 ack + async relay handoff on `event_callback`, `/healthz`.
  - **[nit]** A failed GitHub post (network blip, API error) was silently swallowed (`console.error` only) with no Slack feedback — contradicted the change's own reliability goal. `relayHandler.ts` now catches it, posts an in-thread notice, returns a new `relay_failed` outcome, and deliberately does not record the thread as relayed so a retry can still succeed. 1 new regression test.
  - **[nit]** `design.md` said "raw reply text"; updated to reflect the `slackTextToPlainText()` cleanup added in 1.12.
  - 43/43 tests passing (7 suites); `tsc --noEmit` and `npm run build` both clean.
- [x] 1.14 Third Ring 2 review pass, finding addressed:
  - **[should-fix]** `dedupe.recordRelayed(...)` (a synchronous disk write) ran with no `try/catch` after a successful GitHub post — if it threw (disk full, bad `RELAYED_STORE_PATH` on the VM), the thread would never be marked relayed on disk despite the comment having genuinely posted, risking a duplicate comment on a later follow-up in the same thread. Now caught: the GitHub comment already succeeded, so the PM is not told anything failed (that would be false) and still gets the ✅ reaction; a loud `console.error("DEDUPE PERSISTENCE FAILED...")` signals the ops-level problem instead. 1 new regression test.
  - 44/44 tests passing (7 suites); `tsc --noEmit` and `npm run build` both clean.
- [x] 1.15 Fourth Ring 2 review pass, findings addressed:
  - **[should-fix]** Real race: `alreadyRelayed`'s synchronous read and `recordRelayed`'s write were separated by two `await`s (`fetchThreadParentText`, `postIssueComment`), so two near-simultaneous replies in the same thread (different `event_id`s) could both pass the check before either finished, producing two GitHub comments. Added `DedupeStore.claimThread`/`releaseClaim` - the same synchronous check-and-set `isDuplicateEvent` already used for `event_id`, applied to `thread_ts`. Claimed right after the `alreadyRelayed` check (before any `await`); released on every path that doesn't actually relay (`none`, `ambiguous`, GitHub-post failure) so a genuine retry isn't blocked forever. 3 new regression tests, including one that genuinely exercises the interleaving via unawaited concurrent `handle()` calls.
  - **[nit]** `DedupeStore.persist()` was a direct `writeFileSync`, not atomic - a crash mid-write could leave a truncated file. Now write-to-temp-then-`renameSync`, atomic on the same filesystem.
  - 49/49 tests passing (7 suites); `tsc --noEmit` and `npm run build` both clean.
- [x] 1.16 Fifth Ring 2 review pass, findings addressed:
  - **[should-fix]** `fetchThreadParentText` had no `try/catch`, unlike the GitHub-post and dedupe-write calls right below it. A failure there left the thread permanently claimed (never released) with zero PM-facing notice - any later genuine reply in that thread would silently get `concurrent_reply_in_progress` forever, recoverable only by restarting the service. Wrapped it: releases the claim, posts a best-effort notice, returns a new `thread_lookup_failed` outcome.
  - **[should-fix]** `SlackClient.addReaction`/`postThreadReply` never checked the Slack API's `ok` field, so a scope/auth/rate-limit failure (e.g. the bot not yet invited to the channel - literally Phase 1's own task 2.3) failed completely silently: no exception, no log, nothing - meaning every PM-facing notice in `relayHandler.ts` could silently no-op. Fixed once, centrally, in `SlackClient.call()` (checked for all three methods, not per-method). Since notice-posting is now itself fallible, added `RelayHandler.notifyThread()` - a best-effort wrapper (catches and logs, never throws further) - and routed every PM-facing notice through it instead of calling `postThreadReply` directly; wrapped the final confirmation `addReaction` the same way (the relay itself already succeeded by that point - a missing emoji shouldn't turn a real success into a reported failure). Added `slackClient.spec.ts` (previously nonexistent - zero direct test coverage on either outbound-HTTP client) plus 3 new `relayHandler.spec.ts` regression tests.
  - 59/59 tests passing (8 suites); `tsc --noEmit` and `npm run build` both clean.
- [x] 1.17 Sixth Ring 2 review pass — clean (no should-fix/blocker), 2 nits addressed:
  - **[nit]** `claimedThreads` is never pruned after a successful relay - harmless today (explained why in a new comment in `dedupeStore.ts`), but documented as a known, accepted growth pattern for a long-running process rather than left unexplained.
  - **[nit]** `config.ts`'s `PORT` parsing had no validation, unlike every other field's `requireEnv`. Added `parsePort()`: defaults to 4000 if unset, throws the same clear error style as `requireEnv` on anything non-finite or ≤0, instead of a raw `RangeError` surfacing later out of `app.listen`.
  - 64/64 tests passing (9 suites, new `config.spec.ts`); `tsc --noEmit` and `npm run build` both clean.
- [x] 1.18 Seventh Ring 2 review pass — clean, no should-fix requiring action in this PR:
  - **[should-fix, explicitly scoped as "not this PR's job"]** `context/codebase/INTEGRATIONS.md`'s "no webhooks" claim and `STRUCTURE.md`'s missing mention of `slack-relay/` will read stale on merge. Per rule 7, context updates go through `context-gardener`, not this feature commit — `context-gardener.yml` reacts to merges to `main` automatically, so no manual follow-up action needed here beyond merging.
  - **[nit]** No CI wiring runs `npm test`/`tsc --noEmit` for `slack-relay/` — matches existing precedent (`backend/`'s test also isn't CI-wired per `TESTING.md`), not a regression introduced by this change.
  - No code changes this round - review found nothing actionable within this PR's scope.

## 2. Phase 1 — blocked on Dominik/workspace-admin

- [ ] 2.1 Enable Events API on the existing Slack App, add Bot User with `channels:history`/`chat:write` scopes
- [ ] 2.2 Capture the bot token and signing secret
- [ ] 2.3 Invite the bot into the destination Slack channel (required for event delivery at all)

## 3. Phase 2 — deploy

- [ ] 3.1 Create `blc-slack-relay.service` on the staging VM (template already pulled and verified in `design.md`)
- [ ] 3.2 Add the `handle /slack/events*` block to the existing Caddyfile, reload Caddy
- [ ] 3.3 Write the relay's `.env` (bot token, signing secret, `SLACK_RELAY_GH_PAT`, `PM_SLACK_MEMBER_ID`, `GITHUB_OWNER`/`GITHUB_REPO`)
- [ ] 3.4 Enable and start the service; confirm Slack's Request URL verification succeeds against it

## 4. Phase 3 — live end-to-end verification

- [ ] 4.1 A real threaded reply from the PM's actual Slack account lands as a `@claude <answer>` comment on the correct GitHub issue
- [ ] 4.2 `proposal-answer-sync.yml` fires off that comment and opens the expected PR
- [ ] 4.3 The ✅ reaction appears on the PM's Slack message
- [ ] 4.4 Log the completed deployment in `docs/BUILD_LOG.md`, matching the existing Phase 15/16/17/18 convention
