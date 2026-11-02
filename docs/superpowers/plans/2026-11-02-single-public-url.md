# Single Public URL Implementation Plan

> **For agentic workers:** Use incremental execution with assigned file ownership, focused tests and independent reviews. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une URL publique par ressource et langue choisie par cookie/navigateur/sélecteur.

**Architecture:** Réutiliser les renderers traduits derrière des rewrites internes Next16.4.3. Liens, canonicals et sitemaps restent nus ; les anciennes variantes redirigent308. Négociation privée sans cache partagé HTML.

**Tech Stack:** Next16.4.3 App Router/Proxy, React19, TypeScript, tests Node existants.

**Spec:** `docs/superpowers/specs/2026-11-02-single-public-url-design.md`

## Global Constraints

- Sept langues déjà disponibles, textes et42 valeurs SEO inchangés ; aucun nouveau fournisseur/dépendance.
- Pas de mutation médias, robots/noindex/retraits/versions, audience, bots, MariaDB, secrets ni indexation.
- API/assets/admin hors négociation ; versions/query/pagination/fragment conservés.
- Export propre et retour arrière du seul service app ; préserver réglages mémoire1GiB et réparateurs4/2.

## Review Focus

- Préfixe interne remontant dans un href, JSON-LD, canonical ou ancre d’éditeur.
- Cookies/Accept-Language ignorés par un cache HTML ou Router Cache.
- Alias, retirer/410, anciennes versions et namespaces techniques contournés par une rewrite trop précoce.
- Changement de langue avec query+hash ne produisant qu’une navigation de fragment.
- Pages de découverte2 et sitemaps créateurs dupliqués ou canonicalisés vers page1.

### Lot1 — helpers publics et sélecteur

**Files:** `src/lib/i18n/config.ts`, `src/lib/creator-collections.ts`, `src/components/LocaleProvider.tsx`, liens directs listés dans la spec ; tests i18n/collections/éditeur existants.

**Interfaces:** Exporte `internalLocalePath(locale: Locale, pathname: string): string` pour les seules rewrites/invalidation ; helpers publics rendent le chemin nu. `localeAlternates(pathname)` ne fournit plus de variantes de langue.

- [ ] Tests RED : `/fr/models?page=2`→`/models?page=2`, collections versionnées, href externes non modifiés, choix retenu et même URL après reload/hash.
- [ ] Implémenter helpers et sélecteur boutons ; corriger les préfixes codés en dur, sans changer les textes.
- [ ] Tests GREEN ciblés et diff sans dictionnaires ; commit du lot après revue.

### Lot2 — Proxy et politique de cache

**Files:** `src/proxy.ts`, `next.config.ts`, tests i18n/content routing/removed policy existants et tests NextRequest si nécessaires.

**Interfaces:** Consomme `internalLocalePath`, `chooseLocale`, `supportedLocaleForPath`, `resolveLocalizedPage`. Un chemin public passe les validations de ressource avant une réponse rewrite.

- [ ] Tests RED : root unique sept langues, cookie prioritaire,308ancien, API/admin/assets exclus, protections404/410/503 et alias conservés.
- [ ] Implémenter rewrites internes, redirects publics et private/no-store+Vary non destructif ; retirer seulement cache HTML public.
- [ ] Tests GREEN ciblés + build/test réel Next pour en/fr/en ; commit après revue.

### Lot3 — métadonnées, XML et éditeur

**Files:** `src/lib/i18n/metadata.ts`, `src/lib/i18n/sitemap.ts`, serializers créateurs et leurs tests ; parent `src/app/api/admin/seo/route.ts` pour invalidation.

**Interfaces:** Canonical public nu (pagination conservée), absence de languages hreflang ; une entrée par ressource. Invalidation public+internalLocalePath pour toute locale.

- [ ] Tests RED : canonicalsmodels/profils/médias2 nus, JSON-LD nu, un seul locstatique/créateur, partitions médias inchangées, invalidationFRetESpublique.
- [ ] Adapter helpers/serializers/invalidation seulement ; pas de requête SQL de partition ni valeur SEO modifiée.
- [ ] Tests GREEN et revue ; commit du lot.

### Lot4 — intégration et publication

- [ ] Rejouer suites concernées, TypeScript, lint, build ; comparer empreintes des traductions et valeurs SEO.
- [ ] Parcours navigateur et requêtes HTTP sept langues/anciennesURL/query/hash/caches, sitemaps XML et protections sur candidat.
- [ ] Push, CI et déploiement réversible depuis export propre ; canari validé avant promotion, contrôles publics après.
- [ ] Consigner précisément commit/tests/publié et limites SEO sans promesse d’indexation.
