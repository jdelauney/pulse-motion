# Voix de synthèse locale (compétences voix et outils)

Lue par `/pulse-motion:voix` (« mets une voix de synthèse », « fais-la parler plus lentement », « il prononce mal HACCP ») et `/pulse-motion:outils` (« installe la voix de synthèse »). Ne jamais montrer de commande à la personne ; rien ne se télécharge sans son accord.

## Poser la voix de synthèse

Une voix française fabriquée sur l'ordinateur, sans compte ni réseau une fois installée : une seule voix, féminine, correcte mais moins naturelle qu'une vraie voix (le dire ainsi, jamais « comme une vraie voix »). Elle n'imite personne. Contrairement à la voix de l'ordinateur, elle s'exporte telle quelle ; ses crédits sont ajoutés d'office.

1. `pulse-motion voix synthese .` (une scène : `--scene <id>`) ; seules les scènes changées sont refaites. Une prise de la personne reste toujours entendue avant elle.
2. `installer` vrai (absente) : dire le `message`, puis « Installer la voix de synthèse (Recommandé) » · « La voix de l'ordinateur en attendant ». Accord : section « Installer » ci-dessous, puis relancer l'étape 1. Refus ou échec : `pulse-motion voix provisoire .`.
3. `verification` faux : dire une fois que la prononciation n'est pas vérifiée sans la transcription (proposer de l'installer).
4. `aVerifier` non vide, ou alerte `voix-mal-lue` : dire les mots mal lus (« HACCP, entendu « hasse »… ») et proposer, en deux tours au plus : « Noter la prononciation pour vos prochaines vidéos (Recommandé) » (`pulse-motion glossaire noter . "<terme>" "<sens>" "" "<prononciation>"`, par exemple « hache a cé cé pé ») · « Seulement dans cette vidéo » (`/pulse-motion:retoucher`, texte dit `{HACCP|hache a cé cé pé}`). Puis l'étape 1.
5. Plus lente ou plus rapide : `voix.synthese.vitesse` dans `deroule.json` (0,85 plus lente, 1,15 plus rapide ; de 0,7 à 1,3), puis l'étape 1.

## Installer la voix de synthèse (« installe la voix de synthèse »)

1. `pulse-motion outils` : `voixSynthese.ok` vrai → déjà prête, le dire.
2. Sinon, expliquer en une phrase : « une voix française fabriquée sur votre ordinateur, sans compte ni réseau ensuite ; une seule voix, féminine, moins naturelle qu'une vraie voix ; environ 300 Mo à télécharger une fois, quelques minutes » ; demander l'accord : « Installer (Recommandé) » · « Version plus fidèle (environ 550 Mo) » · « Pas maintenant ». Rien ne se télécharge sans cet accord.
3. Python de 3.10 à 3.13 requis : absent ou d'une autre version, l'installer d'abord (`pulse-motion consignes outils`, étape « Installer Python »), puis reprendre.
4. `pulse-motion voix synthese installer` en arrière-plan (version plus fidèle : `--normale`) ; attendre la fin et lire son résultat. `ok` vrai : « La voix de synthèse est installée. » ; si la vidéo du dossier a des textes dits, proposer de la poser (« mets une voix de synthèse », `/pulse-motion:voix`). `ok` faux : dire le `message` ; la voix de l'ordinateur reste disponible en attendant.
