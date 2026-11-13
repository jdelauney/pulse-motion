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
| `musique.origine` | `"bibliotheque:<id>"` : musique copiée de la bibliothèque personnelle (écrit par `pulse-motion musique utiliser`), avec `fichier` |
| `musique.tempo` | 60–180 bpm, avec `generee` : `"musique": { "generee": "inspirant", "tempo": 120 }` (défaut : celui de l'ambiance) ; il devient le tempo de la vidéo, pas de `tempo` en haut du déroulé en plus |
| `voix.provisoire` | `true` : voix du système pour les scènes qui ont un texte sans prise ; dans la langue de la vidéo, jamais une voix française à sa place (`pulse-motion reference langues`) |
| `voix.volume` | 0–1 (défaut 1) |
| `sousTitres` | présent : sous-titres dès qu'une scène a un `voix.texte` ; `mode` `ligne` (défaut) ou `mot` ; `incrustes` `true` (défaut) ou `false` (fichiers seulement) ; `position` `bas` ou `haut` |
| `bruitages` | `transitions` : un son à chaque transition (défaut `false`) ; `volume` 0–1 |
| `scenes[].voix.texte` | ce qui est dit dans la scène : prompteur du studio, texte des sous-titres, référence de la transcription |
| `scenes[].voix.fichier` | prise de la scène (écrite par le studio ou l'import) |
| `scenes[].voix.debut` | instant du début de la prise dans la scène, en secondes (défaut 0,3) |

## Sous-titres

- Cartons de 2 lignes au plus (42 caractères par ligne, 32 en 4:5, 28 en 9:16), découpés aux pauses et à la ponctuation, jamais après un article.
- `mode: "ligne"` : le carton s'affiche ; `mode: "mot"` : le mot dit passe en couleur d'accent (conseillé en 9:16, pour les réseaux).
- Dessinés dans la vidéo (`incrustes`) et livrés dans `sortie/<titre>.srt` et `sortie/<titre>.vtt`, pour les plateformes qui les proposent à part.
- Habillés par le style : `--pm-st-police`, `--pm-st-taille`, `--pm-st-largeur` (largeur maximale du carton), `--pm-st-texte`, `--pm-st-fond`, `--pm-st-accent`, `--pm-st-marge`, `--pm-st-position`.
- Le contrôle signale un sous-titre qui cache un texte de la scène (`sous-titre-cache-texte`) : remonter le texte, ou passer les sous-titres en haut.

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
| `pulse-motion musique liste [--ambiance <a>]` · `ajouter` · `utiliser <id> .` · `retirer <id>` | les musiques de la personne, gardées avec leur licence (`audio/musique`, « Vos musiques ») |

## Exports

- Le son des deux exports est le mixage de la page ; l'export fidèle vérifie sa sonie (±1 LU).
- Voix provisoire : export refusé ; `pulse-motion exporter . --avec-provisoire` seulement si la personne veut une version de travail.
- Avec des sous-titres : `sortie/<titre>.srt` et `sortie/<titre>.vtt` sont écrits à côté de la vidéo.

## Les parties

Lire ce tronc, puis seulement la partie utile : `pulse-motion reference audio/<partie>`.

| Partie | Contenu |
|---|---|
| `audio/voix` | écrire le texte dit, prises, voix provisoire, transcription |
| `audio/synthese` | voix de synthèse locale : la poser, l'installer (avec accord), prononciation vérifiée, vitesse |
| `audio/ancres` | `data-start="mot:…"` : un élément entre quand la voix dit son mot (scène qui a une prise) |
| `audio/musique` | musique générée (ambiances, humeur par scène, `intensite`), partition écrite, musique en fichier et musiques de la personne (bibliothèque) |
| `audio/bruitages` | `data-son` sur un élément, liste des sons, sons des transitions |
| `audio/son-reactif` | variables `--son-…` et `--voix-enveloppe`, effets et shaders qui suivent le son |
| `audio/mixage` | fondus, baisse sous la voix, sonie |
