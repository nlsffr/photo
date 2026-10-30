export type PremiumOrderStatus =
  | "pending"
  | "claimed"
  | "invoice_sent"
  | "paid"
  | "expired"
  | "failed"
  | "refunded";

const ORDER_STATUSES = new Set<PremiumOrderStatus>([
  "pending",
  "claimed",
  "invoice_sent",
  "paid",
  "expired",
  "failed",
  "refunded",
]);

export function parseOrderStatus(value: unknown): PremiumOrderStatus {
  return typeof value === "string" && ORDER_STATUSES.has(value as PremiumOrderStatus)
    ? (value as PremiumOrderStatus)
    : "failed";
}

export function shouldPollOrder(status: PremiumOrderStatus): boolean {
  return status === "pending" || status === "claimed" || status === "invoice_sent";
}
