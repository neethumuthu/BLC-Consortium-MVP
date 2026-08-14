import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DedupeStore } from "./dedupeStore";

describe("DedupeStore", () => {
  let dir: string;
  let storePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "slack-relay-test-"));
    storePath = join(dir, "relayed-threads.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("treats the same event_id as a duplicate on a second call", () => {
    const store = new DedupeStore(storePath);
    expect(store.isDuplicateEvent("Ev001")).toBe(false);
    expect(store.isDuplicateEvent("Ev001")).toBe(true);
  });

  it("treats different event_ids as independent", () => {
    const store = new DedupeStore(storePath);
    expect(store.isDuplicateEvent("Ev001")).toBe(false);
    expect(store.isDuplicateEvent("Ev002")).toBe(false);
  });

  it("has no relayed record for a thread until one is recorded", () => {
    const store = new DedupeStore(storePath);
    expect(store.alreadyRelayed("1700000000.000000")).toBeUndefined();
  });

  it("persists a relayed thread to disk and survives a fresh instance (a restart)", () => {
    const first = new DedupeStore(storePath);
    first.recordRelayed("1700000000.000000", "20", "2026-08-14T00:00:00.000Z");
    expect(existsSync(storePath)).toBe(true);

    const second = new DedupeStore(storePath);
    expect(second.alreadyRelayed("1700000000.000000")).toEqual({
      issueNumber: "20",
      relayedAt: "2026-08-14T00:00:00.000Z",
    });
  });

  it("does NOT persist event_id dedup across a restart (in-memory only, by design)", () => {
    const first = new DedupeStore(storePath);
    first.isDuplicateEvent("Ev001");

    const second = new DedupeStore(storePath);
    expect(second.isDuplicateEvent("Ev001")).toBe(false);
  });

  it("fails closed (treats as empty) rather than crashing on a corrupt store file", () => {
    writeFileSync(storePath, "{not valid json");
    const store = new DedupeStore(storePath);
    expect(store.alreadyRelayed("1700000000.000000")).toBeUndefined();
  });
});
