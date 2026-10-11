---
description: Reprendre la vidéo en cours là où elle s'était arrêtée
disable-model-invocation: true
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:reprendre – Reprendre la vidéo en cours

1. `pulse-motion etat .` et lire `etape`, `prochaine`, `titre`, `parcours`. La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.
2. Dire à la personne, en une phrase simple, où en est la vidéo « <titre> ».
3. Lire les consignes de création : `pulse-motion consignes creer`.
4. Continuer selon l'étape, à la section indiquée de ces consignes :

| Étape | Suite |
|---|---|
| `questions` | Aucune vidéo ici : proposer `/pulse-motion:creer` |
| `deroule-a-corriger` | Corriger le déroulé (erreurs dans `erreurs`), puis le présenter (creer, étape 2) |
| `deroule-a-valider` | Présenter le déroulé et demander l'accord (creer, étape 2) |
| `fabrication` | Écrire les scènes de `scenesManquantes` (creer, étape 3) |
| `style-a-valider`, `video-a-valider` | Ouvrir l'aperçu et demander l'accord (creer, étape 4) |
| `apercu` | Ouvrir l'aperçu s'il n'est pas actif, puis proposer une retouche (`/pulse-motion:retoucher`) |
