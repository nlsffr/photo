# Une URL publique par ressource, avec préférence de langue

## Demande et autorisation

Le propriétaire a confirmé « Une seule URL, toutes langues » le 2 novembre 2026 : supprimer tous les préfixes publics en/fr/es/de/it/pt/nl, garder le choix automatique et le sélecteur. Il autorise les corrections, tests, commits, push et déploiement réversible. Ce lot remplace son ancien choix de versions publiques distinctes par langue ; il conserve les traductions et les valeurs de l’éditeur SEO.

## Résultat attendu

- Une page a une seule URL publique : `/models?page=2`, `/creator/videos`, `/creator/123-v2`, etc. Identifiants, versions, pagination, filtres, query et fragment sont conservés.
- La préférence `lfh_locale` valide prime sur `Accept-Language`, puis défaut `en`. Aucune détection par pays/IP ou User-Agent. Le sélecteur retient la préférence et recharge la même URL, même si elle possède un fragment.
- Les sept langues déjà disponibles restent disponibles sur les six découvertes, profils, collections et pages médias. Les pages fonctionnelles/éditoriales gardent leur couverture EN/FR et fallback anglais. Les routes héritées non traduites telles que `/tag/:tag` restent sur leur renderer anglais actuel, sans nouveau texte.
- Une ancienne URL à préfixe de langue reçoit308 vers son équivalent nu, query conservée. Cette redirection ne remplace pas le cookie de préférence : le navigateur ou le choix manuel reste prioritaire, même si un ancien résultat Google pointe sur `/en`. Les doublons imbriqués de langue et les variantes préfixées de namespaces techniques ne donnent pas accès à de nouvelles routes.
- Canonicals, OpenGraph URLs, JSON-LD, breadcrumbs et liens publics sont nus. Aucune liste hreflang de sept adresses redirigées. Les moteurs peuvent principalement voir l’anglais sans Accept-Language ; une seule URL ne garantit pas sept résultats de langue distincts.

## Architecture choisie par l’agent

Conserver les sept layouts/renderers existants comme destinations internes de `NextResponse.rewrite`. Les chemins `/fr/...` internes ne doivent jamais être liés, canonisés ni mis dans les sitemaps. Le Proxy traite d’abord les règles de domaine et les règles de ressource publique sur le chemin nu, puis renvoie la réécriture appropriée. Il n’utilise pas de fetch manuel du renderer.

Les helpers publics `localePath`, `localizedHref`, `switchLocalePath` et `creatorCollectionPath` rendent des chemins nus ; un nouveau `internalLocalePath(locale, pathname)` conserve explicitement la construction du chemin interne. Le Proxy n’appelle jamais le helper public pour construire sa destination interne.

Les API, médias binaires, `_next`, fichiers publics, robots/sitemaps et routes privées admin restent hors négociation/réécriture. Les alias `/tiktok`, `/creator/:handle`, `/photo/:id` gardent leur logique avant la réécriture. Les404/410/503, protections de retrait, versions et noindex gardent leur comportement ; une redirection historique ne republie jamais une ressource retirée.

Retirer la redirection `/creator/:handle` de next.config qui s’exécute avant le Proxy : le Proxy conserve seul sa résolution validée, y compris les handles versionnés. Construire les redirections à partir d’une URL canonique clonée, en affectant pathname/search ; jamais une concaténation susceptible de devenir une destination externe. Refuser antislashs et séparateurs encodés sur les anciennes variantes.

Réponses HTML/RSC négociées : `Cache-Control: private, no-store`, `Vary` ajoutant Cookie et Accept-Language sans supprimer les valeurs RSC/Next. Retirer les règles HTML `s-maxage=120` de next.config ; conserver le cache des ressources statiques, icônes et médias. Les données partagées neutres et caches explicitement clés par langue peuvent rester. Un changement manuel de langue force un rechargement document complet afin d’éviter un ancien Router Cache.

Les sitemaps médias sont déjà nus : partitions, frontières et requêtes SQL inchangées. Les sitemaps statiques et créateurs ne produisent qu’une entrée nue par ressource ; supprimer les hreflang de variantes. Aucune recréation de catalogue, aucune modification de noindex ni soumission d’indexation.

L’éditeur SEO conserve ses42 entrées (6 pages ×7 langues) et toutes leurs valeurs. Son invalidation vise la page publique et son renderer interne pour la langue enregistrée.

## Découpage et propriété des fichiers

1. Liens/sélecteur : `src/lib/i18n/config.ts`, `src/lib/creator-collections.ts`, `src/components/LocaleProvider.tsx`, liens directs dans `CreatorCollectionPage.tsx`, `LocalizedPage.tsx`, `SeoEditor*.tsx`, page admin. Tests de helpers/collections/sélecteur.
2. Routage/cache : `src/proxy.ts`, `next.config.ts`, éventuels helpers/tests de politique. Le propriétaire du Proxy consomme `internalLocalePath` et ne modifie pas le fichier config en parallèle.
3. Métadonnées/sitemaps : `src/lib/i18n/metadata.ts`, `src/lib/i18n/sitemap.ts`, `src/lib/creator-sitemap*.ts` de sérialisation seulement, éventuels appels de métadonnées/JSON-LD. Ne pas modifier `LocalizedPage.tsx`/`CreatorCollectionPage.tsx` simultanément avec1 : demander au propriétaire des liens les remplacements nécessaires.
4. Intégration et publication : parent, invalidation SEO, tests complets, build propre et canari avec retour arrière.

## Validation

- Même URL rend en/fr/es/de/it/pt/nl sur parcours pris en charge ; cookie > navigateur >en ; fallback ne remplace pas le cookie global.
- Anciens préfixes308 local uniquement, query conservée ; pas de boucle, de destination externe ni de redirection vers API/admin/assets. Chemins mal encodés et nested locales échouent proprement.
- Profils/médias retirés, mauvais propriétaire, ancienne version non courante, namespaces réservés et disponibilité DB conservent leurs statuts et robots.
- Models page2, collections page2, vidéos et photos ont canonical nu exact. Liens HTML et JSON-LD n’exposent aucun préfixe de langue. Sitemaps ne dupliquent pas les entrées ; médias restent dans les mêmes partitions.
- Sélecteur testé dans un vrai navigateur avec query+hash, changement dans les deux sens, URL inchangée, corps/html-lang/métadonnées cohérents, persistance et liens suivants.
- Tester Link/prefetch/retour arrière et ES→about(fallbackEN)→models(retourES), sans remplacer le cookie ES. Les aperçus de l’éditeur privé doivent choisir la langue du formulaire avant leur navigation nue.
- Comparaison requêtes successives/concurrentes en/fr/en sur une URL avec vérification du cache/Vary. Ne pas faire de test uniquement sur des mocks pour valider le Proxy Next réel.
- Empreintes de toutes les traductions et comparaison des valeurs SEO avant/après ; aucun changement aux cookies d’audience, données médias, retraits, bots, tarifs et clés.

## Déploiement et retour arrière

Base Git620bb236829bad3ee5046c2f43552daab25a6884 ; image web réellement active c3071647/29dab5870a4b, appCIDd303bb..., DB0f4c2210... . Vérifier de nouveau avant promotion. Ne pas construire depuis `/opt/photo` sale. Export Git propre, image dédiée, environnement effectif copié sans divulgation, canari puis changement du seul service application. Conserver cache MariaDB1GiB, montage persistant et4/2 réparateurs.

Sauvegarder Compose/env/état conteneur/Nginx de façon privée. Basculer temporairement l’edge vers le candidat testé pendant l’échange ; restaurer son fichier complet d’origine après disponibilité du nouveau. Le rollback restaure la précédente application et les seuls changements du déploiement, sans compte/clé/certificat renouvelé ni média supprimé.
