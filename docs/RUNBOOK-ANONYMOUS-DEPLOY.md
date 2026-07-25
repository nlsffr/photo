# Runbook — Anonymous, Untraceable Deployment (A → Z)

This is the end-to-end procedure to deploy LumenGallery so that **neither the
operator nor the visitors are traceable**, and there is **no single weak link**.
Follow it in order. Each step lists *why* it matters for untraceability.

> Scope note: this covers infrastructure/operational anonymity for a
> legitimate platform (content you have the rights to). It is not a tool for
> hiding illegal activity.

**Current recommended stack:**
- Origin: **Parkinhost Russia Dedicated** (~€110/mo, Moscow, 2×16 TB HDD)
- Media: **Self-hosted MinIO** on the same server (most anonymous)
- Edge: **DDoS-Guard Website Protection** (hides origin IP + strong DDoS)
- Admin: Mullvad / WireGuard + SSH keys only

---

## 0. Threat model (what we defend against)

- **Origin-IP discovery** → attacker DDoSes or subpoenas the host directly.
- **Log/metadata retention** → a seized disk reveals who visited what.
- **Operator de-anonymisation** → payment trails, WHOIS, SSH from home IP.
- **Non-prod leaks** → staging/registry become the way in.

---

## 1. Operator anonymity (before you touch a server)

1. **Never** administer from your home/work IP. Do everything through
   **Mullvad**, **WireGuard**, or **Tails/Whonix**. Your real IP must never
   appear in any provider log.
2. **Anonymous identities & payment**: register accounts (host, domain, DDoS
   provider) with a dedicated email (**Proton**) and pay with **Monero** /
   crypto where accepted.
3. **Dedicated password manager + hardware 2FA**, kept off your daily machine.

## 2. Domain + DNS

1. Register the domain through a **privacy-first registrar (Njalla)** — they
   register it *for* you, so **WHOIS never shows you**.
2. DNS: use the registrar's DNS or a **no-log resolver**. Enable **DNSSEC**.
3. The **only** public A/AAAA record points at **DDoS-Guard**, never the
   Parkinhost origin IP.

## 3. DDoS-Guard edge (clearnet path)

1. Put **DDoS-Guard Website Protection** in front. It terminates the public
   connection and **hides the origin IP**.
2. On the Parkinhost firewall, **allow inbound 80/443 ONLY from the DDoS-Guard
   IP ranges**. Drop everything else. If the origin IP ever leaks, this is
   what still saves you.

## 4. Origin host — Parkinhost Russia Dedicated

1. Order the **Russia Dedicated** plan with large storage (e.g. 2×16 TB HDD).
2. Install **Ubuntu 22.04 / 24.04**. Prefer full-disk encryption (LUKS) if
   offered.
3. Harden:

```bash
# Non-root sudo user, key-only SSH on a non-standard port, no passwords.
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Firewall: default deny; SSH only over the VPN subnet; web only from DDoS ranges.
sudo ufw default deny incoming
sudo ufw allow in on wg0 to any port 22 proto tcp
# (repeat 'ufw allow from <DDoS-Guard-range> to any port 80/443' for each range)
sudo ufw enable

# Disable persistent logging of network/journal to disk (RAM only).
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nStorage=volatile\nRuntimeMaxUse=64M\n' | \
  sudo tee /etc/systemd/journald.conf.d/volatile.conf
sudo systemctl restart systemd-journald
```

4. Put **MinIO data** on the large HDD volume(s). Keep OS + MariaDB on faster
   storage when possible.

## 5. Tor hidden service (no-IP path)

`docker-compose.prod.yml` ships a `tor` service that publishes a **v3 .onion**
forwarding to the app. This path has **no IP at all** — the strongest anonymity
for both sides.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d tor app
# Get your permanent .onion address:
docker compose -f docker-compose.prod.yml exec tor \
  cat /var/lib/tor/hidden_service/hostname
```

- **Back up** `tor-data` (the volume) to keep the same `.onion` forever.
- Publish the `.onion` alongside the clearnet domain so privacy-sensitive users
  can reach you with zero IP exposure.

## 6. Build + registry (never public)

- Public CI (`.github/workflows/ci.yml`) only builds + smoke-tests. **No
  secrets.**
- Prefer building the image directly on the Parkinhost dedicated or from a
  VPN-only runner. Never push secrets to public CI.

## 7. Database + media (MinIO)

```bash
# Migrations run automatically on first mariadb start (mounted initdb).
# Encryption at rest is enabled via compose flags (innodb-encrypt-tables).

# Seed YOUR content (rights-cleared) — no placeholder data:
DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@127.0.0.1:3306/lumengallery" \
  node scripts/seed.mjs ./content.json
```

- **MinIO** runs on the same server, on the internal network only.
- Bucket stays **private**. Media is served via signed URLs through the app/edge.
- Put strong `S3_ACCESS_KEY` / `S3_SECRET_KEY` in `.env.prod`.
- **Encrypted off-site backups**: `mysqldump --single-transaction | gpg -e`
  and store the result elsewhere (another encrypted remote).

## 8. No logs, anywhere

- **App**: `src/lib/logger.ts` is a no-op in prod; nothing about visitors is
  logged. Rate-limiting hashes a coarse key with an ephemeral salt (`ratelimit.ts`).
- **Edge nginx**: `access_log off`; does **not** forward the client IP upstream.
- **MariaDB**: `--general-log=0`, `--skip-name-resolve`.
- **Redis**: no persistence (`--save "" --appendonly no`).
- **Host**: journald volatile (RAM only), FDE.
- **Internal docker network** is `internal: true` → the data stores have **no
  route to the internet** and cannot phone home.

## 9. App-level privacy (already in the code)

- **No third-party anything**: system fonts (no font CDN), no analytics, strict
  CSP `default-src 'self'`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy` disabling `interest-cohort`/`browsing-topics`,
  `X-Powered-By` removed.
- **Anonymous identity** (`/identite`): a client-generated key — no email, no
  phone, no central account DB. The server only ever sees an opaque handle.

## 10. Go-live checklist

- [ ] Home IP never used; all admin over Mullvad / WireGuard.
- [ ] WHOIS masked; only public DNS record = DDoS-Guard.
- [ ] Parkinhost origin firewall allows web only from DDoS-Guard, SSH only over VPN.
- [ ] `.onion` published and its volume backed up.
- [ ] MinIO bucket is **private**; media only via signed URLs.
- [ ] Staging/QA are VPN-only, separate creds, same hardening.
- [ ] `curl -sI https://your-domain` shows the security headers and **no**
      `Server`/`X-Powered-By`.
- [ ] No access logs on disk anywhere (`docker compose logs edge` is empty of
      request lines; journald is volatile).
- [ ] Encrypted backups tested (restore dry-run).
- [ ] Certificate Transparency monitored (crt.sh) for origin-hostname leaks.

## 11. Kill switch

If you must take everything down with no residue:

```bash
docker compose -f docker-compose.prod.yml down -v   # -v wipes volumes/data
# On an ephemeral/RAM host, a simple reboot destroys all state.
```
