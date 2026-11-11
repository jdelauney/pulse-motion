# Style « info-sans-son »

> L'info qui se lit son coupé : une légende géante qui claque en deux ou trois morceaux, un seul mot-clé sur un bloc d'accent, des chiffres qui roulent avec leur source, sur une feuille sombre à lignes.
> Sources : lemo-opuscar, style `caption-news` (MIT, © 2026 LemoLab), traduit et adapté.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene info-sans-son <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.lignes-compte`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16 ; en 9:16 la légende descend vers le bas, c'est une autre mise en page. Ton sombre seulement.
- Une idée par légende, lisible sans le son ; longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- La légende est le personnage principal : grosse, condensée, elle arrive en 2 ou 3 morceaux ; un seul mot-clé par légende sur un bloc d'accent ; chaque chiffre roule à chasse fixe et porte sa source ; feuille « livre de comptes » ou photo de la personne assombrie.
- Pas `energique` : rien ne tombe ni ne rebondit, ça claque sur place. Pas un journal télévisé : ni bandeau permanent, ni présentateur. Pas `tech-sombre` : aucun texte tapé.

## 2. Matières et rendu

- HTML et CSS. Fond : `.lignes-compte` (lignes à 4,5 % tous les 5 cqh, qui montent d'une ligne par scène) et `.marges` (double marge rouge), ou `.fond-photo` (image de `assets/` sous un dégradé, jamais `backdrop-filter`).
- Moteur : `data-morceaux="2"` ou `"3"` coupe le texte injecté aux limites de mots ; `data-mot-cle="auto"` (le mot le plus long) ou le mot voulu pose le bloc. Aucune syntaxe dans les textes du déroulé.

## 3. Logique de couleur

- Texte ivoire sur fond sombre neutre ; `--c-accent` de la charte pour le bloc du mot-clé, le chiffre arrivé (`.vire`) et les gains (`.gain`) ; `--c-primaire` pour le filet et l'étiquette de source (`.source`).
- Pertes : un rouge fixe, toujours avec le signe « − » (`.perte`) : jamais la couleur seule.
- Rien d'autre n'est coloré. Palette d'exemple (celle du style) : jaune `#facc15`, ciel `#7dd3fc`, nuit `#121418`.

## 4. Typographie et sous-titres

- Polices fournies : **Barlow Condensed** 800, légendes (10 cqh, moyenne 7) et chiffres (26 cqh, `tabular-nums`) ; **Barlow** 500 et 700, texte (4 cqh) et étiquettes en capitales.
- Sous-titres : habillage du moteur, sous la légende ; une légende sur deux lignes au plus. Lisibilité : `controles.md`.

## 5. Qualité du mouvement

- Chaque morceau arrive 0,12 s après le précédent, de l'échelle 1,3 à 1 en 0,13 s avec un léger dépassement, opaque en 0,04 s ; le bloc se balaie de gauche à droite en 0,12 s.
- Les chiffres roulent (#021) puis prennent l'accent ; coupes sur les temps ; `.balaie` (0,3 s) pour une étiquette, `.claque` pour un bloc.
- Conseillés : #021, #067, #037. Déconseillés : #015, #028, #001.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Arrêt sur image (#067) | regarder ce point-là | une photo commentée, un geste |
| Zoom sur un détail (#037) | insister | un chiffre, un mot d'un document |
| Zoom avant lent (#056) | entrer dans la photo | un fond `.fond-photo` |
| Plan fixe | lire | la plupart des scènes |

- La légende ne bouge jamais avec la caméra ; elle reste dans les marges du format.
- Transitions : `coupe`, `glissement`. À éviter : `retournement`, `cercle`, `rideau`.

## 7. Palette sonore

- Ambiance `entrainant` par défaut, `tech` en alternative ; la vidéo doit marcher sans le son.
- Bruitages : texte → `tic` ; chiffre → `tic` ; transition → `clic` ; les autres entrées sans son propre.
- Matière : aucune. Moment fort : `basse`.
- Un son sec par légende au plus ; silence sous la voix.

## 8. Gestes natifs

- **La légende qui claque.** *Recette :* `.legende` avec `data-morceaux="3"` (`data-pas` pour l'écart). *Convient à :* une accroche ; un fait ; une citation courte.
- **Le mot-clé surligné.** Un mot sur le bloc d'accent. *Recette :* `data-mot-cle="<mot>"` sur la légende, un seul. *Convient à :* le chiffre d'une phrase ; le mot qui change tout ; un nom de lieu.
- **Le chiffre qui roule.** Il prend l'accent à l'arrivée, sa source dessous. *Recette :* `nombre 0→…` (#021) sur `.vire`, puis `.source`. *Convient à :* un résultat ; une hausse ; un bilan.
- **L'arrêt sur image commenté.** *Recette :* `data-gel` (#067), `.eclair` (0,14 s), zoom de 1 à 1,12, `.crochets`. *Convient à :* un geste à imiter ; une erreur à repérer ; une photo de terrain.
- **L'écran partagé.** Le séparateur tombe d'abord, la mauvaise moitié s'éteint. *Recette :* scène `comparaison`, `.separateur`, `.moitie.terne`. *Convient à :* avant et après ; deux offres ; le bon et le mauvais geste.
- **Le document surligné.** *Recette :* image dans `.fond-photo`, `.surligneur` (accent à 35 %, `--p` en 0,3 à 0,5 s). *Convient à :* une clause ; une ligne de facture ; un extrait de rapport.

## 9. Pièges

- Une légende sur trois lignes : en faire deux légendes.
- Texte sur une photo claire : garder le dégradé de `.fond-photo` ; le contrôle mesure le contraste.
- Éclairs répétés : un `.eclair` par scène au plus (contrôle des flashs).
- Chiffres qui tremblent : toujours `tabular-nums` (déjà dans `.nombre`).
- Plus d'un mot-clé par légende : le moteur le refuse.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir sur la légende géante | 6 s | etiquette 24, titre 34, sous 44 |
| `liste` | 2 à 4 légendes, une par point | 10 s | titre 34, point1 … point4 36 |
| `chiffre` | Un chiffre qui roule, sa source | 7 s | titre 34, unite 3, legende 50 ; `nombre 0→…` |
| `comparaison` | Écran partagé avant / après | 10 s | titre 34, gauche-titre et droite-titre 16, gauche-texte et droite-texte 50 |
| `etape` | Une étape, numéro sur l'accent | 7 s | numero 2, titre 34, texte 70 |
| `alerte` | Un avertissement entre crochets | 7 s | titre 34, texte 70 |
| `schema` | Trois tuiles reliées | 8 s | titre 34, a, b, c 20 |
| `moyeu` | Centre et parties | 10 s | titre 34, centre 20, parties 18 |
| `conclusion` | La légende à retenir et le logo | 6 s | titre 34, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.legende`, `.legende-moyenne`, `.texte`, `.source`, `.nombre`, `.unite`, `.vire`, `.gain`, `.perte`.
- Entrées : `.claque`, `.balaie` ; `data-morceaux`, `data-mot-cle`. Décor : `.decor` + `.lignes-compte`, `.marges`, `.fond-photo`, `.eclair`, `.surligneur`.
- Scènes : `.points` ; `.ecran-partage`, `.moitie` (`.terne`), `.moitie-titre`, `.separateur` ; `.etape`, `.numero-bloc` ; `.crochets` ; `.chaine-tuiles`, `.tuile`, `.connecteur` ; `.logo`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : le nombre de morceaux, le mot-clé de chaque légende, la feuille ou la photo, les chiffres qui roulent.
- Structures : fait → chiffre → conséquence ; avant → après → ce qui change ; trois légendes, un chiffre, un appel.
- Ouvertures : la légende-choc ; le chiffre seul ; une photo arrêtée et commentée.
- Fins : la légende à retenir ; le chiffre et sa source ; le logo sur la feuille.
- Usages : publier une info sur les réseaux ; annoncer en interne ; faire parler un chiffre clé.
