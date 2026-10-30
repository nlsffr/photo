import type { Metadata } from "next";
import { CreatorCollectionPage, creatorCollectionMetadata } from "@/features/creator/CreatorCollectionPage";
import { randomInt } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdSlot } from "@/components/AdSlot";
import { AuthForm } from "@/components/AuthForm";
import { ContactForm } from "@/components/ContactForm";
import { CreatorCard } from "@/components/CreatorCard";
import { FeaturedCreators } from "@/components/FeaturedCreators";
import { FollowingFeed } from "@/components/FollowingFeed";
import { ForYouGallery } from "@/components/ForYouGallery";
import { HomeFilters } from "@/components/HomeFilters";
import { InfiniteGallery } from "@/components/InfiniteGallery";
import { JsonLd } from "@/components/JsonLd";
import { LegalPage } from "@/components/LegalPage";
import { MediaImg } from "@/components/MediaImg";
import { ModelsGrid } from "@/components/ModelsGrid";
import { SavedGallery } from "@/components/SavedGallery";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { formatCount } from "@/lib/format";
import { isCreatorLocale, localePath, localizedHref, resolveLocalizedPage, type Locale } from "@/lib/i18n/config";
import { DISCOVERY_COPY } from "./discovery-copy";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { buildLocalizedMetadata } from "@/lib/i18n/metadata";
import { buildModelsPagePayload, MODELS_PAGE_SIZE } from "@/lib/models-pagination";
import { getAllTags, getModelCount, getModels, getPhotos, getRankings } from "@/lib/photos";
import { type MediaType, type SortKey } from "@/lib/types";
import { creatorCollectionPath } from "@/lib/creator-collections";
import AddMediaPage from "@/app/(default)/add/page";
import FeedPage from "@/app/(default)/feed/page";
import PremiumPage from "@/app/(default)/premium/page";
import SearchPage from "@/app/(default)/recherche/page";
import FrenchAboutPage from "@/app/(default)/about/page";
import FrenchConditionsPage from "@/app/(default)/conditions/page";
import FrenchPrivacyPage from "@/app/(default)/confidentialite/page";
import FrenchContactPage from "@/app/(default)/contact/page";
import FrenchDmcaPage from "@/app/(default)/dmca/page";
import FrenchLegalPage from "@/app/(default)/mentions-legales/page";
import FrenchWhatIsPage from "@/app/(default)/qu-est-ce-que-lumengallery/page";
import FrenchTrustPage from "@/app/(default)/trust-and-safety/page";
import FrenchSupportPage from "@/app/(default)/contact/support/page";
import FrenchReportPage from "@/app/(default)/contact/signalement/page";
import FrenchPartnershipsPage from "@/app/(default)/contact/partenariats/page";
import FrenchPressPage from "@/app/(default)/contact/presse/page";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type LocalizedPageProps = {
  locale: Locale;
  pathname: string;
  searchParams: SearchParams;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");
const VALID_SORTS: SortKey[] = [
  "discover",
  "popular",
  "recent",
  "trending",
  "liked",
  "longest",
  "random",
];

function first(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function metaCopy(locale: Locale, pathname: string) {
  const pages = getDictionary(locale).pages;
  const byPath = {
    "/": pages.home,
    "/models": pages.models,
    "/trending-medias": pages.trending,
    "/most-liked": pages.mostLiked,
    "/classements": pages.rankings,
    "/influenceuses-tendances": pages.influencers,
    "/about": pages.about,
    "/dmca": pages.dmca,
    "/trust-and-safety": pages.trust,
    "/contact": pages.contact,
    "/conditions": pages.terms,
    "/confidentialite": pages.privacy,
    "/mentions-legales": pages.legal,
    "/qu-est-ce-que-lumengallery": pages.whatIs,
  } as const;
  return byPath[pathname as keyof typeof byPath]?.meta;
}

export async function localizedPageMetadata(
  locale: Locale,
  pathname: string,
  searchParams: SearchParams,
): Promise<Metadata> {
  const route = resolveLocalizedPage(locale, pathname);
  if (!route) notFound();
  if (route.kind === "creator") {
    if (!isCreatorLocale(locale)) notFound();
    return creatorCollectionMetadata({
      locale,
      handleParam: route.handle,
      collection: route.collection,
      searchParams: await searchParams,
    });
  }
  const copy = metaCopy(locale, pathname);
  if (copy) return buildLocalizedMetadata(locale, pathname, copy);
  return {
    title: getFunctionalTitle(locale, pathname),
    robots: { index: false, follow: true },
  };
}

function getFunctionalTitle(locale: Locale, pathname: string): string {
  const english: Record<string, string> = {
    "/recherche": "Search",
    "/feed": "Feed",
    "/random/medias": "Random media",
    "/pour-toi": "For you",
    "/abonnements": "Following",
    "/favoris": "Saved",
    "/add": "Add media",
    "/premium": "Premium",
    "/connexion": "Log in",
    "/inscription": "Sign up",
    "/contact/support": "Support",
    "/contact/signalement": "Report content",
    "/contact/partenariats": "Partnerships & creators",
    "/contact/presse": "Press & media",
  };
  const french: Record<string, string> = {
    "/recherche": "Recherche",
    "/feed": "Feed",
    "/random/medias": "Aléatoire",
    "/pour-toi": "Pour toi",
    "/abonnements": "Abonnements",
    "/favoris": "Enregistrés",
    "/add": "Ajouter un média",
    "/premium": "Premium",
    "/connexion": "Connexion",
    "/inscription": "Inscription",
    "/contact/support": "Support & aide",
    "/contact/signalement": "Signaler un contenu",
    "/contact/partenariats": "Partenariats & créateurs",
    "/contact/presse": "Presse & médias",
  };
  return (locale === "fr" ? french : english)[pathname] || "LeakFanHub";
}

export async function LocalizedPage({ locale, pathname, searchParams }: LocalizedPageProps) {
  if (!resolveLocalizedPage(locale, pathname)) notFound();
  switch (pathname) {
    case "/":
      return <LocalizedHome locale={locale} searchParams={searchParams} />;
    case "/models":
      return <LocalizedModels locale={locale} searchParams={searchParams} />;
    case "/trending-medias":
      return <LocalizedTrending locale={locale} searchParams={searchParams} />;
    case "/most-liked":
      return <LocalizedMostLiked locale={locale} searchParams={searchParams} />;
    case "/classements":
      return <LocalizedRankings locale={locale} />;
    case "/influenceuses-tendances":
      return <LocalizedInfluencers locale={locale} />;
    case "/about":
      return locale === "fr" ? <FrenchAboutPage /> : <EnglishAboutPage />;
    case "/contact":
      return locale === "fr" ? <FrenchContactPage /> : <EnglishContactPage />;
    case "/dmca":
      return locale === "fr" ? <FrenchDmcaPage /> : <EnglishDmcaPage />;
    case "/trust-and-safety":
      return locale === "fr" ? <FrenchTrustPage /> : <EnglishTrustPage />;
    case "/conditions":
      return locale === "fr" ? <FrenchConditionsPage /> : <EnglishTermsPage />;
    case "/confidentialite":
      return locale === "fr" ? <FrenchPrivacyPage /> : <EnglishPrivacyPage />;
    case "/mentions-legales":
      return locale === "fr" ? <FrenchLegalPage /> : <EnglishLegalPage />;
    case "/qu-est-ce-que-lumengallery":
      return locale === "fr" ? <FrenchWhatIsPage /> : <EnglishWhatIsPage />;
    case "/recherche":
      return <SearchPage locale={locale} searchParams={searchParams} />;
    case "/feed":
      return <FeedPage searchParams={searchParams} />;
    case "/random/medias":
      return <LocalizedRandom locale={locale} />;
    case "/pour-toi":
      return <LocalizedForYou locale={locale} />;
    case "/abonnements":
      return <LocalizedFollowing locale={locale} />;
    case "/favoris":
      return <LocalizedSaved locale={locale} />;
    case "/add":
      return <AddMediaPage />;
    case "/premium":
      return <PremiumPage />;
    case "/connexion":
      return <AuthPage mode="login" />;
    case "/inscription":
      return <AuthPage mode="signup" />;
    case "/contact/support":
      return locale === "fr" ? <FrenchSupportPage /> : <EnglishContactFormPage kind="support" />;
    case "/contact/signalement":
      return locale === "fr" ? <FrenchReportPage /> : <EnglishContactFormPage kind="report" />;
    case "/contact/partenariats":
      return locale === "fr" ? <FrenchPartnershipsPage /> : <EnglishContactFormPage kind="partnerships" />;
    case "/contact/presse":
      return locale === "fr" ? <FrenchPressPage /> : <EnglishContactFormPage kind="press" />;
    default: {
      const route = resolveLocalizedPage(locale, pathname);
      if (!route || route.kind !== "creator" || !isCreatorLocale(locale)) notFound();
      return <CreatorCollectionPage locale={locale} handleParam={route.handle} collection={route.collection} searchParams={await searchParams} />;
    }
  }
}

async function LocalizedHome({ locale, searchParams }: { locale: Locale; searchParams: SearchParams }) {
  const sp = await searchParams;
  const tag = first(sp.tag);
  const typeRaw = first(sp.type);
  const type: MediaType | undefined =
    typeRaw === "photo" || typeRaw === "video" || typeRaw === "pack" ? typeRaw : undefined;
  const sortRaw = first(sp.sort);
  const sort: SortKey = VALID_SORTS.includes(sortRaw as SortKey) ? (sortRaw as SortKey) : "discover";
  const [page, tags] = await Promise.all([
    getPhotos({ sort, tag, type, limit: 24 }),
    getAllTags(),
  ]);
  const dictionary = getDictionary(locale);
  const homeUrl = `${SITE}${localePath(locale, "/")}`;
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LeakFanHub",
    inLanguage: locale,
    url: homeUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE}${localizedHref(locale, "/recherche")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="px-2 py-3 sm:px-5 sm:py-4">
      <JsonLd data={websiteLd} />
      <h1 className="sr-only">{dictionary.pages.home.meta.title}</h1>
      <AdSlot variant="banner" />
      <FeaturedCreators
        title={dictionary.home.featured}
        viewAll={dictionary.home.viewAll}
        modelsHref={localePath(locale, "/models")}
        locale={locale}
      />
      <HomeFilters tags={tags} sort={sort} type={type} tag={tag} />
      <InfiniteGallery
        key={`${sort}|${tag ?? ""}|${type ?? ""}`}
        initial={page}
        params={{ sort, tag, type }}
      />
    </div>
  );
}

async function LocalizedModels({ locale, searchParams }: { locale: Locale; searchParams: SearchParams }) {
  const sp = await searchParams;
  const sort = first(sp.sort) === "views" ? "views" : "followers";
  const pageNumber = Math.max(1, Number.parseInt(first(sp.page) || "1", 10) || 1);
  const start = (pageNumber - 1) * MODELS_PAGE_SIZE;
  const [rows, total] = await Promise.all([
    getModels(sort, MODELS_PAGE_SIZE + 1, start),
    getModelCount(),
  ]);
  const page = buildModelsPagePayload(rows, start, MODELS_PAGE_SIZE);
  const copy = getDictionary(locale).models;
  const base = localePath(locale, "/models");
  const toggle = "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors";
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: copy.title,
    inLanguage: locale,
    url: `${SITE}${base}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: page.items.slice(0, 50).map((model, index) => ({
        "@type": "ListItem",
        position: start + index + 1,
        url: `${SITE}${creatorCollectionPath(model.handle, model.urlVersion ?? 1, "overview", isCreatorLocale(locale) ? locale : undefined)}`,
        name: model.name || model.handle,
      })),
    },
  };

  return (
    <div className="px-3 py-6 sm:px-5">
      <JsonLd data={itemListLd} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">{total} {copy.countSuffix}</p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
          <Link href={base} className={`${toggle} ${sort === "followers" ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-ink-muted)]"}`}>{copy.followers}</Link>
          <Link href={`${base}?sort=views`} className={`${toggle} ${sort === "views" ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-ink-muted)]"}`}>{copy.views}</Link>
        </div>
      </div>
      <ModelsGrid
        key={`${sort}:${start}`}
        initialModels={page.items}
        initialHasMore={page.hasMore}
        initialNextOffset={page.nextOffset}
        sort={sort}
        locale={locale}
      />
    </div>
  );
}

async function LocalizedTrending({ locale, searchParams }: { locale: Locale; searchParams: SearchParams }) {
  const sp = await searchParams;
  const typeRaw = first(sp.type);
  const type: MediaType | undefined = typeRaw === "photo" || typeRaw === "video" ? typeRaw : undefined;
  const copy = getDictionary(locale).pages.trending.meta;
  const labels = DISCOVERY_COPY[locale].windows;
  const windows = [
    { key: "day", label: labels[0], minutes: 1_440 },
    { key: "week", label: labels[1], minutes: 10_080 },
    { key: "month", label: labels[2], minutes: 43_200 },
    { key: "all", label: labels[3], minutes: 5_256_000 },
  ];
  const windowKey = first(sp.window) || "week";
  const windowDef = windows.find((item) => item.key === windowKey) || windows[1];
  const page = await getPhotos({ sort: "trending", type, limit: 24 });
  let items = page.items.filter((photo) => photo.ageMinutes <= windowDef.minutes);
  if (items.length < 8) items = page.items;
  const base = localePath(locale, "/trending-medias");

  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">{copy.title}</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
        {copy.description}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {windows.map((item) => (
          <Link key={item.key} href={`${base}?window=${item.key}${type ? `&type=${type}` : ""}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${windowKey === item.key ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"}`}>{item.label}</Link>
        ))}
      </div>
      <InfiniteGallery initial={{ ...page, items }} params={{ sort: "trending", type }} />
    </div>
  );
}

async function LocalizedMostLiked({ locale, searchParams }: { locale: Locale; searchParams: SearchParams }) {
  const sp = await searchParams;
  const cursorRaw = first(sp.cursor);
  const parsed = cursorRaw ? Number.parseInt(cursorRaw, 10) : Number.NaN;
  const cursor = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  const page = await getPhotos({ sort: "liked", limit: 24, cursor });
  const copy = getDictionary(locale).pages.mostLiked.meta;
  return (
    <div className="px-3 py-4 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold">{copy.title}</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-muted)]">{copy.description}</p>
      <InfiniteGallery initial={page} params={{ sort: "liked" }} />
    </div>
  );
}

async function LocalizedRankings({ locale }: { locale: Locale }) {
  const ranked = await getRankings(30);
  const maxScore = ranked[0]?.score || 1;
  const dictionary = getDictionary(locale);
  const copy = dictionary.pages.rankings.meta;
  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-5">
      <h1 className="text-2xl font-bold tracking-tight">🏆 {copy.title}</h1>
      <p className="mb-5 text-sm text-[var(--color-ink-muted)]">{copy.description}</p>
      {ranked.length === 0 ? <p className="py-16 text-center text-[var(--color-ink-muted)]">{DISCOVERY_COPY[locale].emptyRankings}</p> : (
        <ol className="flex flex-col gap-2">
          {ranked.map((creator, index) => (
            <li key={creator.handle}>
              <Link href={creatorCollectionPath(creator.handle, creator.urlVersion ?? 1, "overview", isCreatorLocale(locale) ? locale : undefined)} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <span className="w-8 text-center text-lg font-black">{index + 1}</span>
                <MediaImg src={creator.avatarUrl || ""} alt={creator.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-semibold"><span className="truncate">{creator.name}</span>{creator.verified ? <VerifiedBadge size={13} /> : null}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]"><div className="h-full bg-[var(--color-accent)]" style={{ width: `${Math.round((creator.score / maxScore) * 100)}%` }} /></div>
                </div>
                <div className="text-right"><p className="font-semibold">{formatCount(creator.views)}</p><p className="text-xs text-[var(--color-ink-faint)]">{dictionary.creator.views}</p></div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

async function LocalizedInfluencers({ locale }: { locale: Locale }) {
  const models = (await getModels("views", 100)).filter((model) => model.totalViews > 0);
  const copy = getDictionary(locale).pages.influencers.meta;
  return (
    <div className="px-3 py-6 sm:px-5">
      <h1 className="text-2xl font-bold tracking-tight">{copy.title} 🔥</h1>
      <p className="mb-5 text-sm text-[var(--color-ink-muted)]">{copy.description}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {models.map((creator) => <CreatorCard key={creator.handle} creator={creator} locale={locale} />)}
      </div>
    </div>
  );
}

function EnglishAboutPage() {
  const cards = [
    ["Community gallery", "Creator portraits, videos and editorial series in one fast discovery feed."],
    ["Discovery", "Explore popular and recent media with useful photo, video and interest filters."],
    ["Creator profiles", "Each creator has a profile with a gallery, statistics and follow controls."],
    ["Rankings", "Rankings highlight creators receiving the strongest community interest."],
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">About Leak<span className="text-[var(--color-accent)]">FanHub</span></h1>
      <p className="mt-3 text-lg text-[var(--color-ink-muted)]">A modern, dense and fast media gallery built for discovery.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{cards.map(([title, body]) => <section key={title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-bold">{title}</h2><p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">{body}</p></section>)}</div>
      <section className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-bold">Privacy by default</h2><p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">We avoid third-party advertising trackers and let visitors browse before creating an account.</p></section>
      <Link href="/en" className="mt-8 inline-flex rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white">Explore the gallery</Link>
    </div>
  );
}

function EnglishContactPage() {
  const channels = [
    ["/en/contact/support", "Support & help", "Report a bug, account problem or display issue."],
    ["/en/contact/signalement", "Report content", "Report inappropriate content, impersonation or privacy issues."],
    ["/en/contact/partenariats", "Partnerships & creators", "Creator publishing and commercial partnership requests."],
    ["/en/contact/presse", "Press & media", "Interviews, press questions and brand resources."],
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Contact</h1>
      <p className="mt-3 text-lg text-[var(--color-ink-muted)]">Choose the most relevant channel for a faster response. Copyright removal requests belong on the <Link className="text-[var(--color-accent)]" href="/en/dmca">DMCA page</Link>.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{channels.map(([href, title, body]) => <Link key={href} href={href} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-[var(--color-ink-muted)]">{body}</p></Link>)}</div>
      <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="font-bold">General email</h2><a href="mailto:contact@leakfanhub.com" className="mt-1.5 block font-mono text-sm">contact@leakfanhub.com</a></section>
    </div>
  );
}

function EnglishDmcaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">DMCA content removal</h1>
      <p className="mt-3 text-lg text-[var(--color-ink-muted)]">LeakFanHub respects intellectual-property rights. A valid request must identify the protected work, the exact URL, your authority and a good-faith statement.</p>
      <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"><h2 className="font-bold">Required information</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-muted)]"><li>Description of the protected work.</li><li>Exact LeakFanHub URL to remove.</li><li>Your contact details and electronic signature.</li><li>Accurate good-faith and authority statements.</li></ul></section>
      <h2 className="mt-10 text-2xl font-bold">Removal request form</h2>
      <div className="mt-6"><ContactForm kind="dmca" submitLabel="Send notification" fields={[{ name: "fullname", label: "Full name (signature)", required: true }, { name: "email", label: "Contact email", type: "email", required: true }, { name: "work", label: "Protected work", required: true }, { name: "url", label: "URL to remove", type: "url", required: true }]} reasons={["I am the rights holder", "I represent the rights holder"]} /></div>
    </div>
  );
}

function EnglishTrustPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Trust & Safety</h1>
      <p className="mt-4 text-lg text-[var(--color-ink-muted)]">LeakFanHub applies zero tolerance to illegal or non-consensual content and provides direct reporting channels.</p>
      <section className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-5"><h2 className="text-lg font-bold text-red-400">Content involving minors is strictly forbidden</h2><p className="mt-2 text-sm text-[var(--color-ink-muted)]">Any content involving a person under 18 is illegal and must be reported immediately. We remove it and may report it to the appropriate authorities.</p><Link href="/en/contact/signalement" className="mt-4 inline-flex rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white">Report content →</Link></section>
      <h2 className="mt-10 text-xl font-bold">Other prohibited content</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-muted)]"><li>Non-consensual content, doxxing and harassment</li><li>Extreme violence, threats and terrorism</li><li>Spam, malware and fraud</li><li>Copyright infringement</li></ul>
    </div>
  );
}

function EnglishTermsPage() {
  return <LegalPage title="Terms of use" updated="August 6, 2026" updatedLabel="Last updated" intro="By accessing LeakFanHub, you agree to these terms." sections={[{ heading: "Access", body: <p>LeakFanHub is an adults-only media gallery. Browsing is free; some account features require an identity.</p> }, { heading: "Content and rights", body: <p>Published content must respect intellectual-property rights, consent and applicable law.</p> }, { heading: "Prohibited behavior", body: <p>Harassment, impersonation, illegal content, security bypasses and abusive automation are forbidden.</p> }, { heading: "Availability", body: <p>The service is provided as available, and may change while we improve reliability and safety.</p> }]} />;
}

function EnglishPrivacyPage() {
  return <LegalPage title="Privacy policy" updated="August 6, 2026" updatedLabel="Last updated" intro="LeakFanHub is designed to minimize tracking and explain what is stored." sections={[{ heading: "Local preferences", body: <p>Likes, saved items and display preferences may be stored locally in your browser until you create an account.</p> }, { heading: "Optional accounts", body: <p>Account email is used for access and support. Passwords are hashed and are never stored in plain text.</p> }, { heading: "No advertising fingerprinting", body: <p>We do not use browser fingerprinting or third-party analytics for marketing profiles.</p> }, { heading: "Your rights", body: <p>You can clear local data or contact us to request access to or deletion of account data.</p> }]} />;
}

function EnglishLegalPage() {
  return <LegalPage title="Legal notice" updated="August 6, 2026" updatedLabel="Last updated" sections={[{ heading: "Publisher", body: <p>LeakFanHub is an independent project. Operator details are provided according to the legal operating structure.</p> }, { heading: "Hosting", body: <p>The service is hosted on dedicated infrastructure. Detailed provider information is maintained for legal requests.</p> }, { heading: "Intellectual property", body: <p>The site design is protected and individual media remains subject to its respective rights.</p> }, { heading: "Contact", body: <p>Use the Contact or DMCA pages for legal and content-removal requests.</p> }]} />;
}

function EnglishWhatIsPage() {
  const steps = [["01", "Explore", "Browse a continuous feed of photos, videos and packs without creating an account."], ["02", "Follow creators", "Creator profiles collect galleries and statistics in one place."], ["03", "Like and save", "Use likes and saved items to find media again and improve personal suggestions."], ["04", "Keep control", "Minimal local storage and clear reporting channels put privacy and safety first."]];
  return <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-accent)]">Welcome</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">What is Leak<span className="text-[var(--color-accent)]">FanHub</span>?</h1><p className="mt-3 text-lg text-[var(--color-ink-muted)]">An adults-only creator media gallery designed for fast discovery and clear safety controls.</p><div className="mt-8 flex flex-col gap-3">{steps.map(([number, title, body]) => <section key={number} className="flex gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><span className="text-2xl font-black text-[var(--color-accent)]">{number}</span><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-[var(--color-ink-muted)]">{body}</p></div></section>)}</div></div>;
}

async function LocalizedRandom({ locale }: { locale: Locale }) {
  const seed = randomInt(1_000_000_000);
  const page = await getPhotos({ sort: "random", seed, limit: 30 });
  return <div className="px-3 py-4 sm:px-5"><h1 className="text-2xl font-bold">{locale === "fr" ? "Aléatoire" : "Random media"}</h1><p className="mb-4 text-sm text-[var(--color-ink-muted)]">{locale === "fr" ? "Un nouvel ordre à chaque visite." : "A new order on every visit."}</p><InfiniteGallery initial={page} params={{ sort: "random" }} /></div>;
}

async function LocalizedForYou({ locale }: { locale: Locale }) {
  const [popular, trending] = await Promise.all([getPhotos({ sort: "popular", limit: 80 }), getPhotos({ sort: "trending", limit: 40 })]);
  const seen = new Set<string>();
  const items = [...popular.items, ...trending.items].filter((photo) => !seen.has(photo.id) && Boolean(seen.add(photo.id)));
  return <div className="px-3 py-5 sm:px-5"><h1 className="mb-1 text-2xl font-bold">{locale === "fr" ? "Pour toi" : "For you"}</h1><p className="mb-4 text-sm text-[var(--color-ink-faint)]">{locale === "fr" ? "Personnalisé selon tes interactions." : "Personalized from your interactions."}</p><ForYouGallery items={items} limit={80} /></div>;
}

function LocalizedFollowing({ locale }: { locale: Locale }) {
  return <div className="px-3 py-5 sm:px-5"><h1 className="mb-1 text-2xl font-bold">{locale === "fr" ? "Abonnements" : "Following"}</h1><p className="mb-4 text-sm text-[var(--color-ink-faint)]">{locale === "fr" ? "Les modèles que tu suis et leurs publications." : "Creators you follow and their latest posts."}</p><FollowingFeed /></div>;
}

function LocalizedSaved({ locale }: { locale: Locale }) {
  return <div className="px-3 py-5 sm:px-5"><h1 className="mb-4 text-2xl font-bold">{locale === "fr" ? "Enregistrés" : "Saved"}</h1><SavedGallery kind="saved" /></div>;
}

function AuthPage({ mode }: { mode: "login" | "signup" }) {
  return <div className="px-3 py-8 sm:px-5 sm:py-12"><AuthForm mode={mode} /></div>;
}

function EnglishContactFormPage({ kind }: { kind: "support" | "report" | "partnerships" | "press" }) {
  const copy = {
    support: { title: "Support & help", body: "Describe the bug, account issue or page problem with as much detail as possible.", apiKind: "support", fields: [{ name: "email", label: "Your email", type: "email" as const, required: true }, { name: "page", label: "Affected page or URL" }], reasons: ["Display issue", "Technical bug", "Account question", "Other"] },
    report: { title: "Report content", body: "Report inappropriate content, impersonation, privacy violations or harassment.", apiKind: "signalement", fields: [{ name: "email", label: "Your email", type: "email" as const, required: true }, { name: "url", label: "Reported content URL", type: "url" as const, required: true }], reasons: ["Inappropriate content", "Impersonation", "Privacy violation", "Harassment", "Other"] },
    partnerships: { title: "Partnerships & creators", body: "Tell us about your creator profile, portfolio or partnership proposal.", apiKind: "partenariats", fields: [{ name: "email", label: "Your email", type: "email" as const, required: true }, { name: "name", label: "Name or handle", required: true }, { name: "link", label: "Portfolio or profile", type: "url" as const }], reasons: ["Creator application", "Brand partnership", "Editorial collaboration", "Other"] },
    press: { title: "Press & media", body: "For interviews, project information and brand resources, include your outlet and deadline.", apiKind: "presse", fields: [{ name: "email", label: "Professional email", type: "email" as const, required: true }, { name: "outlet", label: "Publication", required: true }, { name: "deadline", label: "Publication deadline" }], reasons: ["Interview", "Project information", "Brand kit", "Other"] },
  }[kind];
  return <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6"><Link href="/en/contact" className="text-sm text-[var(--color-ink-muted)]">← Contact</Link><h1 className="mt-3 text-3xl font-black">{copy.title}</h1><p className="mt-3 text-[var(--color-ink-muted)]">{copy.body}</p><div className="mt-8"><ContactForm kind={copy.apiKind} fields={copy.fields} reasons={copy.reasons} /></div></div>;
}
