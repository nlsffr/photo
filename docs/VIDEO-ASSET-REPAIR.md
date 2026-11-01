# Remise en état des médias historiques

Les objets absents sont réparés depuis un plan privé immuable. Le service utilise
les identifiants existants et la source MegaBot vérifiée par SHA256 ; aucun secret
ne doit être copié dans Git.

Le listing complet du 1er novembre a trouvé 74 575 adresses vidéo non présentes
dans R2, avec 500 HEAD de confirmation. Les enregistrements source déjà présents
empêchaient les mégabots de réessayer ces imports incomplets. Les fichiers sont
rétablis sous leurs clés publiques existantes, avec PutObject IfNoneMatch=*, après
contrôle des retraits, du propriétaire source et du format par ffprobe. Les
miniatures sont de vraies images. UUID, source_id et version d’URL sont conservés.

Les 24 205 lignes sans URL vidéo ne sont pas supposées être des vidéos. Une photo
confirmée par la source peut être remise en état avec l’outil séparé, après
vérification de son type et de son identité. Les cas sans preuve restent à revoir.

Le plan de première passe comporte 74 156 candidats ; chaque exécution traite au
plus 25 éléments, avec une pause de deux secondes entre eux. Les refus de retrait,
changements d’identité et sources absentes sont consignés comme ignorés. Les
pannes réseau suspendent la progression pendant 60 secondes. Le checkpoint
SQLite et les verrous permettent une reprise après interruption.

Installation : code dans /opt/photo-media-repair/releases/<commit>, lien current,
plan privé /var/lib/video-repair/plan.json (0600) et état dans
/var/lib/video-repair/backfill (0700). Installer les unités de infra/systemd puis
activer leakfanhub-video-repair.timer. Conserver le package de file MegaBot installé
et la configuration privée /etc/megabot-queue/config.json.

```sh
systemctl status leakfanhub-video-repair.timer leakfanhub-video-repair.service
cat /var/lib/video-repair/backfill/progress.json
journalctl -u leakfanhub-video-repair.service --since '1 hour ago'
```

Pour arrêter la restauration : désactiver et arrêter le timer, puis arrêter le
service. L’arrêt SIGTERM déroule les nettoyages des téléchargements temporaires ;
le prochain lancement reprend les jobs interrompus. Ne pas effacer la base de
checkpoint pour réessayer. Aucun objet existant n’est remplacé ou supprimé.

Les compteurs de listing ne prouvent ni la décodabilité de chaque vidéo, ni la
récupérabilité de toutes les sources. Les éléments ignorés/review restent visibles
dans les rapports privés et nécessitent une décision distincte.
