---
description: "Exporter en MP4 la vidéo Pulse Motion du dossier, sans la modifier (« exporte ma vidéo », « fais-moi le MP4 », « une version légère pour le courriel »). Pour changer la vidéo : /pulse-motion:retoucher."
allowed-tools: Bash(pulse-motion *) Bash(node *) Bash(winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements) Bash(brew install ffmpeg) Read Glob Grep AskUserQuestion
---

# /pulse-motion:exporter – La vidéo en MP4

Fabriquer le fichier MP4 de la vidéo, sur l'ordinateur : en **export fidèle** (les vraies images du navigateur, le son au bon niveau) quand ffmpeg est installé, sinon directement dans le navigateur.

## État de la vidéo, lu au lancement

!`pulse-motion etat . 2>&1 || true`

Si ce bloc est vide ou contient une erreur, lancer `pulse-motion etat .`.

ffmpeg sur l'ordinateur :

!`pulse-motion ffmpeg 2>&1 || true`

Si ce bloc est vide ou contient une erreur, lancer `pulse-motion ffmpeg`.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande, sauf celle que la personne doit lancer elle-même.
- Ne rien modifier dans la vidéo : l'export prend la vidéo telle qu'elle est.
- N'installer ffmpeg qu'avec l'accord de la personne, et seulement avec la `commande` donnée par `pulse-motion ffmpeg`.
- Lexique : avant d'expliquer un mot de l'outil (export, aperçu, planche, ffmpeg…), lire `pulse-motion lexique`. Un mot déjà noté n'est pas réexpliqué en entier ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:exporter"`, en reprenant l'image fixe du lexique quand elle existe.

## 1. Vérifier

1. L'état ci-dessus : sans vidéo (`projet` faux), proposer `/pulse-motion:creer` et s'arrêter. « Node.js introuvable » ou « node » introuvable : faire installer Node.js (version LTS, https://nodejs.org), relancer Claude Code, et s'arrêter.
2. `pulse-motion controler . --complet` (toute la vidéo, jamais seulement les scènes retouchées) : s'il reste des **erreurs**, les dire simplement et proposer de les corriger d'abord (`/pulse-motion:retoucher`). Des **alertes** seules n'empêchent pas l'export : les mentionner en une phrase.
3. Alerte `voix-provisoire` : la vidéo parle encore avec la voix de l'ordinateur, qui sert seulement à caler l'animation. Le dire, et proposer d'enregistrer d'abord (bouton « Voix » de l'aperçu, ou dire « j'enregistre la scène 1 ») : « Enregistrer ma voix d'abord (Recommandé) » · « Exporter une version de travail avec la voix de l'ordinateur ». Sur « Enregistrer ma voix d'abord » : expliquer comment ouvrir le studio, puis s'arrêter sans exporter. Seulement sur ce second choix, ajouter `--avec-provisoire` à l'export (sans lui, l'export est refusé).

## 2. Préparer l'export fidèle

1. ffmpeg ci-dessus : `present` et `versionOk` vrais → étape 3.
2. Sinon, suivre les consignes d'installation de `pulse-motion consignes outils` (étape « Installer ffmpeg »), en proposant aussi d'exporter sans. En bref : expliquer en une phrase : « ffmpeg est un petit logiciel libre qui fabrique la vidéo en haute qualité, avec un son propre ; il s'installe une fois. » Puis demander avec `AskUserQuestion` : « Installer ffmpeg (Recommandé) » · « Exporter sans, dans le navigateur ».
   - Accord et `commande` non nulle : lancer exactement cette `commande`, puis relancer `pulse-motion ffmpeg` pour vérifier.
   - Accord mais `commande` nulle (Linux : l'installation demande son mot de passe) : donner à la personne le texte `installer` à taper dans un terminal, puis attendre qu'elle dise que c'est fait et relancer `pulse-motion ffmpeg`.
   - Refus, ou installation ratée : exporter dans le navigateur avec `pulse-motion exporter . --rapide`.

## 3. Exporter

Lancer `pulse-motion exporter .` en arrière-plan, puis lire son résultat JSON quand elle se termine. Compter environ 2 s de calcul par seconde de vidéo en 1080p ; après une retouche, seules les scènes changées sont refaites.

- La personne veut une vidéo plus légère (envoi par courriel) : ajouter `--qualite 720p`. Plus fluide : `--ips 60` (export deux fois plus long).
- Une demande d'usage (« pour LinkedIn », « un GIF », « sur fond transparent ») ou une remarque après l'export (« trop lourd », « c'est flou », « en vertical ») : répondre d'après `pulse-motion reference sorties` : un réglage d'export, une retouche (`/pulse-motion:retoucher`), ou « pas encore possible », dit franchement.
- Réussite : le résumé donne `fichier`, `duree`, `images`, `audio`, `mode` (`fidele` ou `navigateur`), `verification`, et parfois `avertissement`.
- `verification` (`sortie/verification.json`) : une erreur (noir ou silence absent de la page) : « l'export est abîmé », le relancer une fois ; des alertes (image isolée, saut, son qui sature, voix couverte) : les dire en une phrase et proposer la retouche.
- `avertissement` présent (musique ou voix illisible, son non encodable) : le dire ; la vidéo est exportée, muette ou sans la source illisible.
- `conseilFfmpeg` présent : la vidéo a été faite dans le navigateur faute de ffmpeg ; le dire en une phrase, et proposer l'installation pour la prochaine fois (étape 2).
- Export interrompu : les parties faites seront reprises.
- « Chrome ou Edge introuvable » : installer l'un des deux, ou ouvrir l'aperçu dans l'un d'eux et cliquer sur « MP4 » dans la barre de lecture (`pulse-motion apercu . --ouvrir` en arrière-plan s'il n'est pas ouvert).
- Autre échec : dire le message simplement ; aucun fichier incomplet n'est écrit.

## 4. Fin

✅ **Fait** : la vidéo « <titre> » est exportée en MP4 (<durée>, <son ou muette>, <export fidèle ou dans le navigateur>).
📄 **Fichiers** : `<fichier>` (à publier ou envoyer) et `sortie/<titre>.html` (page animée, s'ouvre sans connexion) ; avec des sous-titres, `sortie/<titre>.srt` et `sortie/<titre>.vtt` (à joindre sur YouTube, LinkedIn ou une plateforme de formation).
🔎 **Vérifié** : <`faites` de `sortie/verification.json` en mots simples : images une à une, noirs, silences, niveau du son> ; <`relecture` du résumé : relue (prête, ou corrigée après relecture), avant les dernières retouches si `aJour` est faux ; `null` : non relue> ; le son a été mesuré, pas écouté. Ce qui n'a pas pu l'être (`nonFaites`) se dit avec sa raison (« sans ffmpeg, le niveau du son n'a pas été contrôlé »).
➡️ **Ensuite** : une retouche avec `/pulse-motion:retoucher`, puis un nouvel export.
