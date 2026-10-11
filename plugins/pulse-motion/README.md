# Pulse Motion

Plugin Claude Code qui fabrique, sur votre ordinateur et sans cloud, des vidéos de motion design (CSS et SVG animés), livrées en page HTML animée autonome et en MP4 (fabriqué dans Chrome ou Edge, sans rien installer de plus).

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
| `skills/` | `/pulse-motion:creer`, `/pulse-motion:retoucher`, `/pulse-motion:exporter`, `/pulse-motion:reprendre` |
| `agents/` | `animateur` : écrit une scène |
| `moteur/` | Moteur JavaScript inclus dans chaque page : courbes, minutage, transitions, horloge déterministe, lecteur, débordements ; capture et export MP4 (servis par l'aperçu seulement) |
| `scripts/` | Assemblage, aperçu, contrôles, état, historique, export ; `pm.js` derrière la commande `pulse-motion` (`bin/`) |
| `vendor/` | Mediabunny (MPL-2.0), assemblage du MP4 ; voir `vendor/mediabunny/PROVENANCE.md` |
| `styles/` | Styles : CSS, charte, polices, scènes toutes faites (v1 : `clair-pedagogique`) |
| `references/` | Consignes lues par Claude : moteur, rythme, styles |
| `exemples/` | « La chaîne du froid » : vidéo de formation de 60 s |
| `tests/` | Tests (`npm test`), dont des tests dans Chrome ou Edge sans fenêtre |

## Tests

```bash
cd plugins/pulse-motion
npm test
```

## Licence

MIT. Le code ou les tracés repris citent leur origine en tête de fichier ; licences des polices : `styles/clair-pedagogique/polices/LICENCES.md`.
