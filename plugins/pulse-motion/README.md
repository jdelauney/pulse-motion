# Pulse Motion

Plugin Claude Code qui fabrique, sur votre ordinateur et sans cloud, des vidéos de motion design (CSS et SVG animés), livrées en page HTML animée autonome et, bientôt, en MP4.

## Installation

```
/plugin install pulse-motion --marketplace jdelauney/pulse-motion
```

## Prérequis

- Claude Code
- Node.js 20 ou plus (aucune dépendance à installer)
- Chrome ou Edge pour regarder l'aperçu

## Contenu

| Dossier | Rôle |
|---|---|
| `moteur/` | Moteur JavaScript inclus dans chaque page : courbes, minutage, transitions, horloge déterministe, lecteur |
| `scripts/` | Assemblage de la page autonome (`assembler.js`) et aperçu local avec rechargement (`apercu.js`) |
| `tests/` | Tests (`npm test`), dont des tests dans Chrome ou Edge sans fenêtre |

## Tests

```bash
cd plugins/pulse-motion
npm test
```

## Licence

MIT. Provenance du code repris : `NOTICE.md`.
