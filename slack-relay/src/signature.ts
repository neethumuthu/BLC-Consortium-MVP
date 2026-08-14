import { createHmac, timingSafeEqual } from "crypto";

const MAX_REQUEST_AGE_SECONDS = 60 * 5;

/**
 * Slack's own verification recipe: v0:<timestamp>:<raw body>, HMAC-SHA256
 * with the signing secret, compared against X-Slack-Signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  rawBody: string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  signingSecret: string,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!timestampHeader || !signatureHeader) {
    return false;
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  // Replay-attack guard, per Slack's own docs.
  if (Math.abs(now - timestamp) > MAX_REQUEST_AGE_SECONDS) {
    return false;
  }

  const base = `v0:${timestampHeader}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
