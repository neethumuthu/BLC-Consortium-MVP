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
  let handler: RelayHandler;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "slack-relay-test-"));
    const config = buildConfig(join(dir, "relayed-threads.json"));
    const dedupe = new DedupeStore(config.relayedStorePath);

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
