# Stockage des commentaires — 3 novembre 2026

Le chargement des commentaires renvoyait `503 comments_unavailable` parce que
la table `comments` manquait dans la base effective de l'application. Le message
d'erreur représentait une indisponibilité réelle ; il n'a pas été remplacé par
une réponse vide de succès.

Seul le bloc `CREATE TABLE comments` de
`migrations/007-comments-notifications-history.sql` a été appliqué. Avant la
création, l'absence de la table, les droits existants et la compatibilité des
clés parentes ont été vérifiés. Les définitions des tables et les métadonnées
préalables sont conservées dans un reçu privé, sans export de données utilisateur.

Les tables parentes, les trois autres créations de la migration, les médias,
les identifiants d'infrastructure et le code applicatif restent inchangés.
Aucun build ni redémarrage n'était nécessaire. Le schéma créé conserve les deux
clés étrangères et l'index `(photo_id, created_at)`.

La vérification réelle confirme : GET sur un média actif en 200, média absent
en 404, POST sans authentification en 401. Aucun commentaire de test n'a été
publié. Le plan SQL utilise les clés primaires et l'index des commentaires.
Les 14 tests de `tests/comments-privacy.test.ts` passent ; ils couvrent notamment
le contrat public, la confidentialité, les exclusions, les erreurs et les sept
langues de l'interface.

Cette création est additive. Ne pas supprimer automatiquement la table pour un
retour arrière : des utilisateurs peuvent déjà y avoir écrit. Conserver les
données et diagnostiquer tout éventuel écart avant une autre migration.
