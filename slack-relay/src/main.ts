import express, { Request, Response } from "express";
import { loadConfig } from "./config";
import { DedupeStore } from "./dedupeStore";
import { GithubClient } from "./githubClient";
import { RelayHandler } from "./relayHandler";
import { SlackClient } from "./slackClient";
import { verifySlackSignature } from "./signature";
import { SlackEventPayload } from "./types";

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

function main(): void {
  const config = loadConfig();
  const slack = new SlackClient(config.slackBotToken);
  const github = new GithubClient(config.githubToken, config.githubOwner, config.githubRepo);
  const dedupe = new DedupeStore(config.relayedStorePath);
  const relayHandler = new RelayHandler(config, slack, github, dedupe);

  const app = express();

  app.use(
    express.json({
      verify: (req: RequestWithRawBody, _res: Response, buf: Buffer) => {
        req.rawBody = buf.toString("utf-8");
      },
    }),
  );

  app.get("/healthz", (_req: Request, res: Response) => res.status(200).send("ok"));

  app.post("/slack/events", async (req: RequestWithRawBody, res: Response) => {
    const isValid = verifySlackSignature(
      req.rawBody ?? "",
      req.header("X-Slack-Request-Timestamp"),
      req.header("X-Slack-Signature"),
      config.slackSigningSecret,
    );
    if (!isValid) {
      res.status(401).send("invalid signature");
      return;
    }

    const payload = req.body as SlackEventPayload;

    if (payload.type === "url_verification") {
      res.status(200).json({ challenge: payload.challenge });
      return;
    }

    // Acknowledge immediately - Slack requires a response within 3 seconds
    // and will retry on timeout, which would just re-trigger the same
    // event_id dedup path. The actual relay work happens after responding.
    res.status(200).send();

    if (payload.type === "event_callback") {
      try {
        const outcome = await relayHandler.handle(payload);
        // eslint-disable-next-line no-console
        console.log("relay outcome", outcome);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("relay handler failed", error);
      }
    }
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`blc-slack-relay listening on :${config.port}`);
  });
}

main();
