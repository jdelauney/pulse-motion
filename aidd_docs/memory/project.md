# Projet – Pulse Motion

## Vision

- **Résumé** : plugin Claude Code qui fabrique, sur l'ordinateur et sans cloud, des vidéos de motion design (CSS + SVG animés, moteur JS dans une page HTML), exportées en MP4 et en page HTML animée. Détail : `docs/brief.md`.
- **Public cible** : créateurs solo, formateurs sans notion de code, petites agences.
- **Problème principal** : Canva uniformise, un freelance est cher et lent, After Effects décourage.

## Décisions importantes

- 2026-10-11 : tout se fabrique en local, sans service cloud ni télémétrie.
- 2026-10-11 : parcours rapide par défaut (1 accord, sur le déroulé), parcours accompagné sur demande (3 accords).
- 2026-10-11 : code ouvert MIT ; seules les briques compatibles sont admises → `internal/decisions/0001-licences-compatibles-mit.md`.
- 2026-10-11 : plugin autonome dans le catalogue pulseia, sans dépendance à Pulse.
- 2026-10-11 : export en deux niveaux (navigateur sans installation / outil local fidèle) ; détourage en trois niveaux (IA légère navigateur, IA haute qualité, fond vert).
- Bilan des projets de référence et de l'état de l'art : `external/references-motion.md`.
