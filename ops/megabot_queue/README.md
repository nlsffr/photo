# File persistante des mégabots

Quatre emplacements partagent une file SQLite de profils nommés. Un profil n'a
qu'un propriétaire actif ; le catalogue ne change pas sous des plages numériques
déjà attribuées. Les profils non encore parcourus sont prioritaires, puis les
profils terminés deviennent éligibles à une nouvelle vérification après 24 heures.

## Transition depuis les anciens lots

Les anciens processus ont chargé chacun une liste en mémoire, sans la sauvegarder.
Le service prépare la file et attend **la fin des quatre anciens processus** avant
de lancer sa première génération de workers. Il ne les interrompt pas. Cette
barrière est nécessaire pour ne pas mélanger deux répartitions du catalogue.
Après cette transition unique, chaque emplacement enchaîne ses tâches seul.

Le premier catalogue éligible est ordonné par `handle`, avec priorité à partir
de l'indice 4000, puis au début de la liste. Les profils ajoutés ensuite sont
insérés sans changer l'ordre des tâches existantes. Chaque invocation traite au
plus dix pages et sauvegarde la progression après chaque page réussie.

## Erreurs et retraits

- Une panne, un statut HTTP d'erreur ou une réponse JSON invalide ne vaut jamais
  une page vide. La page sera réessayée avec un délai de 60 secondes à une heure.
  Une panne réseau ou une réponse 429/500/502/503/504 suspend pendant 60 secondes
  les nouvelles attributions, sans interrompre les autres tâches déjà en cours.
- Deux pages réellement vides terminent un profil. La limite historique de 200
  pages et la limite de stockage du bot sont conservées ; atteindre une limite
  ne fait pas passer le travail restant pour terminé.
- Un profil absent, masqué ou retiré de l'index n'est pas publié. Son état est
  revérifié pendant le traitement et verrouillé durant l'insertion SQL.
- Un média dont la fiche source répond 404 est ignoré explicitement, sans être
  téléchargé ni publié. Les vérifications suivantes peuvent le réexaminer.
- Les quatre nouveaux workers partagent des verrous par identifiant de média.
  Le contrôle des médias déjà présents reste actif. Les URL publiques et leurs
  versions ne sont pas modifiées par cette file.

Les jobs actifs n'expirent pas sur un simple délai : un téléchargement peut être
long. Le superviseur confirme la fin d'un worker avant de libérer sa tâche. Un
verrou hérité par les enfants interdit une seconde génération tant qu'un ancien
worker vit encore. Le service doit conserver `KillMode=control-group`.

## Installation et commandes

Installer une révision dans `/opt/megabot-queue/releases/<commit>` puis pointer
`/opt/megabot-queue/current` vers cette révision. La configuration privée
`/etc/megabot-queue/config.json` (root, mode 0600) comporte `source_path`,
`expected_sha256`, `state_dir` et `env`. Les identifiants sont repris de la
configuration existante, jamais stockés dans Git. La source MegaBot existante
n'est pas modifiée ; son SHA256 doit correspondre avant tout import.

```sh
/opt/megabot/venv/bin/python -B /opt/megabot-queue/current/ops/megabot_queue/supervisor.py check --config /etc/megabot-queue/config.json
/opt/megabot/venv/bin/python -B /opt/megabot-queue/current/ops/megabot_queue/supervisor.py status --config /etc/megabot-queue/config.json
systemctl status megabot-queue.service
journalctl -u megabot-queue.service --since '1 hour ago'
```

`check` est en lecture seule : source, connexion SQL, nombre de profils éligibles
et anciens processus. Il ne télécharge et ne publie aucun média.

La copie versionnée `maison_controller.py` conserve le protocole de l'application
iPad. Le démarrage d'un emplacement réactive la file au lieu de relancer l'ancienne
plage. L'arrêt met cet emplacement en pause durablement. Le contrôleur doit être
basculé par un drop-in systemd réversible, sans écraser l'ancien fichier Maison.

Un statut de file indisponible ne permet jamais de retomber sur une relance des
anciens lots. Les fichiers `status.json` et `control.json` restent privés.

Pour arrêter le nouveau système : `systemctl stop megabot-queue.service`. Pendant
la transition, cette commande n'arrête pas les anciens mégabots indépendants.
Le retour arrière restaure le drop-in précédent du contrôleur Maison et la cible
précédente du lien `current`, après l'arrêt des nouveaux workers. Préserver la
base de file et les médias ; ne pas effacer la progression pour réessayer.

## Vérification isolée

```sh
python3 -m unittest discover -s tests -p 'test_megabot_*.py' -v
```

Les tests utilisent des répertoires temporaires et des doubles réseau/SQL. Ils
couvrent notamment l'exclusivité entre processus, les erreurs distinctes de la
fin, les checkpoints, les retraits et les contrôles de l'iPad.
