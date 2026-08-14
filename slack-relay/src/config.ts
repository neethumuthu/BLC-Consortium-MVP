function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined) {
    return 4000;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid PORT environment variable: ${JSON.stringify(raw)}`);
  }
  return parsed;
}

export interface Config {
  port: number;
  slackSigningSecret: string;
  slackBotToken: string;
  pmSlackMemberId: string;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  relayedStorePath: string;
}

export function loadConfig(): Config {
  return {
    port: parsePort(process.env.PORT),
    slackSigningSecret: requireEnv("SLACK_SIGNING_SECRET"),
    slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
    pmSlackMemberId: requireEnv("PM_SLACK_MEMBER_ID"),
    githubToken: requireEnv("SLACK_RELAY_GH_PAT"),
    githubOwner: requireEnv("GITHUB_OWNER"),
    githubRepo: requireEnv("GITHUB_REPO"),
    relayedStorePath: process.env.RELAYED_STORE_PATH ?? "./relayed-threads.json",
  };
}
