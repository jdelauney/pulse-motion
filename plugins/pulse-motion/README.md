# Pulse Motion

Plugin Claude Code qui fabrique, sur votre ordinateur et sans cloud, des vidéos de motion design (CSS et SVG animés), livrées en page HTML animée autonome et en MP4 (fabriqué dans Chrome ou Edge, sans rien installer de plus).

## Installation

```
/plugin install pulse-motion --marketplace jdelauney/pulse-motion
```

## Ce que vous pouvez demander

Tout se fait par une demande dans Claude Code, jamais dans un terminal. Créer une vidéo ou un style passe par une commande commençant par `/` ; pour le reste, une phrase suffit.

| Commande | Comment la lancer | Exemples de demandes |
|---|---|---|
| `/pulse-motion:creer` | avec le `/` | `/pulse-motion:creer Les règles d'hygiène en cuisine` |
| `/pulse-motion:style` | avec le `/` | `/pulse-motion:style Un style papercraft aux couleurs pop-art` |
| `/pulse-motion:retoucher` | une phrase, ou avec le `/` | « ralentis la scène 3 », « baisse la musique », « ouvre l'aperçu », « fais une planche des scènes 2 et 3 », « enregistre ma charte », « annule » |
| `/pulse-motion:voix` | une phrase, ou avec le `/` | « j'enregistre la scène 2 », « j'ai un fichier de ma voix », « mets une voix provisoire », « recale les mots », « fais-moi écouter la musique » |
| `/pulse-motion:exporter` | une phrase, ou avec le `/` | « exporte ma vidéo », « une version légère pour l'envoyer par courriel » |
| `/pulse-motion:reprendre` | une phrase, ou avec le `/` | « où en est ma vidéo ? », « on reprend » |
| `/pulse-motion:outils` | une phrase, ou avec le `/` | « vérifie mon ordinateur », « installe la transcription », « installe ffmpeg » |
| `/pulse-motion:dessiner-personnage` | une phrase, ou avec le `/` | « dessine-moi un cuisinier rondouillard avec une toque », « change sa tenue en rouge » |
| `/pulse-motion:decouper-personnage` | une phrase, ou avec le `/` | « voici notre mascotte en SVG, fais-la marcher », « découpe ce dessin pour l'animer » |
| `/pulse-motion:animer-personnage` | une phrase, ou avec le `/` | « fais une pose où il se gratte la tête », « il marche trop vite », « montre-moi la course de face » |
| `/pulse-motion:atelier-personnages` | une phrase, ou avec le `/` | « ouvre l'éditeur de personnage », « je veux régler son salut moi-même » |
| `/pulse-motion:atelier-particules` | une phrase, ou avec le `/` | « ouvre l'éditeur de particules », « laisse-moi régler les étincelles » |

## Prérequis

- Claude Code
- Node.js 20 ou plus (aucune dépendance à installer)
- Chrome ou Edge pour regarder l'aperçu

## Contenu

| Dossier | Rôle |
|---|---|
| `skills/` | `creer`, `style`, `retoucher`, `voix`, `exporter`, `reprendre`, `outils` (voir « Ce que vous pouvez demander ») |
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
