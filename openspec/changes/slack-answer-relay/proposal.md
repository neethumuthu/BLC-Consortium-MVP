## Why

Today, `requirements-nudge.yml` notifies Dominik on Slack when a change is
blocked on a product question, with a link to a GitHub issue. He has to
click through and comment `@claude <answer>` **on GitHub** to trigger
`proposal-answer-sync.yml`, which resolves the proposal's Open Questions
section and opens a PR. Per the adoption plan's own decision log,
Dominik's *original* ask was for his **Slack** reply to sync automatically
— "answer on GitHub instead" was an implementation shortcut bundled into
the same scope-down conversation as "don't auto-resume implementation."

**Known risk, accepted, not tracked as an Open Question here on purpose:**
whether "answer on GitHub" was something Dominik separately chose, versus
an unconfirmed implementation shortcut, is still genuinely unresolved —
see `docs/AI_SDLC_FRAMEWORK_FINDINGS_REPORT.md` §6/§9 item 6. This is
deliberately *not* listed under `## Open Questions` below, because doing
so would make `requirements-nudge.yml` nudge Dominik about it automatically
— and the explicit decision (made twice now, 2026-08-13 and again
2026-08-14) is to build the missing direction without chasing that
sign-off first, not to force the question via automation. If this turns
out to answer the wrong problem, the fix is cheap: the relay only ever
posts the same `@claude <answer>` comment a human would already type.

## What Changes

- New capability: a small relay service (`slack-relay/`) that listens for
  the PM's threaded replies on the existing Slack nudge and posts the
  equivalent `@claude <answer>` comment on the linked GitHub issue
  automatically, with a ✅ reaction back in Slack on success.
- `proposal-answer-sync.yml`'s own scope, trigger, and behavior are
  completely unchanged — the relay produces the same comment a human
  would type; nothing downstream needs to know the difference.
- Adjacent fix: `ai-pr-review.yml` gains the same PR-vs-tracking-issue
  exclusion guard `proposal-answer-sync.yml` already has, so an
  `@claude <answer>` reply on an "Open question: " issue is handled
  exactly once (by `proposal-answer-sync.yml`), not double-fired into a
  Ring 2 review attempt too — this bug already existed before the relay,
  but the relay makes it fire automatically and more often.

## Capabilities

### New Capabilities
- `slack-answer-relay`: relays a PM's threaded Slack reply to the
  matching GitHub issue as an `@claude <answer>` comment.

### Modified Capabilities
(none — `proposal-answer-sync.yml` and `requirements-nudge.yml` are
consumed as-is, not changed)

**`skip_specs: true`** — this is process/CI tooling, the same category as
`ai-pr-review.yml`/`context-gardener.yml`/etc., none of which have
`openspec/specs/` coverage. It has no HTTP-reachable route on the actual
BLC-31 product and isn't part of the certificate/institution/governance
domain the existing specs describe.

## Impact

- New: `slack-relay/` (TypeScript service, own `package.json`).
- New (VM-only, not committed): systemd unit `blc-slack-relay`, a Caddy
  `handle /slack/events*` block, a `.env` with the bot token/signing
  secret/`SLACK_RELAY_GH_PAT`.
- Modified: `.github/workflows/ai-pr-review.yml` (the guard fix).
- No change to `requirements-nudge.yml` or `proposal-answer-sync.yml`.
- No new NSG rule, no new DNS — reached through the existing Caddy
  site/cert on port 443.
