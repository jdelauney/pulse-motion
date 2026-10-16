---
description: Vérifier que l'ordinateur est prêt pour les vidéos Pulse Motion et installer ce qui manque, avec votre accord (« vérifie mon ordinateur », « installe la transcription », « installe ffmpeg », « est-ce que tout est prêt pour l'export ? », « installe Python »). Ne crée ni ne modifie aucune vidéo.
allowed-tools: Bash(pulse-motion *) Bash(node *) Bash(winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements) Bash(brew install python) Bash(winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements) Bash(brew install ffmpeg) Read AskUserQuestion
---

# Pulse Motion – L'ordinateur prêt

Dire simplement ce qui est prêt, ce qui manque, et l'installer avec l'accord de la personne. Fonctionne dans n'importe quel dossier, avec ou sans vidéo.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande, sauf celle que la personne doit taper elle-même (Linux, mot de passe).
- **Rien ne s'installe sans l'accord de la personne**, demandé avec `AskUserQuestion` (« Installer (Recommandé) » · « Pas maintenant »), une installation à la fois.
- Lexique : avant d'expliquer un mot de l'outil (ffmpeg, transcription, export…), lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:outils"`.
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org (programme d'installation), puis relancer Claude Code, et s'arrêter.

## 1. Vérifier (« vérifie mon ordinateur », « tout est prêt ? »)

`pulse-motion outils`, puis la version de Pulse Motion (`pulseMotion.version`, « Pulse Motion <version> est installé »), et un tableau en mots simples :

| Outil | Prêt ? | À quoi il sert |
|---|---|---|
| Chrome ou Edge (`navigateur`) | ✅ / ❌ | regarder la vidéo, la contrôler, l'exporter |
| ffmpeg (`ffmpeg`) | ✅ / ❌ | un MP4 de qualité avec un son propre (sans lui, l'export se fait dans le navigateur) |
| Python (`python`) | ✅ / ❌ | nécessaire à la transcription |
| Transcription (`transcription`) | ✅ / ❌ | caler les sous-titres et les animations sur les vrais mots de la voix (facultative) |
| Voix de l'ordinateur (`voixSysteme`) | ✅ / ❌ | la voix provisoire, avant d'enregistrer la sienne |

- Chaque ❌ est suivi de son `message` et de ce qu'on peut faire (« dites « installe ffmpeg » »).
- `python.ancien` présent : « Python <version> est trop ancien ».
- Navigateur absent : conseiller d'installer Chrome ou Edge depuis leur site (rien à installer d'ici).
- Le micro ne se vérifie pas ici : il se teste dans le studio de voix ; dire à la personne de demander « j'enregistre la scène 1 » quand une vidéo est ouverte.

## 2. Installer ffmpeg (« installe ffmpeg »)

1. `pulse-motion ffmpeg` : `present` et `versionOk` vrais → déjà prêt, le dire.
2. Sinon : « ffmpeg est un petit logiciel libre qui fabrique la vidéo en haute qualité, avec un son propre ; il s'installe une fois. » Demander l'accord.
3. Accord et `commande` non nulle : lancer exactement cette `commande`, puis `pulse-motion ffmpeg` pour vérifier.
4. `commande` nulle (Linux) : donner le texte `installer` à taper dans un terminal, attendre que la personne dise que c'est fait, puis vérifier.
5. Toujours absent après l'installation : dire de relancer Claude Code (l'ordinateur ne voit un nouveau logiciel qu'au redémarrage de l'outil), puis de redemander « vérifie mon ordinateur ».

## 3. Installer la transcription (« installe la transcription », « installe Whisper »)

1. `pulse-motion whisper` : `pret` vrai → déjà prête, le dire.
2. Sinon, expliquer en une phrase (« elle cale les sous-titres et les animations sur les vrais mots de votre voix ; environ 800 Mo à télécharger une fois ») et demander l'accord : « Installer (Recommandé) » · « Version légère (250 Mo, un peu moins précise) » · « Pas maintenant ».
3. Python absent (`commandeSysteme` présent) : installer Python d'abord (étape 4), puis relancer `pulse-motion whisper`. Python toujours introuvable : dire qu'il faut relancer Claude Code pour finir l'installation (l'ordinateur ne voit Python qu'au redémarrage de l'outil), puis redemander « installe la transcription » ; s'arrêter.
4. `pulse-motion whisper installer` en arrière-plan (version légère : `pulse-motion whisper installer --modele small`) ; prévenir que cela prend quelques minutes ; attendre la fin et lire son résultat.
   - `ok` vrai : « La transcription est installée. » Si la vidéo du dossier a déjà des prises de voix, proposer de recaler leurs mots (« recale les mots »).
   - `ok` faux : dire le `message` simplement ; tout le reste fonctionne sans transcription (mots calés au mieux).

## 4. Installer Python (« installe Python », ou étape 3)

Seulement si `python.ok` est faux. Demander l'accord, puis lancer la `commandeSysteme.commande` de `pulse-motion outils`. Linux (`commande` nulle) : donner le texte du `message` à taper et attendre. Puis `pulse-motion outils` pour vérifier ; toujours introuvable : relancer Claude Code (voir étape 3).

## 5. Fin

✅ **Fait** : <ce qui est prêt, en une phrase>.
📄 **Fichiers** : rien dans votre vidéo n'a changé ; les outils sont installés sur l'ordinateur.
➡️ **Ensuite** : <l'action qui en avait besoin, s'il y en avait une (l'export, l'enregistrement d'une voix)>, sinon créer une vidéo avec `/pulse-motion:creer`.
