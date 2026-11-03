# FileDrop

FileDrop transforme un fichier ou un texte en lien temporaire, sans compte. Je l’ai construit pour mes propres échanges ponctuels : déposer, choisir une durée, protéger éventuellement par mot de passe, puis partager.

**Démo : [drop.purvanas.fr](https://drop.purvanas.fr)**

## Ce que le projet montre

Le parcours est volontairement court, mais le serveur gère tout le cycle de vie du partage : transfert en morceaux, contrôle de capacité, finalisation, accès protégé, expiration et suppression. Les métadonnées sont persistées sur disque afin qu’un redémarrage du processus ne rende plus les liens actifs inutilisables.

- fichiers jusqu’à 500 Mo dans la configuration de la démo ;
- textes jusqu’à 500 Ko ;
- transferts séquentiels par morceaux de 5 Mo, avec reprise automatique d’un morceau interrompu ;
- durée de 15 minutes à 24 heures ;
- mot de passe optionnel et jeton de téléchargement à usage unique ;
- suppression automatique des fichiers expirés et des transferts abandonnés ;
- signalement d’un contenu depuis chaque page de partage.

L’assemblage utilise des flux Node.js : le serveur n’a pas besoin de charger tous les morceaux en mémoire. Les nouveaux identifiants de partage disposent de 128 bits d’aléa. Une limite globale d’espace temporaire réserve la capacité avant de lire un transfert et empêche les sessions concurrentes de dépasser le quota. Les formulaires multipart sont bornés en taille et en nombre de parties. La limite de requêtes par IP reste configurable car un transfert de 500 Mo représente à lui seul une centaine de morceaux.

Les mots de passe utilisent `scrypt` via l’API asynchrone de Node.js. Le nombre de dérivations simultanées et les tentatives par lien et adresse IP sont bornés afin de protéger la boucle événementielle et le CPU.

## Architecture

```text
Navigateur ── morceaux de 5 Mo ──> Express / Multer
                                      │
                                      ├── chunks/   transfert en cours
                                      ├── uploads/  fichier final ou texte
                                      └── data/     métadonnées actives
```

Le frontend tient dans une page HTML/CSS/JavaScript sans framework. Le backend utilise Express, Multer et les primitives de flux et de cryptographie de Node.js.

## Lancer une instance

Prérequis : **Node.js 22 ou 24**.

```bash
git clone https://github.com/Purvanas/file-drop.git
cd file-drop
npm ci
cp .env.example .env
npm start
```

Node ne charge pas `.env` automatiquement. En production, injectez les variables avec votre gestionnaire de processus, votre conteneur ou `node --env-file=.env server.js`.

Les réglages utiles sont documentés dans [.env.example](.env.example). Par défaut, le serveur écoute uniquement sur `127.0.0.1:3200`, pour être placé derrière un reverse proxy HTTPS. Les dossiers sont configurables : `uploads/` et `data/` doivent être persistants, tandis que `chunks/` peut être éphémère mais doit rester accessible en écriture.

Par sécurité, le serveur refuse de démarrer si `uploads/` contient déjà des fichiers alors que `data/shares.json` est absent. Il ne tente ni d’importer ni de supprimer implicitement ces données : une migration doit être préparée explicitement par l’opérateur.

`ERRORS_TOKEN` protège le journal technique : sans jeton, sa route répond comme une route inexistante. Les rapports de contenus et journaux d’exécution restent locaux et sont ignorés par Git.

## Limites assumées

FileDrop est un service personnel mono-instance. Les métadonnées et fichiers sont stockés localement ; il n’y a ni stockage distribué, ni chiffrement de bout en bout, ni haute disponibilité. Un mot de passe limite l’accès via l’application, mais un fichier réellement sensible doit être chiffré avant l’envoi.

L’instance publique a ses propres limites de capacité. Pour un déploiement exposé à Internet, ajoutez au reverse proxy des limites de débit, de taille et de concurrence adaptées à votre infrastructure.

## Vérification

La CI exécute les contrôles et les tests avec Node.js 22 et 24. Les tests couvrent notamment la restauration des partages, les pannes d’écriture et de suppression, les réservations concurrentes, la libération après abandon, la concurrence `scrypt`, l’assemblage en flux et le contrat multipart avec Multer 2.

## Licence

[MIT](LICENSE) — Purvanas.
