"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePremium } from "@/components/Premium";
import { useSession } from "@/components/Session";
import {
  parseOrderStatus,
  shouldPollOrder,
  type PremiumOrderStatus,
} from "@/lib/premium-order-ui";
import { getPlan, PLANS, type PlanId } from "@/lib/premium-plans";

interface CreatedOrder {
  id: string;
  planId: PlanId;
  starsAmount: number;
  expiresAt: string;
  telegramUrl: string;
  status: PremiumOrderStatus;
}

export default function PremiumPage() {
  const { user, loading } = useSession();
  const { isPremium, refresh } = usePremium();
  const [planId, setPlanId] = useState<PlanId>("week");
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [orderStatus, setOrderStatus] = useState<PremiumOrderStatus>("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = useMemo(() => getPlan(planId), [planId]);

  useEffect(() => {
    if (!order || !shouldPollOrder(orderStatus)) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/premium/orders/${encodeURIComponent(order.id)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = (await response.json()) as { status?: unknown };
        const nextStatus = parseOrderStatus(json.status);
        if (cancelled) return;
        setOrderStatus(nextStatus);
        if (nextStatus === "paid") await refresh();
      } catch {
        // A temporary network error is retried by the next polling interval.
      }
    };

    const interval = window.setInterval(() => void poll(), 2500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [order, orderStatus, refresh]);

  const startTelegramPayment = async () => {
    setBusy(true);
    setError(null);
    const telegramWindow = window.open("about:blank", "_blank");
    if (telegramWindow) telegramWindow.opener = null;
    try {
      const response = await fetch("/api/premium/telegram-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const json = (await response.json()) as CreatedOrder & { error?: string };
      if (!response.ok) throw new Error(json.error || "order_create_failed");
      const created = { ...json, status: parseOrderStatus(json.status) };
      setOrder(created);
      setOrderStatus(created.status);
      if (telegramWindow) telegramWindow.location.href = created.telegramUrl;
      else window.location.href = created.telegramUrl;
    } catch {
      telegramWindow?.close();
      setError("Impossible de créer le paiement pour le moment. Réessaie dans quelques instants.");
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

  if (isPremium || orderStatus === "paid") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-3xl">✨</p>
        <h1 className="mt-3 text-2xl font-black">Tu es Premium</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Le paiement Telegram Stars a été confirmé et Premium est actif sur ton compte.
        </p>
        <Link
          href="/"
          prefetch={false}
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
            prefetch={false}
            className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-bold text-white"
          >
            Créer un compte
          </Link>
          <Link
            href="/connexion?next=/premium"
            prefetch={false}
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
          Premium · Telegram Stars
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          Choisis ton offre
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Paiement sécurisé dans Telegram, puis activation automatique sur le compte de{" "}
          <span className="font-semibold text-[var(--color-ink)]">
            {user.username || user.email}
          </span>
          .
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PLANS.map((candidate) => {
          const active = planId === candidate.id;
          return (
            <button
              key={candidate.id}
              type="button"
              disabled={busy || Boolean(order && shouldPollOrder(orderStatus))}
              onClick={() => {
                setPlanId(candidate.id);
                setOrder(null);
                setOrderStatus("pending");
                setError(null);
              }}
              className={`relative rounded-2xl border p-4 text-left transition disabled:opacity-60 ${
                active
                  ? "border-amber-400 bg-amber-400/10 ring-1 ring-amber-400/40"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-ink-faint)]"
              }`}
            >
              {candidate.popular && (
                <span className="absolute -top-2 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-black">
                  Populaire
                </span>
              )}
              <p className="font-bold">{candidate.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">
                {candidate.stars.toLocaleString("fr-FR")} Stars
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="font-bold">Payer avec Telegram Stars</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Telegram ouvrira @{process.env.NEXT_PUBLIC_TELEGRAM_BOT || "LeakFanHubBot"} avec une
          facture exacte de <strong>{plan.stars.toLocaleString("fr-FR")} Stars</strong> pour{" "}
          <strong>{plan.label}</strong>. Premium ne sera activé qu’après la confirmation du paiement.
        </p>

        {order && shouldPollOrder(orderStatus) ? (
          <div className="mt-5 rounded-xl bg-sky-500/10 px-4 py-3 text-sm text-sky-300">
            Facture envoyée. Termine le paiement dans Telegram ; cette page vérifiera automatiquement
            la confirmation.
            <a
              href={order.telegramUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-1 font-bold underline"
            >
              Rouvrir Telegram
            </a>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={startTelegramPayment}
            className="mt-5 flex w-full items-center justify-center rounded-full bg-[#2AABEE] py-3 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            {busy
              ? "Création de la facture…"
              : `Continuer dans Telegram · ${plan.stars.toLocaleString("fr-FR")} Stars`}
          </button>
        )}

        {(orderStatus === "expired" || orderStatus === "failed") && (
          <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Cette demande n’est plus valable. Relance un paiement pour recevoir une nouvelle facture.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>

      <ul className="mt-8 space-y-2 text-sm text-[var(--color-ink-muted)]">
        <li>✓ Sans publicité</li>
        <li>✓ Qualité et vitesse prioritaires</li>
        <li>✓ Premium lié à ton compte sur tous tes appareils</li>
      </ul>
      <p className="mt-6 text-xs text-[var(--color-ink-faint)]">
        En continuant, tu acceptes les{" "}
        <Link href="/conditions" prefetch={false} className="underline">
          conditions
        </Link>
        . Pour toute question de paiement, contacte le{" "}
        <Link href="/contact/support" prefetch={false} className="underline">
          support
        </Link>
        .
      </p>
    </div>
  );
}
