---
description: "Vérifier l'ordinateur et installer ce qui manque, avec votre accord (« vérifie mon ordinateur », « installe ffmpeg »), signaler un problème (« signale un problème »), emporter sa bibliothèque (« emporte mes chartes »). Ne modifie aucune vidéo."
allowed-tools: Bash(pulse-motion *) Bash(node *) Bash(winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements) Bash(brew install python) Bash(winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements) Bash(brew install ffmpeg) Bash(winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements) Bash(brew install node) Monitor Read AskUserQuestion
---

# Pulse Motion – L'ordinateur prêt

Dire simplement ce qui est prêt, ce qui manque, et l'installer avec l'accord de la personne. Fonctionne dans n'importe quel dossier, avec ou sans vidéo.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande, sauf celle que la personne doit taper elle-même (Linux, mot de passe).
- **Rien ne s'installe sans l'accord de la personne**, demandé avec `AskUserQuestion` : un accord pour une liste montrée (outil, à quoi il sert, taille, durée), puis les installations **une à la fois**, en arrière-plan ; annoncer chacune en une phrase et la suivre avec `Monitor` sur `pulse-motion avancement . --suivre` (sans lui : dire que cela prend quelques minutes).
- Lexique : avant d'expliquer un mot de l'outil (ffmpeg, transcription, export…), lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:outils"`.
- La commande échoue avec « Node.js introuvable » : étape « Installer Node.js ».
- « relancer Claude Code » seulement en dernier recours : quand l'outil reste introuvable juste après son installation.

## 1. Vérifier (« vérifie mon ordinateur », « tout est prêt ? »)

`pulse-motion outils`, puis la version de Pulse Motion (`pulseMotion.version`, « Pulse Motion <version> est installé »), et un tableau en mots simples :

| Outil | Prêt ? | À quoi il sert |
|---|---|---|
| Chrome ou Edge (`navigateur`) | ✅ / ❌ | regarder, contrôler, exporter la vidéo |
| Carte graphique (`carteGraphique`) | ✅ / ❌ | particules et effets fluides ; dire son `message` |
| ffmpeg (`ffmpeg`) | ✅ / ❌ | un MP4 de qualité, au son propre (sinon, export dans le navigateur) |
| Python (`python`) | ✅ / ❌ | la transcription |
| Transcription (`transcription`) | ✅ / ❌ | sous-titres et animations calés sur les vrais mots (facultative) |
| Voix de l'ordinateur (`voixSysteme`) | ✅ / ❌ | la voix provisoire |
| Voix de synthèse (`voixSynthese`) | ✅ / ❌ | voix livrable, facultative : `pulse-motion reference audio/synthese` |

`python.ancien` : « Python <version> est trop ancien ». Le micro se teste dans le studio de voix (« j'enregistre la scène 1 », une vidéo ouverte). Il manque quelque chose : étape « Tout installer ».

## 2. Tout installer (« installe ce qui manque », ou après la vérification)

`pulse-motion outils --plan` : la liste dans l'ordre (`outil`, `pourquoi`, `taille`, `duree`). La montrer en mots simples, puis une seule question : « Tout installer (Recommandé) » · « Choisir » · « Pas maintenant » (« Choisir » : une question à choix multiple sur la liste ; la transcription propose sa version légère, `leger`, avec `commandeLegere`).
- Accord : lancer chaque `commande` en arrière-plan, l'une après l'autre (une installation à la fois), puis `pulse-motion outils` pour vérifier.
- `commande` nulle : donner le `texte` à faire soi-même (Linux, navigateur) et attendre que la personne dise que c'est fait.

## 3. Installer ffmpeg (« installe ffmpeg »)

`pulse-motion ffmpeg` : `present` et `versionOk` vrais → déjà prêt, le dire. Sinon : « ffmpeg est un petit logiciel libre qui fabrique la vidéo en haute qualité, avec un son propre ; il s'installe une fois. » Accord : lancer exactement sa `commande` (nulle sous Linux : donner le texte `installer` à taper et attendre), puis `pulse-motion ffmpeg`. Toujours absent : en dernier recours, relancer Claude Code, puis redemander « vérifie mon ordinateur ».

## 4. Installer la transcription (« installe la transcription », « installe Whisper »)

1. `pulse-motion whisper` : `pret` vrai → déjà prête, le dire.
2. Sinon, expliquer en une phrase (« elle cale les sous-titres et les animations sur les vrais mots de votre voix ; environ 800 Mo à télécharger une fois ») et demander l'accord : « Installer (Recommandé) » · « Version légère (250 Mo, un peu moins précise) » · « Pas maintenant ».
3. Python absent (`commandeSysteme` présent) : installer Python d'abord (étape 5), puis relancer `pulse-motion whisper`. Python toujours introuvable : en dernier recours, relancer Claude Code ; s'arrêter.
4. `pulse-motion whisper installer` en arrière-plan (version légère : `pulse-motion whisper installer --modele small`) ; attendre la fin et lire son résultat.
   - `ok` vrai : « La transcription est installée. » Si la vidéo du dossier a déjà des prises de voix, proposer de recaler leurs mots (« recale les mots »).
   - `ok` faux : dire le `message` simplement ; tout le reste fonctionne sans transcription (mots calés au mieux).

## 5. Installer Python (« installe Python », ou étape 4)

Si `python.ok` est faux : accord, puis la `commandeSysteme.commande` de `pulse-motion outils` (nulle sous Linux : le texte du `message`, à taper), puis `pulse-motion outils`.

## 6. Installer Node.js (« Node.js introuvable »)

Proposer « Installer Node.js (Recommandé) » · « Je l'installe moi-même ». Accord :
- Windows : `winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements` ;
- macOS avec Homebrew : `brew install node` ;
- Linux, ou macOS sans Homebrew : donner le lien https://nodejs.org (version LTS) et attendre que la personne dise que c'est fait.

Puis `pulse-motion etat .`, qui marche sans redémarrage ; toujours introuvable : en dernier recours, relancer Claude Code.

## 7. Signaler un problème (« signale un problème », « préviens l'auteur »)

Suivre `pulse-motion reference chez-soi`, section « Signaler un problème » : le résumé montré, puis l'accord avant d'ouvrir la page ; rien n'est envoyé par Pulse Motion.

## 8. Emporter sa bibliothèque (« emporte mes chartes sur mon autre ordinateur », « importe ma bibliothèque »)

Suivre `pulse-motion reference chez-soi`, section « Bibliothèque personnelle » : la liste montrée, puis un fichier ZIP que la personne copie elle-même ; à l'import, rien de ce qui est déjà là n'est remplacé sans son accord.

## 9. Fin

✅ **Fait** : <ce qui est prêt, en une phrase>.
📄 **Fichiers** : rien dans votre vidéo n'a changé ; les outils sont installés sur l'ordinateur.
➡️ **Ensuite** : <l'action qui en avait besoin, s'il y en avait une (l'export, l'enregistrement d'une voix)>, sinon créer une vidéo avec `/pulse-motion:creer`.
