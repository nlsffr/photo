import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const SCRIPT = join(ROOT, "ops/refresh-removed-media-map.py");

function refresh(
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  return spawnSync("python3", [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("the generated nginx maps block removed creators and individual media only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "removed-media-map-"));
  const fixture = join(dir, "fixture.json");
  const output = join(dir, "removed-media-maps.conf");
  const lock = join(dir, "refresh.lock");
  const docker = join(dir, "docker");
  const log = join(dir, "docker.log");

  await writeFile(
    docker,
    `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
if [ "$FAKE_NGINX_TEST_FAIL" = "1" ] && [ "$4" = "-t" ]; then exit 1; fi
exit 0
`,
    "utf8",
  );
  await chmod(docker, 0o755);

  const data = {
    creators: [
      {
        handle: "pinkchyu",
        removedFromIndexAt: "2026-10-29T00:00:00Z",
        avatarUrl: "/media/creators/pinkchyu/avatar.webp",
      },
      {
        handle: "activecreator",
        removedFromIndexAt: null,
        avatarUrl: "/media/creators/activecreator/avatar.webp",
      },
      {
        handle: 'evil"; include /tmp/pwned;',
        removedFromIndexAt: "2026-10-29T00:00:00Z",
        avatarUrl: "/media/unsafe/avatar.webp",
      },
    ],
    photos: [
      {
        removedFromIndexAt: "2026-10-29T00:00:00Z",
        creatorRemovedFromIndexAt: null,
        imageUrl: "/media/creators/activecreator/removed.webp?ignored=1",
        videoUrl: "https://leakfanhub.com/media/shared/removed.mp4",
      },
      {
        removedFromIndexAt: null,
        creatorRemovedFromIndexAt: null,
        imageUrl: "/media/creators/activecreator/active.webp",
      },
      {
        removedFromIndexAt: "2026-10-29T00:00:00Z",
        creatorRemovedFromIndexAt: null,
        imageUrl: "https://evil.example/media/not-ours.webp",
      },
    ],
  };
  await writeFile(fixture, JSON.stringify(data), "utf8");

  const args = [
    "--fixture", fixture,
    "--output", output,
    "--lock-file", lock,
    "--docker-bin", docker,
    "--edge-container", "photo-edge-1",
    "--allowed-host", "leakfanhub.com",
  ];
  const env = { FAKE_DOCKER_LOG: log };
  const first = refresh(args, env);
  assert.equal(first.status, 0, first.stderr);

  const generated = await readFile(output, "utf8");
  assert.match(generated, /"pinkchyu" 1;/);
  assert.match(generated, /"\/media\/unsafe\/avatar\.webp" 1;/);
  assert.match(generated, /"\/media\/creators\/activecreator\/removed\.webp" 1;/);
  assert.match(generated, /"\/media\/shared\/removed\.mp4" 1;/);
  assert.doesNotMatch(generated, /activecreator" 1;/);
  assert.doesNotMatch(generated, /active\.webp/);
  assert.doesNotMatch(generated, /not-ours\.webp/);
  assert.doesNotMatch(generated, /include \/tmp\/pwned/);
  assert.match(generated, /map \$media_tombstone_state \$media_cache_control/);
  assert.match(generated, /no-store, max-age=0/);

  const afterFirst = await readFile(log, "utf8");
  assert.match(afterFirst, /exec photo-edge-1 nginx -t -q/);
  assert.match(afterFirst, /exec photo-edge-1 nginx -s reload/);

  const second = refresh(args, env);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(await readFile(log, "utf8"), afterFirst, "unchanged maps must not reload nginx");

  data.photos.push({
    removedFromIndexAt: "2026-10-29T00:05:00Z",
    creatorRemovedFromIndexAt: null,
    imageUrl: "/media/newly-removed.webp",
  });
  await writeFile(fixture, JSON.stringify(data), "utf8");
  const failed = refresh(args, { ...env, FAKE_NGINX_TEST_FAIL: "1" });
  assert.notEqual(failed.status, 0);
  assert.equal(await readFile(output, "utf8"), generated, "a failed nginx test must roll back atomically");
  const afterFailure = await readFile(log, "utf8");
  assert.equal((afterFailure.match(/nginx -s reload/g) ?? []).length, 1);
});

test("the database URL is decoded but its host is overridden without leaking credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "removed-media-db-"));
  const modules = join(dir, "modules");
  const mysqlPackage = join(modules, "mysql");
  const output = join(dir, "removed-media-maps.conf");
  const lock = join(dir, "refresh.lock");
  const docker = join(dir, "docker");
  const mysqlLog = join(dir, "mysql.json");

  await mkdir(mysqlPackage, { recursive: true });
  await writeFile(join(mysqlPackage, "__init__.py"), "", "utf8");
  await writeFile(
    join(mysqlPackage, "connector.py"),
    `import json
import os

class Cursor:
    def execute(self, query):
        assert "removed_from_index_at IS NOT NULL" in query
        assert "HEX(" not in query
    def fetchall(self):
        return [
            ("creator", "pinkchyu", "/media/creators/pinkchyu/avatar.webp", None),
            ("photo", "", "/media/removed-from-db.webp", None),
        ]
    def close(self):
        pass

class Connection:
    def cursor(self):
        return Cursor()
    def close(self):
        pass

def connect(**kwargs):
    assert kwargs["host"] == "127.0.0.1"
    assert kwargs["port"] == 3307
    assert kwargs["user"] == "db-user"
    assert kwargs["password"] == "p@ss"
    assert kwargs["database"] == "leakfanhub"
    with open(os.environ["FAKE_MYSQL_LOG"], "w", encoding="utf-8") as stream:
        json.dump({
            "host": kwargs["host"],
            "port": kwargs["port"],
            "user": kwargs["user"],
            "database": kwargs["database"],
            "passwordPresent": bool(kwargs["password"]),
        }, stream)
    return Connection()
`,
    "utf8",
  );
  await writeFile(docker, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(docker, 0o755);

  const result = refresh(
    [
      "--output", output,
      "--lock-file", lock,
      "--docker-bin", docker,
      "--database-host", "127.0.0.1",
      "--database-port", "3307",
    ],
    {
      PYTHONPATH: modules,
      DATABASE_URL: "mysql://db%2Duser:p%40ss@db-internal:3306/leakfanhub?charset=utf8mb4",
      FAKE_MYSQL_LOG: mysqlLog,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(output, "utf8"), /"pinkchyu" 1;/);
  assert.match(await readFile(output, "utf8"), /"\/media\/removed-from-db\.webp" 1;/);
  assert.deepEqual(JSON.parse(await readFile(mysqlLog, "utf8")), {
    host: "127.0.0.1",
    port: 3307,
    user: "db-user",
    database: "leakfanhub",
    passwordPresent: true,
  });
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /p%40ss|p@ss|db-internal|db-user/);
});

test("nginx, systemd, and the runbook wire the generated guard without touching bots", async () => {
  const [nginx, service, timer, runbook, baseline, requirements] = await Promise.all(
    [
      "../infra/nginx/nginx.conf",
      "../infra/systemd/leakfanhub-media-tombstones.service",
      "../infra/systemd/leakfanhub-media-tombstones.timer",
      "../docs/REMOVED-MEDIA-GUARD.md",
      "../infra/nginx/generated/removed-media-maps.conf",
      "../ops/requirements-media-tombstones.txt",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  assert.match(nginx, /include \/etc\/nginx\/generated\/removed-media-maps\.conf;/);
  assert.equal((nginx.match(/if \(\$media_tombstoned = 1\)/g) ?? []).length, 2);
  assert.doesNotMatch(nginx, /max-age=86400/);
  assert.ok((nginx.match(/\$media_cache_control always/g) ?? []).length >= 2);
  assert.match(service, /refresh-removed-media-map\.py/);
  assert.match(service, /\/opt\/photo\/infra\/nginx\/generated/);
  assert.match(service, /EnvironmentFile=-\/opt\/photo\/\.env/);
  assert.match(service, /EnvironmentFile=-\/opt\/photo\/\.env\.prod/);
  assert.match(service, /--database-host 127\.0\.0\.1/);
  assert.match(service, /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6/);
  assert.doesNotMatch(service, /database-container|MARIADB_ROOT_PASSWORD/);
  assert.match(timer, /OnUnitActiveSec=1min/);
  assert.match(runbook, /photo-edge-1/);
  assert.match(runbook, /docker inspect/);
  assert.match(runbook, /\/tmp\/nginx-edge\.conf/);
  assert.match(runbook, /\/opt\/photo\/infra\/nginx/);
  assert.match(runbook, /DDoS-Guard/);
  assert.match(runbook, /API de purge/i);
  assert.doesNotMatch(service + timer + runbook, /megabot.*(stop|disable|delete)/i);
  assert.match(baseline, /default 0;/);
  assert.match(requirements, /mysql-connector-python/);
});
