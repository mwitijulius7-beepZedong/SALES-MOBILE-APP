"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Tiny client cache with optimistic patches + invalidation            */
/* ------------------------------------------------------------------ */

type Listener = (mode: "refetch" | "cache") => void;

const store = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

function notify(key: string, mode: "refetch" | "cache") {
  listeners.get(key)?.forEach((cb) => cb(mode));
}

export function readCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function writeCache<T>(key: string, data: T) {
  store.set(key, data);
  notify(key, "cache");
}

export function patchCache<T>(key: string, updater: (prev: T) => T) {
  if (!store.has(key)) return;
  const prev = store.get(key) as T;
  store.set(key, updater(prev));
  notify(key, "cache");
}

/** Drop cached entries whose key starts with `prefix`; subscribed hooks refetch. */
export function invalidate(prefix = "") {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const [key, cbs] of listeners) {
    if (key.startsWith(prefix)) cbs.forEach((cb) => cb("refetch"));
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    method: rest.method ?? (json ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
    body: json ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return (data ?? {}) as T;
}

export function useResource<T>(key: string, path: string) {
  const [data, setData] = useState<T | undefined>(() => readCache<T>(key));
  const [loading, setLoading] = useState(() => !store.has(key));
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await api<T>(path);
      writeCache(keyRef.current, result);
      setData(result);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(!store.has(key));
    const fresh = store.get(key);
    if (fresh !== undefined) setData(fresh as T);
    const handler = (mode: "refetch" | "cache") => {
      if (mode === "cache") {
        setData(readCache<T>(key));
        return;
      }
      setLoading(true);
      void load();
    };
    let set = listeners.get(key);
    if (!set) {
      set = new Set();
      listeners.set(key, set);
    }
    set.add(handler);
    if (!store.has(key)) void load();
    return () => {
      set?.delete(handler);
    };
  }, [key, load]);

  /** Optimistic local update — instantly reflected, replaced by server data on invalidate(). */
  const update = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setData((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev as T) : updater;
        store.set(key, next);
        notify(key, "cache");
        return next;
      });
    },
    [key],
  );

  return { data, setData, loading, error, refetch: load, updatedAt };
}

export function useDebounced<T>(value: T, delay = 260) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Locks body scroll + closes on Escape. */
export function useDismissable(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}
