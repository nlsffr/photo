import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
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

test("nginx, systemd, and the runbook wire the generated guard without touching bots", async () => {
  const [nginx, service, timer, runbook, baseline] = await Promise.all(
    [
      "../infra/nginx/nginx.conf",
      "../infra/systemd/leakfanhub-media-tombstones.service",
      "../infra/systemd/leakfanhub-media-tombstones.timer",
      "../docs/REMOVED-MEDIA-GUARD.md",
      "../infra/nginx/generated/removed-media-maps.conf",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  assert.match(nginx, /include \/etc\/nginx\/generated\/removed-media-maps\.conf;/);
  assert.equal((nginx.match(/if \(\$media_tombstoned = 1\)/g) ?? []).length, 2);
  assert.doesNotMatch(nginx, /max-age=86400/);
  assert.ok((nginx.match(/\$media_cache_control always/g) ?? []).length >= 2);
  assert.match(service, /refresh-removed-media-map\.py/);
  assert.match(service, /\/opt\/photo\/infra\/nginx\/generated/);
  assert.match(timer, /OnUnitActiveSec=1min/);
  assert.match(runbook, /photo-edge-1/);
  assert.match(runbook, /docker inspect/);
  assert.match(runbook, /\/tmp\/nginx-edge\.conf/);
  assert.match(runbook, /\/opt\/photo\/infra\/nginx/);
  assert.match(runbook, /DDoS-Guard/);
  assert.match(runbook, /API de purge/i);
  assert.doesNotMatch(service + timer + runbook, /megabot.*(stop|disable|delete)/i);
  assert.match(baseline, /default 0;/);
});
