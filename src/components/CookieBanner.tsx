"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import { useEffect, useRef, useState } from "react";
import { localizedHref, type Locale } from "@/lib/i18n/config";
import { AUDIENCE_COOKIE, CHOICE_MAX_AGE, cookieCopy, type Choice } from "@/lib/audience-choice";
import { AD_CONSENT_COOKIE, AD_CONSENT_MAX_AGE, AD_CONSENT_VERSION } from "@/lib/ads-contract";
import type { ConsentChoiceRequest } from "@/lib/consent-choice-contract";
import { CHOICE_CHANGED, OPEN_CHOICES, useAudienceChoice } from "./AudienceChoice";
import { useLocale } from "./LocaleProvider";
import { useAgeConfirmation } from "./AgeConfirmation";
import { ADS_CONSENT_CHANGED, useAds } from "./AdsProvider";

type CombinedCopy = {body:string;settingsBody:string;statistics:string;statisticsBody:string;advertising:string;advertisingBody:string;refuseAll:string;save:string};
const combinedCopy: Record<Locale,CombinedCopy> = {
  fr:{body:"En cliquant sur « Entrer », tu acceptes les cookies de statistiques du site et les cookies publicitaires de TrafficStars. Tu peux tout refuser et continuer, ou choisir séparément.",settingsBody:"Choisis séparément les statistiques et les publicités. Les cookies facultatifs restent désactivés sans ton accord.",statistics:"Statistiques du site",statisticsBody:"Compter les visites et les pages vues.",advertising:"Publicités TrafficStars",advertisingBody:"Afficher et mesurer des publicités avec des cookies et des informations de navigation.",refuseAll:"Tout refuser",save:"Enregistrer mes choix"},
  en:{body:"By clicking “Enter”, you accept site analytics cookies and TrafficStars advertising cookies. You can decline all and continue, or choose each purpose separately.",settingsBody:"Choose analytics and advertising separately. Optional cookies stay off without your agreement.",statistics:"Site analytics",statisticsBody:"Count visits and page views.",advertising:"TrafficStars advertising",advertisingBody:"Display and measure ads using cookies and browsing information.",refuseAll:"Decline all",save:"Save my choices"},
  es:{body:"Al pulsar «Entrar», aceptas las cookies de estadísticas del sitio y las cookies publicitarias de TrafficStars. Puedes rechazarlas todas y continuar, o elegir por separado.",settingsBody:"Elige por separado las estadísticas y la publicidad. Las cookies opcionales permanecen desactivadas sin tu permiso.",statistics:"Estadísticas del sitio",statisticsBody:"Contar visitas y páginas vistas.",advertising:"Publicidad de TrafficStars",advertisingBody:"Mostrar y medir anuncios mediante cookies e información de navegación.",refuseAll:"Rechazar todo",save:"Guardar mis opciones"},
  de:{body:"Mit „Eintreten“ akzeptierst du Statistik-Cookies der Website und Werbe-Cookies von TrafficStars. Du kannst alle ablehnen und fortfahren oder die Zwecke einzeln auswählen.",settingsBody:"Wähle Statistik und Werbung getrennt aus. Optionale Cookies bleiben ohne deine Zustimmung deaktiviert.",statistics:"Website-Statistik",statisticsBody:"Besuche und Seitenaufrufe zählen.",advertising:"TrafficStars-Werbung",advertisingBody:"Werbung mithilfe von Cookies und Informationen zum Surfverhalten anzeigen und messen.",refuseAll:"Alle ablehnen",save:"Auswahl speichern"},
  it:{body:"Facendo clic su «Entra», accetti i cookie statistici del sito e i cookie pubblicitari di TrafficStars. Puoi rifiutare tutto e continuare, oppure scegliere separatamente.",settingsBody:"Scegli separatamente statistiche e pubblicità. I cookie facoltativi restano disattivati senza il tuo consenso.",statistics:"Statistiche del sito",statisticsBody:"Contare visite e pagine viste.",advertising:"Pubblicità TrafficStars",advertisingBody:"Mostrare e misurare annunci con cookie e informazioni di navigazione.",refuseAll:"Rifiuta tutto",save:"Salva le mie scelte"},
  pt:{body:"Ao clicar em «Entrar», aceitas os cookies de estatísticas do site e os cookies publicitários da TrafficStars. Podes recusar tudo e continuar ou escolher separadamente.",settingsBody:"Escolhe separadamente as estatísticas e a publicidade. Os cookies opcionais ficam desativados sem o teu consentimento.",statistics:"Estatísticas do site",statisticsBody:"Contar visitas e páginas vistas.",advertising:"Publicidade TrafficStars",advertisingBody:"Apresentar e medir anúncios com cookies e informações de navegação.",refuseAll:"Recusar tudo",save:"Guardar as minhas escolhas"},
  nl:{body:"Door op ‘Doorgaan’ te klikken, accepteer je statistiekcookies van de site en advertentiecookies van TrafficStars. Je kunt alles weigeren en doorgaan of de doelen afzonderlijk kiezen.",settingsBody:"Kies statistieken en advertenties afzonderlijk. Optionele cookies blijven uit zonder je toestemming.",statistics:"Sitestatistieken",statisticsBody:"Bezoeken en paginaweergaven tellen.",advertising:"TrafficStars-advertenties",advertisingBody:"Advertenties tonen en meten met cookies en surfgegevens.",refuseAll:"Alles weigeren",save:"Mijn keuzes opslaan"},
  ru: {
    "body": "Нажимая «Войти», вы разрешаете статистические файлы cookie сайта и рекламные файлы cookie TrafficStars. Вы можете отказаться от всех и продолжить либо выбрать каждую цель отдельно.",
    "settingsBody": "Выберите статистику и рекламу отдельно. Необязательные файлы cookie остаются отключёнными без вашего согласия.",
    "statistics": "Статистика сайта",
    "statisticsBody": "Подсчёт посещений и просмотров страниц.",
    "advertising": "Реклама TrafficStars",
    "advertisingBody": "Показ рекламы и оценка её эффективности с помощью файлов cookie и сведений о просмотрах.",
    "refuseAll": "Отказаться от всех",
    "save": "Сохранить мой выбор"
  },
  zh: {
    "body": "点击“进入”即表示你接受网站统计 Cookie 和 TrafficStars 广告 Cookie。你可以全部拒绝并继续，也可以分别选择每种用途。",
    "settingsBody": "请分别选择是否允许统计和广告。未经你的同意，可选 Cookie 将保持关闭。",
    "statistics": "网站统计",
    "statisticsBody": "统计访问次数和页面浏览量。",
    "advertising": "TrafficStars 广告",
    "advertisingBody": "使用 Cookie 和浏览信息展示广告并衡量广告效果。",
    "refuseAll": "全部拒绝",
    "save": "保存我的选择"
  },
  ja: {
    "body": "「入場」を押すと、サイトのアクセス統計CookieとTrafficStarsの広告Cookieに同意したことになります。すべて拒否して閲覧を続けることも、目的ごとに選ぶこともできます。",
    "settingsBody": "アクセス統計と広告について、それぞれ選択してください。任意のCookieは、同意がなければ無効のままです。",
    "statistics": "サイトのアクセス統計",
    "statisticsBody": "訪問数とページ閲覧数を計測します。",
    "advertising": "TrafficStarsの広告",
    "advertisingBody": "Cookieと閲覧情報を使用して、広告を表示・測定します。",
    "refuseAll": "すべて拒否する",
    "save": "選択を保存する"
  },
  hi: {
    "body": "“प्रवेश करें” पर क्लिक करके आप साइट के आँकड़ों की कुकीज़ और TrafficStars की विज्ञापन कुकीज़ स्वीकार करते हैं। आप सभी को अस्वीकार करके भी जारी रख सकते हैं या हर उद्देश्य के लिए अलग विकल्प चुन सकते हैं।",
    "settingsBody": "आँकड़ों और विज्ञापनों के लिए अलग-अलग विकल्प चुनें। वैकल्पिक कुकीज़ आपकी सहमति के बिना बंद रहती हैं।",
    "statistics": "साइट के आँकड़े",
    "statisticsBody": "विज़िट और पेज व्यू गिनना।",
    "advertising": "TrafficStars विज्ञापन",
    "advertisingBody": "कुकीज़ और ब्राउज़िंग जानकारी से विज्ञापन दिखाना और मापना।",
    "refuseAll": "सभी अस्वीकार करें",
    "save": "मेरे विकल्प सहेजें"
  },
  th: {
    "body": "เมื่อคลิก “เข้าชม” คุณยอมรับคุกกี้สถิติของเว็บไซต์และคุกกี้โฆษณาของ TrafficStars คุณสามารถปฏิเสธทั้งหมดและใช้งานต่อได้ หรือเลือกแยกแต่ละวัตถุประสงค์",
    "settingsBody": "เลือกสถิติและโฆษณาแยกจากกัน คุกกี้ที่ไม่จำเป็นจะยังปิดอยู่หากคุณไม่ยินยอม",
    "statistics": "สถิติของเว็บไซต์",
    "statisticsBody": "นับการเข้าชมและยอดดูหน้าเว็บ",
    "advertising": "โฆษณา TrafficStars",
    "advertisingBody": "แสดงและวัดผลโฆษณาโดยใช้คุกกี้และข้อมูลการเรียกดู",
    "refuseAll": "ปฏิเสธทั้งหมด",
    "save": "บันทึกตัวเลือกของฉัน"
  },
};

export function CookieBanner() {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const choice = useAudienceChoice();
  const { confirmed: ageConfirmed, confirm: confirmAge } = useAgeConfirmation();
  const ads = useAds();
  const [opened, setOpened] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [statisticsDraft, setStatisticsDraft] = useState(false);
  const [advertisingDraft, setAdvertisingDraft] = useState(false);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const declineButton = useRef<HTMLButtonElement>(null);
  const statisticsCheckbox = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const saving = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const copy = cookieCopy[locale];
  const combined = ads.consentOffered;
  const combinedText = combinedCopy[locale];
  useEffect(() => {
    const open = () => {
      if (saving.current) return;
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpened(true); setShowChoices(true); setError(false);
      setStatisticsDraft(choice === "accepted"); setAdvertisingDraft(ads.consent === "accepted");
    };
    window.addEventListener(OPEN_CHOICES, open);
    return () => window.removeEventListener(OPEN_CHOICES, open);
  }, [choice, ads.consent]);
  useEffect(() => {
    if (showChoices) (combined ? statisticsCheckbox.current : declineButton.current)?.focus({ preventScroll: true });
  }, [showChoices, opened, combined]);
  if (choice === undefined || ageConfirmed === undefined) return null;
  // The privacy explanation must remain readable before any entry or cookie choice.
  if (!opened && pathname.replace(/\/$/, "").endsWith("/confidentialite")) return null;
  // A delayed runtime response must never open a second panel after this entry choice.
  // Missing advertising consent still blocks every SDK and can be chosen on a later visit.
  if (!opened && ageConfirmed && (dismissed || (choice !== null && !ads.needsConsent))) return null;

  function close() {
    setOpened(false); setDismissed(true);
    returnFocus.current?.focus({ preventScroll: true });
  }

  async function choose(value: Choice, advertisingChoice?: Choice) {
    if (saving.current) return;
    saving.current = true;
    setPending(true); setError(false);
    if (value === "refused") {
      document.cookie = AUDIENCE_COOKIE + "=refused; Path=/; SameSite=Lax; Max-Age=" + CHOICE_MAX_AGE + (location.protocol === "https:" ? "; Secure" : "");
      confirmAge();
      window.dispatchEvent(new Event(CHOICE_CHANGED));
    }
    if (advertisingChoice === "refused") {
      document.cookie = `${AD_CONSENT_COOKIE}=${AD_CONSENT_VERSION}:refused; Path=/; SameSite=Lax; Max-Age=${AD_CONSENT_MAX_AGE}${location.protocol === "https:" ? "; Secure" : ""}`;
      window.dispatchEvent(new Event(ADS_CONSENT_CHANGED));
    }
    const fullyRefused = value === "refused" && advertisingChoice !== "accepted";
    if (fullyRefused) close();
    const payload: ConsentChoiceRequest = advertisingChoice === undefined ? {choice:value} : {choice:value,advertisingChoice,ageConfirmed:true};
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const result = await fetch("/api/cookies/choice", { method:"POST", credentials:"same-origin", cache:"no-store", keepalive:true, signal:controller.signal, headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      if (result.status !== 204) throw new Error();
      try { localStorage.setItem("lfh:choice-update", String(Date.now())); } catch { /* storage may be disabled */ }
      if (advertisingChoice !== undefined) {
        try { localStorage.setItem("lfh:ad-choice-update", String(Date.now())); } catch { /* Cookie remains authoritative. */ }
        window.dispatchEvent(new Event(ADS_CONSENT_CHANGED));
      }
      confirmAge();
      window.dispatchEvent(new Event(CHOICE_CHANGED));
      close();
    } catch { if (fullyRefused) { close(); } else { setError(true); } } finally { window.clearTimeout(timeout); saving.current = false; setPending(false); }
  }
  return <div className={!ageConfirmed ? "fixed inset-0 z-[100] bg-black/90" : undefined}>
    <section aria-label={copy.manage} className="fixed inset-x-0 top-[calc(50%+1.5rem)] z-50 mx-auto max-w-[27rem] -translate-y-1/2 px-4 font-sans">
    <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-y-contain rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 pb-2 pt-6 text-center shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 flex justify-center">
        <BrandLogo href={localizedHref(locale, "/")} size="sm" />
      </div>
      {!ageConfirmed && <p className="mb-4 text-xs leading-relaxed text-[var(--color-ink-muted)]"><span className="mr-1 font-bold text-[var(--color-ink)]">18+</span> {t("shell.ageGate.body")}</p>}
      {combined ? <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
        {showChoices ? combinedText.settingsBody : combinedText.body}{" "}
        <Link href={localizedHref(locale,"/confidentialite")} onClick={() => setOpened(false)} className="whitespace-nowrap text-[var(--color-accent)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]">{t("shell.cookies.more")}</Link>
      </p> : (choice === null || ageConfirmed || showChoices) && <div className="grid">
        {[false, true].map((settings) => (
          <p key={String(settings)} aria-hidden={settings !== showChoices} className={`col-start-1 row-start-1 text-sm leading-relaxed text-[var(--color-ink-muted)] ${settings !== showChoices ? "invisible" : ""}`}>
            {settings ? copy.settingsBody : copy.body}{" "}
            <Link href={localizedHref(locale, "/confidentialite")} onClick={() => setOpened(false)} className="whitespace-nowrap text-[var(--color-accent)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]">{t("shell.cookies.more")}</Link>
          </p>
        ))}
      </div>}
      <div className="mt-5">
        {showChoices && combined ? <>
          <fieldset disabled={pending} className="mb-4 grid gap-3 text-left">
            <legend className="sr-only">{copy.manage}</legend>
            <label className="flex min-h-12 cursor-pointer gap-3 rounded-2xl border border-[var(--color-border)] p-3">
              <input ref={statisticsCheckbox} type="checkbox" checked={statisticsDraft} onChange={event=>setStatisticsDraft(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
              <span><span className="block text-sm font-semibold">{combinedText.statistics}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-ink-muted)]">{combinedText.statisticsBody}</span></span>
            </label>
            <label className="flex min-h-12 cursor-pointer gap-3 rounded-2xl border border-[var(--color-border)] p-3">
              <input type="checkbox" checked={advertisingDraft} onChange={event=>setAdvertisingDraft(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
              <span><span className="block text-sm font-semibold">{combinedText.advertising}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-ink-muted)]">{combinedText.advertisingBody}</span></span>
            </label>
          </fieldset>
          <button type="button" disabled={pending} onClick={()=>void choose(statisticsDraft?"accepted":"refused",advertisingDraft?"accepted":"refused")} className="min-h-12 w-full rounded-full bg-[var(--color-accent)] px-5 text-[15px] font-bold tracking-tight text-white transition-colors hover:bg-[var(--color-accent-600)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)] disabled:cursor-wait">{combinedText.save}</button>
        </> : showChoices ? (
          <div className="grid grid-cols-2 gap-3">
            <button ref={declineButton} type="button" disabled={pending} onClick={() => choose("refused")} className="min-h-12 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">{copy.refuse}</button>
            <button type="button" disabled={pending} onClick={() => choose("accepted")} className="min-h-12 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">{copy.confirm}</button>
          </div>
        ) : (
          <><button type="button" disabled={pending} onClick={() => {
            if (combined) { void choose("accepted","accepted"); }
            else if (!ageConfirmed && choice !== null) { confirmAge(); close(); }
            else { void choose("accepted"); }
          }} className="min-h-12 w-full rounded-full bg-[var(--color-accent)] px-5 text-[15px] font-bold tracking-tight text-white transition-colors hover:bg-[var(--color-accent-600)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)] disabled:cursor-wait">{copy.accept}</button>
          {combined && <button type="button" disabled={pending} onClick={()=>void choose("refused","refused")} className="mt-2 min-h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">{combinedText.refuseAll}</button>}</>
        )}
        <button ref={detailsButton} type="button" disabled={pending} aria-expanded={showChoices} onClick={() => {
          if (showChoices && choice !== null && ageConfirmed) { close(); return; }
          if (!showChoices) { setStatisticsDraft(choice === "accepted"); setAdvertisingDraft(ads.consent === "accepted"); }
          setShowChoices(!showChoices);
          setError(false);
          if (showChoices) requestAnimationFrame(() => detailsButton.current?.focus({ preventScroll: true }));
        }} className="mx-auto mt-1 flex min-h-11 items-center justify-center rounded-full px-4 text-[0.625rem] text-[var(--color-ink-muted)] underline underline-offset-4 hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">
          {showChoices ? copy.back : copy.manage}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--color-ink)]">{copy.error}</p>}
    </div>
    </section>
  </div>;
}
