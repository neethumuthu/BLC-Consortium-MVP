import { loadConfig } from "./config";

const REQUIRED_ENV = {
  SLACK_SIGNING_SECRET: "sig",
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
    delete process.env.PORT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults PORT to 4000 when unset", () => {
    expect(loadConfig().port).toBe(4000);
  });

  it("uses a valid PORT from the environment", () => {
    process.env.PORT = "5000";
    expect(loadConfig().port).toBe(5000);
  });

  it("throws a clear error on a malformed PORT instead of a raw RangeError from app.listen", () => {
    process.env.PORT = "not-a-number";
    expect(() => loadConfig()).toThrow("Invalid PORT environment variable");
  });

  it("throws on a zero or negative PORT", () => {
    process.env.PORT = "0";
    expect(() => loadConfig()).toThrow("Invalid PORT environment variable");
  });

  it("throws when a required variable is missing", () => {
    delete process.env.SLACK_SIGNING_SECRET;
    expect(() => loadConfig()).toThrow("SLACK_SIGNING_SECRET");
  });
});
