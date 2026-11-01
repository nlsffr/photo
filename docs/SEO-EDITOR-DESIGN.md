# Éditeur privé de titres et descriptions

Demande : modifier directement les métadonnées servies par le VPS, pour les sept langues, au moyen d'une petite interface et d'un bouton Enregistrer. Aucun envoi automatique aux moteurs. Aucun texte réécrit ou optimisé par l'agent.

Choix de réalisation : ajouter `/admin/seo` à l'application actuelle. Première version : accueil et cinq pages de découverte, sept langues. Une écriture MariaDB remplace les métadonnées de cette page/langue au prochain rendu, sans nouvelle construction. Les autres pages et les textes du catalogue restent inchangés.

L'accès réutilise les sessions existantes et une liste d'identifiants de propriétaires dans `SEO_EDITOR_USER_IDS`. Le compte demandé n'existe pas encore : une invitation à usage unique, dont seul le condensat est stocké, permettra à son propriétaire de choisir son mot de passe. Son lien sera livré dans un fichier local privé ; aucun email n'est envoyé et aucun secret n'est demandé dans le chat.

Le titre enregistré est exact : pas de suffixe ajouté. Titre HTML, meta description, Open Graph et Twitter utilisent les mêmes valeurs. L'éditeur charge les valeurs réellement servies (modèle de titre compris), garde les saisies en cas d'erreur, refuse une révision périmée et permet d'annuler le dernier enregistrement pendant la session. Un historique SQL conserve les versions précédentes.

Contrôles : droits sur chaque route, origine des écritures, limites de taille, requêtes paramétrées, comparaison de révision, absence d'indexation des pages privées, impossibilité de réutiliser une invitation, et invalidation ciblée des pages après enregistrement. Vérification par interface locale et contrôles HTTP réels. Déploiement depuis une source propre avec conservation du conteneur précédent.

## Exploitation

Appliquer les migrations `023-seo-editor.sql` et `024-seo-editor-invites.sql` avant d'activer la fonctionnalité. Elles créent uniquement les tables de réglages, d'historique et d'invitations ; aucune ligne du catalogue n'est modifiée.

Lancer `node ops/prepare-seo-editor.mjs --email <adresse> --output <fichier-absolu>` avec les variables d'environnement habituelles de l'application. Le dossier de destination doit appartenir à l'utilisateur courant et être privé (`0700`). Le fichier est créé exclusivement en `0600` : aucun fichier existant n'est écrasé. Le résultat public fournit uniquement l'identifiant à ajouter à `SEO_EDITOR_USER_IDS` ; le lien d'activation reste dans le fichier privé. L'invitation expire après 24 heures et ne peut pas remplacer un mot de passe existant.

Le propriétaire choisit lui-même son mot de passe. Le lien d'activation place le secret dans le fragment de l'URL, retiré immédiatement par la page. Ensuite, la connexion habituelle ouvre `/admin/seo`. Aucun service de messagerie ni moteur de recherche n'est contacté par ce processus.

Enregistrer écrit une révision et son historique dans une même transaction. Un onglet périmé doit recharger la version actuelle avant de réessayer. Si l'invalidation du cache échoue après l'écriture, l'interface conserve la révision reçue et annonce une actualisation en attente. Le bouton d'annulation pendant la session enregistre une nouvelle révision avec les valeurs précédentes.

Un retour arrière de l'application conserve les trois tables et leurs données. L'ancienne application ignore les réglages, ce qui permet de rétablir son comportement sans supprimer l'historique.
