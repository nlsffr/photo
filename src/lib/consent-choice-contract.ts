import { isChoice, type Choice } from "./audience-choice";

/** Omitting advertisingChoice updates analytics alone, never advertising consent. */
export interface ConsentChoiceRequest {
  choice: Choice;
  advertisingChoice?: Choice;
  ageConfirmed?: boolean;
}

export function isConsentChoiceRequest(value: unknown): value is ConsentChoiceRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return !Object.keys(input).some(key => !["choice", "advertisingChoice", "ageConfirmed"].includes(key))
    && isChoice(input.choice)
    && (!("advertisingChoice" in input) || isChoice(input.advertisingChoice))
    && (!("ageConfirmed" in input) || typeof input.ageConfirmed === "boolean")
    && (input.advertisingChoice !== "accepted" || input.ageConfirmed === true);
}
