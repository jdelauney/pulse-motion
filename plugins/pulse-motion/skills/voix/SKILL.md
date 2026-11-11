---
description: "Enregistrer, importer ou recaler la voix, poser une voix de synthèse, écouter la musique (« j'enregistre la scène 2 », « j'ai un fichier de ma voix », « mets une voix de synthèse »). Volume, texte dit, sous-titres : /pulse-motion:retoucher."
allowed-tools: Bash(pulse-motion *) Bash(node *) Monitor Read Glob Write AskUserQuestion
---

# Pulse Motion – La voix de la vidéo

Enregistrer la voix scène par scène dans le studio de l'aperçu, importer un enregistrement, poser la voix de l'ordinateur en attendant ou une voix de synthèse, recaler les mots, faire écouter la musique seule.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande.
- Une demande ambiguë (quelle scène ? une scène ou toute la vidéo ?) : une seule question avec `AskUserQuestion`, réponse recommandée en premier.
- Lexique : avant d'expliquer un mot de l'outil (studio, voix provisoire, transcription…), lire `pulse-motion lexique` ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:voix"`.
- Import ou transcription de plusieurs scènes : l'annoncer en une phrase (« je découpe et je cale les mots, comptez environ une minute ») ; en arrière-plan, le suivre par `Monitor` sur `pulse-motion avancement . --suivre`, une phrase par minute au plus (sans lui : « l'avancement s'affiche dans l'aperçu »).
- Détail : `pulse-motion reference audio/voix` (voix), `pulse-motion reference audio/ancres` (ancres), `pulse-motion reference audio` (sous-titres).
- Ce skill ne change ni les volumes, ni le texte dit, ni les sous-titres, ni l'ambiance : renvoyer à `/pulse-motion:retoucher` (« baisse la voix », « change ce que je dis dans l'intro »…).

## 0. Vérifier la vidéo

`pulse-motion etat .` : `projet` faux (aucune vidéo ici) : proposer `/pulse-motion:creer` et s'arrêter, sans rien modifier. La commande échoue avec « Node.js introuvable » : proposer de l'installer (`/pulse-motion:outils`, étape « Installer Node.js »), et s'arrêter.

Les scènes à dire sont celles qui ont un `voix.texte` dans `deroule.json`. Aucune, sauf pour écouter la musique : proposer d'ajouter une voix avec `/pulse-motion:retoucher` (« ajoute une voix à la vidéo »), qui écrit les textes dits.

## 1. Selon la demande

| Demande | Faire |
|---|---|
| « j'enregistre la scène 2 », « je veux enregistrer ma voix » | `pulse-motion apercu . --ouvrir` en arrière-plan (il rouvre l'aperçu déjà lancé, ou le démarre ; attendre sa ligne « Aperçu »). Puis `pulse-motion voix studio <id> .` (scène demandée, sinon la première à enregistrer). Dire en deux phrases : « Le texte s'affiche en grand ; cliquez sur Enregistrer, lisez après le compte à rebours, puis Arrêter. Réécoutez, puis Garder ou Refaire. » La première fois, le navigateur demande d'autoriser le micro |
| « j'ai un fichier de ma voix », « importe mon enregistrement » | Demander le fichier (chemin ou glisser-déposer) ; ne pas le copier : l'import le lit où il est et range la prise dans la vidéo. Demander « pour une scène ou pour toute la vidéo ? » (Recommandé : toute la vidéo si le fichier dure plus d'une minute). Une scène : `pulse-motion voix importer "<chemin>" --scene <id> .` ; toute la vidéo : `pulse-motion voix importer "<chemin>" .` (découpée par scène). Refusé faute de transcription : proposer de l'installer (« installe la transcription », consignes de `pulse-motion consignes outils`), puis relancer le même import ; sinon proposer une prise par scène. Un `avertissement` (scène mal reconnue) se dit en une phrase |
| « mets une voix provisoire », « je veux entendre le texte » | `pulse-motion voix provisoire .` (une scène : `--scene <id>`) : la voix de l'ordinateur lit les textes, pour caler l'animation ; les vraies prises sont gardées. Elle ne sera jamais livrée : l'export la refuse sans accord |
| « mets une voix de synthèse », « fais-la parler plus lentement », « il prononce mal HACCP » | Section « Synthèse » ci-dessous |
| « recale les mots », « la voix est décalée », « les sous-titres sont en avance » | `pulse-motion voix transcrire .` ; transcription absente : proposer de l'installer (consignes de `pulse-motion consignes outils`), puis relancer |
| « fais-moi écouter la musique » | `pulse-motion musique ecouter . --ouvrir` : la musique seule s'ouvre dans le lecteur de l'ordinateur ; pas de musique : proposer d'en ajouter une avec `/pulse-motion:retoucher` |

Après un enregistrement, un import ou une voix provisoire : `pulse-motion controler .`, et dire en une phrase ce qui reste (scènes encore en voix provisoire, scène allongée par la voix, mots calés au mieux). L'aperçu se recharge seul.

## 2. Synthèse (voix de synthèse locale)

Une voix française fabriquée sur l'ordinateur, sans compte ni réseau une fois installée : une seule voix, féminine, correcte mais moins naturelle qu'une vraie voix (le dire ainsi, jamais « comme une vraie voix »). Elle n'imite personne. Contrairement à la voix de l'ordinateur, elle s'exporte telle quelle ; ses crédits sont ajoutés d'office.

1. `pulse-motion voix synthese .` (une scène : `--scene <id>`) ; seules les scènes changées sont refaites. Une prise de la personne reste toujours entendue avant elle.
2. `installer` vrai (absente) : dire le `message`, puis « Installer la voix de synthèse (Recommandé) » · « La voix de l'ordinateur en attendant ». Accord : `pulse-motion voix synthese installer` en arrière-plan (une fois ; suivi par `pulse-motion avancement . --suivre`), puis relancer l'étape 1. `ok` faux (Python absent : `pulse-motion consignes outils`, étape « Installer Python »), refus : `pulse-motion voix provisoire .`.
3. `verification` faux : dire une fois que la prononciation n'est pas vérifiée sans la transcription (proposer de l'installer).
4. `aVerifier` non vide, ou alerte `voix-mal-lue` : dire les mots mal lus (« HACCP, entendu « hasse »… ») et proposer, en deux tours au plus : « Noter la prononciation pour vos prochaines vidéos (Recommandé) » (`pulse-motion glossaire noter . "<terme>" "<sens>" "" "<prononciation>"`, par exemple « hache a cé cé pé ») · « Seulement dans cette vidéo » (`/pulse-motion:retoucher`, texte dit `{HACCP|hache a cé cé pé}`). Puis l'étape 1.
5. Plus lente ou plus rapide : `voix.synthese.vitesse` dans `deroule.json` (0,85 plus lente, 1,15 plus rapide ; de 0,7 à 1,3), puis l'étape 1.

## 3. Fin

✅ **Fait** : <ce qui a été fait, en une phrase>.
📄 **Fichiers** : la voix est rangée avec la vidéo ; `sortie/<titre>.html` est à jour.
➡️ **Ensuite** : enregistrer une autre scène (« j'enregistre la scène 3 »), retoucher avec `/pulse-motion:retoucher`, ou exporter en MP4 avec `/pulse-motion:exporter`.
