# Style « chaleureux »

> Un accueil en couleurs chaudes : galets qui respirent, cartes aux coins très ronds, entrées douces qui s'arrêtent net.
> Sources : Style d'origine Pulse Motion.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene chaleureux <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.galet`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton clair seulement.
- Un message par scène ; longueurs maximales du § 10 ; 1,5 s de lecture après la dernière entrée.

## 1. Essence, et ce qu'il n'est pas

- Tons chauds (terre cuite, sauge, pêche) ; formes organiques qui gonflent doucement ; cartes douces aux coins de 3 à 5 cqh ; titres arrondis ; un ton direct et bienveillant.
- Pas `clair-pedagogique` : galets irréguliers et non cercles, couleurs plus nombreuses, mouvement plus lent. Pas `energique` : ni aplats criards, ni capitales, ni rebond appuyé. Pas un dessin animé : aucune mascotte d'office.

## 2. Matières et rendu

- HTML et CSS : aplats pâles, rayons généreux, galets aux coins elliptiques ; ni canevas, ni texture, ni module.
- `.galet` respire par `--m` (0 → 1 : forme et taille) et dérive par `--dx`, `--dy`, toute la scène.

## 3. Logique de couleur

- Plusieurs teintes douces : `--c-primaire` de la charte pour les titres, le galet du chiffre et les grands galets ; `--c-accent` (sauge par défaut) pour les pastilles, les puces, les numéros et les flèches.
- Surfaces : la couleur de marque mêlée au fond à 7–12 % ; texte posé dessus en version « sur teinte » (plus foncée). Jamais colorés : le texte courant.
- Ton clair seulement. Palette d'exemple (celle du style) : terre cuite `#c2410c`, sauge `#4d7c0f`, fond pêche `#fff7ed`, texte `#43302b`.

## 4. Typographie et sous-titres

- Polices fournies : **Fredoka** 600, titres arrondis (9,6 cqh, moyen 6,6, chiffre 18) ; **Nunito Sans**, texte (4,4 cqh, interligne 1,45). Une autre police : son fichier dans `assets/`.
- Sous-titres : habillage du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- `.pose` : monte de 6 cqh en `quint-out` (0,9 s) et s'arrête net ; `.eclot` : éclot en `back-out` (0,8 s) ; décor en `sine-inout`, lent.
- Cascade de 0,3 à 0,6 s entre les entrées ; rien de brusque, rien qui clignote.
- Conseillés : #001, #002, #072, #073. Déconseillés : #013, #036, #054.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Zoom avant lent (#056) | on se rapproche de quelqu'un | un témoignage, un accueil |
| Grue (#059) | on entre dans le lieu | une ouverture, un parcours |
| Plan fixe | la conversation | la plupart des scènes |

- Cadrages larges et aérés ; aucune secousse.
- Transitions : `fondu`, `glissement`. À éviter : `coupe`, `glitch`, `pixels`.

## 7. Palette sonore

- Ambiance `inspirant` par défaut, `calme` en alternative.
- Bruitages : point → `pop` ; forme → `pop` ; les autres entrées sans son propre ; transition : son de la transition (`glissement` → `whoosh`).
- Matière : aucune. Moment fort : `carillon`.
- Peu de sons, et doux : aucun son fort.

## 8. Gestes natifs

- **Galet qui respire.** *Recette :* `.galet` (`--m 0→1 sine-inout`) toute la scène. *Convient à :* un accueil ; une pause ; un chiffre rassurant.
- **Éclosion.** Une pastille s'ouvre comme une bulle. *Recette :* `.eclot` sur `.pastille-texte` ou `.rond-numero`. *Convient à :* une étiquette ; un numéro d'étape ; un conseil.
- **Cartes posées.** Les points arrivent un à un et se posent. *Recette :* `.cartes` et `.pose`, 0,6 s d'écart. *Convient à :* des conseils ; les étapes d'un parcours ; des bénéfices.

## 9. Pièges

- Trop de couleurs : deux de marque au plus, le reste en surfaces pâles.
- Galet derrière un texte qui baisse le contraste : décaler le galet vers un bord.
- Export : ni `mix-blend-mode`, ni filtre SVG, ni `transition` CSS.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Accueillir, ouvrir | 7 s | etiquette 25, titre 40, sous 50 |
| `liste` | 2 à 4 points sur cartes | 12 s | titre 40, point1 … point4 45 |
| `chiffre` | Un chiffre dans un galet | 7 s | titre 40, unite 3, legende 60 ; `nombre 0→…` |
| `comparaison` | Deux cartes arrondies | 12 s | titre 40, gauche-titre et droite-titre 20, gauche-texte et droite-texte 60 |
| `etape` | Une étape, numéro rond | 8 s | numero 2, titre 40, texte 80 |
| `alerte` | Un conseil important | 8 s | titre 40, texte 80 |
| `schema` | Trois étapes, flèches courbes | 8 s | titre 40, a, b, c 25 |
| `moyeu` | Un centre, 3 à 5 parties reliées | 10 s | titre 40, centre 24, partie1 … partie5 22 |
| `conclusion` | Le message et le logo | 6 s | titre 40, sous 50 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.pastille-texte`, `.titre`, `.titre-moyen`, `.sous-titre`, `.texte`, `.chiffre-rond` ; `.centre`.
- Entrées : `.pose`, `.eclot`. Décor : `.decor` + `.galet`, `.galet.sauge`.
- Scènes : `.cartes` ; `.galet-chiffre` ; `.deux-cartes`, `.carte`, `.carte-titre` ; `.etape`, `.rond-numero` ; `.conseil`, `.conseil-icone`, `.conseil-corps` ; `.parcours`, `.etiquette-ronde`, `.courbe` ; `.logo`.

Modules du moteur : aucun. Scène composée : ces classes et `<style>@scope { … }</style>` ; photos de vraies personnes bienvenues.

## 11. Espace de variation

- Claude décide pour chaque vidéo : la forme et la place des galets, l'ordre des cartes, l'accent (sauge ou couleur de marque), l'ambiance (§ 7).
- Structures : accueil → ce qui vous attend → premier pas ; besoin → solution → contact ; témoignage → chiffre → message.
- Ouvertures : un bonjour et le nom du lieu ; une question bienveillante ; un chiffre rassurant.
- Fins : le message et le logo ; « à bientôt » et le contact ; le conseil à garder.
- Usages : accueillir de nouveaux arrivants ; parler santé ou prévention ; présenter une association.
