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
    // Replace via NEXT_PUBLIC_CRYPTO_* in production
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
  const { isPremium, setPremium } = usePremium();
  const [planId, setPlanId] = useState<PlanId>("week");
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [cryptoAsset, setCryptoAsset] = useState<(typeof CRYPTO_ASSETS)[number]["id"]>("btc");
  const [copied, setCopied] = useState(false);

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
        <button
          type="button"
          onClick={() => setPremium(false)}
          className="mt-4 block w-full text-xs text-[var(--color-ink-faint)] underline"
        >
          (dev) désactiver
        </button>
      </div>
    );
  }

  // Must be logged in
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

      {/* Plans */}
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

      {/* Payment methods */}
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

      {/* Method panels */}
      {method === "card" || method === "stars" ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="font-bold">
            {method === "card"
              ? "Payer par carte (Telegram Stars)"
              : "Payer avec Telegram Stars"}
          </h3>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            {method === "card" ? (
              <>
                Tu seras redirigé vers Telegram pour activer{" "}
                <strong>Premium — {plan.label}</strong>. Si tu n’as pas assez de
                Stars, Telegram te propose d’en acheter par carte bancaire, puis
                de valider l’abonnement.
              </>
            ) : (
              <>
                Ouvre Telegram et confirme le paiement de{" "}
                <strong>~{plan.stars} Stars</strong> ({formatUsd(plan.priceUsd)})
                pour <strong>{plan.label}</strong> sur ton compte.
              </>
            )}
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--color-ink-muted)]">
            <li>Clique sur le bouton ci-dessous</li>
            <li>Telegram s’ouvre avec « Activate Premium »</li>
            <li>Paie en Stars (ou achète des Stars par carte)</li>
            <li>Ton compte LeakFanHub est activé automatiquement</li>
          </ol>
          <button
            type="button"
            onClick={openTelegram}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#2AABEE] py-3 text-sm font-bold text-white hover:brightness-110"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12a.43.43 0 01.14.28c.02.06.02.2 0 .31z" />
            </svg>
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
            Envoie <strong>{formatUsd(plan.priceUsd)}</strong> (équivalent) à
            l’adresse ci-dessous. Indique ton e-mail en mémo si possible.
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
              <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">
                Après envoi, l’activation peut prendre quelques minutes. Contacte
                le support avec le hash de transaction si besoin.
              </p>
            </div>
          </div>
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
        <li>✓ Annulation à la fin de la période (pas de reconduction forcée ici)</li>
      </ul>
    </div>
  );
}
