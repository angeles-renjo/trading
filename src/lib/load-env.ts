import { readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Minimal .env loader for the standalone CLI scripts (the Next.js app loads
// env files on its own). Reads .env.local then .env from the project root.
// Existing process.env values always win. No external dependency.
// ---------------------------------------------------------------------------

function parseAndApply(file: string): void {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return; // file absent — fine
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = process.cwd();
parseAndApply(path.join(root, ".env.local"));
parseAndApply(path.join(root, ".env"));
