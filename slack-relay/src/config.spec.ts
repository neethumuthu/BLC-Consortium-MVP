import { loadConfig } from "./config";

const REQUIRED_ENV = {
  SLACK_APP_TOKEN: "xapp-fake",
  SLACK_BOT_TOKEN: "xoxb-fake",
  PM_SLACK_MEMBER_ID: "U123",
  SLACK_RELAY_GH_PAT: "ghp_fake",
  GITHUB_OWNER: "neethumuthu",
  GITHUB_REPO: "BLC-Consortium-MVP",
};

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ...REQUIRED_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads a complete config when every required variable is set", () => {
    expect(loadConfig()).toEqual({
      slackAppToken: "xapp-fake",
      slackBotToken: "xoxb-fake",
      pmSlackMemberId: "U123",
      githubToken: "ghp_fake",
      githubOwner: "neethumuthu",
      githubRepo: "BLC-Consortium-MVP",
      relayedStorePath: "./relayed-threads.json",
    });
  });

  it("uses RELAYED_STORE_PATH from the environment when set", () => {
    process.env.RELAYED_STORE_PATH = "/var/lib/blc-slack-relay/relayed.json";
    expect(loadConfig().relayedStorePath).toBe("/var/lib/blc-slack-relay/relayed.json");
  });

  it("throws when the App-Level Token is missing", () => {
    delete process.env.SLACK_APP_TOKEN;
    expect(() => loadConfig()).toThrow("SLACK_APP_TOKEN");
  });

  it("throws when the bot token is missing", () => {
    delete process.env.SLACK_BOT_TOKEN;
    expect(() => loadConfig()).toThrow("SLACK_BOT_TOKEN");
  });

  it("throws when the GitHub PAT is missing", () => {
    delete process.env.SLACK_RELAY_GH_PAT;
    expect(() => loadConfig()).toThrow("SLACK_RELAY_GH_PAT");
  });
});
