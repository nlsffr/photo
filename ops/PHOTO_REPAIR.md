# Reprise des images absentes

`backfill-missing-photos.py` prépare un plan à partir de l'inventaire complet des
préfixes locaux et, facultativement, des seuls cas `video_url_empty` du plan vidéo.
Il ne suppose pas que ces derniers sont des photos : l'API source doit confirmer
strictement `is_video: false`, l'identité et le propriétaire avant restauration.
Les notices de retrait et les filtres d'activité sont revérifiés à l'exécution.

L'image entière est validée puis créée avec `IfNoneMatch=*`. Les objets existants
ne sont pas écrasés. Les URL, identifiants et versions publics sont conservés.
Une ancienne ligne vidéo peut devenir une photo uniquement après confirmation.

Le service `leakfanhub-photo-repair.service` traite 25 candidats avec une pause
d'au moins deux secondes ; le timer reprend après chaque lot. Son checkpoint est
distinct dans `/var/lib/photo-repair/backfill`, ses verrous par média sont partagés
avec le réparateur vidéo dans `/var/lib/video-repair/job-locks`. Une erreur réseau
déclenche une pause persistante ; un refus source ou une notice est consigné.

L'option `MEDIA_REPAIR_DIRECT_CDN=1` autorise les seuls téléchargements binaires du
nom CDN public exact déjà validé à passer directement. L'API conserve son transport
configuré. Un refus ne déclenche aucun essai par une autre route.

Déployer les quatre scripts frères de réparation/reprise depuis un commit propre
dans `/opt/photo-image-repair/releases/<commit>`, exécuter les tests Python, puis
pointer `/opt/photo-image-repair/current` vers ce dossier avant d'activer le timer.
Le plan préparé et son checkpoint doivent être conservés entre les versions.

Pour suspendre le traitement sans supprimer les fichiers restaurés :

```sh
systemctl disable --now leakfanhub-photo-repair.timer
systemctl stop leakfanhub-photo-repair.service
```

Le retour arrière consiste à restaurer le lien et les unités sauvegardés, puis à
recharger systemd. Si cette installation est la première, laisser le timer arrêté.
Les sauvegardes de métadonnées et journaux privés permettent d'auditer les écritures.
