# Cohérence recherche et langues — 1er novembre 2026

État final publié et déployé : source `a135f9911866b94d355158ab7ac1c662b0c8b7a8`. La reprise initiale utilisait `b95fe9b879b90c4a14e2523171c374bfad248bd4`, publiée sur `main` par avance rapide depuis `78ea229`. Les trois lots applicatifs initiaux sont `be04f51`, `f8285ad` et `7cb7ce4`. Cette intégration conserve les changements CTR de l'autre intervention : contrôle opaque de 252 chaînes sur 252, sans relecture ni réécriture de leur contenu.

L'image finale `photo-app:related-a135f99-20261101`, identifiant `sha256:cbb958245599dc8fb9aefac05c6fd0070e813c9e93473b22619a5542e711b967`, a été construite depuis `/opt/photo-release-related-a135f99-20261101` et déployée le 1er novembre à 01:02:06 UTC (02:02:06 à Paris). Aucune construction n'a utilisé le checkout sale `/opt/photo`. La première reprise avait eu lieu à 00:36:04 UTC (01:36:04 à Paris), puis la restauration des paramètres GeoIP antérieurs à 00:40:08 UTC (01:40:08 à Paris), avec l'image initiale `photo-app:search-b95fe9b-20261101`.

## Corrections applicatives

1. **Utiliser de vraies images pour les miniatures.** `mediaThumbnailUrl` choisit une image déjà stockée dans `imageUrl`, puis dans `previewUrl`. Le chemin doit avoir une extension d'image reconnue ; une URL MP4/WebM, même munie d'un paramètre ressemblant à un nom d'image, est refusée. Les chemins relatifs sont normalisés depuis la racine du site, y compris sur une page localisée. URL malformées et protocoles autres que HTTP(S) sont exclus. Aucune miniature n'est générée. Sans image utilisable, la page média reste disponible, mais aucun `VideoObject` ni bloc vidéo XML invalide n'est émis ; une vidéo exige aussi son URL de contenu et sa date de publication.

2. **Conserver des canonicals distincts pour la pagination.** `/models?page=2` et le tri `sort=views` restent présents dans les canonicals, les alternates et les URL des données structurées. La première page et le tri par défaut sont normalisés sans paramètres superflus. Le parseur partagé utilise les mêmes limites pour les métadonnées et les données affichées.

3. **Étendre les profils et médias aux sept langues.** Les routes `en`, `fr`, `es`, `de`, `it`, `pt` et `nl` partagent les mêmes renderers, contrôles de visibilité et versions publiques. Chaque page dispose de son canonical et de sept alternates réciproques, plus `x-default`. Les profils conservent leur numéro de page ; les médias conservent leur propre version et la version du propriétaire dans leurs liens de profil. Les interfaces, commandes vidéo, commentaires et modèles de métadonnées sont traduits. Les titres, biographies et descriptions issus des sources restent inchangés : aucune traduction automatique ni contenu éditorial inventé. Le shell des routes sans préfixe est désormais stable en anglais ; le cookie ne change plus leur langue HTML. Les pages éditoriales et fonctionnelles restent limitées à EN/FR.

4. **Aligner le XML sans refaire les partitions.** Les sitemaps de créateurs gardent leurs entrées `<loc>` EN/FR et annoncent les sept langues avec `xhtml:link`, ainsi que `x-default`. La limite est de 12 000 profils par fichier ; la simulation maximale contrôlée représente environ 46 Mo, sous la limite vérifiée de 50 Mio. Un dépassement de capacité échoue explicitement. Le découpage des partitions médias reste inchangé.

## Validation et limites

Après intégration des changements CTR distants : 320 tests TypeScript réussis, puis 325 tests Web avec le correctif des recommandations ; ESLint, TypeScript et construction Docker de production réussis. Dix tests supplémentaires des helpers de restauration de l'environnement ont réussi. La validation locale avec données de démonstration comprenait 21 contrôles HTTP ; la reprise initiale a ensuite passé 27 contrôles sur le candidat et 27 en production. La promotion finale a passé deux séries de 30 contrôles avec la base réelle, sur le candidat puis en production : sondes, API de catalogue non vide, profils, médias et pages 2 de Modèles dans les sept langues, profil précédemment lent, collection vidéo française et médias avec recommandations par tags. Langue HTML, canonical propre à la page et huit alternates sont vérifiés. Les séries répètent des contrôles ; ce n'est pas un parcours exhaustif du catalogue.

Dans Chrome, la page 2 de Modèles fonctionne et présente son canonical paginé. Le conteneur final est healthy, avec readiness MariaDB réussie. Les contrôles de promotion ont réussi ; la validation visuelle et interactive exhaustive reste à faire. Les dépassements SQL observés après la reprise initiale sont détaillés ci-dessous, distinctement de l'incident d'authentification.

Aucune écriture sur les lignes réelles du catalogue, modification massive des `noindex`, suppression de média ou rotation d'identifiants n'a été effectuée par ce lot. Une migration de schéma additive a été appliquée : l'index secondaire 022 décrit ci-dessous. Les tests SQL du script d'URL ont utilisé uniquement des tables temporaires de session.

## Dépassements SQL et correction mesurée

Après la reprise initiale, les journaux ont révélé 14 erreurs de recommandations avec un budget SQL de 10 secondes et une erreur d'agrégat de profil avec un budget de 5 secondes. Le statut healthy ne détectait pas ces requêtes spécifiques. Le profil `/alexapearl` reproduisait le problème en 5 145 ms : HTTP 200, mais digest serveur dans la réponse. Un statut HTTP seul était donc insuffisant pour valider cette page.

Les recommandations utilisent maintenant les six premiers tags distincts après normalisation, au plus 100 identifiants par correspondance exacte ou héritée, soit 1 200 candidats indexés maximum avant classement. Leur budget SQL est de deux secondes. Seul ce dépassement connu produit une liste de recommandations vide et un journal indiquant le type de requête, sans valeurs sensibles ; les erreurs inattendues continuent de remonter. Le classement choisit les meilleurs médias dans cette fenêtre bornée : sa composition n'est pas garantie identique au classement global antérieur.

Mesures des mêmes trois médias avec tags, deux passages alternés chacun :

| Essai de recommandations | Résultat des six requêtes |
| --- | --- |
| Requête antérieure, budget de reproduction de 2 s | 6 dépassements sur 6 |
| Première borne à 500 candidats par correspondance | 1 dépassement sur 6 |
| Borne finale à 100 candidats par correspondance | 6 réussites, 11 à 374 ms, 12 résultats par requête |

La migration `022-creator-public-stats-index.sql` a été appliquée à 01:00:01 UTC : création de `idx_photos_creator_public_stats` en 23,259 secondes, avec `ALGORITHM=INPLACE`, `LOCK=NONE` et attente de verrou limitée à cinq secondes. L'index couvre les colonnes de visibilité et de compteurs de l'agrégat existant, sans changer son SQL ni ses filtres. `EXPLAIN` confirme `Using index`. Les deux mesures d'agrégat sont passées de deux dépassements à cinq secondes à 18 et 20 ms ; les six compteurs sont identiques. Le profil `/alexapearl` a ensuite répondu en 633 ms, HTTP 200 sans digest. Ces mesures ne constituent pas un test de charge général.

L'index ajoute du stockage et du travail lors des mises à jour des compteurs. Il ne modifie aucune ligne du catalogue ; son retrait manuel réversible est documenté dans la migration. Les index de tri préexistants restent présents.

## Incident de base et reprise réellement effectuée

La page d'erreur portant le digest `599011933` correspondait aux refus MariaDB `1045 / ER_ACCESS_DENIED_ERROR`. La configuration du conteneur applicatif utilisait un mot de passe et un nom de base différents du snapshot fonctionnel ; plusieurs paramètres antérieurs et le montage GeoIP manquaient aussi. La cause opérationnelle établie est cette configuration applicative incompatible avec la base existante. L'auteur et la commande ayant recréé ce conteneur ne sont pas établis ; aucun changement des comptes ou droits SQL n'a été confirmé.

Les valeurs existantes ont été récupérées depuis un snapshot privé, puis testées depuis le même réseau source. `SELECT 1` et les contrôles du schéma ont réussi : 437 569 lignes de photos, 10 529 créateurs et 150 comptes. Ce sont des nombres de lignes de tables, pas des nombres de médias actifs, de fichiers accessibles ou de pages indexées. Aucune valeur secrète n'est publiée dans ce document.

L'environnement applicatif et le montage GeoIP en lecture seule ont été restaurés. La liste des proxys autorisés a été remise exactement à sa valeur antérieure vérifiée :

```text
186.2.160.0/24,186.2.167.0/24,186.2.168.0/24,45.10.240.0/24,45.10.241.0/24
```

Les fichiers `.env` et `.env.prod` sont conservés en mode `0600`. Le service applicatif Compose référence l'image nommée ci-dessus, le contexte de construction propre et une sonde `/api/readyz`. La résolution effective de l'environnement a été comparée exactement aux valeurs attendues ; les autres services Compose sont restés inchangés. Aucun redémarrage global de la pile ni changement des identifiants MariaDB n'a été nécessaire. Contrairement à l'ancienne sonde `/api/healthz`, la readiness vérifie l'accès réel à la base.

La promotion finale conserve exactement les paramètres applicatifs restaurés ; la résolution effective de l'environnement et les autres services Compose ont été comparés sans changement. Retour arrière applicatif le plus récent : `photo-app-rollback-db-20261101T010120Z`. Sauvegarde privée correspondante : `/opt/photo/backups/db-recovery-20261101T010120Z`. Les sauvegardes de reprise `003913Z` et du premier état défaillant `003453Z` restent conservées. Le retour arrière du conteneur ne retire pas automatiquement l'index additif. La présence de ces sauvegardes ne constitue pas une restauration complète hors VPS testée.

## Moteurs et sitemaps après reprise

Le sitemap public annonce 851 fichiers enfants. Cinq fichiers XML échantillonnés ont répondu 200 ; aucune référence MP4 de miniature n'a été relevée dans les échantillons du sitemap populaire (1 939 références) et d'un sitemap médias (175 références). Ce contrôle n'est pas une validation exhaustive des 851 fichiers. `/sitemaps` redirige de nouveau en 308 vers l'adresse canonique ; `robots.txt` annonce le sitemap canonique.

Dans Bing, le sitemap canonique a été soumis de nouveau le 1er novembre et son traitement est en cours. L'ancienne entrée en erreur, dont le dernier traitement affiché date du 27 octobre, a été conservée. Yandex a été revérifié après la reprise : son outil Sitemap confirme toujours un mode lecture seule, avec ajout et retraitement désactivés ; les deux entrées restent dans la file affichée depuis le 9 octobre. Aucune soumission Yandex n'a donc été effectuée.

Les erreurs 5xx peuvent ralentir l'exploration et, si elles persistent, entraîner une désindexation. Un retour HTTP 200 ne garantit pas l'indexation immédiate. L'effet réel de cet incident temporaire sur la couverture et les positions n'est pas encore mesuré. Référence : [traitement des codes HTTP par Google](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes).

## Nouveau script de changement d'URL

Le script créé par l'autre intervention a été corrigé, versionné dans `9ace204` et installé à `/opt/photo/dmca/reimport_data.py` le 1er novembre à 00:48:59 UTC (01:48:59 Paris). L'original est conservé dans `/opt/photo/backups/reimport-data-20261101T004859Z`. Son lanceur `/opt/photo/dmca/run_reimport_data.py` réutilise la connexion de l'application active et son espace réseau, sans publier de port de base ni exposer les identifiants dans les arguments ou sorties. L'installation n'a redémarré aucun service.

La simulation est le comportement par défaut ; `--apply` est nécessaire pour changer une version. Une URL de profil cible seulement la ligne du créateur ; une URL média cible seulement son média. Sept langues, versions publiques et identifiants numériques stockés comme chaînes sont pris en charge. Les anciennes demandes déjà avancées ne provoquent pas un second incrément ; les cibles privées, retirées, ambiguës ou non canoniques sont refusées. Le script ne réimporte pas de fichiers et ne modifie pas les exclusions de visibilité. Le sitemap dynamique annoncera les versions courantes après expiration de ses caches, sans manipulation manuelle du XML.

Validation : les 47 tests Python du répertoire DMCA passent, dont les nouveaux tests du script, du lanceur et de l'isolation. Les 27 scénarios SQL ont réussi sur des tables `TEMPORARY` vérifiées, dans une connexion dédiée fermée sans commit. Deux simulations ont ensuite réussi avec le catalogue réel et le lanceur installé, pour un média et un profil : zéro UPDATE et versions inchangées. Aucun `--apply` n'a été lancé sur le catalogue. Voir [le mode d'emploi](REIMPORT-DATA.md).

## Travail restant

- Le bot Twitter n'a pas été retrouvé et n'a pas été relancé ; son identification reste ouverte.
- Le résultat du traitement Bing et le rétablissement de l'outil Yandex restent à vérifier ultérieurement. Les mesures historiques de performances ne mesurent pas l'effet de ce déploiement.
- Les autres défauts fonctionnels de l'audit global et les essais complets des médias, de charge et de restauration hors VPS ne sont pas certifiés par ce lot.
