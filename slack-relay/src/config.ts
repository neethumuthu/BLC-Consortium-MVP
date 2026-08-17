function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface Config {
  slackAppToken: string;
  slackBotToken: string;
  pmSlackMemberId: string;
  pmDisplayName: string;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  relayedStorePath: string;
}

export function loadConfig(): Config {
  return {
    // App-Level Token (xapp-...), connections:write scope - authenticates
    // the outbound WebSocket connection itself. No SLACK_SIGNING_SECRET or
    // PORT anymore - there's no inbound HTTP server left to verify
    // requests against or bind a port for (Socket Mode is an outbound
    // connection from this service to Slack, not the reverse).
    slackAppToken: requireEnv("SLACK_APP_TOKEN"),
    slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
    pmSlackMemberId: requireEnv("PM_SLACK_MEMBER_ID"),
    // Plain display name, not looked up live via Slack's users.info (which
    // would need a new users:read scope for one mostly-static value) -
    // used only to attribute the relayed GitHub comment to the real PM,
    // since the comment is posted via SLACK_RELAY_GH_PAT, a personal token,
    // and would otherwise show up authored by whoever that token belongs
    // to rather than the person who actually answered in Slack.
    pmDisplayName: requireEnv("PM_DISPLAY_NAME"),
    githubToken: requireEnv("SLACK_RELAY_GH_PAT"),
    githubOwner: requireEnv("GITHUB_OWNER"),
    githubRepo: requireEnv("GITHUB_REPO"),
    relayedStorePath: process.env.RELAYED_STORE_PATH ?? "./relayed-threads.json",
  };
}
