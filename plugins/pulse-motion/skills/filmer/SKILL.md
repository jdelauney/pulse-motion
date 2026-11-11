---
description: "Filmer une application web ou un site pour un tutoriel, ou partir d'une vidéo ou de captures de votre écran (« filme comment on crée une facture sur app.exemple.fr », « j'ai enregistré mon écran », « floute les noms des clients »)."
allowed-tools: Bash(pulse-motion *) Read Write Edit AskUserQuestion
---

# /pulse-motion:filmer – Filmer une application pour un tutoriel

Filmer une application web étape par étape (un site en ligne, une page de cet ordinateur, l'appli d'essai), ou importer une vidéo de l'écran ; garder la prise dans la vidéo, puis la montrer dans une scène : le pointeur, les clics, les zooms et le projecteur sont ajoutés ensuite, sans refilmer. Les données personnelles sont floutées dans les images mêmes.

## Règles

- Parler simplement, en français ; ne jamais montrer de commande, ni de nom de fichier ou de format (parcours, film, prise restent pour Claude).
- Les clics sont réels : le dire avant le premier tournage (« je vais faire les clics pour de vrai dans l'application ; rien n'est annulé ensuite »).
- Jamais de mot de passe tapé par Pulse Motion, même donné dans la conversation : la personne se connecte elle-même. Ne jamais demander ni répéter un identifiant.
- Internet ne sert qu'au tournage d'un site en ligne, après l'accord de la personne ; la vidéo n'en a jamais besoin ensuite.
- Une question à la fois avec `AskUserQuestion`, la réponse recommandée en premier.
- Le film se range dans le dossier de la vidéo (le dossier courant), même avant le déroulé.
- Une commande échoue avec « Node.js introuvable » : proposer de l'installer (`/pulse-motion:outils`, étape « Installer Node.js »), et s'arrêter ; « Chrome ou Edge est introuvable » : `/pulse-motion:outils`.

## 1. Parcours

1. Faire décrire le parcours : « Racontez-moi ce qu'on fait, comme à un collègue. » Demander l'adresse de départ. « Montre-moi sur l'appli d'essai » : `pulse-motion filmer essai .` écrit un parcours d'exemple (une facture), à relire.
2. Écrire `films/<nom>/parcours.json` (nom court : a-z, 0-9, tirets) : `nom`, `depart` (`https://…`, `appli-essai/<page>`, un fichier du dossier, `http://localhost:…`), `appareil` (`ordinateur`, `tablette`, `telephone`), `apparence` (`site`, `claire`, `sombre`), `connexion` (`true` : la personne se connecte d'abord), `flou` (section 4), `etapes`. Une étape : `{ "faire": …, "dit": "<la phrase de la personne>" }`. Un seul site en ligne par parcours.

   | Phrase | Étape |
   |---|---|
   | « Va sur la page Factures » | `{ "faire": "aller", "url": "…" }` (`"montrer": "chargement"` : garder les images du chargement) |
   | « Clique sur Nouvelle facture » | `{ "faire": "cliquer", "cible": "Nouvelle facture" }` (aussi `double-cliquer`, `survoler`) |
   | « Dans Client, tape Dupont SARL puis Entrée » | `{ "faire": "taper", "cible": "Client", "texte": "Dupont SARL", "puis": "Entrée" }` |
   | « Efface la remise », « coche J'accepte » | `{ "faire": "vider", "cible": "Remise" }`, `cocher`, `decocher` |
   | « Choisis Virement dans Mode de paiement » | `{ "faire": "choisir", "cible": "Mode de paiement", "option": "Virement" }` |
   | « Descends jusqu'au total », « d'un écran » | `{ "faire": "defiler", "vers": "Total" }`, `{ "faire": "defiler", "ecrans": 1 }` |
   | « Fais Ctrl+S », « attends le message » | `{ "faire": "touche", "touches": "Ctrl+S" }`, `{ "faire": "attendre", "texte": "Facture enregistrée" }` ou `"secondes": 2` |

   Une cible : le texte visible ; `{ "texte", "rang": 2 }` (« le 2ᵉ Modifier ») ; `{ "texte", "dans": "fenêtre" }` ; après un échec seulement, `{ "selecteur": "…" }` ; en dernier recours `{ "point": [x, y] }` (% de la page). `preparation` : étapes jouées avant, non filmées (bandeau de cookies).
3. `pulse-motion filmer verifier . <nom>` : corriger les `erreurs` (verbe proposé, adresse, mot de passe refusé).
4. Relire le parcours en phrases numérotées (`etapes[].phrase`), jamais en format : « C'est bien ça (Recommandé) » · « Je corrige ».

## 2. Tournage

1. `pulse-motion filmer tourner . <nom>` en arrière-plan ; ses lignes d'avancement (`etape`, `sur`, `quoi`) donnent une phrase de temps en temps (« je filme l'étape 3 sur 6 »). Prévenir : « ne touchez à rien, c'est l'affaire de quelques secondes par étape ».
2. `besoin` vaut `accord` (un site en ligne) : une question, avec le nom du site : « Pour filmer, Pulse Motion va ouvrir app.exemple.fr sur cet ordinateur et y faire les clics pour de vrai. Utilisez un compte de démonstration si vous en avez un. Si vous vous connectez, ce navigateur garde la connexion du site sur cet ordinateur, jamais votre mot de passe. » Options : « Oui, filmer (Recommandé) » · « Je dois d'abord me connecter » (`"connexion": true` dans le parcours) · « Non ». Oui : relancer avec `--accord` ; il est noté, les prises suivantes de ce site ne redemandent pas.
3. Connexion : la progression écrit `attente` `connexion`. Dire : « Une fenêtre s'est ouverte sur app.exemple.fr. Connectez-vous comme d'habitude, allez sur la page de départ, puis dites-moi « c'est fait ». Je ne vois pas ce que vous tapez. » Au « c'est fait » : `pulse-motion filmer continuer . <nom>`, puis « Ne touchez pas à la fenêtre pendant le tournage, environ 40 secondes. » `besoin` vaut `connexion` (la page redemande l'identifiant, ou 15 min sans réponse) : proposer de se connecter, passer `connexion` à `true`, refilmer.
4. `erreur` vaut `etape` : dire `message` (ce que Pulse Motion voit à la place), regarder `image` avec `Read` ; corriger la cible (texte vu, `rang`, `dans`, sinon `selecteur` d'après la page) puis refilmer ; dire `rappel` (les actions déjà faites ne sont pas annulées).
5. Réussite : regarder la `planche` avec `Read` (une image par étape, la cible, le point visé, le nombre de zones floutées), puis la section 4.

## 3. Prises

1. `pulse-motion filmer prises . <nom>` : `recommandee` est la dernière prise réussie. Demander : « Je garde cette prise (Recommandé) » · « Je refilme » · « Je reprends la prise précédente ». Seule la personne choisit ; puis `pulse-motion filmer choisir . <nom> <prise>`.
2. Une prise inutile se supprime (`pulse-motion filmer supprimer . <nom> <prise>`), jamais la prise choisie.

## 4. Confidentialité

- Floutés d'office, dans les images mêmes (rien de net n'est gardé) : mots de passe, adresses électroniques, téléphones, IBAN, numéros de carte, de sécurité sociale, champs d'adresse et de date de naissance. `"flou": { "categories": { "adresse": false } }` : « ne floute pas les adresses, elles sont fausses » ; `"mode": "masque"` : pastille grise au lieu du flou.
- Regarder la planche : noms, visages, montants, tout ce qui semble personnel et n'est pas flouté, le dire (« À l'étape 4, je vois des noms de clients dans le tableau. Je les floute ? ») : « Flouter et refilmer (Recommandé) » · « Flouter cette prise » · « C'est bon ».
  - Refilmer : `"flou": { "cibles": [ … ] }`, même écriture que les cibles, toutes les correspondances (« la colonne Client » : `{ "colonne": "Client" }`) ; le flou suit le défilement.
  - Cette prise : `pulse-motion filmer flouter . <nom> --etapes 3-5 --zone x,y,l,h` (en % de l'image, lu sur la planche), puis relire la planche. Prévenir : « Ce flou est définitif dans cette prise : pour l'enlever, il faudra refilmer. » `videos` non vide : les vidéos déjà exportées gardent l'image nette, les refaire.
- Ce qui reste sur l'ordinateur, dit honnêtement si on le demande : comme tout navigateur, le profil garde les cookies du site, hors du dossier de la vidéo ; aucun mot de passe. « Oublie ma connexion à app.exemple.fr » : `pulse-motion filmer connexions oublier <site>` (la liste : `pulse-motion filmer connexions`).

## 5. Import

Une vidéo de l'écran (MP4, WebM, MOV, MKV) ou une animation (GIF, WebP ou PNG animés) devient une prise, sans réseau :
1. Un logiciel installé (Excel, logiciel métier) : la personne enregistre son écran avec l'outil de son système (Windows 11 : Outil Capture d'écran, mode vidéo ; macOS : Maj+Cmd+5), puis donne le fichier.
2. `pulse-motion filmer importer . <fichier> [--nom <nom>] [--de 0:12] [--a 1:05]`. `besoin` vaut `extrait` (plus de 3 minutes) : demander le passage à garder (début et fin). `erreur` vaut `format` : dire `message` et proposer `/pulse-motion:outils` pour installer ffmpeg.
3. Regarder la `planche` (une image par seconde). `son` présent : « Garder votre voix de la vidéo (Recommandé) » · « Couper le son » ; garder : `/pulse-motion:voix` importe ce fichier son.
4. Repères (là où cliquer, zoomer, mettre le projecteur), lus sur la planche : `pulse-motion filmer repere . <nom> <instant en s> <x,y> [<x,y,l,h>]` (% de l'image) ; le repère N est la cible `etape:N` de la scène. Puis la section 3 (choisir la prise).

Une capture d'écran fixe ne s'importe pas : la copier dans `assets/`, montrée dans un écran (`pulse-motion reference ecran`).

## 6. Retour à la vidéo

- Depuis `/pulse-motion:creer` : le déroulé part des étapes filmées : une scène pour 1 à 3 étapes, `"film": { "nom": "<nom>", "etapes": "2-4" }`, `voix.texte` tiré des `dit`, durée assez longue (le contrôle du déroulé dit le minimum). Vidéo importée : `"etapes": "1"`.
- Vidéo existante : ajouter ou remplacer la scène avec `/pulse-motion:retoucher`.
- L'animateur d'une scène filmée lit `pulse-motion reference ecran` (section « Un film »).

## Creer

Lu par `/pulse-motion:creer` pour un tutoriel de logiciel (une adresse, « comment faire … dans … », « tutoriel ») : la question 2 de la première ronde devient **Que montre-t-on ?** : « L'application : je donne son adresse et les étapes (Recommandé) » · « Une vidéo de mon écran » · « Des captures d'écran » · « Un logiciel installé ». L'application : sections 1 à 4 de ces consignes (tournage, choix de la prise, confidentialité) **avant** d'écrire le déroulé. Une vidéo de l'écran ou un logiciel installé : section 5. Des captures : les copier dans `assets/`, montrées dans un écran (`pulse-motion reference ecran`).

## Retouches

Lu par `/pulse-motion:retoucher` pour une scène filmée :

| Phrase | Effet |
|---|---|
| « Le pointeur va trop vite » | `data-pointeur-vitesse="1.4"` sur l'écran |
| « Clique quand je dis enregistrez » | `<i class="pm-etape" data-etape="N" data-start="mot:enregistrez">` |
| « Zoome sur le bouton » | `<i class="pm-zoom" data-cible="etape:N" …>` |
| « Suis les clics » | `data-film-camera="suivre"` sur l'écran |
| « Mets un projecteur sur le total » | `<i class="pm-projecteur" data-cible="etape:N" …>` |
| « Floute les noms » | Section 4 : refilmer avec `flou.cibles` (recommandé), ou flouter cette prise |
| « Accélère la saisie » | `data-vitesse` sur l'écran pendant la réaction (`"début+durée x2"`) |
| « Mets-le dans un téléphone » | `data-cadre="telephone"` ; une prise filmée sur ordinateur reste un écran d'ordinateur : le dire, et proposer de refilmer en `telephone` |
| « Reprends la première prise » | `pulse-motion filmer choisir . <nom> prise-01` |
| « Refilme » | Section 2 : une nouvelle prise, puis section 3 |
| « On ne voit pas le chargement » | `"montrer": "chargement"` sur l'étape `aller`, puis une nouvelle prise |
