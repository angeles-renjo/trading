import type { ReactNode } from "react";

export function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "up" | "down";
}) {
  const color =
    tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-gray-100";
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${color}`}>{value}</div>
      {sub != null && <div className="tabular mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "up" | "down" | "warn" | "live";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-line text-gray-300",
    up: "bg-up/15 text-up",
    down: "bg-down/15 text-down",
    warn: "bg-amber-500/15 text-amber-400",
    live: "bg-down/20 text-down ring-1 ring-down/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "primary";
}) {
  const tones: Record<string, string> = {
    default: "border-line bg-panel-soft hover:bg-line",
    primary: "border-blue-500/40 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25",
    danger: "border-down/40 bg-down/10 text-down hover:bg-down/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function gradeTone(grade: string): "up" | "warn" | "neutral" {
  if (grade === "A+") return "up";
  if (grade === "A") return "warn";
  return "neutral";
}
