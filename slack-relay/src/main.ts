import { loadConfig } from "./config";
import { DedupeStore } from "./dedupeStore";
import { GithubClient } from "./githubClient";
import { RelayHandler } from "./relayHandler";
import { SlackClient } from "./slackClient";
import { connectSocketMode } from "./socketReceiver";

async function main(): Promise<void> {
  const config = loadConfig();
  const slack = new SlackClient(config.slackBotToken);
  const github = new GithubClient(config.githubToken, config.githubOwner, config.githubRepo);
  const dedupe = new DedupeStore(config.relayedStorePath);
  const relayHandler = new RelayHandler(config, slack, github, dedupe);

  const socketClient = connectSocketMode(config.slackAppToken, relayHandler);
  await socketClient.start();

  // eslint-disable-next-line no-console
  console.log("blc-slack-relay connected via Socket Mode");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("blc-slack-relay failed to start:", error);
  process.exitCode = 1;
});
