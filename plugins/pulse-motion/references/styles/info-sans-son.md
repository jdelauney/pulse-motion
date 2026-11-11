# Style « info-sans-son »

> L'info qui se lit son coupé : légende géante en morceaux, un mot-clé sur l'accent, chiffres qui roulent avec leur source.
> Sources : lemo-opuscar, style `caption-news` (MIT, © 2026 LemoLab), traduit et adapté.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene info-sans-son <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.lignes-compte`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16. Ton sombre seulement.
- Une idée par légende ; longueurs maximales du § 10.

## 1. Essence, et ce qu'il n'est pas

- La légende est le personnage principal : grosse, condensée, elle arrive en 2 ou 3 morceaux ; un seul mot-clé par légende sur un bloc d'accent ; chaque chiffre roule à chasse fixe et porte sa source ; feuille « livre de comptes » ou photo de la personne assombrie.
- Pas `energique` : rien ne tombe ni ne rebondit, ça claque sur place. Pas un journal télévisé : ni bandeau permanent, ni présentateur. Pas `tech-sombre` : aucun texte tapé.

## 2. Matières et rendu

- HTML et CSS. Fond : `.lignes-compte` (lignes à 4,5 % tous les 5 cqh) et `.marges` (double marge rouge), ou `.fond-photo` (image de `assets/` sous un dégradé) ; `.surligneur` (accent à 35 %, `--p`) sur un document.
- `data-morceaux="2"` ou `"3"` coupe le texte aux mots ; `data-mot-cle="auto"` (le plus long) ou le mot voulu pose le bloc. Aucune syntaxe dans le déroulé.

## 3. Logique de couleur

- Texte ivoire sur fond sombre neutre ; `--c-accent` de la charte pour le bloc du mot-clé, le chiffre arrivé (`.vire`) et les gains (`.gain`) ; `--c-primaire` pour le filet et l'étiquette de source (`.source`).
- Pertes : un rouge fixe, toujours avec le signe « − » (`.perte`) : jamais la couleur seule.
- Rien d'autre n'est coloré. Palette d'exemple (celle du style) : jaune `#facc15`, ciel `#7dd3fc`, nuit `#121418`.

## 4. Typographie et sous-titres

- **Barlow Condensed** 800 : légendes (10 cqh, moyenne 7), chiffres (26 cqh, `tabular-nums`) ; **Barlow** 500 et 700 : texte (4 cqh), étiquettes.
- Sous-titres du moteur ; deux lignes de légende au plus.

## 5. Qualité du mouvement

- Morceaux à 0,12 s d'écart, de l'échelle 1,3 à 1 en 0,13 s, opaques en 0,04 s ; bloc balayé en 0,12 s ; `.balaie` (0,3 s), `.claque`.
- Chiffres qui roulent (#021), puis à l'accent ; coupes sur les temps.
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

- **La légende qui claque.** *Recette :* `.legende` et `data-morceaux="3"`. *Convient à :* une accroche ; un fait ; une citation.
- **Le mot-clé surligné.** *Recette :* `data-mot-cle="<mot>"`, un seul par légende. *Convient à :* un chiffre ; le mot qui change tout ; un lieu.
- **Le chiffre qui roule.** *Recette :* `nombre 0→…` (#021) sur `.vire`, puis `.source`. *Convient à :* un résultat ; une hausse ; un bilan.
- **L'arrêt sur image commenté.** *Recette :* `data-gel` (#067), `.eclair`, `.crochets`. *Convient à :* un geste à imiter ; une erreur ; une photo de terrain.
- **L'écran partagé.** *Recette :* scène `comparaison`, `.moitie.terne`. *Convient à :* avant et après ; deux offres ; le bon geste.

## 9. Pièges

- Légende sur trois lignes : en faire deux ; photo claire : garder le dégradé de `.fond-photo`.
- Un `.eclair` par scène au plus (flashs) ; chiffres en `tabular-nums` ; un seul mot-clé par légende.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir, légende géante | 6 s | etiquette 24, titre 34, sous 44 |
| `liste` | 2 à 4 légendes | 10 s | titre 34, point1 … point4 36 |
| `chiffre` | Un chiffre qui roule, sa source | 7 s | titre 34, unite 3, legende 50 ; `nombre 0→…` |
| `comparaison` | Écran partagé avant / après | 10 s | titre 34, gauche-titre et droite-titre 16, gauche-texte et droite-texte 50 |
| `etape` | Une étape, numéro sur l'accent | 7 s | numero 2, titre 34, texte 70 |
| `alerte` | Avertissement entre crochets | 7 s | titre 34, texte 70 |
| `schema` | Trois tuiles reliées | 8 s | titre 34, a, b, c 20 |
| `moyeu` | Centre et parties | 10 s | titre 34, centre 20, parties 18 |
| `conclusion` | La légende à retenir, le logo | 6 s | titre 34, sous 44 |

Point ou logo absent : retirer son élément et sa clé.
- Classes : `.legende`, `.legende-moyenne`, `.texte`, `.source`, `.nombre`, `.unite`, `.vire`, `.gain`, `.perte`, `.claque`, `.balaie`, `.points`, `.ecran-partage`, `.moitie` (`.terne`), `.moitie-titre`, `.separateur`, `.numero-bloc`, `.crochets`, `.chaine-tuiles`, `.tuile`.
- Décor : `.decor`, `.eclair` et ceux du § 2.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : le nombre de morceaux, le mot-clé de chaque légende, la feuille ou la photo, les chiffres qui roulent.
- Structures : fait → chiffre → conséquence ; avant → après → ce qui change ; trois légendes, un chiffre, un appel.
- Ouvertures : la légende-choc ; le chiffre seul ; une photo arrêtée et commentée.
- Fins : la légende à retenir ; le chiffre et sa source ; le logo sur la feuille.
- Usages : publier une info sur les réseaux ; annoncer en interne ; faire parler un chiffre clé.
