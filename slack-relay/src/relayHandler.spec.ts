import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Config } from "./config";
import { DedupeStore } from "./dedupeStore";
import { GithubClient } from "./githubClient";
import { RelayHandler } from "./relayHandler";
import { SlackClient } from "./slackClient";
import { SlackEventCallback } from "./types";

const PM_ID = "U_PM_12345";
const CHANNEL = "C_TEAM_CHANNEL";

const SINGLE_LINK_PARENT = [
  "Open question: cert-licensing-vetting -",
  "https://github.com/neethumuthu/BLC-Consortium-MVP/issues/20",
  "Reply on the linked issue.",
].join("\n");

const MULTI_LINK_PARENT = [
  "- Open question: cert-licensing-vetting - https://github.com/neethumuthu/BLC-Consortium-MVP/issues/20",
  "- Open question: governance-threshold - https://github.com/neethumuthu/BLC-Consortium-MVP/issues/21",
].join("\n");

function buildConfig(storePath: string): Config {
  return {
    port: 4000,
    slackSigningSecret: "unused-in-this-test",
    slackBotToken: "xoxb-fake",
    pmSlackMemberId: PM_ID,
    githubToken: "ghp_fake",
    githubOwner: "neethumuthu",
    githubRepo: "BLC-Consortium-MVP",
    relayedStorePath: storePath,
  };
}

function buildEvent(overrides: Partial<SlackEventCallback["event"]> = {}): SlackEventCallback {
  return {
    type: "event_callback",
    event_id: "Ev001",
    event: {
      type: "message",
      channel: CHANNEL,
      user: PM_ID,
      text: "let's go with option 1",
      ts: "1700000010.000100",
      thread_ts: "1700000000.000000",
      ...overrides,
    },
  };
}

describe("RelayHandler", () => {
  let dir: string;
  let slack: jest.Mocked<SlackClient>;
  let github: jest.Mocked<GithubClient>;
  let dedupe: DedupeStore;
  let handler: RelayHandler;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "slack-relay-test-"));
    const config = buildConfig(join(dir, "relayed-threads.json"));
    dedupe = new DedupeStore(config.relayedStorePath);

    slack = {
      fetchThreadParentText: jest.fn().mockResolvedValue(SINGLE_LINK_PARENT),
      addReaction: jest.fn().mockResolvedValue(undefined),
      postThreadReply: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SlackClient>;

    github = {
      postIssueComment: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<GithubClient>;

    handler = new RelayHandler(config, slack, github, dedupe);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("relays a valid threaded reply to the single linked issue, then reacts with a checkmark", async () => {
    const outcome = await handler.handle(buildEvent());

    expect(outcome).toEqual({ action: "relayed", issueNumber: "20" });
    expect(github.postIssueComment).toHaveBeenCalledWith("20", "@claude let's go with option 1");
    expect(slack.addReaction).toHaveBeenCalledWith(CHANNEL, "1700000010.000100", "white_check_mark");
  });

  it("notifies the PM in-thread and does not mark the thread relayed when the GitHub post fails", async () => {
    github.postIssueComment.mockRejectedValue(new Error("503 Service Unavailable"));

    const outcome = await handler.handle(buildEvent());

    expect(outcome).toEqual({
      action: "relay_failed",
      issueNumber: "20",
      error: "503 Service Unavailable",
    });
    expect(slack.postThreadReply).toHaveBeenCalledWith(
      CHANNEL,
      "1700000000.000000",
      expect.stringContaining("#20"),
    );
    expect(slack.addReaction).not.toHaveBeenCalled();

    // A retry (e.g. Slack redelivering, or the PM replying again) must
    // still be able to succeed - the failed attempt must not have been
    // recorded as relayed.
    github.postIssueComment.mockResolvedValue(undefined);
    const retryEvent = buildEvent({ text: "retrying" });
    retryEvent.event_id = "Ev002";
    const retryOutcome = await handler.handle(retryEvent);
    expect(retryOutcome).toEqual({ action: "relayed", issueNumber: "20" });
  });

  it("releases the claim and notifies the PM when looking up the thread's parent message fails", async () => {
    slack.fetchThreadParentText.mockRejectedValueOnce(new Error("conversations.replies failed"));

    const outcome = await handler.handle(buildEvent());

    expect(outcome).toEqual({
      action: "thread_lookup_failed",
      error: "conversations.replies failed",
    });
    expect(github.postIssueComment).not.toHaveBeenCalled();
    expect(slack.postThreadReply).toHaveBeenCalledWith(
      CHANNEL,
      "1700000000.000000",
      expect.stringContaining("Couldn't look up"),
    );

    // The claim must have been released - a later retry in the same
    // thread must not be stuck as concurrent_reply_in_progress forever.
    const retryEvent = buildEvent({ text: "retrying" });
    retryEvent.event_id = "Ev002";
    const retryOutcome = await handler.handle(retryEvent);
    expect(retryOutcome).toEqual({ action: "relayed", issueNumber: "20" });
  });

  it("does not crash and still returns the real outcome when even the best-effort Slack notice fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    slack.fetchThreadParentText.mockRejectedValueOnce(new Error("lookup failed"));
    slack.postThreadReply.mockRejectedValueOnce(new Error("chat.postMessage also failed"));

    const outcome = await handler.handle(buildEvent());

    expect(outcome).toEqual({ action: "thread_lookup_failed", error: "lookup failed" });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to post a notice"),
      expect.any(Error),
    );

    consoleError.mockRestore();
  });

  it("still reports success when the relay itself succeeds but the confirmation reaction fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    slack.addReaction.mockRejectedValueOnce(new Error("not_in_channel"));

    const outcome = await handler.handle(buildEvent());

    expect(outcome).toEqual({ action: "relayed", issueNumber: "20" });
    expect(github.postIssueComment).toHaveBeenCalledWith("20", "@claude let's go with option 1");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to add the confirmation reaction"),
      expect.any(Error),
    );

    consoleError.mockRestore();
  });

  it("still reacts and reports success when the GitHub post succeeds but persisting the dedup record fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(dedupe, "recordRelayed").mockImplementation(() => {
      throw new Error("ENOSPC: no space left on device");
    });

    const outcome = await handler.handle(buildEvent());

    // The GitHub comment genuinely succeeded - the PM must not be told
    // it failed, and should still see the confirmation reaction.
    expect(outcome).toEqual({ action: "relayed", issueNumber: "20" });
    expect(github.postIssueComment).toHaveBeenCalledWith("20", "@claude let's go with option 1");
    expect(slack.addReaction).toHaveBeenCalledWith(CHANNEL, "1700000010.000100", "white_check_mark");
    expect(slack.postThreadReply).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("DEDUPE PERSISTENCE FAILED"),
      expect.any(Error),
    );

    consoleError.mockRestore();
  });

  it("closes the race between two near-simultaneous replies in the same thread - only one relays", async () => {
    const first = buildEvent({ text: "let's go with option 1" });
    const second = buildEvent({ text: "actually, option 1" });
    second.event_id = "Ev002";

    // Not awaited between calls, so both run synchronously up to their
    // first await (fetchThreadParentText) before either resolves -
    // genuinely exercising the interleaving the claim exists to close.
    const [outcome1, outcome2] = await Promise.all([
      handler.handle(first),
      handler.handle(second),
    ]);
    const outcomes = [outcome1, outcome2];

    expect(outcomes).toContainEqual({ action: "relayed", issueNumber: "20" });
    expect(outcomes).toContainEqual({ action: "concurrent_reply_in_progress" });
    expect(github.postIssueComment).toHaveBeenCalledTimes(1);
  });

  it("releases the claim on a no-issue-link outcome, so a genuine follow-up reply can still relay", async () => {
    slack.fetchThreadParentText.mockResolvedValueOnce("no links in here at all");

    const first = await handler.handle(buildEvent({ text: "sure" }));
    expect(first).toEqual({ action: "no_issue_link_found" });

    const followUp = buildEvent({ text: "sorry, meant to reply on issue 20" });
    followUp.event_id = "Ev002";
    const second = await handler.handle(followUp);
    expect(second).toEqual({ action: "relayed", issueNumber: "20" });
  });

  it("cleans Slack's escaped/mrkdwn text before posting it as a GitHub comment", async () => {
    const outcome = await handler.handle(
      buildEvent({
        text: "docs &amp; spec look fine, thanks <@U99999> - see <https://example.com|the doc>",
      }),
    );

    expect(outcome).toEqual({ action: "relayed", issueNumber: "20" });
    expect(github.postIssueComment).toHaveBeenCalledWith(
      "20",
      "@claude docs & spec look fine, thanks @U99999 - see the doc (https://example.com)",
    );
  });

  it("ignores a redelivered event with the same event_id and does not relay twice", async () => {
    await handler.handle(buildEvent());
    github.postIssueComment.mockClear();

    const outcome = await handler.handle(buildEvent());

    expect(outcome).toEqual({ action: "duplicate_event" });
    expect(github.postIssueComment).not.toHaveBeenCalled();
  });

  it("ignores a reply from someone other than the configured PM", async () => {
    const outcome = await handler.handle(buildEvent({ user: "U_SOMEONE_ELSE" }));

    expect(outcome).toEqual({ action: "ignored", reason: "wrong_user" });
    expect(github.postIssueComment).not.toHaveBeenCalled();
  });

  it("does not open a second GitHub comment for a thread already relayed, and posts a notice instead", async () => {
    await handler.handle(buildEvent());
    github.postIssueComment.mockClear();

    // A follow-up fragment in the same thread, different event_id.
    const followUp = buildEvent({ text: "actually also see below" });
    followUp.event_id = "Ev002";
    const outcome = await handler.handle(followUp);

    expect(outcome).toEqual({ action: "already_relayed", issueNumber: "20" });
    expect(github.postIssueComment).not.toHaveBeenCalled();
    expect(slack.postThreadReply).toHaveBeenCalledWith(
      CHANNEL,
      "1700000000.000000",
      expect.stringContaining("#20"),
    );
  });

  it("asks for clarification and does not relay when the thread links no GitHub issue", async () => {
    slack.fetchThreadParentText.mockResolvedValue("no links in here at all");

    const outcome = await handler.handle(buildEvent());

    expect(outcome).toEqual({ action: "no_issue_link_found" });
    expect(github.postIssueComment).not.toHaveBeenCalled();
    expect(slack.postThreadReply).toHaveBeenCalled();
  });

  it("asks for clarification and does not relay when the thread links multiple issues ambiguously", async () => {
    slack.fetchThreadParentText.mockResolvedValue(MULTI_LINK_PARENT);

    const outcome = await handler.handle(buildEvent({ text: "let's go with option 1 for both" }));

    expect(outcome).toEqual({ action: "ambiguous", candidates: ["20", "21"] });
    expect(github.postIssueComment).not.toHaveBeenCalled();
    expect(slack.postThreadReply).toHaveBeenCalledWith(
      CHANNEL,
      "1700000000.000000",
      expect.stringContaining("#20"),
    );
  });
});
