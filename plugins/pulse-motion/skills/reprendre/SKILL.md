---
description: "Reprendre la vidéo Pulse Motion du dossier là où elle s'était arrêtée (« où en est ma vidéo ? », « on reprend »), ou retrouver ses vidéos (« quelles sont mes vidéos ? »). Nouvelle vidéo, ou exemple d'un modèle : /pulse-motion:creer."
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

0. « Quelles sont mes vidéos ? », « retrouve ma vidéo sur… » : `pulse-motion reference chez-soi`, section « Mes vidéos ».
1. Lire dans l'état ci-dessus `etape`, `prochaine`, `titre`, `parcours`. `projet` faux (aucune vidéo ici) : proposer `/pulse-motion:creer` et s'arrêter, sans rien modifier ; la personne veut voir un exemple (« montre-moi un exemple de pitch ») : c'est `/pulse-motion:creer` qui le copie (`pulse-motion modeles exemple`), le lui proposer. L'état dit « Node.js introuvable » : proposer de l'installer (`/pulse-motion:outils`, étape « Installer Node.js »), et s'arrêter.
2. Lexique ci-dessus : ne pas réexpliquer les mots déjà vus par la personne. `charte.aJour` faux : dire que la charte enregistrée « <modele> » a changé (ou n'existe plus, `charte.existe` faux) et proposer de la réappliquer (`pulse-motion charte appliquer <modele> .`) ; ne rien changer sans accord.
3. Dire à la personne, en une phrase simple, où en est la vidéo « <titre> ».
4. Continuer selon l'étape : lire seulement la section utile des consignes de création (`pulse-motion consignes creer <section>` : leurs règles et cette section), puis la suivre ; une étape qui mène à la suivante : lire la section suivante de la même façon.

| Étape | Section | Suite |
|---|---|---|
| `tournage` | aucune | Suivre `pulse-motion consignes filmer prises` |
| `questions` | aucune | Aucune vidéo ici : proposer `/pulse-motion:creer` |
| `deroule-a-corriger` | `deroule` | Corriger le déroulé (erreurs dans `erreurs`), puis le présenter (étape 2) |
| `deroule-a-valider` | `deroule` | Présenter le déroulé et demander l'accord (étape 2) |
| `fabrication` | `fabrication` | `pulse-motion ebauche .`, puis, aperçu inactif, `pulse-motion apercu . --ouvrir` en arrière-plan ; écrire les scènes de `scenesManquantes` (étape 3) ; puis lire `apercu,fin` |
| `style-a-valider` | `deroule` | Montrer la comparaison des styles et demander l'accord sur le style (étape 2, points 4 à 6) |
| `video-a-valider` | `apercu,fin` | Ouvrir l'aperçu (`pulse-motion apercu . --ouvrir` en arrière-plan : il rouvre l'aperçu déjà lancé, ou le démarre) et demander l'accord sur la vidéo (étape 4) |
| `apercu` | aucune | Ouvrir l'aperçu (`pulse-motion apercu . --ouvrir` en arrière-plan), puis proposer une retouche (`/pulse-motion:retoucher`) |
