export type BotEventType =
  | "entry"
  | "exit"
  | "signal"
  | "blocked"
  | "info"
  | "error";

export interface BotEvent {
  type: BotEventType;
  message: string;
  time: number;
  data?: Record<string, unknown>;
}

export interface Notifier {
  notify(event: BotEvent): Promise<void>;
}
