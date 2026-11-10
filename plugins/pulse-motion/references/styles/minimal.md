# Style « minimal »

> Une grille suisse qui bouge : beaucoup d'espace, une typographie démesurée, un seul accent, des mouvements courts et nets.
> Sources : Style d'origine Pulse Motion ; gestes des § 5 et § 8 repris de `swiss-motion` (lemo-opuscar, MIT, LemoLab).

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene minimal <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.marqueur`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16 (en vertical, la ligne du schéma devient verticale). Ton clair par défaut, sombre sur demande.
- Titres très courts, tout aligné à gauche ; longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- Grille et marges fixes ; titres noirs de 12 cqh très serrés ; un seul détail d'accent par scène (carré d'index, numéro, unité, barre) ; un repère fin en haut avec son marqueur.
- Pas `editorial` : une seule famille sans empattements, des règles épaisses, plus rapide. Pas `clair-pedagogique` : ni couleur de marque dans les titres, ni décor qui dérive, ni coin arrondi. Pas un style vide : la typographie occupe la page.

## 2. Matières et rendu

- HTML et CSS : fond uni, règles de 0,2 à 0,4 cqh, carrés pleins ; ni ombre, ni rayon, ni module. Seul décor : `.repere` et `.marqueur` qui avance (`--x`, en cqw).

## 3. Logique de couleur

- Deux teintes et un accent : fond, texte (titres, règles et repères compris) et `--c-accent` de la charte, en version lisible, sur un seul détail par scène.
- `--c-primaire` de la charte n'est pas employé : le style reste lisible quelle que soit la marque. Jamais de dégradé ni de surface teintée.
- Ton sombre : fond `#0a0a0a`, texte `#fafafa`. Palette d'exemple (celle du style) : texte `#0a0a0a`, rouge `#dc2626`, fond `#ffffff`.

## 4. Typographie et sous-titres

- Police fournie : **Schibsted Grotesk** seule (titre 900 à 12 cqh, moyen 7, chiffre 32 ; texte 4,4 cqh). Une autre : son fichier dans `assets/`.
- Sous-titres : habillage du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Deux courbes, comme swiss-motion : `expo-out` pour les entrées (0,45 à 0,5 s), linéaire pour l'exception (§ 8) ; marqueur en `expo-inout`, proche de `cubic-bezier(.7, 0, .2, 1)`.
- Entrées : `.revele` (masque) pour les titres, `.monte` (3 cqh) pour le reste ; 0,1 à 0,4 s d'écart. Rien ne rebondit ; ce qui est entré ne bouge plus.
- Conseillés : #006, #011, #021, #050. Déconseillés : #001, #007, #028, #029.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Panoramique (#057) | suivre la grille | une ligne de temps, des colonnes |
| Zoom sur un détail (#037) | isoler un chiffre | un résultat, une décision |
| Plan fixe | la page composée | la plupart des scènes |

- La grille ne bouge pas : la caméra reste rare et sans inclinaison.
- Transitions : `coupe`, `fondu`. À éviter : `zoom`, `retournement`, `glitch`.

## 7. Palette sonore

- Ambiance `corporate` par défaut, `tech` en alternative.
- Bruitages : point → `tic` ; les autres entrées sans son propre ; transition : son de la transition (`coupe` → `impact`, `fondu` → `souffle`).
- Matière : aucune. Moment fort : `basse`.
- Sons rares et secs ; le silence fait partie du style.

## 8. Gestes natifs

- **Masque.** Les grands textes entrent par un masque, jamais par un fondu. *Recette :* `.revele` ou `.pm-m-masque` (#006). *Convient à :* un titre ; un chiffre géant ; un numéro d'étape.
- **Couteau.** Coupe nette, sans fondu de sortie. *Recette :* transition `coupe` (#050) ; aucune `.pm-m-sortie` (#012). *Convient à :* un changement de sujet ; une liste qui se remplace ; un avant et un après.
- **Exception.** Un seul élément bouge en linéaire. *Recette :* `.marqueur`, `data-tween="--x 0cqw→60cqw linear"` toute la scène. *Convient à :* une progression ; un temps qui passe ; un chargement.

## 9. Pièges

- Plusieurs couleurs, ou l'accent sur deux détails : en garder un seul par scène.
- Titre long : à 12 cqh il prend trois lignes ; le raccourcir.
- Décor ajouté (ronds, dégradés) : il ruine la grille.
- Export : ni `mix-blend-mode`, ni filtre SVG, ni `transition` CSS ; numéros écrits en clair.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Titre démesuré | 7 s | etiquette 25, titre 40, sous 50 |
| `liste` | 2 à 4 points numérotés | 12 s | titre 40, point1 … point4 45 |
| `chiffre` | Un chiffre démesuré | 7 s | titre 40, unite 3, legende 60 ; `nombre 0→…` |
| `comparaison` | Deux colonnes sur la grille | 12 s | titre 40, gauche-titre et droite-titre 20, gauche-texte et droite-texte 60 |
| `etape` | Une étape, numéro géant | 8 s | numero 2, titre 40, texte 80 |
| `alerte` | Vigilance, barre d'accent | 8 s | titre 40, texte 80 |
| `schema` | Trois temps sur une ligne | 8 s | titre 40, a, b, c 25 |
| `moyeu` | Un centre, 3 à 5 parties reliées | 10 s | titre 40, centre 24, partie1 … partie5 22 |
| `conclusion` | Le message et le logo | 6 s | titre 40, sous 50 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.index`, `.titre`, `.titre-moyen`, `.sous-titre`, `.texte`, `.chiffre-geant`.
- Entrées : `.monte`, `.revele` ; `.regle` se trace. Décor : `.decor` + `.repere`, `.marqueur` (`--x`).
- Scènes : `.rangs` ; `.colonnes`, `.colonne` (`.accent`), `.colonne-titre` ; `.etape`, `.numero-geant` ; `.vigilance`, `.vigilance-corps` ; `.ligne-temps`, `.temps` ; `.logo`.

Modules du moteur : aucun. Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : le détail d'accent de chaque scène, la course du marqueur, les scènes en coupe et celles en fondu, le ton.
- Structures : énoncé → trois chiffres → décision ; avant → après → résultat ; une question, une réponse par scène.
- Ouvertures : un titre de deux mots ; un chiffre seul ; un index « 01 » et le sujet.
- Fins : la décision et le logo ; le chiffre qui reste ; une phrase courte.
- Usages : présenter un produit ; montrer des résultats ; annoncer une décision.
