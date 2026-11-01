"use client";
import { useEffect, useState } from "react";
import { AUDIENCE_COOKIE, isChoice, type Choice } from "@/lib/audience-choice";

export const OPEN_CHOICES = "lfh:cookie-settings";
export const CHOICE_CHANGED = "lfh:audience-changed";
export function browserChoice(): Choice | null {
  const entry = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(AUDIENCE_COOKIE + "="));
  const value = entry?.slice(AUDIENCE_COOKIE.length + 1);
  return isChoice(value) ? value : null;
}
export function useAudienceChoice() {
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined);
  useEffect(() => {
    const update = () => setChoice(browserChoice());
    update();
    window.addEventListener(CHOICE_CHANGED, update);
    window.addEventListener("storage", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener(CHOICE_CHANGED, update);
      window.removeEventListener("storage", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return choice;
}
