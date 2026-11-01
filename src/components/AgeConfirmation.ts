"use client";

import { useState, useSyncExternalStore } from "react";

const KEY = "lumen_age_ok";
const CHANGED = "lfh:age-confirmed";

function readConfirmation() {
  try { return localStorage.getItem(KEY) === "1"; }
  catch { return false; }
}

function subscribe(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener(CHANGED, update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener(CHANGED, update);
  };
}

export function useAgeConfirmation() {
  const stored = useSyncExternalStore<boolean | undefined>(subscribe, readConfirmation, () => undefined);
  const [confirmedInSession, setConfirmedInSession] = useState(false);
  function confirm() {
    try { localStorage.setItem(KEY, "1"); } catch { /* Keep the choice in this session when storage is unavailable. */ }
    setConfirmedInSession(true);
    window.dispatchEvent(new Event(CHANGED));
  }
  return { confirmed: confirmedInSession || stored, confirm };
}
