# La journée qui passe : ciel, papier, encre et lampes

## L'essentiel

- Une scène peut passer du jour à la nuit : le ciel change, le papier s'assombrit en indigo, l'encre devient pâle, les fenêtres s'allument une à une.
- Tout est calculé depuis le temps de la vidéo, sans mémoire d'une image à l'autre : l'aperçu, l'export rapide et l'export fidèle montrent la même heure au même instant.
- Rien n'est imposé : sans `data-journee`, une vidéo reste exactement la même. Un style s'en sert par ses gestes (fiche § 8) ; les couleurs de la charte (`--c-*`) ne changent jamais.

## L'heure d'une scène

```html
<section data-scene="rue" data-journee="0.62-0.95"
  style="background: linear-gradient(var(--pm-ciel-haut), var(--pm-ciel-bas))">
  …
</section>
```

- `data-journee` se pose sur la section de la scène. L'heure va de 0 (minuit) à 1 : 0,25 l'aube, 0,5 midi, 0,75 le crépuscule.
- `"0.62-0.95"` : l'heure passe de la première à la seconde pendant la scène, lente au début et à la fin, plus vive au milieu. `"0.75"` : l'heure est fixe. Pour passer minuit, deux scènes.
- La scène reçoit, à chaque image :

| Variable | Ce que c'est |
|---|---|
| `--pm-ciel-haut`, `--pm-ciel-bas` | Le haut et le bas du ciel (un dégradé du haut vers le bas) |
| `--pm-papier` | Le papier : crème le jour, indigo la nuit |
| `--pm-encre` | L'encre : sombre sur le papier clair, pâle sur le papier sombre ; elle bascule quand le papier passe à mi-sombre |
| `--pm-nuit` | De 0 (jour) à 1 (nuit) : étoiles, lune, lucioles (`opacity: var(--pm-nuit)`) |
| `--pm-lampe` | De 0 (grand jour) à 1 (nuit noire) : combien il fait sombre pour les lampes |

- Les personnages au trait de plume prennent d'eux-mêmes l'encre et le papier de l'heure. Un décor dessiné les prend par `stroke: var(--pm-encre)` et `fill: var(--pm-papier)`.
- Dans un canevas (style qui peint son ciel), lire `M.journee.palette(M.journee.instant('<scène>', t))` : `{ haut, bas, papier, encre, lampe, nuit, couchant }` (couleurs `[r, g, b]` ; `couchant` : la lumière chaude de l'aube et du crépuscule). Jamais les variables lues dans la page : elles sont posées après le rendu de l'image.

## Fenêtres et lampes

```html
<rect data-lampe x="20" y="30" width="8" height="10" />   <!-- dans un SVG -->
<div class="fenetre" data-lampe></div>                     <!-- en HTML -->
```

- `data-lampe` (sans valeur) sur une fenêtre, une lanterne, un réverbère, dans une scène à `data-journee`. Chaque lampe tire son seuil au sort, toujours le même : elles s'allument une à une à la tombée de la nuit, et s'éteignent une à une au matin.
- Allumée, la fenêtre passe de la couleur du papier à une lumière chaude, et une lueur ronde l'entoure (dégradé radial, sans fusion de couleurs). Toute règle du style ou de la scène l'emporte ; `--pm-allume` (0 à 1) sert à un dessin à soi.
- Pour les voir s'allumer une à une, une scène lente autour du crépuscule : `data-journee="0.72-0.8"` sur 8 s ou plus. De 0,62 à 0,95 en quelques secondes, elles s'allument presque ensemble.

## Lisibilité

- Pendant la bascule de l'encre (vers τ = 0,75 au soir, 0,25 au matin), l'encre et le papier se lisent mal un court instant. **Aucun texte n'y est visible** (règle `journee-texte`, erreur) : le faire partir avant (`data-tween="opacity 1→0"`), le faire entrer après, ou passer l'heure dans une scène sans texte.
- Regarder la scène aux 7 heures du balayage : `pulse-motion planche . --journee [--scene <id>] [--de <s>]` (aube, matin, midi, heure dorée, bascule, nuit, fin de nuit, au même instant de la scène ; `sortie/planche/journee-<scène>.png`). L'encre doit se lire partout, sauf à la bascule.

## Règles

`journee-texte` (erreur) : un texte visible pendant la bascule ; `journee-invalide` : `data-journee` mal écrit ou ailleurs que sur la section (erreur), `data-lampe` avec une valeur ou dans une scène sans journée (alerte).
