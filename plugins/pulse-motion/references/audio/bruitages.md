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
| `crissement` | un tracé à main levée (pointe qui frotte, sur la durée du tracé ; tenu) |
| `frappe` | une touche de clavier, un texte tapé |
| `succes` | une réussite (deux notes qui montent) |
| `erreur` | une erreur, un mauvais choix (deux notes graves qui descendent) |
| `notification` | un message qui arrive (deux tintements doux) |
| `aimant` | un aimant, une pièce qui se pose (clic métallique et petit choc) |
| `feutre` | un trait au feutre sur un tableau blanc (tenu) |
| `craie` | un trait à la craie (tenu) |
| `crayon` | un trait au crayon (tenu) |
| `papier` | un papier qui glisse ou se froisse (tenu) |
| `chargement` | une barre qui se remplit (tics réguliers, tenu) |

- Bruitages automatiques (`"bruitages": { "auto": true }`, ou `"minimal"`) : un son doux par entrée, selon son genre ; détail dans `pulse-motion reference explication`.
- **Son tenu** : il dure l'entrée de l'élément (`data-dur`) et compte pour un son. Le tracé à main levée sonne `crissement`, sauf dans un style qui déclare une matière (`feutre`, `craie`, `crayon`, `papier`) : son son tenu le remplace. Dans un tel style, toute action visible qui touche la matière a un son, dans la limite de 1 à 3 par scène.
- 1 à 3 sons par scène suffisent ; au plus 3 dans la même seconde (`trop-de-sons`).
- **Calage par le pic** (`"bruitages": { "calage": "pic" }`, écrit par `creer`) : le son part un peu avant l'élément, pour que son pic tombe dessus (`whoosh` : 0,25 s avant). Sans ce champ, il part au début de l'élément.
- **Moment fort** : `data-moment-fort` sur l'élément d'un temps fort (au plus 1 par scène et 3 par vidéo, `moment-fort-en-trop`) : la musique se tait 0,6 s avant, puis le son fort du style tombe sur l'élément (sauf s'il a son `data-son`). Quand en mettre : `pulse-motion reference realisation`.
- **Mixage par bandes** (`"bruitages": { "bandes": true }`) : les bruitages doux passent au-dessus de 800 Hz et la musique sous 4 kHz pendant 0,3 s autour de chacun ; chacun garde sa place. Sur demande seulement.
- Jamais un son fort (`impact`, `basse`, `montee`) pendant un mot de la voix (`son-sous-voix`) : le placer dans une pause.
- `"bruitages": { "transitions": true }` : un son par transition (fondu → `souffle`, glissement, rideau, whip, poussée et retournement → `whoosh`, traversée → `montee`, cercle et volets → `swoosh-inverse`, balayage → `swoosh-inverse`, zoom → `montee`, coupe → `impact` ; transition par shader : `dissolution` et `ondulation` → `souffle`, `pixels` → `blip`, `glitch` → `impact`, `balayage-organique` et `iris` → `swoosh-inverse`, `fuite-lumiere` et `brulure` → `souffle`, `lentille` et `deformation` → `whoosh`, un shader du projet → `souffle`).

