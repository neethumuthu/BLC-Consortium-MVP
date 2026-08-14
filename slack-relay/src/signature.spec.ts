import { createHmac } from "crypto";
import { verifySlackSignature } from "./signature";

const SIGNING_SECRET = "test-signing-secret";

function sign(timestamp: string, rawBody: string): string {
  const base = `v0:${timestamp}:${rawBody}`;
  return `v0=${createHmac("sha256", SIGNING_SECRET).update(base).digest("hex")}`;
}

describe("verifySlackSignature", () => {
  it("accepts a correctly signed, fresh request", () => {
    const now = 1_700_000_000;
    const timestamp = String(now);
    const rawBody = '{"type":"event_callback"}';
    const signature = sign(timestamp, rawBody);

    expect(verifySlackSignature(rawBody, timestamp, signature, SIGNING_SECRET, now)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const now = 1_700_000_000;
    const timestamp = String(now);
    const rawBody = '{"type":"event_callback"}';
    const badSignature = `v0=${createHmac("sha256", "wrong-secret").update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;

    expect(verifySlackSignature(rawBody, timestamp, badSignature, SIGNING_SECRET, now)).toBe(
      false,
    );
  });

  it("rejects a stale request outside the replay window", () => {
    const now = 1_700_000_000;
    const staleTimestamp = String(now - 60 * 10); // 10 minutes old
    const rawBody = '{"type":"event_callback"}';
    const signature = sign(staleTimestamp, rawBody);

    expect(verifySlackSignature(rawBody, staleTimestamp, signature, SIGNING_SECRET, now)).toBe(
      false,
    );
  });

  it("rejects a request with a mismatched body (tampered payload)", () => {
    const now = 1_700_000_000;
    const timestamp = String(now);
    const signature = sign(timestamp, '{"type":"event_callback"}');

    expect(
      verifySlackSignature('{"type":"tampered"}', timestamp, signature, SIGNING_SECRET, now),
    ).toBe(false);
  });

  it("rejects when the timestamp or signature header is missing", () => {
    expect(verifySlackSignature("{}", undefined, "v0=abc", SIGNING_SECRET)).toBe(false);
    expect(verifySlackSignature("{}", "1700000000", undefined, SIGNING_SECRET)).toBe(false);
  });
});
