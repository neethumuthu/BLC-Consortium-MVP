import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";

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
 *
 * A third, in-memory-only "claim" set closes a real race: `alreadyRelayed`
 * is a synchronous read, but the async work between checking it and
 * calling `recordRelayed` (fetching the thread, posting to GitHub) leaves
 * a window where two near-simultaneous replies in the same thread could
 * both pass the check before either finishes. `claimThread`/`releaseClaim`
 * give callers the same synchronous check-and-set `isDuplicateEvent`
 * already uses for `event_id`, applied to `thread_ts` instead.
 */
export class DedupeStore {
  private readonly seenEventIds = new Set<string>();
  private readonly claimedThreads = new Set<string>();
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
    // Write-then-rename rather than a direct writeFileSync, so a crash
    // mid-write can never leave a truncated/corrupt store file - rename
    // is atomic on the same filesystem, a partial write to the temp file
    // is not visible under the real path until it's complete.
    const tempPath = `${this.storePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.relayedThreads, null, 2));
    renameSync(tempPath, this.storePath);
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

  /** Synchronous check-and-set - call before any `await` in the same request. */
  claimThread(threadTs: string): boolean {
    if (this.claimedThreads.has(threadTs)) {
      return false;
    }
    this.claimedThreads.add(threadTs);
    return true;
  }

  /** Only for a path that did NOT relay anything, so a genuine retry isn't blocked forever. */
  releaseClaim(threadTs: string): void {
    this.claimedThreads.delete(threadTs);
  }

  recordRelayed(threadTs: string, issueNumber: string, relayedAt: string): void {
    this.relayedThreads[threadTs] = { issueNumber, relayedAt };
    this.persist();
  }
}
