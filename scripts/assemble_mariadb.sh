#!/bin/bash
set -e
cd "$(dirname "$0")/.."
cat scripts/mariadb.b64.* | base64 -d > src/lib/providers/mariadb.ts
wc -l src/lib/providers/mariadb.ts
grep -q "lim + 1" src/lib/providers/mariadb.ts && echo OK
