# reimport_data.py — changement d’URL publique

Ce programme ne récupère aucun fichier et ne réactive aucun contenu masqué ou retiré. Il utilise la connexion `DATABASE_URL` déjà disponible dans son environnement, avec l’hôte et le port du DSN. Les secrets ne se passent pas sur la ligne de commande et ne sont pas affichés.

- Une URL de profil modifie uniquement `creators.url_version`. Les URL de ses collections héritent de cette version ; ses médias conservent leurs propres versions.
- Une URL média modifie uniquement `photos.url_version` et son horodatage. Son identifiant, son propriétaire et ses fichiers restent identiques.
- Une exécution ne peut modifier qu’une seule ligne. Les doublons, exclusions de visibilité, versions périmées et changements concurrents bloquent l’écriture.

## Simulation : comportement par défaut

```sh
python3 reimport_data.py https://leakfanhub.com/fr/alice-v3
python3 reimport_data.py https://leakfanhub.com/alice/42-v2 --dry-run
```

Ces exemples utilisent des identifiants fictifs. Remplacer par une URL publique actuelle. Les sept préfixes de langue sont reconnus. Les paramètres, fragments, domaines tiers et URL de collection (`/alice/photos`, etc.) sont refusés.

Les identifiants numériques sont conservés comme chaînes de 1 à 191 chiffres ASCII, y compris `0`, les zéros initiaux et les longues valeurs ; aucune conversion en entier ne modifie l’URL.

La simulation peut exécuter un SELECT borné, puis effectue un rollback : elle n’exécute aucun UPDATE. Un identifiant numérique dupliqué entre plusieurs créateurs actifs est refusé, comme une URL ambiguë. Exemple de résultat pour une URL média actuelle :

```json
{"action":"dry_run","next_version":3,"status":"would_bump_media","target_kind":"media","writes":0}
```

## Application explicite

```sh
python3 reimport_data.py https://leakfanhub.com/alice/42-v2 --apply
```

`--apply` et `--dry-run` sont incompatibles. Une répétition de l’ancienne URL après un incrément déjà réalisé renvoie `action: noop`, `status: already_advanced`, sans nouvel UPDATE. Une version plus éloignée renvoie `stale_url` et reste inchangée. Une erreur ou un UPDATE concurrent ayant affecté zéro ligne entraîne un rollback.

L’URL de profil `/alice-v3` devient `/alice-v4`. Le média `/alice/42-v2` devient `/alice/42-v3`. L’absence de suffixe correspond à la version 1 ; le suffixe explicite `-v1` est refusé, car le site ne le sert pas. Le site dérive son sitemap de la base : après renouvellement des caches, il annonce les versions courantes. Aucune suppression puis réinsertion manuelle dans le XML n’est nécessaire. Les anciennes versions cessent d’être servies selon les règles déjà présentes sur le site ; ce programme n’ajoute aucune redirection. Il ne notifie aucun moteur et ne promet aucune indexation.

Exécuter dans un contexte qui peut joindre l’hôte du DSN. Si l’opérateur utilise un autre espace réseau, `--db-host` et `--db-port` permettent seulement de changer cette adresse de connexion, sans modifier les identifiants ou la base ciblée.

## Lanceur sur le VPS

Sur le VPS, conserver `run_reimport_data.py` à côté de `reimport_data.py`, puis lancer depuis l’hôte avec les droits permettant Docker et `nsenter` :

```sh
python3 run_reimport_data.py https://leakfanhub.com/alice/42-v2
python3 run_reimport_data.py https://leakfanhub.com/alice/42-v2 --apply
```

Le premier appel reste une simulation. Le lanceur lit en mémoire les deux paramètres `DATABASE_URL` et `NEXT_PUBLIC_SITE_URL` de `photo-app-1`, sans les afficher. Il exécute le Python de l’hôte dans le seul espace réseau de cette application et utilise l’adresse de `photo-mariadb-1` sur `photo_lumen-internal`. Aucun port SQL public ni Python dans le conteneur applicatif n’est nécessaire. Le Python de l’hôte doit disposer de `mysql.connector`. Le lanceur refuse les conteneurs arrêtés, un réseau ambigu, une configuration manquante et tout argument `--db-host` ou `--db-port` fourni par l’opérateur.

Codes de sortie : `0` pour simulation valide, incrément réussi ou répétition déjà avancée ; `2` pour cible refusée/non trouvée/périmée/concurrente ; `1` pour erreur de configuration ou d’exécution. Seuls les noms de classes d’erreur sont journalisés, jamais les valeurs de connexion.
