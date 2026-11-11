# Voix

- **Écrire le texte dit** : une idée par phrase, des phrases courtes, au plus 3,5 mots par seconde. La scène dure donc au moins mots / 3,5 + 0,7 s. La transcription lit les nombres jusqu'au milliard, les années, les décimales, « % », « € », les ordinaux (« 1er ») et les sigles épelés.
- **Balisage du texte dit** (jamais montré dans les sous-titres) : `[#nom]` pose un repère au mot qui suit (`data-start="repere:nom"`) ; `{HACCP|hache a cé cé pé}` affiche la forme de gauche et dit celle de droite ; `[pause 0.6]` ajoute un silence à la voix de synthèse (ignoré pour une prise). La prononciation du glossaire s'applique à la voix provisoire ; le prompteur du studio montre la forme dite.
- **Une prise par scène** : `assets/voix/<scène>.wav`, enregistrée dans le studio de l'aperçu (bouton « Voix », ou `pulse-motion voix studio <scène> .`) ou importée : `pulse-motion voix importer <fichier> --scene <id> .` (WAV, ou tout format avec ffmpeg).
- **Un enregistrement de toute la vidéo** : `pulse-motion voix importer <fichier> .` sans `--scene` le découpe par scène (transcription requise). Une scène dont moins de la moitié des mots ont été reconnus est signalée.
- **Voix provisoire** : `pulse-motion voix provisoire .` fait lire les textes par la voix du système, pour caler l'animation avant d'enregistrer. Elle n'est jamais livrée : l'export la refuse sauf `--avec-provisoire`, donné seulement si la personne le demande.
- **Transcription** (facultative) : `pulse-motion whisper` dit si elle est prête ; `pulse-motion whisper installer` l'installe une fois (Python requis, environ 800 Mo ; `--modele small` : 250 Mo). Ensuite `pulse-motion voix transcrire .` cale les mots des prises déjà là. Sans elle, les mots sont calés au mieux (calage approché), et tout fonctionne.
- Chaque prise a, à côté, un `.mots.json` (temps de chaque mot). Prise ou texte changés : il est périmé et recalculé au mieux ; `pulse-motion voix transcrire .` le refait.

