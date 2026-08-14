import express, { Application, Request, Response } from "express";
import { RelayHandler } from "./relayHandler";
import { verifySlackSignature } from "./signature";
import { SlackEventPayload } from "./types";

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

/**
 * Split out from main.ts so the HTTP layer (signature enforcement,
 * url_verification, immediate-ack-then-async-relay) is testable directly
 * with supertest, without needing a real config or an actual listener.
 */
export function createApp(signingSecret: string, relayHandler: RelayHandler): Application {
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
      signingSecret,
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

  return app;
}
