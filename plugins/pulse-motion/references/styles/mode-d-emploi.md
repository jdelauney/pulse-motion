# Style « mode-d-emploi »

> Le film pédagogique des années 50, « suivez le guide » : des aplats imprimés à quelques pixels de leur trait cassé, une animation limitée où le corps tient et les mains travaillent, des étapes numérotées, un guide calme qui montre le geste.
> Sources : lemo-opuscar, `midcentury-toon` (MIT, © 2026 LemoLab) ; adapté.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene mode-d-emploi <type>`), `type` noté au déroulé.
- Décor (`.piece`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Le guide (`.guide`, `data-personnage="guide"`) : la feuille le place selon le format, sans `data-x` ni `data-taille`.
- `data-aplat` jamais sur un texte à `data-mots`. Longueurs : § 10.

## 1. Essence, et ce qu'il n'est pas

- Des aplats d'époque (moutarde, bleu-vert, rouge brique) imprimés un peu à côté de leur trait.
- Un trait cassé, en tirets irréguliers, jamais un contour net.
- Une animation limitée : tout avance par images (12 i/s), le corps du guide tient, ses mains travaillent.
- Une étape à la fois, numérotée ; une pièce se colore quand on la nomme.
- Pas `chaleureux` : aucune forme qui respire, aucun rebond. Pas un dessin animé à gags : un narrateur calme. Pas `iso-album` : de face, à plat, sans isométrie.

## 2. Matières et rendu

- `[data-aplat]` (module `aplats`) : couleur `--pm-aplat` décalée de 0,3 à 0,6 cqh selon la scène ; trait cassé en tirets à graine (`data-aplat="rond"` : ellipse).
- Le guide (personnage `guide`) : `--pm-perso-vie: mains` (seuls les bras bougent), `--pm-perso-cadence: 12`.
- Décor : `.piece`, par crans (`round()` sur `--x`, `--y`, `--r`). Aucune texture, aucun canevas.

## 3. Logique de couleur

- Trois encres d'aplat au plus par scène : `--c-primaire` (blocs froids, le bon geste), `--c-accent` (le mauvais geste, l'avertissement, `.compte`), une moutarde fixe (`--moutarde`, cartons et pastilles).
- Les textes sont dans l'encre du texte, sur le fond ou sur un carton clair ; jamais sur un aplat foncé.
- Palette d'exemple (celle du style) : crème `#f1e6cf`, bleu-vert `#2b6b67`, rouge brique `#b23f28`, moutarde `#e2ad45`, encre `#26201c`.

## 4. Typographie et sous-titres

- **Fraunces** 600 : titres (9 cqh, moyen 6,2), numéros, chiffres ; **Barlow** 500 : texte (3,9 cqh), 700 : étiquettes.
- Sous-titres sur carton crème. Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Image par image : entrées `pm-m-saccade` (#013, 7 images en 0,6 s), décor par crans, guide à 12 i/s.
- Une pose (`montrer`) tenue par étape ; seule la main bouge.
- Conseillés : #013, #021, #065. Déconseillés : #001, #036, #054.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Plan fixe | regarder le geste | presque toutes les scènes |
| Zoom lent (#056) | s'approcher de la main | une étape délicate, un détail |
| Panoramique (#057) | passer d'une pièce à l'autre | un montage en trois temps |

- De face, cadre stable : un film d'atelier. Transitions : `coupe` (d'une carte à l'autre), `fondu`. À éviter : `whip`, `glitch`, `zoom`.
- Shaders conseillés, jamais imposés : `grain` très léger.

## 7. Palette sonore

- Ambiance `acoustique` par défaut, `mecanique` en alternative (pour une partition propre, la corde au préréglage kalimba).
- Bruitages : point (chaque étape, chaque point) → `ding` ; forme → `pop` ; chiffre → `tic`.
- Matière : aucune. Moment fort (la réussite) : `succes`. Silence entre deux étapes ; 1 à 3 sons par scène.

## 8. Gestes natifs

- **L'étape où la main fait.** *Recette :* scène `etape`, pose `montrer` tenue. *Convient à :* une mise en route ; un réglage ; un logiciel.
- **Le geste montré deux fois.** *Recette :* le même `jouer`, puis sous `data-vitesse="0.5"` (#065). *Convient à :* la sécurité ; un nœud ; un raccourci.
- **Le bon et le mauvais geste.** *Recette :* scène `comparaison`, `.nommee` sur la bonne planche. *Convient à :* une posture ; un rangement ; une erreur fréquente.
- **La pièce qui se colore quand on la nomme.** *Recette :* `.nommee` à `data-aplat` et `data-dur`, sur `mot:`. *Convient à :* un appareil ; un circuit ; un écran.

## 9. Pièges

- Un corps qui gigote : garder la vie `mains`.
- Des mouvements fluides et rebondis : tout par images (#013).
- Le guide sur un texte : garder la marge de la feuille. Export : ni filtre, ni `mix-blend-mode`.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Carte de titre, le guide la montre | 7 s | etiquette 22, titre 30, sous 46 |
| `liste` | 2 à 4 points, pastilles numérotées | 12 s | titre 30, point1 … point4 36 |
| `chiffre` | Bloc tracé qui se colore | 7 s | titre 30, unite 3, legende 46 ; `nombre 0→…` |
| `comparaison` | Mauvais geste, puis le bon | 12 s | titre 30, gauche-titre et droite-titre 16, gauche-texte et droite-texte 48 |
| `etape` | Le numéro, le guide montre | 8 s | numero 2, titre 30, texte 64 |
| `alerte` | Carton d'avertissement | 8 s | titre 30, texte 64 |
| `schema` | Trois pièces qui se colorent | 8 s | titre 30, a, b, c 16 |
| `moyeu` | Centre et parties | 10 s | titre 30, centre 18, parties 16 |
| `conclusion` | À retenir sur sa carte, logo | 6 s | titre 30, sous 44 |

- Texte : `.titre`, `.titre-moyen`, `.texte`, `.etiquette`, `.nombre`, `.compte`.
- Aplats : `.carton` (`.moutarde`, `.froid`, `.chaud`), `.nommee` (`.froide`), `.piece`, `.guide`. Scènes : `.points`, `.mesure`, `.planche`, `.signe`, `.disque-numero`, `.cadre-alerte`, `.chaine`, `.idee`.
- Module : `aplats`.

Scène composée : ces classes, `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : la pose du guide à chaque étape, la pièce qui se colore, l'encre de chaque carton.
- Structures : une étape par scène, numérotées ; le mauvais geste puis le bon ; l'appareil pièce par pièce.
- Ouvertures : la carte de titre que le guide montre ; le numéro 1 qui se pose ; une pièce tracée qui se colore.
- Fins : la carte de fin ; toutes les pièces colorées ; le logo sur la dernière carte.
- Usages : guide de mise en route d'un produit ; procédure pas à pas d'un poste ; aide en ligne et tutoriel d'usage.
