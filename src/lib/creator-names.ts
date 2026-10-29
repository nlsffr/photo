export function verifiedCreatorNames(handle: string, displayName: string, verifiedAliases: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of [handle, displayName, ...verifiedAliases]) {
    if (typeof value !== "string") continue;
    const name = value.trim();
    const key = name.toLocaleLowerCase();
    if (name && !seen.has(key)) { seen.add(key); names.push(name); }
  }
  return names;
}
