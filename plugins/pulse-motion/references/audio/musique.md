# Musique de la vidéo

## Musique générée

Composée sur l'ordinateur à partir de la graine : la même graine donne toujours la même musique ; `graine` + 1 donne une variante. Son tempo devient celui du déroulé (unité `t` des animations).

**La musique se cale sur l'image, pas l'inverse.** Elle est recomposée à chaque assemblage sur le minutage réel : une section par scène, qui commence pile au vrai début de la scène (transitions et allongement par la voix compris) et s'arrête au début de la suivante ; la grille des temps repart à chaque scène, donc les temps musicaux d'une scène (`data-start="4t"`) tombent sur la musique. Les durées de scène sont libres (pas besoin de demi-secondes). Structure : introduction sans percussion pendant la première scène (sauf humeur donnée), montée sur la dernière seconde avant la dernière scène, accord final jusqu'à la fin (pas d'accord si la dernière scène est en `silence`) ; la progression d'accords continue d'une scène à l'autre.

Humeur de la musique pendant une scène : `scenes[].musique` = `"silence"` (rien), `"calme"` (nappe seule), `"normale"` (défaut : couches selon `intensite`), `"intense"` (toutes les couches, percussions et basse profonde comprises). Ex. un arrêt sur image en silence, puis une démonstration en force : `"musique": "silence"` sur l'une, `"intense"` sur l'autre.

| Ambiance | Caractère | Tempo, tonalité par défaut | Genres |
|---|---|---|---|
| `calme` | nappes douces, posé | 72 bpm, fa | formation, explication |
| `entrainant` | rythmé, joyeux | 118 bpm, sol | social, annonce |
| `inspirant` | lumineux, qui avance | 100 bpm, ré | formation, storytelling |
| `corporate` | net, rassurant | 108 bpm, do | produit, entreprise |
| `suspense` | sombre, tendu (cloche, souffle) | 84 bpm, la mineur | storytelling, alerte |
| `tech` | arpèges rapides | 124 bpm, mi mineur | produit, numérique |

`intensite` (scènes `normale`) : en dessous de 0,25, nappe seule ; puis basse (0,25), mélodie (0,45), percussions (0,65). Sous une voix, `volume` 0,4 à 0,6. `pulse-motion musique ecouter .` rend la musique seule dans `sortie/musique.wav`, pour la faire écouter.

## Partition

`"musique": { "partition": "assets/partition.json", "volume": 0.5 }` :

```json
{ "tempo": 100, "tonalite": "re", "mesures": 32,
  "pistes": [
    { "instrument": "pad", "volume": 0.5, "motif": ["re3+fa3+la3 1", "sib2+re3+fa3 1"], "de": 0, "a": 32 },
    { "instrument": "pluck", "motif": ["re4 1/8", "- 1/8", "la4 1/8 0.7", "fa4 1/8"], "de": 4 },
    { "instrument": "kick", "motif": ["x 1/4"], "de": 8, "a": 30 }
  ] }
```

- Note : `do ré mi fa sol la si` (ou `c d e f g a b`), `#` ou `b`, octave (`re4`) ; `+` pour un accord ; `-` silence ; `x` frappe d'une percussion ; durée en fraction de ronde (`1`, `1/2`, `1/4`, `3/8`) ; vélocité facultative (`re4 1/4 0.7`).
- Le motif se répète de la mesure `de` (défaut 0) à la mesure `a` (exclue, défaut `mesures`).
- **Piste calée sur une scène** : `"scene": "demo"`. Elle commence au vrai début de la scène (transitions comprises) et s'arrête au début de la suivante ; `de` et `a` comptent alors les mesures depuis ce début. Écrire la partition **après** les scènes, une ou plusieurs pistes par scène : elle suit l'image même si une durée ou une transition change. Une scène sans piste est muette. Les pistes sans `scene` suivent une grille continue depuis 0.
- Le `tempo` de la partition devient celui de la vidéo (unité `t` des animations) : ne pas écrire de `tempo` dans le déroulé en plus (s'il diffère, c'est une erreur).
- Une partition dont une piste n'a pas de `scene` garde une grille continue : les scènes doivent alors commencer sur un temps (contrôle `hors-tempo`). Toutes les pistes calées sur une scène : durées libres.
- Instruments : `pluck` (corde pincée), `pad` (nappe), `basse`, `sub` (basse profonde), `kick` (grosse caisse), `caisse` (caisse claire), `charleston`, `cloche`, `nappe-bruit` (souffle filtré), `riser` (montée).
- Une partition mal formée est une erreur (`partition-invalide`) qui nomme la piste et la note fautives.

