---
description: "Exporter en MP4 la vidéo Pulse Motion du dossier, sans la modifier (« exporte ma vidéo », « fais-moi le MP4 », « une version légère pour le courriel »). Pour changer la vidéo : /pulse-motion:retoucher."
allowed-tools: Bash(pulse-motion *) Bash(node *) Bash(winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements) Bash(brew install ffmpeg) Monitor Read Write Glob Grep AskUserQuestion
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
- Ne rien modifier dans la vidéo.
- N'installer ffmpeg qu'avec l'accord de la personne, et seulement avec la `commande` donnée par `pulse-motion ffmpeg`.
- `Write` n'écrit que `sortie/<titre>-textes.md`.
- Lexique : avant d'expliquer un mot de l'outil (usage, master, couverture…), lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:exporter"`.

## 1. Vérifier

1. L'état ci-dessus : sans vidéo (`projet` faux), proposer `/pulse-motion:creer` et s'arrêter. « Node.js introuvable » : l'installer (`/pulse-motion:outils`), et s'arrêter.
2. `pulse-motion controler . --complet` (`reglagesNonControles` : dire ce que la personne a changé, `reglagesChanges`) : s'il reste des **erreurs**, dire leur `message` et proposer de les corriger d'abord (`/pulse-motion:retoucher`). Des **alertes** seules n'empêchent pas l'export : une phrase.
3. Alerte `voix-provisoire` (la voix de l'ordinateur parle encore) : si `accords.voixProvisoire` de l'état est vrai, ne pas redemander. Sinon : « Enregistrer ma voix d'abord (Recommandé) » · « Exporter une version de travail avec la voix de l'ordinateur ». Sur « Enregistrer ma voix d'abord » : dire comment ouvrir le studio (bouton « Voix » de l'aperçu, ou « j'enregistre la scène 1 »), puis s'arrêter sans exporter. Second choix : `pulse-motion etat . --accord voix-provisoire`, puis `--avec-provisoire` ; le fichier est `sortie/<titre>-version-de-travail.mp4` (le MP4 définitif n'est pas touché), le dire.

## 2. Préparer l'export fidèle

1. ffmpeg ci-dessus : `present` et `versionOk` vrais → étape 3.
2. Sinon, `AskUserQuestion` : « Installer ffmpeg (Recommandé) » · « Exporter sans, dans le navigateur ». Accord : `pulse-motion consignes outils`, étape « Installer ffmpeg » (sa `commande` exacte), puis relancer `pulse-motion ffmpeg`. Refus ou échec : `--rapide`.

## 3. Exporter

1. **L'usage** (`pulse-motion reference usages`) : YouTube, site → `web` ; LinkedIn, TikTok → `reseaux` ; PowerPoint → `presentation` ; archiver, monteur → `master` (avec un flou de mouvement sur les passages rapides : le dire) ; courriel → `courriel` (« moins de 20 Mo » : `--taille-max 20`) ; « juste pour vérifier » → `brouillon` (jamais à publier). Si la demande ne le dit pas, `AskUserQuestion` : « Pour le web (Recommandé) » · « Pour les réseaux sociaux » · « Pour l'envoyer par courriel » · « Pour la projeter en réunion » ; vidéo 9:16 ou de genre `social` : « Pour les réseaux sociaux (Recommandé) » en premier.
2. `pulse-motion exporter . --pour <usage> --estimer` : annoncer la durée (« environ 3 minutes ; je vous préviens à la fin »). Puis lancer `pulse-motion exporter .` en arrière-plan avec `--pour <usage>`, le suivre avec `Monitor` sur `pulse-motion avancement . --suivre` (une phrase par minute au plus ; sans lui, l'avancement s'affiche dans l'aperçu), et lire son résultat JSON.

- `--qualite 720p`, `--ips 60` : sur demande seulement.
- Refus de taille : dire le message et ses deux propositions.
- Une demande d'usage hors de cette liste (« en GIF », « juste la scène 3 », « un PDF des scènes », « dans un téléphone », « à incruster dans mon montage », « en boucle ») ou une remarque après l'export (« trop lourd », « en vertical ») : suivre `pulse-motion reference sorties` : une option, une retouche (`/pulse-motion:retoucher`), ou « pas encore possible », dit franchement.
- Réussite : `fichier`, `taille`, `duree`, `audio`, `mode` (`fidele` ou `navigateur`), `fichiers`, `verification` ; `conseils` et `alertes` : une phrase chacun.
- `verification` (`sortie/verification.json`) : une erreur (noir ou silence absent de la page) : « l'export est abîmé », le relancer une fois ; des alertes : les dire en une phrase et proposer la retouche. `avertissement` (son illisible) : le dire. `conseilFfmpeg` : proposer ffmpeg pour la prochaine fois.
- « Chrome ou Edge introuvable » : en installer un, ou ouvrir l'aperçu (`pulse-motion apercu . --ouvrir` en arrière-plan), bouton « MP4 ». Autre échec : dire le message ; rien d'incomplet n'est écrit.
- Puis la page qui sait faire son MP4 : `pulse-motion reference chez-soi`, section « Page qui sait faire son MP4 » (« Non merci » recommandé ; déjà là : le dire).
- `reseaux` ou `courriel` : proposer « Voulez-vous un texte pour accompagner la vidéo ? » ; oui : suivre `pulse-motion reference accompagnement`.

## 4. Fin

✅ **Fait** : la vidéo « <titre> » est exportée en MP4 <usage en mots> (<durée>, <taille>, <son ou muette>, <fidèle ou dans le navigateur>).
📄 **Fichiers** : chaque fichier de `fichiers` et son rôle : la vidéo (brouillon ou voix de l'ordinateur : « version de travail, pas pour publier »), les sous-titres `.srt` et `.vtt`, la couverture (miniature), les chapitres (à coller dans la description), les crédits (à vérifier avant de publier), et `sortie/<titre>.html` (sans connexion).
🔎 **Vérifié** : <`faites` de `sortie/verification.json` en mots simples : images une à une, noirs, silences, niveau du son, couleurs, taille> ; <`relecture` du résumé : relue (prête, ou corrigée après relecture), avant les dernières retouches si `aJour` est faux ; `null` : non relue> ; le son a été mesuré, pas écouté. Ce qui n'a pas pu l'être (`nonFaites`) se dit avec sa raison (« sans ffmpeg, le niveau du son n'a pas été contrôlé »).
➡️ **Ensuite** : une retouche avec `/pulse-motion:retoucher`, puis un nouvel export.
