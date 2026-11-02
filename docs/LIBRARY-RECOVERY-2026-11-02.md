# Reprise complète de la bibliothèque — 2 novembre 2026

La restauration est en cours ; ce rapport ne signifie pas que tous les médias sont réparés.

## Couverture vérifiée

Manifeste de 501 584 lignes actives observé de 18 h 00 à 18 h 10 Paris, listing terminé à 18 h 25 :

- 64 565 références vidéo principales absentes du listing (66 174 dans le relevé précédent).
- 1 286 références photo principales absentes.
- 14 653 lignes encore classées vidéo sans URL vidéo (16 222 auparavant).

Les 65 851 références principales absentes ont toutes une entrée dans les files existantes. Le croisement de 18 h 27 compte 63 410 pending, 337 retry, 5 running, 2 003 exclusions, 96 done à réconcilier avec le passage antérieur du listing. Les 14 653 lignes sans URL sont toutes couvertes par la file photo, qui exige confirmation source du type, de l’identité et du propriétaire avant toute reclassification.

Les 2 325 anciennes références de vidéo utilisées comme miniature sont également toutes connues de la file vidéo. Aucun supplément de plan ni retrait des exclusions n’a été nécessaire.

Le listing et les checkpoints ne sont pas simultanés. Parmi 139 cas ensuite trouvés done mais absents de ce listing ancien, les 100 plus anciens contrôlés par HEAD sont tous présents et non vides ; 39 n’ont pas été contrôlés. Cela explique des courses temporelles, sans démontrer une lecture intégrale de tous les objets.

## Corrections publiées

- `c30b6d8` : autorise un poster dérivé lorsque les deux références image sont NULL/vides, avec CAS et reprise exacte ; ce cas supplémentaire n’a pas été observé dans la cohorte des 2 325 anciens posters, qui avaient tous image=vidéo et preview NULL.
- `88c335e` : erreurs réseau/JSON/MySQL distinguées par codes assainis ; aucun message, URL ou secret transmis dans les erreurs publiques. Exclusions et backoff inchangés.
- `6ec1766` : corrige l’attente indéfinie des retries derrière tous les pending. Un compteur SQLite durable réserve un retry éligible après 25 claims ; la rotation par ancienneté empêche un retry de monopoliser ces créneaux. Claims, compteur et tentatives sont transactionnels.
- `c7c5c53` : plafond du pool porté à 500, plafond série conservé à 100. L’unité vidéo utilise 500 tâches par lot et une limite de durée de 7 200 s ; quatre workers et délai de deux secondes conservés. Cela réduit la fréquence de drainage des lots : trois slots avaient été observés libres pendant le téléchargement final d’un fichier de 638 Mo dans un lot de 100.

Les nouveaux paramètres s’appliquent aux prochains lots. Les processus déjà lancés terminent avec leur code/arguments initiaux. Les liens vidéo et photo pointent sur `c7c5c535cfe6e25cf4107ea2d5b686dff3ef722a` depuis 18 h 43 min 29 s Paris ; daemon-reload effectué, aucun service arrêté ou redémarré pour cette publication. L’application web reste sur `54a14da`.

## Validation

222 tests Python passent localement (un saut lié à l’environnement) et sur le VPS (aucun saut), dont un test réel de 102 tâches prouvant la poursuite des slots pendant un gros travail, concurrence maximale de quatre, refus au-delà de 500 et reprise sans doublon. Fairness et scripts d’activation relus indépendamment.

Après publication de `6ec1766`, les nouveaux coordinateurs ont créé le compteur durable. Sept anciens retries photo étaient déjà finalisés à 18 h 40. À 18 h 44, un des trois anciens échecs vidéo contrôlés en dry-run était réellement restauré, un autre avait repris son téléchargement ; ces preuves ne prétendent pas que les 127 anciens retries vidéo soient tous corrigés.

Contrôle public distinct : cinq vidéos restaurées répondent HEAD200 et Range206 ; trois téléchargements complets correspondent au SHA256 du téléversement et une image vidéo se décode pour chacune. 6 688 381 octets téléchargés au total. Le contrôle confirme cet échantillon, pas la lecture intégrale de la bibliothèque.

L’inventaire a émis 657 appels R2 LIST/HEAD sur trois exécutions reprenant le même checkpoint, puis 100 HEAD de réconciliation séparés. Aucun payload média téléchargé par ces deux audits. Deux suspensions conservatrices résultaient de latence publique ; la reprise finale a limité à trois essais les contrôles de santé transitoires. Les réparateurs sont restés actifs.

## Reprise et retour arrière

Sauvegarde publication fairness : `/opt/photo-media-repair/rollouts/recovery-20261102T172556Z`.
Sauvegarde publication lots : `/opt/photo-media-repair/rollouts/pool-batch-20261102T174329Z`.

Les états privés contiennent les anciennes cibles de liens, les empreintes et la sauvegarde exacte de l’unité vidéo. Pour revenir en arrière, restaurer uniquement les liens effectivement modifiés et l’unité dont l’empreinte correspond encore à celle publiée, puis daemon-reload. Les lots déjà initialisés peuvent continuer sous leur version initiale ; ne pas tuer un téléchargement en progression pour accélérer une simple prise en compte. Si la santé exige un arrêt, utiliser l’arrêt propre du groupe prévu par l’unité et conserver les checkpoints, plans et fichiers restaurés.

Aucune suppression de média, aucun changement d’identifiant/version/URL publique de page, aucun remplacement d’objet existant, aucun redémarrage application/MariaDB, aucune rotation d’identifiants. Les sources refusées, les conflits d’identité et les avis de retrait restent exclus ; davantage de workers ne résout pas ces cas. La fin de la restauration dépend du débit réel et de la disponibilité des originaux ; aucun délai de réparation totale n’est garanti.
