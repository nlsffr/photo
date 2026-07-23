# Deployment & Infrastructure

Production topology for LumenGallery — designed for **anonymity, DDoS
resilience, and a hardened attack surface**. The guiding rule: nothing
internal is ever reachable from the public internet. Only the edge is public.

```
                          Public Internet
                                │
                    ┌───────────▼────────────┐
                    │  Domain (.bs) + DNS     │  WHOIS masked (Njalla)
                    │  DNSSEC, no-log resolver│  Quad9 / registrar DNS
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   DDoS-Guard (edge)     │  Anti-DDoS + WAF + rate limit
                    │   Hides origin IP       │  (NOT Cloudflare)
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Edge proxy (nginx/     │  TLS termination, HSTS,
                    │  HAProxy)               │  rate limiting, bot filtering
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Next.js origin (Docker)│  non-root container, healthz
                    │  output: standalone     │  no direct public exposure
                    └───────────┬────────────┘
                                │  (VPN-only internal network)
      ┌─────────────┬───────────┼───────────┬──────────────┐
      │             │           │           │              │
 ┌────▼────┐  ┌─────▼────┐  ┌───▼────┐  ┌───▼─────┐  ┌─────▼──────┐
 │ MariaDB │  │  Redis   │  │Elastic │  │  Minio  │  │   Harbor   │
 │(encrypt)│  │ (cache)  │  │search  │  │(S3, priv)│  │ (registry) │
 └─────────┘  └──────────┘  └────────┘  └────┬────┘  └────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  Media CDN       │  behind DDoS-Guard
                                    │  (signed URLs)   │  private origin
                                    └──────────────────┘

  Observability (VPN-only):  Grafana + Prometheus + Loki
  Admin access:              WireGuard VPN + bastion host + 2FA
```

## Non-negotiables (the "no weak link" rules)

1. **Origin IP is never exposed.** The only public DNS record points at
   DDoS-Guard. If the origin IP leaks (via TLS cert transparency logs,
   misconfigured subdomain, email headers, etc.) the whole edge protection
   is bypassable. Mitigations:
   - Firewall the origin to accept traffic **only** from DDoS-Guard's IP ranges.
   - Use a **wildcard TLS cert** or a cert that does not name the origin, and
     avoid putting the origin hostname in any public DNS or cert SAN.
   - Monitor **certificate transparency logs** (crt.sh) for any cert that
     leaks an internal/origin hostname.

2. **Registry (Harbor) is never publicly reachable.** It lives on the
   VPN-only network. Pushes come **only** from a self-hosted CI runner on that
   same network (`.github/workflows/deploy.yml`, `runs-on: self-hosted-vpn`),
   triggered manually. The public GitHub-hosted CI (`ci.yml`) only *builds and
   smoke-tests* the image — it never has registry credentials.

3. **Staging / dev / QA are not the weak link.** Non-prod environments are a
   common breach vector. Therefore:
   - Every non-prod environment is **VPN-only** (no public DNS, no public
     ingress). Reachable only over WireGuard.
   - Non-prod uses **separate credentials and separate databases** — a leaked
     staging secret must be useless against prod.
   - Non-prod has the **same hardening** as prod (non-root containers, no
     exposed data stores). No "it's just staging" shortcuts.

4. **Data stores have no public port.** MariaDB, Redis, Elasticsearch, Minio
   bind only to the internal network. In `docker-compose.yml` they have **no
   published ports** (except Minio's console on `127.0.0.1` for local dev only).

5. **Secrets never live in the repo or images.** Use HashiCorp Vault (or the
   orchestrator's secret store). `.env` is git-ignored; only `.env.example`
   (no real values) is committed. CI reads secrets from GitHub Environments.

## Environments

| Env       | Public? | DNS            | DB            | Access        |
|-----------|---------|----------------|---------------|---------------|
| dev       | no      | none           | local/compose | localhost/VPN |
| staging   | no      | internal only  | staging DB    | VPN only      |
| qa        | no      | internal only  | qa DB         | VPN only      |
| prod      | yes     | public → edge  | prod DB       | edge + VPN admin |

## CI/CD runner placement

- **`ci.yml`** → GitHub-hosted runners. Build, typecheck, lint, docker build +
  healthcheck smoke test. **No secrets, no registry access.**
- **`deploy.yml`** → self-hosted runner **inside the VPN network** next to
  Harbor. Manually triggered (`workflow_dispatch`). Builds, pushes to Harbor,
  rolls out. This is the only path that touches the registry.

## TLS hardening (origin + edge)

- TLS 1.2 minimum (prefer 1.3), disable weak ciphers.
- HSTS with long max-age + preload.
- Hide server version headers (`server_tokens off` in nginx).
- OCSP stapling.
- Rotate certs via ACME (Let's Encrypt) with **DNS-01** challenge (so no
  public HTTP endpoint is needed and the origin hostname stays private).

## Database

- MariaDB with **InnoDB encryption at rest** (see `docs/DATABASE.md`).
- Read replica for failover.
- Encrypted, off-site backups (`mysqldump | gpg`).

## Media storage + CDN

- Minio buckets are **private by default** (a public/misconfigured S3 bucket is
  the classic catastrophic leak — never set a bucket public).
- Media served via **signed, expiring URLs** through a CDN whose origin is the
  private Minio, and the CDN itself sits behind DDoS-Guard.

## Monitoring

- Grafana dashboards (VPN-only), Prometheus metrics, Loki logs.
- Alerts routed to Proton Mail / an encrypted channel.
- The app exposes `/api/healthz` (liveness) and `/api/readyz` (readiness).

## Local development

```bash
cp .env.example .env      # fill in dev values
docker compose up -d      # app + mariadb + redis + elasticsearch + minio
# app on http://localhost:3000
# minio console on http://localhost:9001 (dev only)
```
