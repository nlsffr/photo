# Cohérence recherche et langues — 1er novembre 2026

État du code : `46a9023`, branche `fix/search-consistency-20261101`. Les trois lots applicatifs sont `be04f51`, `f8285ad` et `7cb7ce4`. Le merge `c0d8221` conserve les modifications CTR de l'autre intervention, présentes sur `origin/main` jusqu'à `78ea229`. Ce lot n'a pas modifié `main`.

## Corrections applicatives

1. **Utiliser de vraies images pour les miniatures.** `mediaThumbnailUrl` choisit une image déjà stockée dans `imageUrl`, puis dans `previewUrl`. Le chemin doit avoir une extension d'image reconnue ; une URL MP4/WebM, même munie d'un paramètre ressemblant à un nom d'image, est refusée. Les chemins relatifs sont normalisés depuis la racine du site, y compris sur une page localisée. URL malformées et protocoles autres que HTTP(S) sont exclus. Aucune miniature n'est générée. Sans image utilisable, la page média reste disponible, mais aucun `VideoObject` ni bloc vidéo XML invalide n'est émis ; une vidéo exige aussi son URL de contenu et sa date de publication.

2. **Conserver des canonicals distincts pour la pagination.** `/models?page=2` et le tri `sort=views` restent présents dans les canonicals, les alternates et les URL des données structurées. La première page et le tri par défaut sont normalisés sans paramètres superflus. Le parseur partagé utilise les mêmes limites pour les métadonnées et les données affichées.

3. **Étendre les profils et médias aux sept langues.** Les routes `en`, `fr`, `es`, `de`, `it`, `pt` et `nl` partagent les mêmes renderers, contrôles de visibilité et versions publiques. Chaque page dispose de son canonical et de sept alternates réciproques, plus `x-default`. Les profils conservent leur numéro de page ; les médias conservent leur propre version et la version du propriétaire dans leurs liens de profil. Les interfaces, commandes vidéo, commentaires et modèles de métadonnées sont traduits. Les titres, biographies et descriptions issus des sources restent inchangés : aucune traduction automatique ni contenu éditorial inventé. Le shell des routes sans préfixe est désormais stable en anglais ; le cookie ne change plus leur langue HTML. Les pages éditoriales et fonctionnelles restent limitées à EN/FR.

4. **Aligner le XML sans refaire les partitions.** Les sitemaps de créateurs gardent leurs entrées `<loc>` EN/FR et annoncent les sept langues avec `xhtml:link`, ainsi que `x-default`. La limite est de 12 000 profils par fichier ; la simulation maximale contrôlée représente environ 46 Mo, sous la limite vérifiée de 50 Mio. Un dépassement de capacité échoue explicitement. Le découpage des partitions médias reste inchangé.

## Validation et limites

Après intégration des changements CTR distants : 320 tests TypeScript réussis, ESLint et TypeScript sans erreur, construction locale de production Webpack réussie. Une instance locale issue de cette construction, avec données de démonstration, passe 21 contrôles HTTP : profil, deuxième page de modèles et média dans chacune des sept langues. Les contrôles vérifient la langue HTML, le canonical propre à la page et les huit alternates. Ces 21 contrôles ne constituent pas un essai avec la base de production. Dans Chrome, la page média allemande de démonstration a également été inspectée : navigation, commandes, statistiques et commentaires sont en allemand ; le titre source reste français comme prévu. La validation visuelle et interactive complète reste à faire.

Aucune migration SQL, modification massive des `noindex`, suppression de média ou rotation d'identifiants n'a été effectuée par ce lot.

## Déploiement encore à faire

L'utilisateur a confirmé qu'une autre intervention est en cours sur le VPS. Aucun déploiement applicatif de ce lot n'y a donc été réalisé. Il reste à coordonner l'état distant, construire et tester le candidat Docker depuis une source propre, effectuer les contrôles avec la configuration réelle puis préparer et vérifier le retour arrière avant toute promotion. Ne pas construire depuis le répertoire sale `/opt/photo`.

Les validations locales ne certifient ni l'indexation ni le classement dans les moteurs. Le candidat Docker, les contrôles de production, le retour arrière réel et les essais visuels restent à valider.
