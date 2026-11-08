# Voix

- **Écrire le texte dit** : une idée par phrase, des phrases courtes, au plus 3,5 mots par seconde. La scène dure donc au moins mots / 3,5 + 0,7 s. Écrire les nombres comme on les dit quand ils comptent pour le calage (« quatre degrés » se cale mieux que « 4 °C »).
- **Une prise par scène** : `assets/voix/<scène>.wav`, enregistrée dans le studio de l'aperçu (bouton « Voix », ou `pulse-motion voix studio <scène> .`) ou importée : `pulse-motion voix importer <fichier> --scene <id> .` (WAV, ou tout format avec ffmpeg).
- **Un enregistrement de toute la vidéo** : `pulse-motion voix importer <fichier> .` sans `--scene` le découpe par scène (transcription requise). Une scène dont moins de la moitié des mots ont été reconnus est signalée.
- **Voix provisoire** : `pulse-motion voix provisoire .` fait lire les textes par la voix du système, pour caler l'animation avant d'enregistrer. Elle n'est jamais livrée : l'export la refuse sauf `--avec-provisoire`, donné seulement si la personne le demande.
- **Transcription** (facultative) : `pulse-motion whisper` dit si elle est prête ; `pulse-motion whisper installer` l'installe une fois (Python requis, environ 800 Mo ; `--modele small` : 250 Mo). Ensuite `pulse-motion voix transcrire .` cale les mots des prises déjà là. Sans elle, les mots sont calés au mieux (calage approché), et tout fonctionne.
- Chaque prise a, à côté, un `.mots.json` (temps de chaque mot). Prise ou texte changés : il est périmé et recalculé au mieux ; `pulse-motion voix transcrire .` le refait.

