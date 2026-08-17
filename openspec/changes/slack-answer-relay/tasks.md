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

## 2. Phase 0.5 — transport pivot to Socket Mode (2026-08-14, own PR)

While starting Phase 1, found Socket Mode already enabled on the Slack
App. Reworked the transport layer rather than turning it off — see
`proposal.md`/`design.md` for the full rationale and the exact,
source-verified `@slack/socket-mode` API.

- [x] 2.1 Verify the exact `SocketModeClient` event-body shape against the installed package's own runtime source (`node_modules/@slack/socket-mode/dist/src/SocketModeClient.js`), not just docs prose — confirmed `body` is the full `event_callback` payload, byte-for-byte reusable by the existing `RelayHandler.handle()`
- [x] 2.2 Install `@slack/socket-mode`; remove `express`/`supertest` and their `@types/*`
- [x] 2.3 Remove `app.ts`/`app.spec.ts`/`signature.ts`/`signature.spec.ts` (HTTP receiver + HMAC verification, no longer applicable)
- [x] 2.4 Add `socketReceiver.ts` (`connectSocketMode`, `handleSocketMessage` — small and directly unit-testable, matching how `app.ts`'s routes were tested) + `socketReceiver.spec.ts`
- [x] 2.5 Update `config.ts` (drop `slackSigningSecret`/`port`, add `slackAppToken`) + `config.spec.ts`
- [x] 2.6 Rewrite `main.ts` to wire `connectSocketMode` + `socketClient.start()` instead of the Express app
- [x] 2.7 Update `.env.example` (`SLACK_APP_TOKEN` instead of `SLACK_SIGNING_SECRET`/`PORT`)
- [x] 2.8 Confirm every pre-existing business-logic test suite (`relayHandler`, `dedupeStore`, `linkResolver`, `slackText`, `slackClient`, `eventFilter`) passes unmodified — only their `Config` fixture needed updating, no logic changes
- [x] 2.9 Full verification: `tsc --noEmit` clean, `npm run build` clean, 58/58 tests passing (8 suites)
- [x] 2.10 Update `proposal.md`/`design.md` to record the pivot, the verified API, and why (before this tasks.md entry)

## 3. Phase 1 — Neethu has edit access, not blocked on Dominik

- [x] 3.1 Add `channels:history`/`chat:write` Bot Token scopes to the Slack App
- [x] 3.2 Subscribe to `message.channels` bot events
- [x] 3.3 Generate the App-Level Token (`connections:write` scope) — new credential, not in the original Phase 1 plan
- [x] 3.4 Capture the bot token
- [x] 3.5 Invite the bot into the destination Slack channel (required for event delivery at all)
- [x] 3.6 **Added 2026-08-17, not in the original plan:** `team_blockchain` turned out to be a **private** channel — `channels:history`/`message.channels` only cover public channels. Had to separately add `groups:history` scope + `message.groups` event subscription, and (a distinct, second gap) actually invite the bot user as a channel **member** — it could already post there via the older incoming-webhook mechanism, which does not require bot membership, so this was missed on the first pass. Both fixed live.

## 4. Phase 2 — deploy

- [x] 4.0 Pull the merged code onto the staging VM (`783b72c` → `82a1627`), `npm install` + `npm run build`, confirmed `dist/main.js` exists
- [x] 4.1 Create `blc-slack-relay.service` on the staging VM (template already pulled and verified in `design.md`) - created and `daemon-reload`'d, deliberately left **disabled/inactive** since `.env` (4.3) doesn't exist yet and the service would just fail to start
- [x] 4.2 ~~Add the `handle /slack/events*` block to the existing Caddyfile~~ — dropped entirely, not deferred: Socket Mode needs no inbound route at all
- [x] 4.3 Pull this change's rework onto the VM, rebuild; write the relay's `.env` (app token, bot token, `SLACK_RELAY_GH_PAT`, `PM_SLACK_MEMBER_ID`, `GITHUB_OWNER`/`GITHUB_REPO`) — done 2026-08-14
- [x] 4.4 Enable and start the service; confirm it connects — done 2026-08-14, confirmed running continuously since

## 5. Phase 3 — live end-to-end verification

**Status as of 2026-08-17: core relay confirmed working end to end.** Live attempts (5 real threaded replies from Dominik across the day) surfaced three separate, real bugs, none catchable without an actual live attempt:
1. The Phase 1 gaps in 3.6 above (private channel scope + bot membership) — the first 3 replies were never received by the relay at all, confirmed via `journalctl` showing zero log activity across all three.
2. Once 3.6 was fixed and a 4th reply was received: `SlackClient.fetchThreadParentText` called `conversations.replies` via a JSON POST body — confirmed live that this specific Slack API method rejects that (`invalid_arguments`, "missing required field" for every field even though sent), unlike `chat.postMessage`/`reactions.add` which do accept JSON. Fixed and deployed.
3. On the 5th reply, with both fixes deployed: the relay fully succeeded (`{ action: 'relayed', issueNumber: '24' }`) and `proposal-answer-sync.yml` fired correctly — but `reactions.add` failed with `missing_scope` (`reactions:write` was never added, only `channels:history`/`chat:write`/`groups:history`). The relay itself doesn't report this as a failure (matches 1.16's own "a missing emoji shouldn't turn a real success into a reported failure" design) — but it does mean 5.3 below wasn't actually observable yet. Fix: add `reactions:write` scope.

**Also found and fixed the same day, not blocking but real:** the relayed comment showed up on GitHub authored by the PAT owner (Neethu), not the PM who actually answered in Slack (Dominik) — `SLACK_RELAY_GH_PAT` is a personal token with no "posted on behalf of" concept. Fixed by prefixing the comment with `@claude Relayed from <PM name>'s Slack reply: ...` (separate PR; also required adding `PM_DISPLAY_NAME` to config, and updating `design.md`/`proposal.md`'s wire-format claims to match — those said `@claude <answer>` verbatim, no longer accurate).

- [x] 5.1 A real threaded reply from the PM's actual Slack account lands as an `@claude ...` comment on the correct GitHub issue — confirmed live 2026-08-17, issue #24
- [x] 5.2 `proposal-answer-sync.yml` fires off that comment and opens the expected PR — confirmed live 2026-08-17 (correctly declined to open a PR for this specific test, since it's a throwaway issue with no real `proposal.md` behind it — that's the right call, not a bug)
- [ ] 5.3 The ✅ reaction appears on the PM's Slack message — blocked on the missing `reactions:write` scope above, not yet re-attempted with it added
- [ ] 5.4 Log the completed deployment in `docs/BUILD_LOG.md`, matching the existing Phase 15/16/17/18 convention
