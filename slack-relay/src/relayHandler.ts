import { Config } from "./config";
import { DedupeStore } from "./dedupeStore";
import { filterEvent } from "./eventFilter";
import { GithubClient } from "./githubClient";
import { resolveIssueNumber } from "./linkResolver";
import { SlackClient } from "./slackClient";
import { slackTextToPlainText } from "./slackText";
import { SlackEventCallback } from "./types";

const CHECKMARK_EMOJI = "white_check_mark";

export type RelayOutcome =
  | { action: "ignored"; reason: string }
  | { action: "duplicate_event" }
  | { action: "already_relayed"; issueNumber: string }
  | { action: "no_issue_link_found" }
  | { action: "ambiguous"; candidates: string[] }
  | { action: "relayed"; issueNumber: string };

export class RelayHandler {
  constructor(
    private readonly config: Config,
    private readonly slack: SlackClient,
    private readonly github: GithubClient,
    private readonly dedupe: DedupeStore,
  ) {}

  async handle(payload: SlackEventCallback): Promise<RelayOutcome> {
    if (this.dedupe.isDuplicateEvent(payload.event_id)) {
      return { action: "duplicate_event" };
    }

    const filterResult = filterEvent(payload.event, this.config.pmSlackMemberId);
    if (!filterResult.relayable) {
      return { action: "ignored", reason: filterResult.reason };
    }

    const { channel, thread_ts: threadTs, text: rawReplyText = "" } = payload.event;
    // A human typing directly on GitHub types plain text - Slack's own
    // escaped/mrkdwn representation must never leak into the relayed
    // comment, or into the disambiguation match against it.
    const replyText = slackTextToPlainText(rawReplyText);

    const existing = this.dedupe.alreadyRelayed(threadTs!);
    if (existing) {
      await this.slack.postThreadReply(
        channel,
        threadTs!,
        `Already relayed to GitHub issue #${existing.issueNumber} (at ${existing.relayedAt}) - not opening a second one.`,
      );
      return { action: "already_relayed", issueNumber: existing.issueNumber };
    }

    const parentText = await this.slack.fetchThreadParentText(channel, threadTs!);
    const resolution = resolveIssueNumber(parentText, replyText);

    if (resolution.status === "none") {
      await this.slack.postThreadReply(
        channel,
        threadTs!,
        "Couldn't find a linked GitHub issue in this thread - not relaying. Please answer directly on the issue instead.",
      );
      return { action: "no_issue_link_found" };
    }

    if (resolution.status === "ambiguous") {
      const list = resolution.candidates.map((n) => `#${n}`).join(", ");
      await this.slack.postThreadReply(
        channel,
        threadTs!,
        `This thread links more than one issue (${list}) and I can't tell which one your reply answers - please answer directly on the right issue instead, or mention its number (e.g. "#${resolution.candidates[0]}") in your reply.`,
      );
      return { action: "ambiguous", candidates: resolution.candidates };
    }

    await this.github.postIssueComment(resolution.issueNumber, `@claude ${replyText}`);
    this.dedupe.recordRelayed(threadTs!, resolution.issueNumber, new Date().toISOString());
    await this.slack.addReaction(channel, payload.event.ts, CHECKMARK_EMOJI);

    return { action: "relayed", issueNumber: resolution.issueNumber };
  }
}
