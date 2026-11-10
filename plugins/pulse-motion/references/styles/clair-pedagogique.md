# Style « clair-pedagogique »

> Le tableau de la salle de formation, au propre : fond clair, grands titres, ronds pâles qui dérivent, chaque idée entre en glissant.
> Sources : Style d'origine Pulse Motion.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene clair-pedagogique <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.rond`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16 (en vertical, tout s'empile). Ton clair par défaut, sombre sur demande.
- Un message par scène ; longueurs maximales du § 10 ; 1,5 s de lecture après la dernière entrée.

## 1. Essence, et ce qu'il n'est pas

- Fond clair uni ; titres gras dans la couleur primaire de la marque ; deux grands ronds pâles qui dérivent ; textes qui entrent en glissant d'en bas ; puces, chiffres et flèches à l'accent.
- Pas `chaleureux` : des cercles nets, ni galets ni cartes molles, un ton neutre. Pas `minimal` : couleur de marque dans les titres, décor présent, angles arrondis. Pas `tech-sombre` : ni terminal, ni grille, ni chasse fixe.

## 2. Matières et rendu

- HTML et CSS : aplats, coins arrondis, surfaces teintées de la marque (7 à 14 %) ; ni canevas, ni texture, ni module.
- `.rond` (7 %, accent 12 %) dérive sur `--dx`, `--dy` ou `scale` toute la scène.

## 3. Logique de couleur

- Trois teintes : fond neutre clair ; `--c-primaire` de la charte pour les titres, les numéros et le cadre des boîtes ; `--c-accent` pour ce qui guide l'œil (étiquettes, puces, chiffres, flèches, soulignement).
- Toujours par leurs versions lisibles (`--c-primaire-lisible`, `--c-accent-lisible`) ; la couleur brute seulement dans le décor transparent. Jamais colorés : le texte courant, le fond.
- Ton sombre : fond `#0f172a`, texte `#e2e8f0`, ronds plus visibles (16 %). Palette d'exemple (celle du style) : bleu `#1d4ed8`, ambre `#b45309`, fond `#f8fafc`.

## 4. Typographie et sous-titres

- Polices fournies : **Figtree** 800, titres (9 cqh, moyen 6,5, chiffre 24) ; **Inter**, texte (4,4 cqh). Une autre police : son fichier dans `assets/`. Carré : −20 % ; vertical : titre 6 cqh, texte 3,5.
- Sous-titres : habillage du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Entrées `quart-out` en 0,7 s, `.zoom` en `back-out`, décor en `sine-inout`. Poids léger : seul le chiffre rebondit un peu.
- Une entrée par élément, en cascade de 0,2 à 0,3 s ; puis le texte ne bouge plus, seul le décor dérive. Pas de sortie : la transition s'en charge.
- Conseillés : #002, #003, #011, #021, #025. Déconseillés : #013, #033, #054.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Zoom avant lent (#056) | on se concentre | un titre, une règle à retenir |
| Zoom sur un détail (#037) | « regardez ici » | un chiffre, une étape |
| Panoramique (#057) | on parcourt | un schéma large, une liste |
| Plan fixe | l'explication posée | la plupart des scènes |

- La caméra ne coupe jamais un texte ; le contenu reste dans les marges du style.
- Transitions : `fondu`, `glissement`, `balayage`. À éviter : `coupe`, `retournement`, `glitch`.
- Shaders : aucun n'est nécessaire ; `grain` léger sur demande seulement (WebGPU), jamais imposé.

## 7. Palette sonore

- Ambiance `calme` par défaut, `inspirant` en alternative.
- Bruitages : point → `pop` ; chiffre → `tic` ; tracé → `whoosh` ; les autres entrées sans son propre ; transition : son de la transition (`fondu` → `souffle`).
- Matière : aucune. Moment fort : `carillon` (conclusion, bonne réponse).
- La voix d'abord : 1 à 3 sons par scène, silence pendant les phrases importantes.

## 8. Gestes natifs

- **Soulignement.** Un trait d'accent se trace sous le titre. *Recette :* `.trait` à `#titre:fin`, 0,6 s ; #025 dans une phrase. *Convient à :* un titre de chapitre ; le mot clé d'une règle ; une bonne réponse.
- **Flèche tracée.** *Recette :* `data-fleche` (#114). *Convient à :* une cause et sa conséquence ; un processus ; un avant et un après.
- **Rond qui respire.** Derrière le chiffre. *Recette :* `.rond.accent`, `scale 0.9→1.05 sine-inout` toute la scène. *Convient à :* un chiffre clé ; une conclusion ; un titre court.

## 9. Pièges

- Texte trop long : couper, ou passer en `liste` (4 points au plus, sinon deux scènes).
- Marque claire (jaune, cyan) en titre : `--c-primaire-lisible`, jamais `--c-primaire`, sur du texte.
- Export : ni `mix-blend-mode`, ni filtre SVG, ni `transition` CSS.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir la vidéo ou un chapitre | 7 s | etiquette 25, titre 40, sous 50 |
| `liste` | 2 à 4 points un par un | 12 s | titre 40, point1 … point4 45 |
| `chiffre` | Un chiffre qui compte | 7 s | titre 40, unite 3 (ou vide), legende 60 ; `nombre 0→…` |
| `comparaison` | Deux colonnes | 12 s | titre 40, gauche-titre et droite-titre 20, gauche-texte et droite-texte 60 |
| `etape` | Une étape numérotée | 8 s | numero 2, titre 40, texte 80 |
| `alerte` | Un point de vigilance | 8 s | titre 40, texte 80 |
| `schema` | Trois étapes fléchées | 8 s | titre 40, a, b, c 25 |
| `moyeu` | Centre et parties | 10 s | titre 40, centre 24, parties 22 |
| `conclusion` | Le message et le logo | 6 s | titre 40, sous 50 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.etiquette`, `.titre`, `.titre-moyen`, `.sous-titre`, `.texte`, `.grand-chiffre` ; `.centre`, `.rangee`.
- Entrées : `.entre-bas`, `.entre-gauche`, `.entre-droite`, `.zoom`, `.fondu` ; `.trait` se trace.
- Décor : `.decor` + `.rond`, `.rond.accent`.
- Scènes : `.liste` ; `.colonne` (`.accent`), `.colonne-titre` ; `.etape`, `.numero`, `.etape-texte` ; `.alerte`, `.alerte-icone`, `.alerte-corps` ; `.schema`, `.boite`, `.fleche` ; `.logo`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : la scène toute faite de chaque idée, la place et la taille des ronds, l'ordre des entrées, le ton et l'ambiance (§ 7).
- Structures : problème → trois règles → rappel ; question → étapes → récapitulatif ; chiffre → explication → geste à retenir.
- Ouvertures : le titre du module et son étiquette ; une question au spectateur ; un chiffre qui surprend.
- Fins : la règle à retenir et le logo ; les trois points résumés ; l'étape suivante à faire.
- Usages : former une équipe ; expliquer une procédure ; présenter un produit.
