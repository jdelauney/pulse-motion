# Style « editorial »

> Une page de magazine qui s'anime : titres à empattements démesurés, filets fins qui se tracent, textes qui montent derrière un masque, lentement.
> Sources : Style d'origine Pulse Motion.

## L'essentiel

- Partir d'une des **9 scènes toutes faites** (`pulse-motion scene editorial <type>`) ; le `type` noté au déroulé permet de changer de style sans réécrire la scène.
- Décor (`.ligne`, `.guillemet`, `data-decor`) : `data-dur="scene"`. Sur la **dernière scène**, il s'arrête 1 s avant la fin : image stable d'au moins 0,5 s.
- Formats 16:9, 1:1, 4:5 et 9:16 (en vertical, volets et schéma s'empilent). Ton clair par défaut (fond crème), sombre sur demande.
- Un message par scène ; longueurs maximales du § 10 ; titres courts, en deux lignes au plus.

## 1. Essence, et ce qu'il n'est pas

- La typographie porte tout : titres très grands à empattements, chapeau en italique, filets fins, grandes marges, peu d'éléments ; mouvement lent et sûr.
- Pas `minimal` : empattements et italiques, filets fins plutôt que règles épaisses, plus lent. Pas `clair-pedagogique` : aucune surface teintée, aucun aplat de couleur, titres dans la couleur du texte. Pas un diaporama : chaque scène est composée comme une page.

## 2. Matières et rendu

- HTML et CSS : papier crème uni, filets de 0,25 à 0,5 cqh, aucun aplat ; ni canevas, ni texture, ni module.
- Décor : `.ligne` se trace sur `--l` (0 → 1) toute la scène ; `.guillemet` géant (7 %) dérive sur `--dy`.

## 3. Logique de couleur

- Une couleur vive par scène au plus. Titres et texte dans `--c-texte` ; `--c-primaire` de la charte pour le chapeau, les chiffres et les numéros ; `--c-accent` pour les surtitres, les filets courts et les flèches, toujours en version lisible.
- Jamais d'aplat de couleur, jamais de fond coloré.
- Ton sombre : fond `#16130f`, texte `#efe9df`, chapeau dans la couleur du texte. Palette d'exemple (celle du style) : brun `#7c2d12`, framboise `#9f1239`, papier `#f7f3ec`.

## 4. Typographie et sous-titres

- Polices fournies : **Fraunces** 600, titres (10,5 cqh, moyen 6,6, chiffre 28, numéro 32 en 300) ; **Instrument Sans**, texte (4,4 cqh, interligne 1,5) ; surtitre en capitales très espacées. Une autre police : son fichier dans `assets/`.
- Sous-titres : habillage du moteur ; lisibilité : `controles.md`.

## 5. Qualité du mouvement

- `.masque` : le texte monte de 4 cqh derrière un masque, `expo-out` en 1,1 s ; `.fondu` en `sine-inout` (1 s) ; filets en `expo-out` (1,2 s).
- Lent et rare : 0,3 à 0,6 s entre deux entrées ; rien ne rebondit, rien ne tourne.
- Conseillés : #006, #011, #017, #025. Déconseillés : #001, #007, #028, #036.

## 6. Grammaire de caméra et transitions

| Mouvement | Ce qu'il exprime | Peut servir |
|---|---|---|
| Zoom avant lent (#056) | la gravité, l'attention | un titre, une citation |
| Bascule de mise au point (#061) | passer d'un plan à l'autre | un chiffre, un témoignage |
| Plan fixe | la page qu'on lit | la plupart des scènes |

- Grandes marges toujours libres ; la caméra ne recadre jamais un titre en deux.
- Transitions : `fondu`, `rideau`. À éviter : `coupe`, `zoom`, `glitch`.
- Shaders conseillés, jamais imposés (WebGPU) : `grain` très léger, `vignettage`.

## 7. Palette sonore

- Ambiance `calme` par défaut, `suspense` pour un récit tendu.
- Bruitages : tracé → `souffle` ; les autres entrées sans son propre ; transition : son de la transition (`rideau` → `whoosh`).
- Matière : aucune. Moment fort : `basse`, dans un silence.
- Beaucoup de silence : un son par scène suffit souvent.

## 8. Gestes natifs

- **Filet tracé.** *Recette :* `.filet` ou `.filet.court`, 1,2 s, avant le titre. *Convient à :* une ouverture de chapitre ; une séparation entre deux idées ; une citation.
- **Titre sous masque.** *Recette :* `.masque` (#006) sur le titre puis le chapeau. *Convient à :* un titre ; une phrase de témoignage ; un chiffre géant.
- **Grand guillemet.** *Recette :* `.guillemet` en décor, `--dy` toute la scène. *Convient à :* une citation ; un témoignage ; une parole de dirigeant.

## 9. Pièges

- Titre de plus de deux lignes : le couper ou passer en `.titre-moyen`.
- Mouvement trop vif : garder les durées du style (1 à 1,2 s).
- Export : ni `mix-blend-mode`, ni filtre SVG, ni `transition` CSS ; les numéros du sommaire sont écrits en clair (pas de `counter()`).

## 10. Scènes toutes faites et classes

| Scène | Rôle | Durée | Textes (longueur maximale) |
|---|---|---|---|
| `titre` | Ouvrir la vidéo ou un chapitre | 7 s | etiquette 25, titre 40, sous 50 |
| `liste` | 2 à 4 points, en sommaire | 12 s | titre 40, point1 … point4 45 |
| `chiffre` | Un chiffre en très grand | 7 s | titre 40, unite 3, legende 60 ; `nombre 0→…` |
| `comparaison` | Deux volets et un filet | 12 s | titre 40, gauche-titre et droite-titre 20, gauche-texte et droite-texte 60 |
| `etape` | Une étape, numéro à empattements | 8 s | numero 2, titre 40, texte 80 |
| `alerte` | Un point de vigilance entre deux filets | 8 s | titre 40, texte 80 |
| `schema` | Trois temps, flèches fines | 8 s | titre 40, a, b, c 25 |
| `moyeu` | Centre et parties | 10 s | titre 40, centre 24, parties 22 |
| `conclusion` | Le message et le logo | 6 s | titre 40, sous 50 |

Point ou logo absent : retirer son élément et sa clé.
- Texte : `.surtitre`, `.titre`, `.titre-moyen`, `.chapo`, `.texte`, `.chiffre-geant` ; `.centre`.
- Entrées : `.masque`, `.fondu` ; `.filet`, `.filet.court`, `.filet.accent` se tracent. Décor : `.decor` + `.ligne`, `.guillemet`.
- Scènes : `.sommaire` ; `.duo`, `.volet`, `.volet-titre` ; `.etape`, `.numeral`, `.etape-texte` ; `.encadre` ; `.chaine`, `.maillon`, `.lien` ; `.logo`.

Scène composée : ces classes et `<style>@scope { … }</style>`.

## 11. Espace de variation

- Claude décide pour chaque vidéo : la place des filets et du guillemet, la scène qui porte le moment fort, le ton (crème ou sombre), l'ambiance (§ 7).
- Structures : situation → tension → résolution ; portrait → chiffre → citation ; trois chapitres numérotés.
- Ouvertures : un surtitre et un titre seul ; une citation ; un chiffre géant.
- Fins : la phrase qui reste et le logo ; une question ouverte ; le chapitre suivant annoncé.
- Usages : raconter un récit, un témoignage ; porter un message institutionnel ; former en prenant son temps.
