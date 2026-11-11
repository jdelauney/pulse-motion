# Style « energique »

> Une affiche qui crie : aplats pleins, titres géants en capitales qui tombent et rebondissent, bandes qui défilent, tout est court.
> Sources : Style d'origine Pulse Motion.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene energique <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.bandes`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16 (pensé aussi pour le vertical). Ton clair par défaut (fond jaune), sombre sur demande (fond noir, aplats à l'accent).
- Textes plus courts qu'ailleurs (titre 28 caractères) : longueurs du § 10 ; une idée par écran.

## 1. Essence, et ce qu'il n'est pas

- Fond de couleur vive ; aplats noirs ou d'accent légèrement penchés ; capitales étroites géantes ; entrées de 0,45 à 0,7 s ; bandes obliques qui défilent en continu.
- Pas `minimal` : la couleur partout, des angles penchés, du rebond. Pas `chaleureux` : aucune douceur, aucune forme ronde. Pas un style de formation longue : il fatigue au-delà d'une minute.

## 2. Matières et rendu

- HTML et CSS : aplats pleins, rotations de 1 à 6°, bandes en dégradé répété, bande de chantier ; ni canevas, ni texture, ni module.
- `.bandes` défile sur `--x` en linéaire, toute la scène.

## 3. Logique de couleur

- Trois couleurs au plus : le fond (jaune par défaut) ; `--c-primaire` de la charte en aplats et bandeaux ; `--c-accent` pour les chiffres, pastilles, chevrons et la carte pleine.
- Texte sur aplat : `--c-sur-primaire` ou `--c-sur-accent` ; en couleur de marque : la version lisible, jamais `--c-accent` brut.
- Ton sombre : fond `#0a0a0a`, texte `#fafafa`, aplats à l'accent. Palette d'exemple (celle du style) : noir `#0a0a0a`, framboise `#9f1239`, jaune `#facc15`.

## 4. Typographie et sous-titres

- Polices fournies : **Anton**, capitales étroites (cri 14 cqh, moyen 9, chiffre 32) ; **Archivo** gras, texte (4,6 cqh) et bandeaux en capitales. Une autre police : son fichier dans `assets/`.
- Sous-titres : habillage du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- `.tombe` : chute de 26 cqh en `bounce-out` (0,7 s) ; `.claque` : de 150 % à 100 % en `back-out` (0,45 s) ; `.volet` : ouverture de gauche en `expo-out` (0,45 s).
- Enchaînement serré : 0,1 à 0,4 s entre deux entrées ; le décor ne s'arrête jamais avant la fin.
- Conseillés : #007, #009, #014, #032, #036. Déconseillés : #005, #017, #026.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Secousse d'impact (#036) | le choc | un chiffre, un mot qui tombe |
| Zoom sur un détail (#037) | l'insistance | un prix, une date |
| Plan incliné (#060) | le déséquilibre, l'élan | un titre, une annonce |
| Plan fixe | l'affiche | la plupart des scènes |

- Cadrage plein : le titre occupe la largeur ; la caméra reste brève (0,3 à 1 s).
- Transitions : `coupe`, `balayage`, `zoom`. À éviter : `fondu`, `rideau`.

## 7. Palette sonore

- Ambiance `entrainant`.
- Bruitages : titre → `impact` ; point → `clic` ; les autres entrées sans son propre ; transition : son de la transition (`balayage` → `swoosh-inverse`, `zoom` → `montee`, `coupe` → `impact`).
- Matière : aucune. Moment fort : `impact`.
- Sons forts jamais pendant un mot de la voix : les placer dans les pauses.

## 8. Gestes natifs

- **Titre qui tombe.** *Recette :* `.cri.tombe` après le bandeau ; #036 à l'atterrissage. *Convient à :* une annonce ; un slogan ; un prix.
- **Pile penchée.** Les points tombent un à un, inclinés. *Recette :* `.pile` et `.tombe`, 0,4 s d'écart. *Convient à :* des avantages ; trois raisons ; un programme.
- **Bande de chantier.** *Recette :* `.danger` (bande hachurée en haut) et `.claque`. *Convient à :* une interdiction ; une date limite ; un piège à éviter.

## 9. Pièges

- Texte trop long : il passe sur deux lignes et perd sa force ; réécrire en trois mots.
- Plus de trois couleurs, ou une marque claire en texte : passer par les variables lisibles.
- Rebond partout : un seul `.tombe` à la fois, le reste en `.claque`.
- Export : ni `mix-blend-mode`, ni filtre SVG, ni `transition` CSS.

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir fort | 6 s | etiquette 20, titre 28, sous 40 |
| `liste` | 2 à 4 points qui tombent | 10 s | titre 28, point1 … point4 32 |
| `chiffre` | Un chiffre choc | 6 s | titre 28, unite 3, legende 45 ; `nombre 0→…` |
| `comparaison` | Avant / après en face à face | 10 s | titre 28, gauche-titre et droite-titre 16, gauche-texte et droite-texte 50 |
| `etape` | Une étape, pastille | 7 s | numero 2, titre 28, texte 70 |
| `alerte` | Bande de chantier | 7 s | titre 28, texte 70 |
| `schema` | Trois blocs enchaînés | 7 s | titre 28, a, b, c 20 |
| `moyeu` | Centre et parties | 10 s | titre 28, centre 20, parties 16 |
| `conclusion` | L'appel à l'action et le logo | 5 s | titre 28, sous 40 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.cri`, `.cri-moyen`, `.texte`, `.bandeau`, `.chiffre-choc` ; `.centre`.
- Entrées : `.tombe`, `.claque`, `.volet`. Décor : `.decor` + `.bandes` (`--x`).
- Scènes : `.pile` ; `.face-a-face`, `.carte.creuse`, `.carte.pleine`, `.carte-titre` ; `.etape`, `.pastille` ; `.danger` ; `.enchainement`, `.maillon`, `.chevron` ; `.logo`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : le mot qui tombe, l'inclinaison des aplats, la vitesse des bandes, le ton (jaune ou noir), l'ambiance.
- Structures : accroche → trois raisons → appel ; problème → solution → prix ; compte à rebours → révélation → date.
- Ouvertures : un mot géant qui tombe ; un chiffre choc ; une question en capitales.
- Fins : l'appel à l'action et le logo ; la date et le lieu ; le slogan seul.
- Usages : annoncer un lancement ; publier sur les réseaux ; lancer une promotion.
