# Cache MariaDB : lot réversible de 128 MiB à 1 GiB

Préparé le 2 novembre 2026 ; pas encore appliqué. Le serveur dispose de 8 Go, environ4,5Go disponibles ; le conteneur MariaDB n’a pas de plafond mémoire. MariaDB11.4.12 expose une taille de128MiB, `size_max` et `size_auto_min` de8TiB ; ce plafond réserve de l’adresse virtuelle et permet ici une augmentation en ligne. `chunk_size=0` est ignoré dans cette version. Aucun de ces trois autres réglages n’est modifié.

Sources officielles : [variables InnoDB actuelles, détails11.4.11+](https://github.com/mariadb-corporation/mariadb-docs/blob/main/server/server-usage/storage-engines/innodb/innodb-system-variables.md), [buffer pool](https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-buffer-pool). Les pages de documentation mises en cache qui indiquent un plafond égal à la taille initiale ne décrivent pas le défaut de11.4.12 ; la valeur réelle a été lue avant de préparer ce lot.

Le premier cas réel de tag/récent/vidéo/nonIA a expiré au budget diagnostic2s. L’essai de réécriture « IDs puis contenu » a ensuite donné167,5ms avant,57,6ms après, puis56,8ms avant réchauffé, avec31ID identiques dans le même ordre. **Essai retiré : aucun gain SQL à chaud démontré.** Les19 tests existants passent ; les deux tests du candidat retiré avaient passé également. Les relevés privés et le patch écarté restent dans le dossier de travail de l’intervention.

À14:35:57Paris, compteurs globaux :1,787Md demandes de pages,125,496M lectures physiques (~7,02%),2,056To lus depuis136055s. Cela justifie un essai de cache mesuré, sans attribuer chaque timeout à ce seul facteur.

## Application par le parent après revue

Mettre en pause le pilote d’inventaire, sans modifier les bots. Lire d’abord le plan avec `python3 ops/resize-mariadb-buffer-pool.py` sur le VPS. Vérifier l’ID exact, l’ancienne taille, le plafond et la mémoire fraîche. Le script lit seulement `DB_ROOT_PASSWORD` dans le fichier privé existant `/opt/photo/.env.prod` (propriétaire du processus, aucune permission de groupe/autres). Le secret passe sur l’entrée standard du client, sans figurer dans les arguments ni être affiché.

L’accès root a été confirmé par un unique `SELECT 1` et la lecture des privilèges avec ce secret existant, identique à deux sauvegardes historiques. Il diffère de la variable root du conteneur courant, refusée par le volume existant ; l’essai sans mot de passe a aussi été refusé. Le compte applicatif possède les droits des bases, mais pas `SUPER`. Aucun compte, mot de passe, variable d’environnement ou privilège n’a été modifié. Le client utilise `--no-defaults` pour éviter une autre source d’authentification implicite.

```sh
python3 ops/resize-mariadb-buffer-pool.py --apply \
  --expected-container-id 0f4c22104a4dca44bbff21584fe54847121e54d0cd0d9ae03f10d70814969330 \
  --backup /opt/photo-db-cache/backups/20261102/before.json
```

Le script sauvegarde l’identité, les variables et les SHA des autres fichiers`.cnf`, crée seulement `/etc/mysql/conf.d/90-buffer-pool.cnf`, puis envoie un unique `SET GLOBAL innodb_buffer_pool_size=1073741824`. Il vérifie le réglage, les autres variables, les montages et la lecture du fichier par `my_print_defaults`. Aucun redémarrage, migration, changement d’utilisateur, montage de données ou reconstruction. En cas d’arrêt partiel, la sauvegarde indique l’étape atteinte ; traiter cet état avant toute nouvelle tentative.

Le fichier copié survit au redémarrage du même conteneur. Pour une recréation future, **le parent doit ajouter si absent le seul montage du fichier de configuration dans le Compose effectif**, avec sauvegarde et comparaison sémantique du service MariaDB ; ni environnement, commande, ports, réseaux ni autres volumes ne doivent changer. Le fichier source existant `infra/mariadb/tuning.cnf` contient déjà1G. Les Compose prod/vps de ce commit reçoivent seulement ce montage ; le Compose de base le possède déjà. Ne pas lancer `compose up` dans ce lot.

## Vérification et retour arrière

Rejouer le même échantillon de requête à budget2s, sans purger le cache, sans gros scan ni préchauffage artificiel. Relever les compteurs physiques/logiques, la mémoire et les erreurs àT0 puis30–60s et quelques minutes sous trafic naturel ; les deltas sont globaux et ne doivent pas être attribués intégralement à une requête. Vérifier l’accès public et la progression des bots. Aucune baisse garantie sur une seule mesure chaude.

```sh
python3 ops/resize-mariadb-buffer-pool.py --rollback /opt/photo-db-cache/backups/20261102/before.json
```

Retour à128MiB et retrait du seul fichier créé, après vérification de son SHA et de l’identité du conteneur. Toute modification tierce fait arrêter le rollback. Le parent restaure aussi sa seule ligne de Compose si elle avait été ajoutée, sans toucher aux modifications déjà présentes.
