"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data;
}

export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/** Poll a JSON endpoint on an interval, with manual refresh. */
export function usePolling<T>(url: string, intervalMs = 5000): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const tick = useRef(0);

  const load = useCallback(async () => {
    const myTick = ++tick.current;
    try {
      const json = await fetchJson<T>(url);
      if (myTick === tick.current) {
        setData(json);
        setError(null);
      }
    } catch (e) {
      if (myTick === tick.current) setError((e as Error).message);
    } finally {
      if (myTick === tick.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);
    return () => clearInterval(id);
  }, [load, intervalMs]);

  return { data, error, loading, refresh: load };
}
