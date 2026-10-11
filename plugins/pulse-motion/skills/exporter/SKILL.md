---
description: Exporter la vidéo en MP4 (fabriqué sur l'ordinateur, dans le navigateur) pour la publier ou l'envoyer
disable-model-invocation: true
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep AskUserQuestion
---

# /pulse-motion:exporter – La vidéo en MP4

Fabriquer le fichier MP4 de la vidéo, sur l'ordinateur, sans rien installer de plus que Chrome ou Edge.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande.
- Ne rien modifier dans la vidéo : l'export prend la vidéo telle qu'elle est.

## 1. Vérifier

1. `pulse-motion etat .` : sans vidéo (`projet` faux), proposer `/pulse-motion:creer` et s'arrêter. La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.
2. `pulse-motion controler .` : s'il reste des **erreurs**, les dire simplement et proposer de les corriger d'abord (`/pulse-motion:retoucher`). Des **alertes** seules n'empêchent pas l'export : les mentionner en une phrase.

## 2. Exporter

`pulse-motion exporter .` (compter environ une demi-seconde par seconde de vidéo ; la progression s'affiche).

- Réussite : le résumé donne `fichier`, `duree`, `images`, `audio`.
- `audio` faux alors que la vidéo a une musique : dire que ce navigateur ne sait pas encoder le son et que la vidéo est muette ; l'export fidèle (plus tard) le permettra.
- « Chrome ou Edge introuvable » : expliquer qu'il faut ouvrir l'aperçu dans Chrome ou Edge et cliquer sur le bouton « MP4 » de la barre de lecture (lancer `pulse-motion apercu . --ouvrir` en arrière-plan si l'aperçu n'est pas ouvert).
- Autre échec : dire le message simplement ; aucun fichier incomplet n'a été écrit.

## 3. Fin

✅ **Fait** : la vidéo « <titre> » est exportée en MP4 (<durée>, <son ou muette>).
📄 **Fichiers** : `<fichier>` (à publier ou envoyer) et `sortie/<titre>.html` (page animée, s'ouvre sans connexion).
➡️ **Ensuite** : une retouche avec `/pulse-motion:retoucher`, puis un nouvel export.
