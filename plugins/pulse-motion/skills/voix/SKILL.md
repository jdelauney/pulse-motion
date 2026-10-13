---
description: Enregistrer, importer et caler la voix de la vidéo Pulse Motion, ou faire écouter sa musique (« j'enregistre la scène 2 », « j'ai un fichier de ma voix », « mets une voix provisoire », « recale les mots », « fais-moi écouter la musique »). Pour un volume, le texte dit, les sous-titres ou l'ambiance de la musique, c'est /pulse-motion:retoucher.
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Write AskUserQuestion
---

# Pulse Motion – La voix de la vidéo

Enregistrer la voix scène par scène dans le studio de l'aperçu, importer un enregistrement, poser la voix de l'ordinateur en attendant, recaler les mots, faire écouter la musique seule.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande.
- Une demande ambiguë (quelle scène ? une scène ou toute la vidéo ?) : une seule question avec `AskUserQuestion`, réponse recommandée en premier.
- Lexique : avant d'expliquer un mot de l'outil (studio, voix provisoire, transcription…), lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:voix"`.
- Détail des voix, ancres et sous-titres : `pulse-motion reference audio`.
- Ce skill ne change ni les volumes, ni le texte dit, ni les sous-titres, ni l'ambiance : renvoyer à `/pulse-motion:retoucher` (« baisse la voix », « change ce que je dis dans l'intro »…).

## 0. Vérifier la vidéo

`pulse-motion etat .` : `projet` faux (aucune vidéo ici) : proposer `/pulse-motion:creer` et s'arrêter, sans rien modifier. La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

Les scènes à dire sont celles qui ont un `voix.texte` dans `deroule.json`. Aucune, sauf pour écouter la musique : proposer d'ajouter une voix avec `/pulse-motion:retoucher` (« ajoute une voix à la vidéo »), qui écrit les textes dits.

## 1. Selon la demande

| Demande | Faire |
|---|---|
| « j'enregistre la scène 2 », « je veux enregistrer ma voix » | `pulse-motion apercu . --ouvrir` en arrière-plan (il rouvre l'aperçu déjà lancé, ou le démarre ; attendre sa ligne « Aperçu »). Puis `pulse-motion voix studio <id> .` (scène demandée, sinon la première à enregistrer). Dire en deux phrases : « Le texte s'affiche en grand ; cliquez sur Enregistrer, lisez après le compte à rebours, puis Arrêter. Réécoutez, puis Garder ou Refaire. » La première fois, le navigateur demande d'autoriser le micro |
| « j'ai un fichier de ma voix », « importe mon enregistrement » | Demander le fichier (chemin ou glisser-déposer) ; ne pas le copier : l'import le lit où il est et range la prise dans la vidéo. Demander « pour une scène ou pour toute la vidéo ? » (Recommandé : toute la vidéo si le fichier dure plus d'une minute). Une scène : `pulse-motion voix importer "<chemin>" --scene <id> .` ; toute la vidéo : `pulse-motion voix importer "<chemin>" .` (découpée par scène). Refusé faute de transcription : proposer de l'installer (« installe la transcription », consignes de `pulse-motion consignes outils`), puis relancer le même import ; sinon proposer une prise par scène. Un `avertissement` (scène mal reconnue) se dit en une phrase |
| « mets une voix provisoire », « je veux entendre le texte » | `pulse-motion voix provisoire .` (une scène : `--scene <id>`) : la voix de l'ordinateur lit les textes, pour caler l'animation ; les vraies prises sont gardées. Elle ne sera jamais livrée : l'export la refuse sans accord |
| « recale les mots », « la voix est décalée », « les sous-titres sont en avance » | `pulse-motion voix transcrire .` ; transcription absente : proposer de l'installer (consignes de `pulse-motion consignes outils`), puis relancer |
| « fais-moi écouter la musique » | `pulse-motion musique ecouter . --ouvrir` : la musique seule s'ouvre dans le lecteur de l'ordinateur ; pas de musique : proposer d'en ajouter une avec `/pulse-motion:retoucher` |

Après un enregistrement, un import ou une voix provisoire : `pulse-motion controler .`, et dire en une phrase ce qui reste (scènes encore en voix provisoire, scène allongée par la voix, mots calés au mieux). L'aperçu se recharge seul.

## 2. Fin

✅ **Fait** : <ce qui a été fait, en une phrase>.
📄 **Fichiers** : la voix est rangée avec la vidéo ; `sortie/<titre>.html` est à jour.
➡️ **Ensuite** : enregistrer une autre scène (« j'enregistre la scène 3 »), retoucher avec `/pulse-motion:retoucher`, ou exporter en MP4 avec `/pulse-motion:exporter`.
