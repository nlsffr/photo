#!/usr/bin/env bash
set -euo pipefail

budget="${CONNECTION_BUDGET:-32}"
container="${MARIADB_CONTAINER:-photo-mariadb-1}"
app_container="${APP_CONTAINER:-photo-app-1}"
credentials_file="${MARIADB_CREDENTIALS_FILE:-/opt/photo/dmca/.env}"

if ! [[ "$budget" =~ ^[0-9]+$ ]]; then
  echo "CONNECTION_BUDGET must be a non-negative integer" >&2
  exit 2
fi

app_ip="$({
  docker inspect "$app_container" \
    --format '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}'
} | grep '^172\.20\.' | head -n 1)"

if [[ -z "$app_ip" ]]; then
  echo "Unable to determine the application IP on the MariaDB network" >&2
  exit 3
fi

set -a
# shellcheck disable=SC1090
. "$credentials_file"
set +a

connections="$(
  docker exec \
    -e QUERY_PASS="$MARIADB_ROOT_PASSWORD" \
    -e APP_IP="$app_ip" \
    "$container" \
    sh -lc 'mariadb --protocol=socket -uroot -p"$QUERY_PASS" --batch --skip-column-names -e \
      "SELECT COUNT(*) FROM information_schema.PROCESSLIST
       WHERE SUBSTRING_INDEX(HOST, \":\", 1) = \"$APP_IP\";"' \
    2>/dev/null
)"

printf 'application_connections=%s budget=%s\n' "$connections" "$budget"

if (( connections > budget )); then
  echo "MariaDB application connection budget exceeded" >&2
  exit 1
fi
