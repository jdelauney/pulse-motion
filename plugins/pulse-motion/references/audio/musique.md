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
| `acoustique` | guitare pincée, chaleureux | 92 bpm, sol | formation, styles dessinés |
| `mecanique` | horlogerie, précis (pizzicato, tics, cloche) | 108 bpm, la mineur | procédure, styles techniques |

L'ambiance proposée est la première de la palette sonore du style (`pulse-motion styles ambiance <style> --genre <genre>`) ; le genre départage les ambiances d'un style qui en liste plusieurs.

`intensite` (scènes `normale`) : en dessous de 0,25, nappe seule ; puis basse (0,25), mélodie (0,45), percussions (0,65). Sous une voix, `volume` 0,4 à 0,6. `pulse-motion musique ecouter .` rend la musique seule dans `sortie/musique.wav`, pour la faire écouter.

## Musique en fichier

Copier le fichier dans `assets/`. Si la personne connaît son tempo (ou le titre l'indique : « 120 bpm »), l'écrire dans le déroulé (`"tempo": { "bpm": 120 }`) : les animateurs caleront les entrées sur les temps. Un fichier ne se recale pas sur les scènes : chaque scène doit alors commencer sur un temps (contrôle `hors-tempo`) ; à 120 bpm, des durées en demi-secondes.

## Vos musiques (bibliothèque personnelle)

Pulse Motion ne livre aucune musique enregistrée ; la personne peut garder les siennes (achetées, libres, ou dont elle a les droits) pour toutes ses vidéos, dans `~/.pulse-motion/musiques/`.

- **Garder** (« garde cette musique pour mes prochaines vidéos », un fichier donné) : la licence est obligatoire ; la demander si elle manque : « J'en ai les droits » (`personnelle`) · « Libre, sans mention (CC0) » (`cc0`) · « Libre, avec mention (CC BY) » (`cc-by` : demander aussi le texte à citer, `--attribution`) · « Achetée sur une banque de musique » (`achetee`) · « Autre » (`autre:<ce que la licence permet>`). Puis `pulse-motion musique ajouter <fichier> --ambiance <a>[,<b>] --licence <l> [--titre "…"] [--auteur "…"] [--source "…"] [--attribution "…"]` ; ambiances : celles du tableau plus haut. Durée, tempo et volume sont mesurés dans le navigateur (`tempo` : `null` si la pulsation n'est pas nette). Refus `licence` ou `attribution` : poser la question, puis relancer.
- **Proposer** : `pulse-motion musique liste --ambiance <ambiance>` ; des titres trouvés : « Votre musique « <titre> » » vient avant « Une musique composée pour la vidéo ».
- **Utiliser** : `pulse-motion musique utiliser <id> .` **copie** le fichier dans `assets/musique/`, écrit `musique.fichier` et `musique.origine` (volume gardé) et note sa licence pour les crédits (`assets/sources.json`, attribution CC BY comprise). Changer ou retirer la musique de la bibliothèque ne change pas la vidéo. `pris` : la vidéo a déjà un fichier de ce nom, différent ; demander avant `--remplacer`. Le résultat donne le `tempo` estimé : si les gestes de la vidéo étaient calés sur les temps de la musique composée (`data-start="2t"`), proposer de l'écrire dans `"tempo": { "bpm": … }`, puis contrôler (`hors-tempo`).
- Licence `autre` : l'export rappelle de vérifier les droits avant de publier (`alertes` du résultat) ; le dire.
- `pulse-motion musique retirer <id>` : la retire de la bibliothèque, jamais des vidéos. Elle part avec la bibliothèque sur un autre ordinateur (`pulse-motion reference chez-soi`).

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
- Instruments : `pluck` (corde pincée simple), `corde` (corde pincée par modèle physique ; `"prereglage"` de la piste : `guitare`, `harpe`, `kalimba`, `pizzicato` ; chaque note varie un peu), `tic` (battement d'horloge), `pad` (nappe), `basse`, `sub` (basse profonde), `kick` (grosse caisse), `caisse` (caisse claire), `charleston`, `cloche`, `nappe-bruit` (souffle filtré), `riser` (montée).
- Une partition mal formée est une erreur (`partition-invalide`) qui nomme la piste et la note fautives.

