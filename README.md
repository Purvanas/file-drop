# FileDrop

**Partager un fichier ou du texte avec un lien temporaire, sans créer de compte.**

[Ouvrir l’application](https://drop.purvanas.fr) · [Portfolio](https://purvanas.fr)

FileDrop est une application web personnelle que je développe et héberge pour simplifier les échanges ponctuels. Le parcours tient en quelques étapes : déposer un fichier, choisir sa durée de disponibilité, ajouter un mot de passe si nécessaire, puis transmettre le lien.

Ce dépôt présente l’application et ses choix de conception. **Le code source n’est pas publié ici** : il ne s’agit pas d’un paquet à installer ou d’une distribution prête à auto-héberger.

## Du dépôt au téléchargement

L’application accepte les fichiers et les extraits de texte. Un même principe les relie : chaque partage possède un lien et une date d’expiration. La durée est réglable de 15 minutes à 24 heures ; un mot de passe peut protéger l’accès.

Les fichiers peuvent atteindre 500 Mo dans la configuration actuelle. Leur transfert est découpé en blocs de 5 Mo, puis assemblé côté serveur : cela permet de passer par le proxy sans envoyer tout le fichier dans une seule requête. Les sessions de transfert abandonnées font également l’objet d’un nettoyage.

À la consultation, le serveur vérifie la disponibilité du partage et, le cas échéant, son mot de passe. Le téléchargement peut ensuite utiliser un jeton à courte durée de vie. Les liens expirés affichent un état dédié et les fichiers concernés sont supprimés par le nettoyage périodique.

## Une application full-stack volontairement légère

| Couche | Choix |
| --- | --- |
| Interface | HTML, CSS et JavaScript, sans framework frontend |
| Serveur | Node.js, Express et Multer |
| Stockage | Fichiers sur disque ; métadonnées des partages en mémoire |
| Exploitation | Serveur Ubuntu personnel, derrière un proxy |

Le travail porte autant sur le parcours utilisateur que sur le cycle de vie des données : réception par blocs, finalisation du transfert, contrôle de l’accès, expiration et nettoyage. Le service reste assez compact pour être exploité sur mon infrastructure personnelle.

## Périmètre

FileDrop sert au partage temporaire, avec une capacité et une disponibilité liées à mon serveur. Les métadonnées étant en mémoire, les liens ne sont pas conçus pour survivre à un redémarrage du processus. Ce service ne remplace pas un espace de sauvegarde.

Les fichiers sont traités et stockés temporairement côté serveur ; il ne s’agit pas d’un système de chiffrement de bout en bout. Les limites et durées indiquées correspondent à la configuration actuelle de l’instance.

---

Un projet personnel de [Purvanas](https://purvanas.fr), autour d’un besoin concret de partage au quotidien.

