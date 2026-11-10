---
description: "Exporter en MP4 la vidéo Pulse Motion du dossier, sans la modifier (« exporte ma vidéo », « fais-moi le MP4 », « une version légère pour le courriel »). Pour changer la vidéo : /pulse-motion:retoucher."
allowed-tools: Bash(pulse-motion *) Bash(node *) Bash(winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements) Bash(brew install ffmpeg) Read Glob Grep AskUserQuestion
---

# /pulse-motion:exporter – La vidéo en MP4

Fabriquer le MP4 de la vidéo, sur l'ordinateur, réglé pour son usage : en **export fidèle** (les vraies images du navigateur, le son au bon niveau) quand ffmpeg est installé, sinon directement dans le navigateur.

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
- Lexique : avant d'expliquer un mot de l'outil (export, usage d'export, master, aperçu, ffmpeg…), lire `pulse-motion lexique`. Un mot déjà noté n'est pas réexpliqué en entier ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:exporter"`.

## 1. Vérifier

1. L'état ci-dessus : sans vidéo (`projet` faux), proposer `/pulse-motion:creer` et s'arrêter. « Node.js introuvable » : faire installer Node.js (LTS, https://nodejs.org), relancer Claude Code, et s'arrêter.
2. `pulse-motion controler . --complet` (toute la vidéo) : s'il reste des **erreurs**, les dire simplement et proposer de les corriger d'abord (`/pulse-motion:retoucher`). Des **alertes** seules n'empêchent pas l'export : les mentionner en une phrase.
3. Alerte `voix-provisoire` : la vidéo parle encore avec la voix de l'ordinateur, qui sert seulement à caler l'animation. Le dire, et proposer : « Enregistrer ma voix d'abord (Recommandé) » · « Exporter une version de travail avec la voix de l'ordinateur ». Sur « Enregistrer ma voix d'abord » : expliquer comment ouvrir le studio (bouton « Voix » de l'aperçu, ou « j'enregistre la scène 1 »), puis s'arrêter sans exporter. Seulement sur le second choix, ajouter `--avec-provisoire` à l'export.

## 2. Préparer l'export fidèle

1. ffmpeg ci-dessus : `present` et `versionOk` vrais → étape 3.
2. Sinon, suivre `pulse-motion consignes outils` (étape « Installer ffmpeg ») : « ffmpeg est un petit logiciel libre qui fabrique la vidéo en haute qualité, avec un son propre ; il s'installe une fois. » `AskUserQuestion` : « Installer ffmpeg (Recommandé) » · « Exporter sans, dans le navigateur ». Accord : lancer exactement la `commande` (nulle sous Linux : donner le texte `installer` à taper, attendre), puis relancer `pulse-motion ffmpeg`. Refus ou échec : ajouter `--rapide` à l'export.

## 3. Exporter

1. **L'usage** (tableau : `pulse-motion reference usages`) : YouTube, site, intranet → `web` ; LinkedIn, Instagram, TikTok → `reseaux` ; projeter, PowerPoint → `presentation` ; archiver, monteur, meilleure qualité → `master` ; courriel, WhatsApp → `courriel` (« moins de 20 Mo » : `--taille-max 20`) ; « vite fait, juste pour vérifier » → `brouillon` (version de travail, jamais à publier). Si la demande ne le dit pas, `AskUserQuestion` : « Pour le web (Recommandé) » · « Pour les réseaux sociaux » · « Pour l'envoyer par courriel » · « Pour la projeter en réunion » ; vidéo 9:16 ou de genre `social` : « Pour les réseaux sociaux (Recommandé) » en premier.
2. `pulse-motion exporter . --pour <usage> --estimer` : annoncer la durée (« environ 3 minutes ; je vous préviens à la fin »). Puis lancer `pulse-motion exporter .` en arrière-plan avec `--pour <usage>`, et lire son résultat JSON. Après une retouche, seules les scènes changées sont refaites (aucune pour un autre usage).

- `--qualite 720p` ou `--ips 60` : seulement sur demande (ils priment sur l'usage).
- Refus de taille : dire le message et ses deux propositions.
- Une demande d'usage hors de cette liste (« un GIF », « sur fond transparent ») ou une remarque après l'export (« trop lourd », « c'est flou », « en vertical ») : répondre d'après `pulse-motion reference sorties` : un réglage d'export, une retouche (`/pulse-motion:retoucher`), ou « pas encore possible », dit franchement.
- Réussite : `fichier`, `taille`, `duree`, `audio`, `mode` (`fidele` ou `navigateur`), `usage`, `fichiers`, `verification`.
- `verification` : une erreur (noir ou silence absent de la page) : « l'export est abîmé », le relancer une fois ; des alertes : les dire en une phrase, proposer la retouche. `avertissement` (son illisible) : le dire. `conseilFfmpeg` : faite dans le navigateur faute de ffmpeg ; proposer l'installation pour la prochaine fois.
- « Chrome ou Edge introuvable » : installer l'un des deux, ou ouvrir l'aperçu (`pulse-motion apercu . --ouvrir` en arrière-plan) et cliquer sur « MP4 ».
- Autre échec, ou export interrompu : dire le message simplement ; aucun fichier incomplet n'est écrit, les parties faites seront reprises.

## 4. Fin

✅ **Fait** : la vidéo « <titre> » est exportée en MP4 <usage en mots> (<durée>, <taille>, <son ou muette>, <fidèle ou dans le navigateur>).
📄 **Fichiers** : chaque fichier de `fichiers`, avec son rôle en une ligne : la vidéo (à publier ou envoyer ; brouillon : « version de travail, pas pour publier »), les sous-titres `.srt` et `.vtt` (à joindre sur YouTube ou LinkedIn), et `sortie/<titre>.html` (page animée, s'ouvre sans connexion).
🔎 **Vérifié** : <`faites` de `sortie/verification.json` en mots simples : images une à une, noirs, silences, niveau du son, couleurs, taille> ; <`relecture` du résumé : relue (prête, ou corrigée après relecture), avant les dernières retouches si `aJour` est faux ; `null` : non relue> ; le son a été mesuré, pas écouté. Ce qui n'a pas pu l'être (`nonFaites`) se dit avec sa raison (« sans ffmpeg, le niveau du son n'a pas été contrôlé »).
➡️ **Ensuite** : une retouche avec `/pulse-motion:retoucher`, puis un nouvel export.
