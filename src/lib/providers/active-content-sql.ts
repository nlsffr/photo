const SAFE_ALIAS = /^[A-Za-z][A-Za-z0-9_]*$/;

function sqlAlias(alias: string): string {
  if (!SAFE_ALIAS.test(alias)) throw new Error("invalid_sql_alias");
  return alias;
}
export function activeCreatorSql(creatorAlias = "c"): string {
  return `${sqlAlias(creatorAlias)}.removed_from_index_at IS NULL`;
}

export function activeMediaSql(
  photoAlias = "p",
  creatorAlias = "c",
): string {
  return `${sqlAlias(photoAlias)}.removed_from_index_at IS NULL AND ${activeCreatorSql(creatorAlias)}`;
}
