# Réparation des métadonnées existantes

`dmca/dmca_reimport.py` est le point d'entrée installé sur le VPS. Il appelle
`dmca_metadata_repair.py`, sans téléchargement, création de média, notification
aux moteurs ou remise en publication. Le programme installé avant ce lot était
uniquement présent sur le VPS ; le commit de capture le conserve pour la revue.

Les fichiers locaux non suivis `reimport_payload.py` ne font pas partie de ce
programme et restent préservés dans leur worktree d'origine.

## Protections

- Un manifeste doit contenir une section de cibles reconnue et des listes
  d'identifiants valides. Un profil entier exige explicitement `photo_ids: []`.
  Une liste absente, une chaîne à la place d'une liste ou un identifiant invalide
  provoque une erreur avant toute connexion à la base.
- Le programme ignore les médias et créateurs masqués ou retirés.
- L'écriture SQL vérifie de nouveau le mapping, les identifiants et handles
  exacts, la source et la version lues, ainsi que les exclusions actuelles.
  Une modification concurrente ne compte pas comme une réparation réussie.
- Une version intégrée à la source qui ferait baisser la version active est
  refusée. Les versions contradictoires du manifeste restent signalées.

La jointure et les conditions sont exécutées dans le même
[UPDATE MariaDB](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/changing-deleting-data/update).
Le résultat dépend du nombre de lignes effectivement modifiées, conformément à
la documentation [ROW_COUNT](https://mariadb.com/docs/server/reference/sql-functions/secondary-functions/information-functions/row_count).

Le code de sortie 2 signale des cibles non résolues, exclues, contradictoires ou
modifiées entre lecture et écriture ; il ne signifie pas qu'un téléchargement a
échoué. Les écritures déjà validées dans le même lot conservent le comportement
de transaction existant. Aucun nouveau téléchargeur ni incrément de version
d'URL n'est ajouté par ce correctif.

## Vérifications

Les tests unitaires ne se connectent pas à une base :

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s dmca -p test_dmca_metadata_repair.py -v
```

Les 14 tests unitaires passent en local et sur le VPS. Vingt scénarios MariaDB
réels passent avec deux connexions dans une instance temporaire sans réseau,
sur des lignes synthétiques : changements concurrents de masquage, retrait,
mapping, créateur, casse, source et version, ainsi que simulation sans écriture.
Le runner refuse un schéma existant et supprime uniquement le schéma qu'il crée.

Pour une instance de test isolée avec socket UNIX, fournir explicitement
`TEST_DATABASE_URL` avec un schéma neuf préfixé `photo_metadata_guard_test_`,
et `TEST_DATABASE_SOCKET`, puis exécuter :

```sh
PYTHONDONTWRITEBYTECODE=1 python3 dmca/integration_dmca_metadata_repair.py
```

Le VPS possède déjà `mysql-connector-python` 26.7.0. Aucune modification
d'identifiant ni installation de dépendance en production n'est nécessaire.
Le manifeste réel a été validé sans connexion SQL : 63 profils entiers,
14 cibles explicites et 3 conflits de versions conservés. Cette validation
ne prouve ni l'indexation ni la réparation de ces cibles.

## Livraison

Le correctif concerne les scripts uniquement. Il ne demande ni construction
depuis `/opt/photo`, ni remplacement de l'image web, ni démarrage de service.
Préparer les fichiers dans un répertoire séparé, exécuter les tests, vérifier
que les empreintes des fichiers installés correspondent toujours à la capture,
puis conserver une copie privée avant remplacement atomique. Vérifier ensuite
les empreintes et relancer les tests unitaires sur les fichiers installés.

Le retour arrière restaure les scripts sauvegardés par remplacement atomique.
Il ne restaure pas d'anciens médias et ne réactive pas les anciens téléchargeurs.
Les exclusions SQL et les protections de l'application web restent nécessaires.

Le statut d'échec de `dmca-reimport.service` observé le 31 octobre provient de
son arrêt par SIGTERM le 30 octobre à 20:34 UTC. Il précède le programme actuel.
Ce lot ne remet pas le service ou son timer en marche et n'exécute pas de
réconciliation sur les données applicatives.
