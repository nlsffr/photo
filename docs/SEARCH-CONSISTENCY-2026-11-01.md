# Cohérence recherche et langues — 1er novembre 2026

État final vérifié : source `b95fe9b879b90c4a14e2523171c374bfad248bd4`, publiée sur `main` par avance rapide depuis `78ea229`. Les trois lots applicatifs sont `be04f51`, `f8285ad` et `7cb7ce4`. L'intégration conserve les changements CTR de l'autre intervention : contrôle opaque de 252 chaînes sur 252, sans relecture ni réécriture de leur contenu.

L'image `photo-app:search-b95fe9b-20261101`, identifiant `sha256:6d8d7ae1d6c9d645953f7c5c2b15b4efa579a9106a7025d8c3dec9692d0d2ea0`, a été construite depuis `/opt/photo-release-search-b95fe9b-20261101`. Aucune construction n'a utilisé le checkout sale `/opt/photo`. Première reprise le 1er novembre à 00:36:04 UTC (01:36:04 à Paris), puis dernier remplacement applicatif à 00:40:08 UTC (01:40:08 à Paris), avec restauration des paramètres GeoIP antérieurs.

## Corrections applicatives

1. **Utiliser de vraies images pour les miniatures.** `mediaThumbnailUrl` choisit une image déjà stockée dans `imageUrl`, puis dans `previewUrl`. Le chemin doit avoir une extension d'image reconnue ; une URL MP4/WebM, même munie d'un paramètre ressemblant à un nom d'image, est refusée. Les chemins relatifs sont normalisés depuis la racine du site, y compris sur une page localisée. URL malformées et protocoles autres que HTTP(S) sont exclus. Aucune miniature n'est générée. Sans image utilisable, la page média reste disponible, mais aucun `VideoObject` ni bloc vidéo XML invalide n'est émis ; une vidéo exige aussi son URL de contenu et sa date de publication.

2. **Conserver des canonicals distincts pour la pagination.** `/models?page=2` et le tri `sort=views` restent présents dans les canonicals, les alternates et les URL des données structurées. La première page et le tri par défaut sont normalisés sans paramètres superflus. Le parseur partagé utilise les mêmes limites pour les métadonnées et les données affichées.

3. **Étendre les profils et médias aux sept langues.** Les routes `en`, `fr`, `es`, `de`, `it`, `pt` et `nl` partagent les mêmes renderers, contrôles de visibilité et versions publiques. Chaque page dispose de son canonical et de sept alternates réciproques, plus `x-default`. Les profils conservent leur numéro de page ; les médias conservent leur propre version et la version du propriétaire dans leurs liens de profil. Les interfaces, commandes vidéo, commentaires et modèles de métadonnées sont traduits. Les titres, biographies et descriptions issus des sources restent inchangés : aucune traduction automatique ni contenu éditorial inventé. Le shell des routes sans préfixe est désormais stable en anglais ; le cookie ne change plus leur langue HTML. Les pages éditoriales et fonctionnelles restent limitées à EN/FR.

4. **Aligner le XML sans refaire les partitions.** Les sitemaps de créateurs gardent leurs entrées `<loc>` EN/FR et annoncent les sept langues avec `xhtml:link`, ainsi que `x-default`. La limite est de 12 000 profils par fichier ; la simulation maximale contrôlée représente environ 46 Mo, sous la limite vérifiée de 50 Mio. Un dépassement de capacité échoue explicitement. Le découpage des partitions médias reste inchangé.

## Validation et limites

Après intégration des changements CTR distants : 320 tests TypeScript réussis, ESLint et TypeScript sans erreur, construction locale de production Webpack réussie. Dix tests supplémentaires des helpers de restauration de l'environnement ont réussi. La validation locale avec données de démonstration comprenait 21 contrôles HTTP ; elle a ensuite été complétée par deux séries de 27 contrôles avec la base réelle, sur le candidat puis en production. Ces séries couvrent les sondes, une API de catalogue non vide et les profils, médias et pages 2 de Modèles dans les sept langues : langue HTML correcte, canonical propre à la page et huit alternates. Il ne s'agit pas de 54 URL distinctes ni d'un parcours exhaustif du catalogue.

Dans Chrome, la page 2 de Modèles fonctionne et présente son canonical paginé. Le conteneur est healthy au dernier relevé, avec readiness MariaDB réussie, sans nouvelles erreurs d'authentification ni digest serveur observés dans les contrôles de reprise. La validation visuelle et interactive exhaustive reste à faire.

Aucune migration, écriture SQL de réparation, exécution de réimport, modification massive des `noindex`, suppression de média ou rotation d'identifiants n'a été effectuée par ce lot.

## Incident de base et reprise réellement effectuée

La page d'erreur portant le digest `599011933` correspondait aux refus MariaDB `1045 / ER_ACCESS_DENIED_ERROR`. La configuration du conteneur applicatif utilisait un mot de passe et un nom de base différents du snapshot fonctionnel ; plusieurs paramètres antérieurs et le montage GeoIP manquaient aussi. La cause opérationnelle établie est cette configuration applicative incompatible avec la base existante. L'auteur et la commande ayant recréé ce conteneur ne sont pas établis ; aucun changement des comptes ou droits SQL n'a été confirmé.

Les valeurs existantes ont été récupérées depuis un snapshot privé, puis testées depuis le même réseau source. `SELECT 1` et les contrôles du schéma ont réussi : 437 569 lignes de photos, 10 529 créateurs et 150 comptes. Ce sont des nombres de lignes de tables, pas des nombres de médias actifs, de fichiers accessibles ou de pages indexées. Aucune valeur secrète n'est publiée dans ce document.

L'environnement applicatif et le montage GeoIP en lecture seule ont été restaurés. La liste des proxys autorisés a été remise exactement à sa valeur antérieure vérifiée :

```text
186.2.160.0/24,186.2.167.0/24,186.2.168.0/24,45.10.240.0/24,45.10.241.0/24
```

Les fichiers `.env` et `.env.prod` sont conservés en mode `0600`. Le service applicatif Compose référence l'image nommée ci-dessus, le contexte de construction propre et une sonde `/api/readyz`. La résolution effective de l'environnement a été comparée exactement aux valeurs attendues ; les autres services Compose sont restés inchangés. Aucun redémarrage global de la pile ni changement des identifiants MariaDB n'a été nécessaire. Contrairement à l'ancienne sonde `/api/healthz`, la readiness vérifie l'accès réel à la base.

Retour arrière conservé après la dernière reprise : `photo-app-rollback-db-20261101T003913Z`. Sauvegarde privée correspondante : `/opt/photo/backups/db-recovery-20261101T003913Z`. La première sauvegarde de l'état défaillant reste également disponible : `/opt/photo/backups/db-recovery-20261101T003453Z`. La présence de ces sauvegardes ne constitue pas une restauration complète hors VPS testée.

## Moteurs et sitemaps après reprise

Le sitemap public annonce 851 fichiers enfants. Cinq fichiers XML échantillonnés ont répondu 200 ; aucune référence MP4 de miniature n'a été relevée dans les échantillons du sitemap populaire (1 939 références) et d'un sitemap médias (175 références). Ce contrôle n'est pas une validation exhaustive des 851 fichiers. `/sitemaps` redirige de nouveau en 308 vers l'adresse canonique ; `robots.txt` annonce le sitemap canonique.

Dans Bing, le sitemap canonique a été soumis de nouveau le 1er novembre et son traitement est en cours. L'ancienne entrée en erreur, dont le dernier traitement affiché date du 27 octobre, a été conservée. Yandex avait annoncé un incident avec accès en lecture seule lors du relevé précédent ; son état n'a pas été revérifié après la reprise.

Les erreurs 5xx peuvent ralentir l'exploration et, si elles persistent, entraîner une désindexation. Un retour HTTP 200 ne garantit pas l'indexation immédiate. L'effet réel de cet incident temporaire sur la couverture et les positions n'est pas encore mesuré. Référence : [traitement des codes HTTP par Google](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes).

## Travail restant

- Le nouveau `reimport_data.py` demandé par l'utilisateur est en cours d'audit ; il n'a pas été exécuté. Ne pas confondre cette revue avec une reprise d'import réalisée.
- Le bot Twitter n'a pas été retrouvé et n'a pas été relancé ; son identification reste ouverte.
- Le traitement Bing et l'état Yandex doivent être contrôlés ultérieurement. Les mesures historiques de performances ne mesurent pas l'effet de ce déploiement.
- Les autres défauts fonctionnels de l'audit global et les essais complets des médias, de charge et de restauration hors VPS ne sont pas certifiés par ce lot.
