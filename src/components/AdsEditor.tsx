"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AD_PLACEMENT_KEYS, isAdProfile, type AdPlacement, type AdProfile, type AdsConfig, type AdPlacements } from "@/lib/ads-contract";
import { ADS_REGISTRY, isAdsRegistryReady, missingAdsPlacements, type AdDevice } from "@/lib/ads-registry";
import { AD_PROFILE_INFO } from "@/lib/ads-profiles";

const LABELS: Record<AdPlacement, string> = { header:"Bannière en haut", footer:"Bannière en bas", underVideo:"Galeries et lecteur vidéo (préroll/pause en Intensif)", feed:"Dans le feed vidéo", popunder:"Popunder après un clic", interstitial:"Interstitiel", slider:"Vidéo flottante" };
const samePlacements = (left:AdPlacements,right:AdPlacements) => AD_PLACEMENT_KEYS.every(key=>left[key]===right[key]);
function parseConfig(value:unknown):AdsConfig|null {
  if(!value || typeof value!=='object' || Array.isArray(value)) return null;
  const config=value as AdsConfig;
  const withProfile=Object.hasOwn(config,'profile');
  if(Object.keys(config).sort().join(',')!==(withProfile?'enabled,placements,profile,revision,updatedAt':'enabled,placements,revision,updatedAt')
    || (withProfile&&!isAdProfile(config.profile)) || typeof config.enabled!=='boolean'
    || !Number.isSafeInteger(config.revision) || config.revision<0 || config.revision>4_294_967_294
    || !config.placements || typeof config.placements!=='object' || Array.isArray(config.placements)
    || Object.keys(config.placements).length!==AD_PLACEMENT_KEYS.length
    || AD_PLACEMENT_KEYS.some(key=>typeof config.placements[key]!=='boolean')
    || (config.updatedAt!==null && (typeof config.updatedAt!=='string' || config.updatedAt.length>40 || !Number.isFinite(Date.parse(config.updatedAt))))) return null;
  return config;
}

function AdsPreview({ placement, device, profile }: { placement: AdPlacement; device: AdDevice; profile:AdProfile }) {
  const [closed, setClosed] = useState(false);
  const spot = ADS_REGISTRY[placement][device];
  const floating = placement === "slider";
  const profileInfo=AD_PROFILE_INFO.find(item=>item.key===profile)!;
  return <section data-ad-preview-profile={profile} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
    <p className="mb-3 text-xs text-[var(--color-ink-muted)]">Aperçu privé · aucun annonceur, script tiers ou fenêtre externe.</p>
    <p className="mb-3 text-xs text-[var(--color-ink-muted)]">{profileInfo.title} · {profileInfo.summary}</p>
    <div className={`relative mx-auto overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] ${device === "mobile" ? "h-[430px] max-w-[320px]" : "h-[360px] w-full"}`}>
      <div className="border-b border-[var(--color-border)] px-4 py-3 text-xs font-semibold">LeakFanHub · {device === "mobile" ? "Téléphone" : "Ordinateur"}</div>
      <div className="grid h-48 place-items-center text-xs text-[var(--color-ink-faint)]">{placement === "feed" ? "Vidéo 5 · emplacement suivant" : "Contenu de la page"}</div>
      {!closed && <div className={`border border-[var(--color-accent)]/40 bg-[var(--color-surface)] p-4 text-center text-sm ${placement === "interstitial" ? "absolute inset-3 z-10 grid place-items-center rounded-xl" : floating ? "absolute bottom-16 right-3 w-[30%] min-w-24 rounded-lg" : placement === "header" ? "absolute inset-x-4 top-14" : "mx-4 rounded-xl"}`}>
        {(floating || placement === "interstitial") && <button type="button" aria-label="Fermer l’aperçu" onClick={() => setClosed(true)} className="absolute -right-1 -top-1 grid h-11 w-11 place-items-center rounded-full bg-[var(--color-surface-2)] text-lg">×</button>}
        <span><span className="block text-[10px] uppercase text-[var(--color-ink-muted)]">Publicité · simulation</span>{LABELS[placement]}</span>
        {typeof spot.width === "number" && spot.height && <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">{spot.width} × {spot.height}</span>}
        {placement === "slider" && <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">{device === "mobile" ? spot.mobileWidth : spot.width}</span>}
        {placement === "popunder" && <p className="mt-2 text-xs">{profileInfo.details.find(detail=>detail.startsWith("Popunder"))} La fenêtre réelle s’ouvrira uniquement lors d’un clic éligible.</p>}
      </div>}
      <div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-center border-t border-[var(--color-border)] text-[10px] text-[var(--color-ink-muted)]">Navigation · les commandes restent accessibles</div>
    </div>
    {closed && <button className="mt-3 min-h-11 text-sm text-[var(--color-accent)]" onClick={() => setClosed(false)}>Revoir l’aperçu</button>}
  </section>;
}

export function AdsEditor() {
  const [saved, setSaved] = useState<AdsConfig | null>(null);
  const [draft, setDraft] = useState<AdPlacements | null>(null);
  const [draftProfile, setDraftProfile] = useState<AdProfile>("current");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [placement, setPlacement] = useState<AdPlacement>("header");
  const [device, setDevice] = useState<AdDevice>("mobile");
  const inFlight = useRef(false);
  const dirtyDraft = useRef(false);
  const profileDraft = useRef<AdProfile>("current");
  const placementsDraft = useRef<AdPlacements | null>(null);

  const resetDraft=useCallback((config:AdsConfig) => {
    const placements={...config.placements},profile=config.profile??"current";
    placementsDraft.current=placements;profileDraft.current=profile;
    setDraft(placements);setDraftProfile(profile);dirtyDraft.current=false;
  },[]);

  const load=useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailed(false);
    try {
      const response = await fetch("/api/admin/ads", { credentials:"same-origin", cache:"no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      const config=parseConfig(body.config);
      if (!config) throw new Error();
      setSaved(config); resetDraft(config); setUncertain(false); setMessage("");
    } catch { setUncertain(true); setFailed(true); setMessage("État de la diffusion inconnu. Recharge les réglages avant toute commande."); }
    finally { inFlight.current = false; setBusy(false); }
  },[resetDraft]);
  useEffect(() => { void load(); }, [load]);

  async function write(enabled: boolean, placements: AdPlacements, profile?:AdProfile) {
    if (!saved || inFlight.current || uncertain) return;
    const expectedProfile=profile??saved.profile??"current";
    const expectedRevision=saved.revision+Number(enabled!==saved.enabled || !samePlacements(placements,saved.placements) || expectedProfile!==(saved.profile??"current"));
    inFlight.current = true; setBusy(true); setFailed(false); setMessage("");
    try {
      const response = await fetch("/api/admin/ads", { method:"PUT", credentials:"same-origin", cache:"no-store",
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({ revision:saved.revision, enabled, placements,...(profile===undefined?{}:{profile}) }) });
      if (!response.ok) {
        setUncertain(true); setFailed(true);
        setMessage(response.status === 409 ? "Les réglages ont changé ailleurs. Recharge pour connaître l’état actuel." : "La modification n’a pas été confirmée. Recharge pour vérifier l’état actuel.");
        return;
      }
      const body = await response.json();
      const config=parseConfig(body.config);
      const profileMustBeConfirmed=profile!==undefined || saved.profile!==undefined;
      if (!config || config.enabled!==enabled || config.revision!==expectedRevision || !samePlacements(config.placements,placements)
        || (profileMustBeConfirmed && config.profile!==expectedProfile)) throw new Error();
      setSaved(config); resetDraft(config); setUncertain(false);
      setMessage(config.enabled ? "Diffusion activée pour les visiteurs éligibles ayant accepté les cookies publicitaires." : "Diffusion désactivée.");
    } catch { setUncertain(true); setFailed(true); setMessage("Connexion interrompue : état incertain. Recharge avant toute autre commande."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const dirty = Boolean(saved && draft && (!samePlacements(saved.placements,draft) || draftProfile!==(saved.profile??"current")));
  const ready = saved ? isAdsRegistryReady(saved.placements) : false;
  const missing = draft ? missingAdsPlacements(draft) : [];
  const status = busy ? "Mise à jour en cours…" : uncertain ? "État à vérifier" : saved?.enabled ? "Diffusion activée" : "Diffusion désactivée";
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <h1 className="text-2xl font-bold">Publicités</h1>
    <p className="mt-2 max-w-2xl text-sm text-[var(--color-ink-muted)]">Les réglages concernent uniquement ce site. Les aperçus restent privés et ne chargent aucune publicité réelle.</p>
    {!saved || !draft ? <button type="button" onClick={() => void load()} disabled={busy} className="mt-6 min-h-11 rounded-full border border-[var(--color-border)] px-5">{busy ? "Chargement…" : "Recharger les réglages"}</button> : <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-base font-semibold" role="status">{status}</h2>
        <p className="mt-2 text-sm">Profil enregistré : {AD_PROFILE_INFO.find(item=>item.key===(saved.profile??"current"))?.title}</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">{uncertain ? "Une réponse du serveur est nécessaire avant de poursuivre." : "L’âge et le consentement publicitaire restent requis. Le compte propriétaire et les membres Premium sont exclus."}</p>
        <button type="button" onClick={() => { if (!dirtyDraft.current) void write(!saved.enabled, saved.placements, saved.profile); }} disabled={busy || uncertain || dirty || (!saved.enabled && !ready)}
          className={`mt-4 min-h-12 w-full rounded-full px-5 text-sm font-bold disabled:opacity-50 ${saved.enabled ? "border border-[var(--color-accent)] text-[var(--color-accent)]" : "bg-[var(--color-accent)] text-white"}`}>
          {saved.enabled ? "Couper la diffusion" : "Activer la diffusion"}
        </button>
        {dirty && <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Enregistre ou annule les changements de profil ou d’emplacements avant de modifier la diffusion.</p>}
        {!ready && !saved.enabled && <p className="mt-2 text-xs text-[var(--color-ink-muted)]">L’activation sera disponible lorsque les emplacements enregistrés seront complets.</p>}
        <fieldset className="mt-5 grid gap-3 border-t border-[var(--color-border)] pt-4" disabled={busy || uncertain}>
          <legend className="px-1 text-sm font-semibold">Profil publicitaire</legend>
          {AD_PROFILE_INFO.map(info=><div key={info.key} className={`rounded-2xl border p-3 ${draftProfile===info.key?"border-[var(--color-accent)] bg-[var(--color-accent)]/5":"border-[var(--color-border)]"}`}>
            <label htmlFor={`ad-profile-${info.key}`} className="flex min-h-12 cursor-pointer items-start gap-3">
              <input id={`ad-profile-${info.key}`} type="radio" name="ads-profile" value={info.key} checked={draftProfile===info.key} aria-describedby={`ad-profile-${info.key}-details`}
                onChange={event=>{if(!event.target.checked||inFlight.current||uncertain)return;profileDraft.current=info.key;setDraftProfile(info.key);dirtyDraft.current=info.key!==(saved.profile??"current") || !samePlacements(placementsDraft.current??draft,saved.placements);}}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]" />
              <span><span className="block text-sm font-semibold">{info.title}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-ink-muted)]">{info.summary}</span></span>
            </label>
            <ul id={`ad-profile-${info.key}-details`} className="ml-8 mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[var(--color-ink-muted)]">{info.details.map(detail=><li key={detail}>{detail}</li>)}</ul>
          </div>)}
        </fieldset>
        <fieldset className="mt-5 border-t border-[var(--color-border)] pt-4" disabled={busy || uncertain}>
          <legend className="px-1 text-sm font-semibold">Emplacements</legend>
          <p className="mb-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">Les emplacements sont communs aux trois profils. Le profil ajuste leur fréquence et leur disposition.</p>
          {AD_PLACEMENT_KEYS.map(key => <label key={key} className="flex min-h-11 items-center justify-between gap-4 text-sm">
            {LABELS[key]}<input type="checkbox" checked={draft[key]} onChange={event => {if(inFlight.current||uncertain)return;const next={...(placementsDraft.current??draft),[key]:event.target.checked};placementsDraft.current=next;dirtyDraft.current=!samePlacements(next,saved.placements)||profileDraft.current!==(saved.profile??"current");setDraft(next);}} className="h-5 w-5 accent-[var(--color-accent)]" />
          </label>)}
        </fieldset>
        {missing.length > 0 && <p className="mt-3 text-xs text-[var(--color-ink-muted)]">Codes à compléter : {missing.map(key => LABELS[key]).join(", ")}.</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => void write(saved.enabled, draft, saved.profile===undefined && draftProfile==="current" ? undefined : draftProfile)} disabled={busy || uncertain || !dirty || (saved.enabled && !isAdsRegistryReady(draft))} className="min-h-11 rounded-full bg-[var(--color-accent)] px-5 text-sm font-bold text-white disabled:opacity-50">Enregistrer la configuration</button>
          {dirty && <button type="button" disabled={busy || uncertain} onClick={() => {if(!inFlight.current)resetDraft(saved);}} className="min-h-11 rounded-full border border-[var(--color-border)] px-4 text-sm">Annuler</button>}
          <button type="button" onClick={() => void load()} disabled={busy} className="min-h-11 rounded-full border border-[var(--color-border)] px-5 text-sm">Recharger</button>
        </div>
        {saved.updatedAt && <p className="mt-3 text-[11px] text-[var(--color-ink-faint)]">Dernier enregistrement : {new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(saved.updatedAt))}</p>}
      </section>
      <section>
        <h2 className="text-base font-semibold">Aperçu des emplacements</h2>
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{dirty?"Brouillon non enregistré":"Configuration enregistrée"} · {AD_PROFILE_INFO.find(item=>item.key===draftProfile)?.title}</p>
        <select aria-label="Emplacement à prévisualiser" value={placement} onChange={event => setPlacement(event.target.value as AdPlacement)} className="mt-3 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm">
          {AD_PLACEMENT_KEYS.map(key => <option key={key} value={key}>{LABELS[key]}</option>)}
        </select>
        <div className="my-3 flex gap-2" role="group" aria-label="Format de l’aperçu">
          {(["mobile", "desktop"] as const).map(value => <button type="button" key={value} aria-pressed={device === value} onClick={() => setDevice(value)} className={`min-h-11 rounded-full border px-4 text-sm ${device === value ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>{value === "mobile" ? "Téléphone" : "Ordinateur"}</button>)}
        </div>
        <AdsPreview key={`${placement}:${device}:${draftProfile}`} placement={placement} device={device} profile={draftProfile} />
      </section>
    </div>}
    {message && <p role={failed ? "alert" : "status"} className="mt-4 text-sm">{message}</p>}
  </div>;
}
