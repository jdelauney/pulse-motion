---
description: "Filmer une application web pour un tutoriel : une page de votre ordinateur ou l'appli d'essai (« filme comment on crée une facture dans mon appli », « montre-moi sur l'appli d'essai », « refilme cette étape »)."
allowed-tools: Bash(pulse-motion *) Read Write Edit AskUserQuestion
---

# /pulse-motion:filmer – Filmer une application pour un tutoriel

Filmer une application web étape par étape, garder la prise dans la vidéo, puis la montrer dans une scène : le pointeur, les clics, les zooms et le projecteur sont ajoutés ensuite, sans refilmer. Pour l'instant : les pages de cet ordinateur (un fichier, une adresse « localhost ») et l'appli d'essai. Un site en ligne, la connexion à un compte, le flou des données personnelles et l'import d'une vidéo de l'écran viennent plus tard : le dire simplement, et proposer l'appli d'essai ou des captures d'écran (`/pulse-motion:creer` sait les montrer).

## Règles

- Parler simplement, en français ; ne jamais montrer de commande, ni de nom de fichier ou de format (parcours, film, prise restent pour Claude).
- Les clics sont réels : le dire avant le premier tournage (« je vais faire les clics pour de vrai dans l'application ; rien n'est annulé ensuite »).
- Jamais de mot de passe tapé par Pulse Motion, même donné dans la conversation.
- Une question à la fois avec `AskUserQuestion`, la réponse recommandée en premier.
- Le film se range dans le dossier de la vidéo (le dossier courant), même avant le déroulé.
- Une commande échoue avec « Node.js introuvable » : proposer de l'installer (`/pulse-motion:outils`, étape « Installer Node.js »), et s'arrêter ; « Chrome ou Edge est introuvable » : `/pulse-motion:outils`.

## 1. Parcours

1. Faire décrire le parcours : « Racontez-moi ce qu'on fait, comme à un collègue. » Demander l'adresse de départ. « Montre-moi sur l'appli d'essai » : `pulse-motion filmer essai .` écrit un parcours d'exemple (une facture), à relire.
2. Écrire `films/<nom>/parcours.json` (nom court : a-z, 0-9, tirets) : `nom`, `depart` (`appli-essai/<page>`, un fichier du dossier, `http://localhost:…`), `appareil` (`ordinateur`, `tablette`, `telephone`), `apparence` (`site`, `claire`, `sombre`), `etapes`. Une étape : `{ "faire": …, "dit": "<la phrase de la personne>" }`.

   | Phrase | Étape |
   |---|---|
   | « Va sur la page Factures » | `{ "faire": "aller", "url": "…" }` (`"montrer": "chargement"` : garder les images du chargement) |
   | « Clique sur Nouvelle facture » | `{ "faire": "cliquer", "cible": "Nouvelle facture" }` (aussi `double-cliquer`, `survoler`) |
   | « Dans Client, tape Dupont SARL puis Entrée » | `{ "faire": "taper", "cible": "Client", "texte": "Dupont SARL", "puis": "Entrée" }` |
   | « Efface la remise », « coche J'accepte » | `{ "faire": "vider", "cible": "Remise" }`, `cocher`, `decocher` |
   | « Choisis Virement dans Mode de paiement » | `{ "faire": "choisir", "cible": "Mode de paiement", "option": "Virement" }` |
   | « Descends jusqu'au total », « d'un écran » | `{ "faire": "defiler", "vers": "Total" }`, `{ "faire": "defiler", "ecrans": 1 }` |
   | « Fais Ctrl+S », « attends le message » | `{ "faire": "touche", "touches": "Ctrl+S" }`, `{ "faire": "attendre", "texte": "Facture enregistrée" }` ou `"secondes": 2` |

   Une cible : le texte visible ; `{ "texte", "rang": 2 }` (« le 2ᵉ Modifier ») ; `{ "texte", "dans": "fenêtre" }` ; après un échec seulement, `{ "selecteur": "…" }` ; en dernier recours `{ "point": [x, y] }` (% de la page). `preparation` : étapes jouées avant, non filmées.
3. `pulse-motion filmer verifier . <nom>` : corriger les `erreurs` (verbe proposé, adresse, mot de passe refusé).
4. Relire le parcours en phrases numérotées (`etapes[].phrase`), jamais en format : « C'est bien ça (Recommandé) » · « Je corrige ».

## 2. Tournage

1. `pulse-motion filmer tourner . <nom>` en arrière-plan ; ses lignes d'avancement (`etape`, `sur`, `quoi`) donnent une phrase de temps en temps (« je filme l'étape 3 sur 6 »). Prévenir : « ne touchez à rien, c'est l'affaire de quelques secondes par étape ».
2. `besoin` vaut `accord`, ou `erreur` vaut `site-en-ligne` ou `connexion` : dire que filmer un site en ligne ou un compte arrive bientôt ; proposer l'appli d'essai, une page de l'ordinateur ou des captures.
3. `erreur` vaut `etape` : dire `message` (ce que Pulse Motion voit à la place), regarder `image` avec `Read` ; corriger la cible (texte vu, `rang`, `dans`, sinon `selecteur` d'après la page) puis refilmer ; dire `rappel` (les actions déjà faites ne sont pas annulées).
4. Réussite : regarder la `planche` avec `Read` (une image par étape, la cible et le point visé). Ce qui semble faux, ou des données personnelles visibles (noms, adresses) : le dire en une phrase et proposer de refilmer avec des données d'essai.

## 3. Prises

1. `pulse-motion filmer prises . <nom>` : `recommandee` est la dernière prise réussie. Demander : « Je garde cette prise (Recommandé) » · « Je refilme » · « Je reprends la prise précédente ». Seule la personne choisit ; puis `pulse-motion filmer choisir . <nom> <prise>`.
2. Une prise inutile se supprime (`pulse-motion filmer supprimer . <nom> <prise>`), jamais la prise choisie.

## 4. Retour à la vidéo

- Depuis `/pulse-motion:creer` : le déroulé part des étapes filmées : une scène pour 1 à 3 étapes, `"film": { "nom": "<nom>", "etapes": "2-4" }`, `voix.texte` tiré des `dit`, durée assez longue (le contrôle du déroulé dit le minimum).
- Vidéo existante : ajouter ou remplacer la scène avec `/pulse-motion:retoucher`.
- L'animateur d'une scène filmée lit `pulse-motion reference ecran` (section « Un film »).

## Creer

Lu par `/pulse-motion:creer` pour un tutoriel de logiciel (une adresse, « comment faire … dans … », « tutoriel ») : la question 2 de la première ronde devient **Que montre-t-on ?** : « L'application : je donne son adresse et les étapes (Recommandé) » · « Une vidéo de mon écran » · « Des captures d'écran » · « Un logiciel installé ». L'application : sections 1 à 3 de ces consignes (tournage et choix de la prise) **avant** d'écrire le déroulé. Des captures : les copier dans `assets/`, montrées dans un écran (`pulse-motion reference ecran`). Une vidéo de l'écran ou un logiciel installé : pas encore possible ; proposer des captures.

## Retouches

Lu par `/pulse-motion:retoucher` pour une scène filmée :

| Phrase | Effet |
|---|---|
| « Le pointeur va trop vite » | `data-pointeur-vitesse="1.4"` sur l'écran |
| « Clique quand je dis enregistrez » | `<i class="pm-etape" data-etape="N" data-start="mot:enregistrez">` |
| « Zoome sur le bouton » | `<i class="pm-zoom" data-cible="etape:N" …>` |
| « Suis les clics » | `data-film-camera="suivre"` sur l'écran |
| « Mets un projecteur sur le total » | `<i class="pm-projecteur" data-cible="etape:N" …>` |
| « Floute les noms » | Pas encore possible : refilmer avec des données d'essai |
| « Accélère la saisie » | `data-vitesse` sur l'écran pendant la réaction (`"début+durée x2"`) |
| « Mets-le dans un téléphone » | `data-cadre="telephone"` ; une prise filmée sur ordinateur reste un écran d'ordinateur : le dire, et proposer de refilmer en `telephone` |
| « Reprends la première prise » | `pulse-motion filmer choisir . <nom> prise-01` |
| « Refilme » | Section 2 : une nouvelle prise, puis section 3 |
| « On ne voit pas le chargement » | `"montrer": "chargement"` sur l'étape `aller`, puis une nouvelle prise |
