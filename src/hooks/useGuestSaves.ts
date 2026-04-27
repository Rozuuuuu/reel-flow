import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "reelo:guest-saves";
const EVENT = "reelo:guest-saves-changed";

const read = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const write = (ids: string[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* quota or privacy mode — ignore */
  }
};

/**
 * Guest-only temporary saves persisted to localStorage.
 * Authenticated users should use a server-backed saves table instead.
 */
export const useGuestSaves = () => {
  const [ids, setIds] = useState<string[]>(() => read());

  useEffect(() => {
    const sync = () => setIds(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isSaved = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback((id: string) => {
    const current = read();
    const next = current.includes(id)
      ? current.filter((v) => v !== id)
      : [id, ...current].slice(0, 100); // cap to 100 to keep storage tiny
    write(next);
    return next.includes(id);
  }, []);

  const clear = useCallback(() => write([]), []);

  return { ids, isSaved, toggle, clear, count: ids.length };
};

export const readGuestSaves = read;
