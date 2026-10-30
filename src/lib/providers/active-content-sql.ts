const SAFE_ALIAS = /^[A-Za-z][A-Za-z0-9_]*$/;

function sqlAlias(alias: string): string {
  if (!SAFE_ALIAS.test(alias)) throw new Error("invalid_sql_alias");
  return alias;
}
export function activeCreatorSql(creatorAlias = "c"): string {
  const creator = sqlAlias(creatorAlias);
  return `${creator}.removed_from_index_at IS NULL AND ${creator}.is_hidden = 0`;
}

export function activeMediaSql(
  photoAlias = "p",
  creatorAlias = "c",
): string {
  const photo = sqlAlias(photoAlias);
  return `${photo}.removed_from_index_at IS NULL AND ${activeCreatorSql(creatorAlias)} AND ${photo}.is_hidden = 0`;
}
