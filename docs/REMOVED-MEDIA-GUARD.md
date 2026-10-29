# Removed-media nginx guard

This guard makes removed creator and media assets return `410` before the R2
proxy is reached. The request path uses nginx maps in memory: MariaDB is read
once per timer run, never once per asset. It does not delete any R2 object and
does not stop, restart, disable, or otherwise change an ingestion bot.

## Production layout

The current edge is the manually-created `photo-edge-1` container
(`nginx:1.27-alpine`, restart `unless-stopped`, network
`photo_lumen-internal`, ports 80/443). Its configuration is currently bound
from `/tmp/nginx-edge.conf`. `/tmp` is not a durable configuration location and
the running container has no bind for a generated map.

Before changing that container, save its exact effective configuration. Do not
infer missing environment, labels, mounts, entrypoint, or networking options:

```bash
install -d -m 0750 /opt/photo/infra/nginx/generated /opt/photo/ops
docker inspect photo-edge-1 > /opt/photo/infra/nginx/photo-edge-1.inspect.json
docker inspect --format '{{json .HostConfig}}' photo-edge-1
docker inspect --format '{{json .Config}}' photo-edge-1
cp -a /tmp/nginx-edge.conf /opt/photo/infra/nginx/default.conf
install -m 0750 ops/refresh-removed-media-map.py /opt/photo/ops/refresh-removed-media-map.py
install -m 0640 infra/nginx/generated/removed-media-maps.conf \
  /opt/photo/infra/nginx/generated/removed-media-maps.conf
```

In the HTTP context of `/opt/photo/infra/nginx/default.conf` (the file is
loaded from `conf.d`, so immediately before its `server` blocks is valid), add:

```nginx
include /etc/nginx/generated/removed-media-maps.conf;
```

Inside **both** HTTP and HTTPS `location /media/` blocks, before `proxy_pass`,
add:

```nginx
if ($media_tombstoned = 1) { return 410; }
add_header Cache-Control $media_cache_control always;
add_header X-Robots-Tag $media_robots_tag always;
```

Remove any older hard-coded media `Cache-Control` line. Active assets now have
a five-minute cache TTL; a tombstone response is `no-store` and `noindex`.

## Validate before replacing the edge container

Adding the generated-directory bind requires a container replacement. First
run a disposable config check with the same image, network, config, certificate
mount, and generated map mounts recorded by `docker inspect`:

```bash
docker run --rm --name photo-edge-config-check \
  --network photo_lumen-internal \
  -v /opt/photo/infra/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro \
  -v /opt/photo/infra/nginx/certs:/etc/nginx/certs:ro \
  -v /opt/photo/infra/nginx/generated:/etc/nginx/generated:ro \
  nginx:1.27-alpine nginx -t
```

Only after that succeeds, reproduce **all** options found in the saved inspect
output while moving the config bind from `/tmp/nginx-edge.conf` to
`/opt/photo/infra/nginx/default.conf` and adding the generated-directory bind.
Keep the stopped old container under a rollback name until HTTP, HTTPS, R2
proxying, `410` handling, and `docker exec photo-edge-1 nginx -t` are verified.
This repository deliberately does not automate that one-time replacement,
because losing an unrecorded mount or network option would take the edge down.

## Timer activation

The generator validates the candidate inside the real edge container and only
then reloads it. A failed database query, `nginx -t`, or reload restores the
previous file atomically.

```bash
install -m 0644 infra/systemd/leakfanhub-media-tombstones.service /etc/systemd/system/
install -m 0644 infra/systemd/leakfanhub-media-tombstones.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start leakfanhub-media-tombstones.service
systemctl enable --now leakfanhub-media-tombstones.timer
systemctl status leakfanhub-media-tombstones.service --no-pager
systemctl list-timers leakfanhub-media-tombstones.timer --no-pager
```

The default database is `leakfanhub`. Override it with
`MEDIA_TOMBSTONE_DATABASE` in a systemd drop-in if production uses another
schema name. The root password stays inside the MariaDB container; it is never
copied to the map, command output, or repository.

## DDoS-Guard cache limitation

The origin cannot invalidate an already cached DDoS-Guard `200` response.
There is currently no configured DDoS-Guard API de purge, so this change does
not pretend to purge that external cache. Reducing the origin media TTL from
one day to five minutes limits future stale windows after the edge honors the
new header, but objects cached earlier can survive until their old TTL expires.
Configure and test the provider's authenticated purge API separately before
claiming immediate external-cache removal.
