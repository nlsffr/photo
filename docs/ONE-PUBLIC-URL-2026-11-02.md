# Une URL publique par page — publication du 2 novembre 2026

Demande confirmée par le propriétaire : « Une seule URL, toutes langues ».

Version applicative publiée : `54a14dab6c43d73df8ddce93e1af3bdfe08a0a79`, le 2 novembre à 17 h 52 min 45 s, heure de Paris. Image `photo-app:single-url-54a14da`, digest `sha256:bf99ad9ebb58e62c39ebe6da07c61a41731f5458cf02d317168921bc0ae3959d`.

## Comportement

Les préfixes publics en/fr/es/de/it/pt/nl redirigent en308 vers le chemin nu après vérification de la ressource. La langue est rendue derrière une rewrite interne : préférence valide du sélecteur, puis Accept-Language, puis anglais. Une ancienne URL ne remplace pas la préférence du visiteur. Le sélecteur recharge le même document, query et fragment conservés. Les pages sans traduction demandée gardent leur langue de repli existante.

Les liens, canonicals, URL OpenGraph et JSON-LD sont nus ; versions et pagination restent présentes. Le sitemap statique émet14URL uniques ; les serializers créateurs émettent une entrée par ressource. Partitions et requêtes des sitemaps médias inchangées. Les variantes de langue redirigées ne sont plus annoncées en hreflang.

## Validation réelle

- 390tests Node passent ;13cas Proxy utilisent de vrais NextRequest/NextResponse. Lint, TypeScript, compilation locale, image Docker etCI applicative passent.
- Canari puis contrôles publics :7langues sur accueil, modèles page2, collection vidéo page2, profil et média ; anciennesURL308 ; mauvaises versions/propriétaires et namespaces préfixés404. Retraits410 et pannes503 couverts par les tests de politique.
- Navigateur isolé : EN→FR→modèlesFR→EN→accueilEN ;23réponses RSC200 avec `private, no-store`. ES sur page2 avec fragment→page de repliEN→modèlesES→retourEN ; aucune erreur JavaScript.
- Après promotion, navigateur public : `/en/models?page=2#locale-check`→`/models?page=2#locale-check`, langueFR depuis navigateur français, puisEN via sélecteur avec URL inchangée. Canonical `/models?page=2`, `private, no-store`, sans Age ni réponse de cache HIT observée.
- Les9fichiers de traduction contrôlés et les7overrides SEO réellement sauvegardés sont identiques avant/après par SHA256. L’éditeur expose toujours42combinaisons, les35autres reposant sur les valeurs par défaut existantes.
- Le mécanisme de consentement et ses refus restent testés. Trois anciens tests beacon échouaient déjà sur620bb à cause d’un harness antérieur au consentement ; seul ce harness a été corrigé, avec cas refus/absence/chargement/révocation.

Le Proxy propose Cookie/Accept-Language dans Vary, mais Next16.4.3 remplace ce champ pendant le rendu par ses variantes RSC. La protection HTTP effective est `private, no-store`, vérifiée sur HTML et RSC ; le sélecteur recharge intégralement pour vider le Router Cache. RFC9110 §12.5.5 et RFC9111 §5.2.2.5 permettent cette décision sans patch du framework ni ajout d’une couche réseau.

## Déploiement et récupération

Construction depuis un export Git propre dans `/opt/photo-release-single-url-54a14da`, avec builder limité à1CPU et2GiB puis arrêté. Aucun build depuis le dépôt sale `/opt/photo`. Canari validé avant promotion ; environnement effectif copié sans changement. Seul le service app et son contexte/image Compose ont changé. Configuration Nginx temporaire restaurée exactement après l’échange.

Sauvegarde privée : `/opt/photo/backups/single-url-20261102T164849Z`. Ancien conteneur conservé : `photo-app-rollback-single-url-20261102T164849Z`. Procédure et état privés : `/opt/photo-single-url-54a14da/rollout.py` et `state.json` ; rollback automatique en cas d’échec de promotion. Le candidat n’est nettoyé qu’après preuve qu’un autre upstream est disponible.

MariaDB garde son conteneur et son cache1GiB ; réglages4réparateurs vidéo/2photo préservés. Aucun média supprimé, aucune rotation d’identifiants, aucun changement d’audience, aucune soumission d’indexation. Les moteurs peuvent conserver temporairement les anciennesURL ou extraits ; ce lot ne garantit ni délai de mise à jour ni sept résultats linguistiques distincts pour une mêmeURL.
