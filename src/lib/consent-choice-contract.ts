import { isChoice, type Choice } from "./audience-choice";
import { AD_CONSENT_VERSION } from "./ads-contract";

/** Omitting advertisingChoice updates analytics alone, never advertising consent. */
export interface ConsentChoiceRequest {
  choice: Choice;
  advertisingChoice?: Choice;
  ageConfirmed?: boolean;
  version?: typeof AD_CONSENT_VERSION;
}

export function isConsentChoiceRequest(value: unknown): value is ConsentChoiceRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return !Object.keys(input).some(key => !["choice", "advertisingChoice", "ageConfirmed", "version"].includes(key))
    && isChoice(input.choice)
    && (!("advertisingChoice" in input) || isChoice(input.advertisingChoice))
    && (!("ageConfirmed" in input) || typeof input.ageConfirmed === "boolean")
    && (!("version" in input) || (input.version === AD_CONSENT_VERSION && "advertisingChoice" in input))
    && (input.advertisingChoice !== "accepted" || input.ageConfirmed === true);
}
