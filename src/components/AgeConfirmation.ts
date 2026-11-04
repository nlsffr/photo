"use client";

import { useSyncExternalStore } from "react";

const KEY = "lumen_age_ok";
const CHANGED = "lfh:age-confirmed";
// Shared by every hook in this document, never persisted without a working store.
// Only an explicit confirm() can set it; an event alone grants nothing.
let confirmedWithoutStorage = false;

function readConfirmation() {
  try { return localStorage.getItem(KEY) === "1" || confirmedWithoutStorage; }
  catch { return confirmedWithoutStorage; }
}

function subscribe(update: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) confirmedWithoutStorage = false;
    update();
  };
  window.addEventListener("storage", storageChanged);
  window.addEventListener(CHANGED, update);
  return () => {
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(CHANGED, update);
  };
}

export function useAgeConfirmation() {
  const stored = useSyncExternalStore<boolean | undefined>(subscribe, readConfirmation, () => undefined);
  function confirm() {
    try {
      localStorage.setItem(KEY, "1");
      confirmedWithoutStorage = localStorage.getItem(KEY) !== "1";
    } catch { confirmedWithoutStorage = true; }
    window.dispatchEvent(new Event(CHANGED));
  }
  return { confirmed: stored, confirm };
}
