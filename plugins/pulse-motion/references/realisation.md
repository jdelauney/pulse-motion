# Réalisation d'une vidéo Pulse Motion

## L'essentiel

- **Une idée par scène, une promesse par vidéo.**
- **Minuter pour qui regarde une fois.**
- **Regarder avant de montrer** : la personne n'est jamais la première à voir la vidéo (§ 12).
- **Mesurer faute de voir ou d'entendre** : ce qui n'a été ni mesuré ni vu n'est pas affirmé (§ 14).
- **Un chiffre sans source porte « Exemple »** ; rien d'inventé à l'écran (§ 8).
- **Les règles des fils sociaux ne valent que pour le genre `social`** (§ 15).
- **Un seul tour de correction** après le regard et après la relecture (§ 13).
- **Dire ce qui n'a pas été vérifié**, et pourquoi.

## 1. La posture

1. **Réaliser, pas décorer** : juger le rythme, puis la caméra, la mise en scène, enfin l'image.
2. **Une idée, un propos** : ce qui ne sert pas l'idée se coupe, même réussi.
3. **Minuter pour celui qui voit la vidéo une fois**, parfois sur un téléphone, parfois sans le son.
4. **Tout se planifie dans le déroulé** (durées, textes, texte dit, cadrans, faits) ; une scène n'invente rien.
5. **Mesurer ce qu'on ne peut ni voir ni entendre** : le contrôle mesure, Claude regarde les planches.
6. **Ces chiffres sont des repères** : on en enfreint un exprès, et on dit pourquoi.

## 2. Les quatre cadrans

Quatre choix, notés dans le déroulé (facultatif) : `"cadrans": { "horloge": "voix", "continuite": "chapitres", "registre": "editorial", "texte": "legendes" }`.

| Cadran | Valeurs | Ce qu'il décide |
|---|---|---|
| `horloge` | `voix`, `musique`, `lecture` | Ce qui mène le temps |
| `continuite` | `chapitres`, `voyage`, `metamorphose`, `coupes` | Le passage d'une scène à l'autre (parties, caméra, forme qui se change, coupes sur le temps) |
| `registre` | `net`, `fait-main`, `editorial`, `energique` | Le caractère du mouvement et de l'image |
| `texte` | `grand-titre`, `legendes`, `sans-texte` | La place du texte |

Couplages : `sans-texte` exige l'horloge `voix` ; `coupes` va avec `musique` et `energique` ; `voyage` demande une caméra (`pulse-motion reference moteur/camera`).

Par défaut : formation → `voix` (sinon `lecture`), `chapitres`, `legendes` ; produit → `voix` ou `musique`, `voyage`, `grand-titre` ; storytelling → `voix`, `metamorphose`, `legendes` ; social → `musique`, `coupes`, `grand-titre`. Le registre suit le caractère du mouvement du style : posé ou lent → `editorial` (`clair-pedagogique`, `editorial`) ; doux → `fait-main` (`chaleureux`) ; vif → `energique` ; net → `net` (`minimal`, `tech-sombre`).

## 3. Avant d'écrire le déroulé

- L'idée en une phrase ; la promesse en 10 mots au plus.
- Une **constante** (décor, personnage, couleur) et une **grandeur qui change** de scène en scène (un nombre, une distance, un état).
- Le **moment fort** entre 60 et 90 % de la durée ; la **fin répond au début**.
- Trois structures envisagées, deux écartées, en silence : aucune question de plus.
- « À la manière de… » : ce qu'on prend de la vidéo citée, et ce qu'on n'en prend pas.
- 1 à 3 termes du métier au glossaire (`pulse-motion glossaire noter`), dits et montrés dans les mêmes scènes.
- **Les chiffres et leur source** : le chiffre d'une scène `chiffre` s'écrit dans son `intention`. Un chiffre donné avec sa source va dans `faits` : `{ "chiffre": "4 °C", "scene": "seuil", "source": "Règlement (CE) n° 852/2004", "date": "2004-04-29" }` (`date` facultative : AAAA, AAAA-MM ou AAAA-MM-JJ). Un chiffre que la personne n'a pas donné est un exemple : le dire en une phrase, l'écrire dans `faits` avec `"exemple": true`, et la scène affiche « Exemple ».

## 4. L'ouverture

- Formation, produit, storytelling : la première scène dit le sujet et ce qu'on saura faire ; un logo seul, 2 s au plus ; une première image composée.
- Genre social : la promesse se lit avant 3 s (`accrocheMax`), sans le son, en grand ; la première image montre déjà du contenu.

## 5. Rythme et lecture

- Durées : `pulse-motion reference rythme`. Un texte reste 1,5 s (`lectureBase`) + 0,3 s (`lectureParMot`) par mot ; un sous-titre 1,25 s (`sousTitreMin`) au moins ; rien d'immobile plus de 2,5 s (`tempsMort`).
- Une information nouvelle au plus toutes les 8 s (12 s sous une voix, 4 s en social), jamais sous le temps de lecture.
- Une respiration avant le moment fort.
- Accélérer par moitiés (0,5 s, 0,25 s, 0,125 s entre deux entrées), jamais sous 3 images.
- Une comparaison reste entière 2,5 s au moins ; un carton titre dure 2,5 à 4 s.
- Deux échecs : le **diaporama** (tout entre, puis se fige) et l'**économiseur d'écran** (tout bouge sans fin).

## 6. Mouvement et caméra

- Courbes par rôle : une entrée finit franchement, une sortie dure 40 à 60 % de l'entrée, un déplacement accélère puis freine, le linéaire reste à la dérive.
- Une entrée = l'opacité **et** un trajet de 1 à 5 cqh ou une échelle de 0,86 à 0,99, en 0,6 à 0,8 s ; jamais de fondu seul.
- Les enfants entrent 2 à 4 images après leur parent ; un seul dépassement visible par mouvement.
- Rebond, élastique : registres `fait-main` et `energique` ; secousse : `energique` seulement.
- Caméra immobile pendant une révélation ; pas de zoom avant puis arrière ; jamais le même mouvement de caméra sur deux scènes voisines.
- Personnages et décors vivants : `pulse-motion reference mouvement-vivant`.

## 7. Composition et couleur

- Un point focal par image ; le sujet occupe au moins un tiers de l'image aux moments clés.
- Marges de 4 % (`margeMin`) du petit côté au moins.
- Chaque arrêt est une affiche, la dernière image aussi.
- Un accent, une signification.
- Jamais une couleur sur la même couleur ; texte à 4,5:1 (`contrasteTexte`), grand texte à 3:1 (`contrasteGrandTexte`) ; un fond sombre teinté plutôt que noir pur.
- Les sous-titres ne passent jamais sur le sujet.

## 8. La vérité à l'écran

- Un compteur ne porte pas d'étiquette qui affirme sa valeur tant qu'il défile : unité et date arrivent quand il s'arrête.
- Une période en cours se dit « à date ».
- « Après » plutôt que « grâce à » quand on ne sait que l'ordre des faits.
- Un graphique part de zéro, ou sa base est signalée.
- Pas d'interface, de témoignage ni de fonction inventés ; les logos viennent des fichiers fournis.
- Une action se montre (pointeur, appui, résultat), elle ne s'écrit pas.

## 9. Les erreurs les plus vues

| Erreur | Ce qui l'attrape |
|---|---|
| Sujet trop petit aux moments clés | critique |
| Texte collé au bord | `marge` ; une image : critique |
| Trop sombre, ou couleur sur la même couleur | `contraste`, `contraste-reel` ; une forme : critique |
| Sous-titres sur le sujet | `sous-titre-cache-texte` ; une image : critique |
| Un moment trop rapide pour être compris | `lecture`, `texte-fugace`, `mouvement-rapide` |
| Éléments qui se chevauchent ou sortent de l'image | `chevauchement`, `hors-cadre`, `debordement` |
| Images vides pendant une transition | critique (bandes) |
| Effet qui ne suit plus son élément quand la caméra bouge | critique (bandes) |
| Texte cassé (« NaN », « undefined ») | critique |
| Image agrandie et floue | critique |

## 10. Clichés à éviter

- **Composition** : titre centré sur un dégradé ; repère permanent dans un coin ; « 03/06 » ou barre de progression non demandés ; cartes empilées serrées ; dernière image qui n'est pas une affiche.
- **Mouvement** : tout en fondu ; tout qui entre ensemble sur la même courbe ; rebond dans un registre sérieux ; caméra qui pompe à chaque temps.
- **Aspect** : halos partout ; dégradés arc-en-ciel ; emoji en guise d'illustration ; police par défaut.
- **Contenu** : interface grise factice ; faux texte latin ; action écrite au lieu de montrée ; chiffres inventés.
- **Structure** : ouverture sur un logo qui se dévoile lentement ; une seule vitesse du début à la fin.
- **Son** : un souffle sur chaque coupe ; un son sur chaque mouvement.

## 11. Symptôme → mécanisme → correction

Ce qu'on voit ou mesure sur l'image. Numéros stables : on en ajoute à la fin, on n'en retire pas.

| N° | Symptôme | Mécanisme probable | Correction | Règle |
|---|---|---|---|---|
| 1 | Tout entre, puis rien ne bouge plus de 2,5 s (`tempsMort`) | Entrées groupées au début | Échelonner les `data-start` ; décor qui dérive | `temps-mort` |
| 2 | Un texte reste moins que son temps de lecture | Scène courte, entrée tardive | Allonger `duree`, avancer l'entrée | `lecture`, `texte-fugace` |
| 3 | Plusieurs éléments de même poids | Pas de hiérarchie | Un titre 2,5 fois plus grand ; un accent | critique |
| 4 | Rien de nouveau pendant 8 s | Scène longue sans étape | Une entrée sur un mot dit (`mot:`), ou deux scènes | critique |
| 5 | Texte sous 4,5:1 (`contrasteTexte`) | Couleur de marque sur le fond | `var(--c-primaire-lisible)`, `var(--c-sur-primaire)` | `contraste`, `contraste-reel` |
| 6 | Texte agrandi plus de 1,12 fois sous la caméra | Zoom sur un texte réglé petit | Texte à sa taille finale, zoom plus faible | critique |
| 7 | Clic sans pointeur ni appui visible | Action écrite, pas montrée | `pulse-motion reference cadres-pointeur` | critique |
| 8 | Première image d'une scène vide | Tout entre après la transition | Un élément visible dès `data-start="0"` | critique |
| 9 | Tout bouge sans arrêt | Une boucle par élément | Une boucle au plus | `trop-d-animations` |
| 10 | Tout entre au même instant, même courbe | Entrées recopiées | Décaler de 0,2 à 0,4 s ; enfants 2 à 4 images après | critique |
| 11 | Texte qui déborde ou sort de l'image | Texte trop long | Raccourcir, ou `ajustements` | `debordement`, `hors-cadre` |
| 12 | Deux éléments se recouvrent | Positions sans place réservée | Rangées du style (`.rangee`) | `chevauchement` |
| 13 | Texte qui touche le bord | Marge oubliée | 4 % (`margeMin`) du petit côté | `marge` |
| 14 | Texte illisible sur un téléphone | Taille trop basse | 3,5 cqh (`texteMinCqh`) au moins | `texte-petit` |
| 15 | Mouvement trop rapide à suivre | Long trajet, peu de temps | Plus long, ou moins ample | `mouvement-rapide` |
| 16 | Particules devant un texte qu'on lit | Effet `avant` sur un texte long | Calque arrière, ou après la lecture | `effet-sur-texte` |
| 17 | Logo caché | Élément posé sur son coin | Déplacer l'élément | `logo-masque` |
| 18 | L'image bouge encore à la dernière seconde | Décor qui dérive jusqu'au bout | Décor arrêté 1 s avant la fin ; 0,5 s (`pauseFinale`) d'image stable | `pause-finale` |
| 19 | Zoom avant puis arrière dans une scène | Caméra qui pompe | Un mouvement de caméra par scène | critique |
| 20 | Même mouvement de caméra deux scènes de suite | Caméra recopiée | En changer un, ou le retirer | critique |
| 21 | L'image clignote | Lumière qui change trop vite | Adoucir, ralentir | `flash` |
| 22 | Bruitage sur un mot de la voix | Son mal calé | Le décaler entre deux mots | `son-sous-voix` |
| 23 | Un son sur chaque mouvement | Bruitages partout | 1 à 3 par scène | `trop-de-sons` |
| 24 | Chiffre affiché absent du déroulé | Nombre inventé | Celui de l'intention ou de `faits` | critique |

## 12. Regarder avant de montrer

- `pulse-motion planche . --regard` : ouverture de 0 à 3 s (`accrocheMax`), une image toutes les 0,5 s (`regardPas`) ; une image 0,3 s (`regardDecalage`) après les entrées importantes de chaque scène, 24 (`regardVignettesMax`) au plus ; chaque scène sur un téléphone de 360 px (`telephoneLargeur`) ; des bandes autour des transitions, pour le relecteur.
- Trois passes, une sorte de défaut à la fois : lisibilité (planche téléphone) ; composition et rythme (temps forts) ; ouverture et mouvement (ouverture).
- Corriger avant de montrer ; un tour au plus.

## 13. La relecture indépendante

- **Quand** : `creer`, une fois, dès 3 scènes, après le regard et avant l'aperçu. `retoucher` : refonte (style changé, 3 scènes réécrites ou plus, scène ajoutée ou retirée ; `--scenes` des scènes touchées si elle est partielle) ou demande (« relis la vidéo », « note-la »). Jamais à l'export.
- **Pas deux fois la même version** : `pulse-motion planche . --regard` rend `relecture` ; `aJour` vrai : relire `sortie/regard/critique.json`, ne pas relancer. Après une planche partielle, la refaire d'abord sur toute la vidéo (ou la refonte).
- **Lancer** l'agent `critique` (outil Agent) avec ce seul message : le chemin de `sortie/regard/` et « Relisez cette vidéo. » Modèle passé à l'appel (paramètre `model`) : `sonnet`. Jamais un modèle plus cher que celui de la session : si la session tourne déjà en Sonnet ou en Haiku, aucun paramètre.
- **Huit axes** : `message`, `ouverture`, `lisibilite`, `composition`, `mouvement`, `rythme`, `continuite`, `verite` (grille : `agents/critique.md`). Prête si chaque axe noté vaut 8 (`critiqueBarre`) ou plus, sans défaut à corriger.
- **Un seul tour** : corriger les défauts `a-corriger` et les scènes notées 7 (`critiqueCorrige`) ou moins ; ne jamais toucher une scène notée 9 (`critiqueIntouche`) ou plus. Puis `pulse-motion controler .` et la planche des scènes corrigées, **sans seconde relecture**.
- **La personne l'emporte** sur le relecteur. Pour lui rendre une note : `pulse-motion reference revue`.

## 14. Dire honnêtement

La ligne 🔎 du bloc de fin dit ce qui a été **mesuré**, combien d'images ont été **regardées**, si la vidéo a été **relue** (scène la plus faible, « corrigée, non relue »), que le son est mesuré, **pas écouté**, ce que Claude corrigerait ensuite, et ce qui n'a pas pu être vérifié, avec la raison.

## 15. Genre social

Pour lui seul : la promesse lisible avant 3 s (`accrocheMax`), la première image composée, une nouveauté toutes les 4 s, les sous-titres mot par mot, la zone des boutons (`zone-sure`, selon le format). La sonie reste la même pour tous les usages.
