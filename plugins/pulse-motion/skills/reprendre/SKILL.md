---
description: Reprendre la vidéo Pulse Motion du dossier là où elle s'était arrêtée (« où en est ma vidéo ? », « on reprend », « rouvre ma vidéo », « continue la vidéo »). Pour une nouvelle vidéo, ou pour voir l'exemple fini d'un modèle (« montre-moi un exemple de pitch »), c'est /pulse-motion:creer.
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:reprendre – Reprendre la vidéo en cours

## État de la vidéo, lu au lancement

!`pulse-motion etat . 2>&1 || true`

Si ce bloc est vide ou contient une erreur, lancer `pulse-motion etat .`.

Lexique de la personne :

!`pulse-motion lexique 2>&1 || true`

Si ce bloc est vide ou contient une erreur, lancer `pulse-motion lexique`.

## Suite

1. Lire dans l'état ci-dessus `etape`, `prochaine`, `titre`, `parcours`. `projet` faux (aucune vidéo ici) : proposer `/pulse-motion:creer` et s'arrêter, sans rien modifier ; la personne veut voir un exemple (« montre-moi un exemple de pitch ») : c'est `/pulse-motion:creer` qui le copie (`pulse-motion modeles exemple`), le lui proposer. L'état dit « Node.js introuvable » ou « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.
2. Lexique ci-dessus : ne pas réexpliquer les mots déjà vus par la personne. `charte.aJour` faux : dire que la charte enregistrée « <modele> » a changé (ou n'existe plus, `charte.existe` faux) et proposer de la réappliquer (`pulse-motion charte appliquer <modele> .`) ; ne rien changer sans accord.
3. Dire à la personne, en une phrase simple, où en est la vidéo « <titre> ».
4. Lire les consignes de création : `pulse-motion consignes creer`.
5. Continuer selon l'étape, à la section indiquée de ces consignes :

| Étape | Suite |
|---|---|
| `questions` | Aucune vidéo ici : proposer `/pulse-motion:creer` |
| `deroule-a-corriger` | Corriger le déroulé (erreurs dans `erreurs`), puis le présenter (creer, étape 2) |
| `deroule-a-valider` | Présenter le déroulé et demander l'accord (creer, étape 2) |
| `fabrication` | Écrire les scènes de `scenesManquantes` (creer, étape 3) |
| `style-a-valider` | Montrer la comparaison des styles et demander l'accord sur le style (creer, étape 2, points 4 à 6) |
| `video-a-valider` | Ouvrir l'aperçu (`pulse-motion apercu . --ouvrir` en arrière-plan : il rouvre l'aperçu déjà lancé, ou le démarre) et demander l'accord sur la vidéo (creer, étape 4) |
| `apercu` | Ouvrir l'aperçu (`pulse-motion apercu . --ouvrir` en arrière-plan), puis proposer une retouche (`/pulse-motion:retoucher`) |
