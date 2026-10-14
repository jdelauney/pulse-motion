# Le son d'une vidéo Pulse Motion

## L'essentiel

- Un seul mixage, fait dans la page : voix, musique et bruitages, ramenés ensemble à −16 LUFS. L'aperçu, la page livrée et les deux exports ont exactement le même son.
- La voix commande la durée : une scène dure au moins le temps de sa prise (début + prise + 0,4 s).
- Les sous-titres reprennent toujours le texte écrit (`voix.texte`), jamais ce que la transcription a cru entendre.
- La musique est un fichier, une ambiance générée sur l'ordinateur (`generee`) ou une partition écrite pour la vidéo.
- Les bruitages se posent sur les éléments (`data-son`) et partent quand l'élément entre.

## Champs du déroulé

Tous facultatifs : un déroulé sans son reste valide.

```json
{
  "musique": { "generee": "inspirant", "intensite": 0.6, "graine": 1, "volume": 0.5 },
  "voix": { "provisoire": true, "volume": 1 },
  "sousTitres": { "mode": "ligne", "incrustes": true, "position": "bas" },
  "bruitages": { "transitions": true, "volume": 0.8 },
  "scenes": [{ "id": "intro", "voix": { "texte": "Pourquoi garder les aliments à 4 degrés ?", "fichier": "assets/voix/intro.wav", "debut": 0.3 } }]
}
```

| Champ | Valeurs |
|---|---|
| `musique` | exactement un de `fichier`, `generee`, `partition` ; `volume` 0–1 (défaut 1) |
| `musique.generee` | ambiance (liste plus bas) ; avec `tonalite` (`do`, `do#`, `re`, `mib`, `mi`, `fa`, `fa#`, `sol`, `lab`, `la`, `sib`, `si`, suivi de `m` pour le mineur), `intensite` 0–1 (défaut 0,5), `graine` entier ≥ 0 (défaut 1) |
| `musique.tempo` | 60–180 bpm, avec `generee` : `"musique": { "generee": "inspirant", "tempo": 120 }` (défaut : celui de l'ambiance) ; il devient le tempo de la vidéo, pas de `tempo` en haut du déroulé en plus |
| `voix.provisoire` | `true` : voix du système pour les scènes qui ont un texte sans prise |
| `voix.volume` | 0–1 (défaut 1) |
| `sousTitres` | présent : sous-titres dès qu'une scène a un `voix.texte` ; `mode` `ligne` (défaut) ou `mot` ; `incrustes` `true` (défaut) ou `false` (fichiers seulement) ; `position` `bas` ou `haut` |
| `bruitages` | `transitions` : un son à chaque transition (défaut `false`) ; `volume` 0–1 |
| `scenes[].voix.texte` | ce qui est dit dans la scène : prompteur du studio, texte des sous-titres, référence de la transcription |
| `scenes[].voix.fichier` | prise de la scène (écrite par le studio ou l'import) |
| `scenes[].voix.debut` | instant du début de la prise dans la scène, en secondes (défaut 0,3) |

## Voix

- **Écrire le texte dit** : une idée par phrase, des phrases courtes, au plus 3,5 mots par seconde. La scène dure donc au moins mots / 3,5 + 0,7 s. Écrire les nombres comme on les dit quand ils comptent pour le calage (« quatre degrés » se cale mieux que « 4 °C »).
- **Une prise par scène** : `assets/voix/<scène>.wav`, enregistrée dans le studio de l'aperçu (bouton « Voix », ou `pulse-motion voix studio <scène> .`) ou importée : `pulse-motion voix importer <fichier> --scene <id> .` (WAV, ou tout format avec ffmpeg).
- **Un enregistrement de toute la vidéo** : `pulse-motion voix importer <fichier> .` sans `--scene` le découpe par scène (transcription requise). Une scène dont moins de la moitié des mots ont été reconnus est signalée.
- **Voix provisoire** : `pulse-motion voix provisoire .` fait lire les textes par la voix du système, pour caler l'animation avant d'enregistrer. Elle n'est jamais livrée : l'export la refuse sauf `--avec-provisoire`, donné seulement si la personne le demande.
- **Transcription** (facultative) : `pulse-motion whisper` dit si elle est prête ; `pulse-motion whisper installer` l'installe une fois (Python requis, environ 800 Mo ; `--modele small` : 250 Mo). Ensuite `pulse-motion voix transcrire .` cale les mots des prises déjà là. Sans elle, les mots sont calés au mieux (calage approché), et tout fonctionne.
- Chaque prise a, à côté, un `.mots.json` (temps de chaque mot). Prise ou texte changés : il est périmé et recalculé au mieux ; `pulse-motion voix transcrire .` le refait.

## Ancres `mot:`

Dans une scène qui **a une prise**, un élément peut entrer quand la voix dit un mot :

| Écriture | Instant |
|---|---|
| `data-start="mot:froid"` | début du premier « froid » (accents, majuscules et ponctuation ignorés) |
| `data-start="mot:froid#2"` | deuxième « froid » |
| `data-start="mot:froid:fin"` | fin du mot |
| `data-start="mot:froid+0.2"` | 0,2 s après le début du mot (`-0.2` : avant) |

Réenregistrer la scène recale tout seul les ancres. Une ancre sur un mot que la voix ne dit pas, ou dans une scène sans prise, est une erreur (`ancre-mot-introuvable`).

## Sous-titres

- Cartons de 2 lignes au plus (42 caractères par ligne, 32 en 4:5, 28 en 9:16), découpés aux pauses et à la ponctuation, jamais après un article.
- `mode: "ligne"` : le carton s'affiche ; `mode: "mot"` : le mot dit passe en couleur d'accent (conseillé en 9:16, pour les réseaux).
- Dessinés dans la vidéo (`incrustes`) et livrés dans `sortie/<titre>.srt` et `sortie/<titre>.vtt`, pour les plateformes qui les proposent à part.
- Habillés par le style : `--pm-st-police`, `--pm-st-taille`, `--pm-st-largeur` (largeur maximale du carton), `--pm-st-texte`, `--pm-st-fond`, `--pm-st-accent`, `--pm-st-marge`, `--pm-st-position`.
- Le contrôle signale un sous-titre qui cache un texte de la scène (`sous-titre-cache-texte`) : remonter le texte, ou passer les sous-titres en haut.

## Musique générée

Composée sur l'ordinateur à partir de la graine : la même graine donne toujours la même musique ; `graine` + 1 donne une variante. Son tempo devient celui du déroulé (unité `t` des animations) : chaque scène doit alors commencer sur un temps (contrôle `hors-tempo`). Le plus simple : `"tempo": 120` (un temps = 0,5 s) avec des durées de scène en demi-secondes. Structure calée sur les scènes : introduction sans percussion pendant la première scène, montée sur la dernière seconde avant la dernière scène, accord final jusqu'à la fin.

| Ambiance | Caractère | Tempo, tonalité par défaut | Genres |
|---|---|---|---|
| `calme` | nappes douces, posé | 72 bpm, fa | formation, explication |
| `entrainant` | rythmé, joyeux | 118 bpm, sol | social, annonce |
| `inspirant` | lumineux, qui avance | 100 bpm, ré | formation, storytelling |
| `corporate` | net, rassurant | 108 bpm, do | produit, entreprise |
| `suspense` | sombre, tendu (cloche, souffle) | 84 bpm, la mineur | storytelling, alerte |
| `tech` | arpèges rapides | 124 bpm, mi mineur | produit, numérique |

`intensite` : en dessous de 0,25, nappe seule ; puis basse (0,25), mélodie (0,45), percussions (0,65). Sous une voix, `volume` 0,4 à 0,6. `pulse-motion musique ecouter .` rend la musique seule dans `sortie/musique.wav`, pour la faire écouter.

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
- Instruments : `pluck` (corde pincée), `pad` (nappe), `basse`, `sub` (basse profonde), `kick` (grosse caisse), `caisse` (caisse claire), `charleston`, `cloche`, `nappe-bruit` (souffle filtré), `riser` (montée).
- Une partition mal formée est une erreur (`partition-invalide`) qui nomme la piste et la note fautives.

## Bruitages

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

- 1 à 3 sons par scène suffisent ; au plus 3 dans la même seconde (`trop-de-sons`).
- Jamais un son fort (`impact`, `basse`, `montee`) pendant un mot de la voix (`son-sous-voix`) : le placer dans une pause.
- `"bruitages": { "transitions": true }` : un son par transition (fondu → `souffle`, glissement et rideau → `whoosh`, balayage → `swoosh-inverse`, zoom → `montee`, coupe → `impact` ; transition par shader : `dissolution` et `ondulation` → `souffle`, `pixels` → `blip`, `glitch` → `impact`, `balayage-organique` → `swoosh-inverse`, un shader du projet → `souffle`).

## Mixage

- Musique : fondu d'entrée de 0,5 s et de sortie de 1,5 s ; baissée de 10 dB pendant la voix (et creusée vers 2,5 kHz, là où se trouve la parole).
- Le mélange à plein volume est ramené à −16 LUFS (crête sous −1,5 dBFS, limiteur réglé à −2 dBFS) ; les volumes du déroulé (`voix.volume`, `musique.volume`, `bruitages.volume`) s'appliquent ensuite : « baisse la musique » = `musique.volume` plus bas.
- Pas d'élément `<audio>` dans une scène : tout le son passe par le déroulé et `data-son`.

## Commandes

| Commande | Effet |
|---|---|
| `pulse-motion voix provisoire .` | voix du système pour toutes les scènes qui ont un texte (`--scene <id>` : une seule) |
| `pulse-motion voix importer <fichier> --scene <id> .` | une prise pour une scène |
| `pulse-motion voix importer <fichier> .` | un enregistrement de toute la vidéo, découpé par scène |
| `pulse-motion voix studio <id> .` | ouvre le studio de l'aperçu sur la scène |
| `pulse-motion voix transcrire .` | recale les mots des prises par la transcription |
| `pulse-motion whisper` | état de la transcription (`pret`, `commandeSysteme` si Python manque) |
| `pulse-motion whisper installer` | installe la transcription (avec l'accord de la personne) |
| `pulse-motion musique ecouter .` | la musique seule dans `sortie/musique.wav` |

## Exports

- Le son des deux exports est le mixage de la page ; l'export fidèle vérifie sa sonie (±1 LU).
- Voix provisoire : export refusé ; `pulse-motion exporter . --avec-provisoire` seulement si la personne veut une version de travail.
- Avec des sous-titres : `sortie/<titre>.srt` et `sortie/<titre>.vtt` sont écrits à côté de la vidéo.
