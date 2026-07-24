# Deployment & Infrastructure

Production topology for LumenGallery — designed for **anonymity, DDoS
resilience, and a hardened attack surface**. The guiding rule: nothing
internal is ever reachable from the public internet. Only the edge is public.

**Current target stack (July 2026):**
- **Origin VPS**: Abelohost Storage Pro (~€39.99/mo) — 4 GB RAM, 2 CPU, 200 GB SAS, unmetered traffic, dedicated IPv4 (Netherlands)
- **Media storage**: Backblaze B2 (S3-compatible object storage, private buckets)
- **Edge / DDoS**: DDoS-Guard (or any equivalent no-log anti-DDoS you choose)
- **SQL**: MariaDB 11.x on the VPS (InnoDB encryption at rest)

```
                          Public Internet
                                │
                    ┌───────────▼────────────┐
                    │  Domain + DNS           │  WHOIS masked (Njalla etc.)
                    │  DNSSEC, no-log resolver│  Quad9 / registrar DNS
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   DDoS-Guard (edge)     │  Anti-DDoS + WAF + rate limit
                    │   Hides origin IP       │  (or equivalent no-log provider)
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Edge proxy (nginx)     │  TLS termination, HSTS,
                    │  on Abelohost VPS       │  rate limiting, bot filtering
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Next.js origin (Docker)│  non-root container, healthz
                    │  output: standalone     │  no direct public exposure
                    └───────────┬────────────┘
                                │  (internal docker network only)
      ┌─────────────┬───────────┼───────────┐
      │             │           │           │
 ┌────▼────┐  ┌─────▼────┐  ┌───▼────┐     │
 │ MariaDB │  │  Redis   │  │Elastic │     │
 │(encrypt)│  │ (cache)  │  │search  │     │
 └─────────┘  └──────────┘  └────────┘     │
                                           │
                              ┌────────────▼────────────┐
                              │  Backblaze B2 (private) │  media files
                              │  signed URLs / CDN      │  (external)
                              └─────────────────────────┘

  Observability (VPN-only):  Grafana + Prometheus + Loki (optional)
  Admin access:              WireGuard VPN + bastion + 2FA
```

## Non-negotiables (the "no weak link" rules)

1. **Origin IP is never exposed.** The only public DNS record points at
   DDoS-Guard (or your chosen edge). If the origin IP leaks the whole edge
   protection is bypassable. Mitigations:
   - Firewall the Abelohost VPS to accept traffic **only** from the DDoS
     provider's IP ranges on 80/443.
   - Use a **wildcard TLS cert** or a cert that does not name the origin, and
     avoid putting the origin hostname in any public DNS or cert SAN.
   - Monitor **certificate transparency logs** (crt.sh) for any cert that
     leaks an internal/origin hostname.

2. **Registry is never publicly reachable** (if you use Harbor or similar).
   Pushes come only from a self-hosted CI runner on the VPN network.

3. **Staging / dev / QA are not the weak link.** Non-prod environments are
   VPN-only, separate credentials, same hardening.

4. **Data stores have no public port.** MariaDB, Redis, Elasticsearch bind
   only to the internal docker network. In `docker-compose.prod.yml` they
   have **no published ports**.

5. **Secrets never live in the repo or images.** Use environment files or a
   secret store. `.env` is git-ignored; only `.env.example` is committed.

6. **Media buckets stay private.** Backblaze B2 buckets must never be public.
   Serve via signed expiring URLs or a CDN whose origin is the private B2
   bucket (CDN still behind the DDoS edge if possible).

## Environments

| Env       | Public? | DNS            | DB            | Media     | Access        |
|-----------|---------|----------------|---------------|-----------|---------------|
| dev       | no      | none           | local/compose | local MinIO | localhost/VPN |
| staging   | no      | internal only  | staging DB    | B2 (staging) | VPN only    |
| prod      | yes     | public → edge  | prod MariaDB  | B2 (prod) | edge + VPN admin |

## CI/CD runner placement

- **`ci.yml`** → GitHub-hosted runners. Build, typecheck, lint, docker build +
  healthcheck smoke test. **No secrets, no registry access.**
- **`deploy.yml`** → self-hosted runner **inside the VPN network** (or manual
  on the Abelohost VPS). Manually triggered. This is the only path that
  touches production credentials.

## TLS hardening (origin + edge)

- TLS 1.2 minimum (prefer 1.3), disable weak ciphers.
- HSTS with long max-age + preload.
- Hide server version headers (`server_tokens off` in nginx).
- OCSP stapling.
- Rotate certs via ACME (Let's Encrypt) with **DNS-01** challenge (so no
  public HTTP endpoint is needed and the origin hostname stays private).

## Database (MariaDB on Abelohost)

- MariaDB 11.4 with **InnoDB encryption at rest** (see `docs/DATABASE.md`).
- Read replica optional later.
- Encrypted, off-site backups (`mysqldump | gpg`) → store on another B2 bucket
  or encrypted remote.

## Media storage — Backblaze B2

1. Create a **private** B2 bucket (never public).
2. Create an Application Key limited to that bucket (read + write).
3. Put the Key ID / Application Key / region / endpoint in `.env.prod`.
4. Endpoint example: `https://s3.us-west-004.backblazeb2.com`
5. Media is referenced by URL in the `photos` table (`image_url`, `video_url`).
   When you add upload endpoints later, use any S3-compatible client
   (`@aws-sdk/client-s3` with custom endpoint + path-style).

## Abelohost VPS specifics

- Storage Pro plan is sufficient for the app + MariaDB + Redis + light ES.
- Keep Elasticsearch memory low (`ES_JAVA_OPTS=-Xms512m -Xmx512m`) so the
  4 GB RAM is not exhausted.
- Full-disk encryption (LUKS) recommended at install time.
- Firewall (ufw): default deny; allow SSH only over WireGuard; allow 80/443
  only from your DDoS provider IP ranges.

## Monitoring

- Optional Grafana + Prometheus + Loki (VPN-only).
- The app exposes `/api/healthz` (liveness) and `/api/readyz` (readiness).

## Local development

```bash
cp .env.example .env      # fill in dev values (MinIO still used locally)
docker compose up -d      # app + mariadb + redis + elasticsearch + minio
# app on http://localhost:3000
# minio console on http://localhost:9001 (dev only)
```

## Production start (Abelohost)

```bash
# On the VPS (after cloning / pulling the image)
cp .env.example .env.prod
# Edit .env.prod → real B2 keys, strong DB passwords, etc.
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```
