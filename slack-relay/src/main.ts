import { createApp } from "./app";
import { loadConfig } from "./config";
import { DedupeStore } from "./dedupeStore";
import { GithubClient } from "./githubClient";
import { RelayHandler } from "./relayHandler";
import { SlackClient } from "./slackClient";

function main(): void {
  const config = loadConfig();
  const slack = new SlackClient(config.slackBotToken);
  const github = new GithubClient(config.githubToken, config.githubOwner, config.githubRepo);
  const dedupe = new DedupeStore(config.relayedStorePath);
  const relayHandler = new RelayHandler(config, slack, github, dedupe);

  const app = createApp(config.slackSigningSecret, relayHandler);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`blc-slack-relay listening on :${config.port}`);
  });
}

main();
