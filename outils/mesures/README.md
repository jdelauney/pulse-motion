# Outils de mesure

Protocole de mesure de la spec Rapidité (`docs/superpowers/specs/2026-11-08-rapidite-design.md`, § 5.1) : chaque plan qui promet un gain de vitesse le mesure avant et après, sur deux vidéos témoins. Outils de mainteneur, hors du plugin, jamais livrés.

| Outil | Rôle |
|---|---|
| `node outils/mesures/mesurer.js [--plugin <dossier>] [--passages 3] [--temoins a,b] [--seulement m1,m2] [--tests] [--sortie <fichier>]` | Temps des commandes réelles du plugin sur chaque témoin (médiane, minimum, maximum) : assemblage, contrôle complet, contrôle sans changement, export fidèle 1080p30, sauvegarde d'historique (durée et octets écrits), contrôle après la retouche scriptée (titre de la scène 7), réexport, comparaison de 3 styles, sur demande (`--seulement historique-medias`), sauvegarde d'historique avec 50 Mo de médias quand seul le déroulé change (durée, octets écrits, place de 20 sauvegardes rapportée aux médias) ; poids de la page (total, moteur, polices) et temps jusqu'à `M.pret` dans Chrome sans fenêtre (1280 × 800) ; `--tests` : durée de `npm test`, phase par phase. |
| `node outils/mesures/seance.js --plugin <dossier> --demande "<phrase>" [--temoin <nom>] [--sans-scenes] [--sortie <fichier>]` | Une vraie séance de Claude Code, non interactive, avec le plugin donné, sur une copie du témoin. Mesure de création : `--temoin <nom> --sans-scenes --demande "/pulse-motion:reprendre"` (déroulé validé, étape « fabrication », jusqu'au bloc de fin). |
| `node outils/mesures/jetons.js <session.jsonl> [--json]` | Jetons d'une séance, par modèle et par agent (entrée, cache créé, cache relu, sortie), appels d'outils, temps et appels avant la première phrase, commandes `pulse-motion` lancées, bloc de fin. Aucun coût en euros : il se calcule au moment du bilan. |
| `node outils/mesures/usages.js [--plugin <dossier>] [--temoins a,b] [--usages web,reseaux,…] [--derive] [--mire] [--sortie <fichier>]` | Export par usage (spec Rendu et export) : poids et temps de chaque usage sur une copie neuve de chaque témoin (`720p` : l'export `--qualite 720p` d'avant les usages), coût d'un second usage dérivé de l'intermédiaire commun (`--derive` : web, puis réseaux, puis courriel), écart de couleur CIEDE2000 de la mire des couleurs lue par ffmpeg et par Chrome, dans les deux voies (`--mire`). |
| `node outils/mesures/machine.js` | La machine qui mesure : système, processeur, fils, mémoire, carte graphique, Chrome, ffmpeg, Node, Claude Code. |

Tests : `node --test outils/mesures/*.test.js`.

## Les témoins

- `exemples/chaine-du-froid` du plugin mesuré : 62,5 s, 6 scènes, `clair-pedagogique`.
- `temoins/trois-minutes/` : 3 min, 15 scènes, `chaleureux`, qui couvre tous les groupes du moteur (scènes toutes faites, composées, étincelles, confettis, personnage `touffu`, mouvements nommés, transition par shader, musique générée, bruitages, sous-titres). Fabriqué une fois par une séance de création (`temoin.json`), puis figé : le modifier oblige à refaire les mesures de référence.

Les mesures copient chaque témoin dans un dossier temporaire : les originaux ne sont jamais touchés. Elles ne doivent pas tourner en même temps qu'une autre charge (tests, export, séance).

## Où ranger les résultats

Dans `docs/superpowers/rapports/2026-11-08-depots-rd/mesures/` (ignoré par git), un fichier JSON par mesure et par plan ; le plan recopie le tableau « avant / après / objectif ».
