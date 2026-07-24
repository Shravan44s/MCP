// ============================================
// Meme Ledger — no-repeat tracking for auto-posted
// memes. Backed by a JSON file committed to the repo
// by the auto-post GitHub Actions workflow (Vercel's
// serverless filesystem is ephemeral/read-only, so only
// the Actions script ever writes+commits this file).
// ============================================
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.resolve(__dirname, "../../data/posted-memes.json");
const DEFAULT_MAX_AGE_DAYS = 90;

interface LedgerEntry {
  id: string;
  source: string;
  category: string;
  postedAt: string; // ISO timestamp
}

export class MemeLedger {
  private entries: LedgerEntry[];

  constructor() {
    this.entries = this.load();
  }

  private load(): LedgerEntry[] {
    try {
      const raw = fs.readFileSync(LEDGER_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return []; // no ledger yet, or unreadable — start fresh
    }
  }

  has(id: string): boolean {
    return this.entries.some((e) => e.id === id);
  }

  add(id: string, source: string, category: string): void {
    if (this.has(id)) return;
    this.entries.push({ id, source, category, postedAt: new Date().toISOString() });
  }

  /** Categories used in the last N posts — for weighting variety away from recent repeats */
  recentCategories(count: number = 4): string[] {
    return this.entries
      .slice()
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
      .slice(0, count)
      .map((e) => e.category);
  }

  prune(maxAgeDays: number = DEFAULT_MAX_AGE_DAYS): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    this.entries = this.entries.filter((e) => new Date(e.postedAt).getTime() >= cutoff);
  }

  save(): void {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(this.entries, null, 2) + "\n");
  }
}
