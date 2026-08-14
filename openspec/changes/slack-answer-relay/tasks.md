## 1. Phase 0 — relay service, buildable and testable with zero Slack dependency

- [x] 1.1 Scaffold `slack-relay/` (`package.json`, `tsconfig.json`) matching `backend/`'s toolchain conventions (TypeScript, Jest+ts-jest, `node dist/main.js` production entrypoint)
- [x] 1.2 Implement Slack request-signature verification (HMAC-SHA256 `v0=`, timestamp replay-window check)
- [x] 1.3 Implement `url_verification` challenge handling
- [x] 1.4 Implement event filtering (no subtype, correct PM user, must be threaded)
- [x] 1.5 Implement parent-message link resolution with multi-issue disambiguation (explicit `#n` mention, then distinctive-word overlap, else refuse to guess)
- [x] 1.6 Implement two-layer dedup: in-memory `event_id`, disk-persisted per-thread relay record
- [x] 1.7 Implement the GitHub comment relay (`@claude <reply text>`) and the Slack ✅ reaction
- [x] 1.8 Wire it together in `main.ts` (Express app, raw-body capture for signature verification, `/slack/events` + `/healthz`)
- [x] 1.9 Unit tests against synthetic payloads: valid reply, tampered/expired/missing signature, wrong user, edited-message subtype, single-link parent, multi-link parent with and without a disambiguating hint, duplicate `event_id`, already-relayed thread, no-issue-link parent — all passing (26/26)
- [x] 1.10 Verify the production build compiles (`npm run build` → `dist/main.js`)
- [x] 1.11 ~~Fix `ai-pr-review.yml`'s missing PR-vs-tracking-issue exclusion guard~~ — pulled out and landed directly on `main` instead, not as part of this change (bundling it here broke Ring 2 review of this PR entirely — GitHub Actions won't run a modified workflow file against the PR that changes it)

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
