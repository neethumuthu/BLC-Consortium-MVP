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
