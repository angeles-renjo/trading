import { promises as fs } from "node:fs";
import path from "node:path";
import type { AccountState } from "../types";
import type { AppConfig } from "../config";

// ---------------------------------------------------------------------------
// Persistence for the paper/live account state. A JSON file is plenty for a
// single-account bot; the Storage interface lets you swap in SQLite/Postgres
// later without touching the engine. Writes are atomic (temp file + rename)
// and serialised through a tiny in-process mutex to avoid lost updates.
// ---------------------------------------------------------------------------

export interface Storage {
  load(): Promise<AccountState>;
  save(state: AccountState): Promise<void>;
  reset(): Promise<AccountState>;
}

export function utcDay(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

export function createFreshAccount(cfg: AppConfig): AccountState {
  const now = Math.floor(Date.now() / 1000);
  return {
    cash: cfg.startingBalance,
    startingBalance: cfg.startingBalance,
    position: null,
    fills: [],
    createdAt: now,
    updatedAt: now,
    realizedPnlToday: 0,
    pnlDay: utcDay(now),
    halted: false,
  };
}

export class FileStorage implements Storage {
  private readonly file: string;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly cfg: AppConfig) {
    this.file = path.resolve(cfg.dataDir, "account.json");
  }

  /** Serialise operations so concurrent requests can't clobber each other. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async load(): Promise<AccountState> {
    return this.enqueue(async () => {
      try {
        const raw = await fs.readFile(this.file, "utf8");
        return JSON.parse(raw) as AccountState;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          const fresh = createFreshAccount(this.cfg);
          await this.writeFile(fresh);
          return fresh;
        }
        throw err;
      }
    });
  }

  async save(state: AccountState): Promise<void> {
    await this.enqueue(async () => {
      state.updatedAt = Math.floor(Date.now() / 1000);
      await this.writeFile(state);
    });
  }

  async reset(): Promise<AccountState> {
    return this.enqueue(async () => {
      const fresh = createFreshAccount(this.cfg);
      await this.writeFile(fresh);
      return fresh;
    });
  }

  private async writeFile(state: AccountState): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmp, this.file);
  }
}

let cached: Storage | null = null;

export function getStorage(cfg: AppConfig): Storage {
  if (!cached) cached = new FileStorage(cfg);
  return cached;
}
