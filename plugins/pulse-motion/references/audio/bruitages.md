# Bruitages

`data-son="pop"` sur un élément : le son part au début de l'élément (ancres `mot:` comprises). `data-son-volume="0.6"` le baisse. Un fichier du projet : `data-son="assets/sons/porte.wav"`.

| Son | Pour |
|---|---|
| `whoosh` | une entrée rapide, un glissement |
| `swoosh-inverse` | une sortie, un balayage |
| `pop` | un point de liste, une bulle |
| `clic` | un bouton, une coche |
| `tic` | un compteur, une petite étape |
| `impact` | un mot clé qui tombe (fort) |
| `basse` | un chiffre choc (fort) |
| `montee` | une tension avant une révélation (fort) |
| `carillon` | une conclusion, une réussite |
| `ding` | un chiffre, une bonne réponse |
| `blip` | une alerte, une notification |
| `souffle` | un fondu, une respiration |
| `crissement` | un tracé à main levée (feutre qui frotte, sur la durée du tracé) |

- Bruitages automatiques (`"bruitages": { "auto": true }`, ou `"minimal"`) : un son doux par entrée, selon son genre ; détail dans `pulse-motion reference explication`.
- 1 à 3 sons par scène suffisent ; au plus 3 dans la même seconde (`trop-de-sons`).
- Jamais un son fort (`impact`, `basse`, `montee`) pendant un mot de la voix (`son-sous-voix`) : le placer dans une pause.
- `"bruitages": { "transitions": true }` : un son par transition (fondu → `souffle`, glissement, rideau, whip, poussée et retournement → `whoosh`, traversée → `montee`, cercle et volets → `swoosh-inverse`, balayage → `swoosh-inverse`, zoom → `montee`, coupe → `impact` ; transition par shader : `dissolution` et `ondulation` → `souffle`, `pixels` → `blip`, `glitch` → `impact`, `balayage-organique` et `iris` → `swoosh-inverse`, `fuite-lumiere` et `brulure` → `souffle`, `lentille` et `deformation` → `whoosh`, un shader du projet → `souffle`).

