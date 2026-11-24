"use client";

import { useSyncExternalStore } from "react";
import { COMPARE_STORAGE_KEY, parseCompareSlugs, toggleCompare } from "@/lib/compare/slugs";

// Client-side compare list (max 4 slugs) in localStorage, shared by every toggle and the sticky bar.
const listeners = new Set<() => void>();
let cache: string[] | null = null;
const EMPTY: string[] = [];

function read(): string[] {
  if (cache) return cache;
  try {
    cache = parseCompareSlugs(window.localStorage.getItem(COMPARE_STORAGE_KEY) ?? "");
  } catch {
    cache = [];
  }
  return cache;
}

function write(list: string[]) {
  cache = list;
  try {
    window.localStorage.setItem(COMPARE_STORAGE_KEY, list.join(","));
  } catch {
    // Private mode / blocked storage: keep the in-memory list for this page.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === COMPARE_STORAGE_KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCompareList(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Returns false when the list is full (the slug was not added). */
export function toggleCompareSlug(slug: string): boolean {
  const { list, full } = toggleCompare(read(), slug);
  if (!full) write(list);
  return !full;
}

export function clearCompare() {
  write([]);
}
