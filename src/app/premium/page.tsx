"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "@/components/Session";
import { usePremium } from "@/components/Premium";
import { PLANS, type PayMethod, type PlanId, getPlan, telegramPremiumLink } from "@/lib/premium-plans";

const CRYPTO_ASSETS = [
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    address:
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CRYPTO_BTC) ||
      "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  },
  {
    id: "usdt-eth",
    name: "USDT (Ethereum)",
    symbol: "USDT-ERC20",
    address:
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CRYPTO_USDT_ETH) ||
      "0x0000000000000000000000000000000000000000",
  },
  {
    id: "usdt-poly",
    name: "USDT (Polygon)",
    symbol: "USDT-POLYGON",
    address:
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CRYPTO_USDT_POLYGON) ||
      "0x0000000000000000000000000000000000000000",
  },
] as const;

function formatUsd(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

export default function PremiumPage() {
  const { user, loading } = useSession();
  const { isPremium, refresh } = usePremium();
  const [planId, setPlanId] = useState<PlanId>("week");
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [cryptoAsset, setCryptoAsset] = useState<(typeof CRYPTO_ASSETS)[number]["id"]>("btc");
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [cryptoSent, setCryptoSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const plan = useMemo(() => getPlan(planId), [planId]);
  const asset = CRYPTO_ASSETS.find((a) => a.id === cryptoAsset) ?? CRYPTO_ASSETS[0];

  const qrUrl = useMemo(() => {
    const data = encodeURIComponent(asset.address);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&bgcolor=161618&color=f3f3f5&data=${data}`;
  }, [asset.address]);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(asset.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const openTelegram = () => {
    const url = telegramPremiumLink(planId, user?.id);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const submitCrypto = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/premium/crypto-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          cryptoAsset,
          txHash: txHash.trim(),
        }),
      });
      if (res.ok) {
        setCryptoSent(true);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-[var(--color-ink-muted)]">
        Chargement…
      </div>
    );
  }

  if (isPremium) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-3xl">✨</p>
        <h1 className="mt-3 text-2xl font-black">Tu es Premium</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Pubs désactivées. Merci pour ton soutien.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-bold text-white"
        >
          Retour à la galerie
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-3xl font-black tracking-tight">Premium</h1>
        <p className="mt-3 text-[var(--color-ink-muted)]">
          Crée un compte ou connecte-toi pour activer Premium sur ton profil.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/inscription?next=/premium"
            className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-bold text-white"
          >
            Créer un compte
          </Link>
          <Link
            href="/connexion?next=/premium"
            className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
          >
            Connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <span className="inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-400">
          Premium
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          Choisis ton offre
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Connecté en tant que{" "}
          <span className="font-semibold text-[var(--color-ink)]">
            {user.username || user.email}
          </span>
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PLANS.map((p) => {
          const active = planId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPlanId(p.id);
                setMethod(null);
                setCryptoSent(false);
              }}
              className={`relative rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/40"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-ink-faint)]"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-black">
                  Populaire
                </span>
              )}
              <p className="font-bold">{p.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{formatUsd(p.priceUsd)}</p>
              <p className="text-xs text-[var(--color-ink-faint)]">
                {p.perDay} · ~{p.stars} Stars
              </p>
            </button>
          );
        })}
      </div>

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-faint)]">
        Moyen de paiement
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(
          [
            { id: "card" as const, title: "Carte", sub: "via Telegram Stars" },
            { id: "stars" as const, title: "Telegram Stars", sub: "Payer dans Telegram" },
            { id: "crypto" as const, title: "Crypto", sub: "BTC / USDT" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMethod(m.id)}
            className={`rounded-xl border px-3 py-3 text-left ${
              method === m.id
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            <p className="text-sm font-bold">{m.title}</p>
            <p className="text-[11px] text-[var(--color-ink-faint)]">{m.sub}</p>
          </button>
        ))}
      </div>

      {method === "card" || method === "stars" ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="font-bold">
            {method === "card"
              ? "Payer par carte (Telegram Stars)"
              : "Payer avec Telegram Stars"}
          </h3>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Ouvre Telegram, paie ~{plan.stars} Stars ({formatUsd(plan.priceUsd)}) pour{" "}
            <strong>{plan.label}</strong>. L’activation est validée côté compte après
            confirmation.
          </p>
          <button
            type="button"
            onClick={openTelegram}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#2AABEE] py-3 text-sm font-bold text-white hover:brightness-110"
          >
            Ouvrir Telegram — {plan.label} ({formatUsd(plan.priceUsd)})
          </button>
          <p className="mt-3 text-center text-[11px] text-[var(--color-ink-faint)]">
            Bot : @{process.env.NEXT_PUBLIC_TELEGRAM_BOT || "LeakFanHubBot"}
          </p>
        </div>
      ) : null}

      {method === "crypto" ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="font-bold">Payer en crypto</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Envoie <strong>{formatUsd(plan.priceUsd)}</strong> (équivalent) à l’adresse,
            puis confirme ci-dessous.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {CRYPTO_ASSETS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setCryptoAsset(a.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  cryptoAsset === a.id
                    ? "bg-[var(--color-accent)] text-white"
                    : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR code paiement"
              width={160}
              height={160}
              className="rounded-xl border border-[var(--color-border)] bg-black p-2"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-[var(--color-ink-faint)]">
                {asset.name}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-[var(--color-ink)]">
                {asset.address}
              </p>
              <button
                type="button"
                onClick={copyAddr}
                className="mt-3 rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-bold"
              >
                {copied ? "Copié ✓" : "Copier l’adresse"}
              </button>
            </div>
          </div>

          {cryptoSent ? (
            <p className="mt-5 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
              Demande enregistrée. Activation sous peu après vérification du paiement.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Hash de transaction (optionnel)"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy}
                onClick={submitCrypto}
                className="w-full rounded-full bg-[var(--color-accent)] py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "Envoi…" : "J’ai payé — notifier"}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {!method && (
        <p className="mt-6 text-center text-sm text-[var(--color-ink-faint)]">
          Sélectionne un moyen de paiement pour continuer.
        </p>
      )}

      <ul className="mt-10 space-y-2 text-sm text-[var(--color-ink-muted)]">
        <li>✓ Sans publicité</li>
        <li>✓ Qualité et vitesse prioritaires</li>
        <li>✓ Premium lié à ton compte (tous tes appareils)</li>
      </ul>
    </div>
  );
}
