/** Compact number: 1234 -> "1,2 k", 1_200_000 -> "1,2 M" (fr formatting). */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(".", ",")} k`;
  return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
}

/** Seconds to "m:ss", e.g. 83 -> "1:23". */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Relative age from a minutes offset, e.g. "il y a 3 h", "il y a 2 j". */
export function formatAge(ageMinutes: number): string {
  if (ageMinutes < 1) return "à l’instant";
  if (ageMinutes < 60) return `il y a ${ageMinutes} min`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${Math.floor(months / 12)} an${months >= 24 ? "s" : ""}`;
}
