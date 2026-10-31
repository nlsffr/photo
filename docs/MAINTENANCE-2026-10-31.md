# Maintenance du 31 octobre 2026

Ce lot corrige les exclusions des agrégats, la confidentialité et les erreurs de disponibilité. Il n'ajoute pas de pages indexables, ne republie aucun contenu et ne lance aucune soumission à un moteur.

## Agrégats de collections

La migration 020 remplace individuellement les trois triggers de collections et conserve les exclusions de retrait. Un média masqué ne contribue plus aux compteurs ni à la date du dernier contenu. La visibilité des créateurs reste contrôlée par les requêtes de lecture. Les tables photos et creators ne sont pas modifiées.

Prérequis : migration 019 déjà appliquée, MariaDB compatible avec CREATE OR REPLACE TRIGGER atomique, tables InnoDB, innodb_table_locks=1. Exécuter sur une connexion dédiée qui abandonne et ferme la connexion à la première erreur, sans option --force. Le remplacement des triggers est du DDL : les trois remplacements ne forment pas une transaction globale. Le recalcul des compteurs utilise autocommit=0, un verrou de lecture sur les photos et un verrou d'écriture sur les agrégats, puis COMMIT et déverrouillage. En cas d'échec, faire ROLLBACK, déverrouiller et fermer avant de réessayer. Les délais d'attente sont de cinq secondes et chaque requête de recalcul est limitée à quinze secondes.

Application en production le 31 octobre à 13 h 54 UTC : 12 instructions, opération et vérification en 8,03 secondes, 10 483 lignes d'agrégats contrôlées, zéro divergence avec les médias non masqués et non retirés, trois triggers tenant compte du masquage. Sauvegarde préalable des agrégats et définitions : /opt/photo/backups/visibility-privacy-20261031T135408Z, accès privé. Aucune ligne de média supprimée, masquée ou réactivée.

Validation isolée : l'ancienne migration compte trois médias au lieu de deux visibles. La nouvelle version passe les transitions de visibilité, retraits, insertions, suppressions de fixtures, transferts de créateur, type/date/engagement, rollback et réexécution. Une panne injectée après remise à zéro laisse les anciens agrégats intacts après rollback. Un writer attend la libération du verrou et deux insertions concurrentes conservent les bons compteurs. Les schémas de test sont supprimés après les essais.

Pour reproduire, fournir TEST_DATABASE_URL avec un nom de schéma neuf préfixé photo_visibility_test_ puis lancer node tests/collection-visibility.integration.mjs. Le test crée et supprime uniquement ce schéma ; il refuse un autre préfixe et échoue si le schéma existe déjà. Ne pas utiliser la base applicative. Le script ops/verify-creator-collection-stats.mjs compare ensuite en lecture seule les compteurs aux mêmes exclusions.

## Commentaires

Le GET ne sélectionne plus les e-mails et construit explicitement un contrat public id/body/created_at/username. L'interface n'affiche jamais l'e-mail comme pseudonyme. Une base absente ou une erreur SQL renvoie 503 comments_unavailable. L'écran distingue le chargement, une vraie liste vide et une panne avec réessai ; les réponses périmées sont ignorées.

La table comments n'a pas été créée par ce lot. La capacité reste donc indisponible tant que son stockage manque. Le POST et ses contrôles d'authentification et de visibilité restent inchangés. Treize tests couvrent le contrat public, les erreurs et l'écran.

## Disponibilité

readyz teste réellement MariaDB avec une connexion dédiée, les mêmes paramètres DATABASE_URL/DB_SSL/DB_SSL_CA que l'application et un délai global de 1,5 seconde incluant la connexion et la fermeture. Les sondes concurrentes sont regroupées et le résultat conservé une seconde. Une socket bloquée est détruite, sans endommager le pool de l'application. Une panne ou configuration absente renvoie 503 ; une sonde réussie renvoie 200. Les réponses sont no-store et ne publient aucun détail d'infrastructure.

Redis et Elasticsearch ne sont pas des dépendances obligatoires des parcours applicatifs examinés ; ils ne conditionnent pas ce contrôle. healthz reste le contrôle de vie du processus. Six tests incluent un véritable pair TCP local muet, une requête bloquée, une fermeture bloquée et trente sondes concurrentes.

## Upload

L'ancien endpoint annonçait un traitement sans conserver le fichier. Il refuse désormais explicitement l'envoi par 503 upload_unavailable, avant toute lecture du corps et sans accès au stockage. La page FR/EN explique l'indisponibilité et ne propose plus de formulaire trompeur. Aucun stockage ni mécanisme de publication n'a été ajouté. Huit tests couvrent la route et les états de compte de l'écran.

## Validation et déploiement

281 tests TypeScript réussis, tests SQL réels sur un schéma isolé, ESLint et TypeScript sans erreur. Constructions de production locale Webpack et Docker Turbopack réussies. Instance candidate testée avant promotion, puis image photo-app:protective-0f22abb-20261031 déployée à 13 h 57 UTC. Le contrôle public readyz répond 200, ready:true et no-store ; conteneur healthy, zéro redémarrage au contrôle. L'environnement a été comparé et préservé à l'identique. Retour arrière conservé : photo-app-rollback-protective-20261031T135706Z. Le recalcul SQL protecteur est compatible avec l'ancienne image ; un rollback applicatif ne doit pas réintroduire les compteurs incluant les médias masqués.

Dans le navigateur public isolé, les écrans /fr/add et /en/add affichent l'indisponibilité et aucun champ de fichier. Une page média échantillonnée répond 200 ; le bloc commentaires montre la panne et son bouton de réessai produit une nouvelle requête, sans faux Aucun commentaire. Aucune erreur JavaScript observée pendant ces essais. Images/vidéos et enregistrement des statistiques neutralisés ; aucune écriture de compte ou de contenu réalisée.

Le code part de eaa6023, version réellement déployée. La référence locale origin/main était ancienne ; la mise à jour distante a confirmé eaa6023 comme parent de main. Il n'y avait pas de rollback de GitHub. Les correctifs de code sont poussés dans le commit 0f22abba4b33f877bcc36b5ea30fa5506ddfbd6e ; les compléments de documentation sont publiés ensuite sans changement du code de l'image.

Les autres défauts du rapport global restent ouverts, notamment feed, navigation, paiement Premium, traductions et mesures de charge. Ce lot ne certifie ni l'indexation intégrale, ni la lecture de tous les médias, ni la capacité sous forte concurrence.
