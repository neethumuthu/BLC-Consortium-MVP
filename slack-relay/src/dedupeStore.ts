import { existsSync, readFileSync, writeFileSync } from "fs";

interface RelayedThreadRecord {
  issueNumber: string;
  relayedAt: string;
}

/**
 * Two dedup layers, deliberately different lifetimes:
 * - event_id: in-memory only. Covers Slack's own short-window redelivery
 *   retries (typically seconds). Losing this on a restart is fine - the
 *   thread-level check below still prevents a duplicate relay.
 * - thread_ts: persisted to disk. This is the actual guarantee against
 *   relaying the same thread twice (e.g. the PM sends a follow-up
 *   fragment, or the service restarts between the first reply and a
 *   second one) - a restart must not forget which threads already
 *   produced a GitHub comment.
 */
export class DedupeStore {
  private readonly seenEventIds = new Set<string>();
  private relayedThreads: Record<string, RelayedThreadRecord>;

  constructor(private readonly storePath: string) {
    this.relayedThreads = this.load();
  }

  private load(): Record<string, RelayedThreadRecord> {
    if (!existsSync(this.storePath)) {
      return {};
    }
    try {
      return JSON.parse(readFileSync(this.storePath, "utf-8"));
    } catch {
      // A corrupt/partial file must never crash the service or silently
      // pretend everything is un-relayed - fail closed to an empty store
      // and let the next relay attempt re-populate it.
      return {};
    }
  }

  private persist(): void {
    writeFileSync(this.storePath, JSON.stringify(this.relayedThreads, null, 2));
  }

  isDuplicateEvent(eventId: string): boolean {
    if (this.seenEventIds.has(eventId)) {
      return true;
    }
    this.seenEventIds.add(eventId);
    return false;
  }

  alreadyRelayed(threadTs: string): RelayedThreadRecord | undefined {
    return this.relayedThreads[threadTs];
  }

  recordRelayed(threadTs: string, issueNumber: string, relayedAt: string): void {
    this.relayedThreads[threadTs] = { issueNumber, relayedAt };
    this.persist();
  }
}
