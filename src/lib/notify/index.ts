import type { AppConfig } from "../config";
import type { BotEvent, Notifier } from "./types";

export * from "./types";

const ICONS: Record<BotEvent["type"], string> = {
  entry: "🟢",
  exit: "🔴",
  signal: "📈",
  blocked: "⛔",
  info: "ℹ️ ",
  error: "❌",
};

function stamp(ev: BotEvent): string {
  const t = new Date(ev.time * 1000).toISOString().replace("T", " ").slice(0, 19);
  return `${ICONS[ev.type] ?? ""} [${t}] ${ev.message}`;
}

export class ConsoleNotifier implements Notifier {
  async notify(event: BotEvent): Promise<void> {
    const line = stamp(event);
    if (event.type === "error") console.error(line);
    else console.log(line);
  }
}

/** Posts to a generic webhook. Shape is friendly to Discord (`content`) and
 *  Slack (`text`) while also including the structured event. */
export class WebhookNotifier implements Notifier {
  constructor(private readonly url: string) {}

  async notify(event: BotEvent): Promise<void> {
    const body = JSON.stringify({
      content: stamp(event),
      text: stamp(event),
      event,
    });
    await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  }
}

export class CompositeNotifier implements Notifier {
  constructor(private readonly children: Notifier[]) {}
  async notify(event: BotEvent): Promise<void> {
    await Promise.allSettled(this.children.map((c) => c.notify(event)));
  }
}

export function createNotifier(cfg: AppConfig): Notifier {
  const children: Notifier[] = [new ConsoleNotifier()];
  if (cfg.webhookUrl) children.push(new WebhookNotifier(cfg.webhookUrl));
  return new CompositeNotifier(children);
}
