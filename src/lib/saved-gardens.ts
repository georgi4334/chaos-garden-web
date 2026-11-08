"use client";

import { useSyncExternalStore } from "react";

/**
 * Gardens have no accounts, so the admin token lives in this browser's
 * localStorage. Anyone with access to this browser profile can use it.
 */
export interface SavedGarden {
  id: string;
  name: string;
  token: string;
}

const KEY = "chaos-garden:gardens";
const EMPTY: SavedGarden[] = [];
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cachedValue: SavedGarden[] = EMPTY;

function read(): SavedGarden[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // storage blocked: behave as empty
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedValue = Array.isArray(parsed) ? (parsed as SavedGarden[]) : EMPTY;
  } catch {
    cachedValue = EMPTY;
  }
  return cachedValue;
}

function write(value: SavedGarden[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // storage blocked: the garden still works until the page is closed
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useSavedGardens(): SavedGarden[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function saveGarden(garden: SavedGarden) {
  write([garden, ...read().filter((g) => g.id !== garden.id)]);
}

export function forgetGarden(id: string) {
  write(read().filter((g) => g.id !== id));
}
