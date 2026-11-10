# Style personnel guidé

## L'essentiel

- **Deux départs**, dits en une question : adapter un style (une base, celle dont le § 1 de la fiche est le plus proche de la description ; un second style peut prêter des gestes, `--emprunts`) ou partir d'une page blanche (Claude choisit la base technique la plus proche et le dit en une ligne). Dans les deux cas, `style nouveau --depuis <base>`.
- **Trois groupes de réglages**, montrés avec les exemples de la fiche de la base (`pulse-motion reference styles/<base>`, lue entière), en mots simples.
- **5 changements au plus par tour.** Un changement imposé par la charte (une police de marque) ne compte pas. Avant d'écrire : un résumé avant / après / ce que ça coûte, puis l'accord.
- Chaque changement accepté se note (`pulse-motion style noter`) et s'écrit dans sa section de `guide.md`. `style verifier` avertit au-delà de 5 changements dans un tour.
- À chaque tour, la planche avec la base : `pulse-motion style planche <nom> --avec-base --ouvrir`, la base à gauche, le style à droite, mêmes textes (« la chaîne du froid »).
- `guide.md` est la fiche de la base, entière, avec la ligne « Adapté du style « <base> » » sous le titre ; il garde les 11 sections de la fiche.
- Souhait flou (« plus premium », « plus calme », « comme notre marque ») : `pulse-motion reference remarques`, jamais appliqué en silence.

## Les trois groupes

| Groupe | Sections de la fiche | À dire à la personne |
|---|---|---|
| Sans risque | § 3 (couleurs, dans la logique du style), § 4 (polices), § 5 (rythme, quantité de mouvement), § 7 (son), § 8 (ajouter ou échanger **un** geste) | le style reste lui-même ; donner 2 ou 3 idées pour chacun, tirées de la fiche de la base |
| Change son caractère | § 2 (matières et rendu), la logique de couleur elle-même (§ 3), § 6 (caméra et transitions) | possible ; dire ce que le style y perd (« sans les ronds qui dérivent, il devient plus sec ») |
| Impossible | § 1 (essence) et les modules de rendu du style (§ 2, `modules` de `identite.json`) | ce serait un autre style : proposer une base plus proche (`pulse-motion styles chercher <mots>`) |

## Un tour de changements

1. La personne dit ce qu'elle veut ; les souhaits se rangent dans les trois groupes. Plus de 5 : garder les 5 qui comptent le plus, dire que les autres viendront au tour suivant.
2. Le résumé, une ligne par changement, avant l'accord : « § 4 · titres en Fraunces → en Bricolage Grotesque · le style devient plus rond, moins éditorial ». Un changement du groupe « change son caractère » dit ce qu'il coûte ; un changement impossible n'est pas proposé.
3. Accord : « C'est d'accord (Recommandé) » · « Je veux changer quelque chose ».
4. Écrire les changements (`style.css`, scènes, `identite.json`, `guide.md`), noter chacun : `pulse-motion style noter <nom> <section> "<avant>" "<après>" "<pourquoi>"`. Le premier d'un tour : `--nouveau-tour` ; imposé par la charte : `--charte`.
5. Montrer la planche avec la base, regarder soi-même les images (`Read`), puis demander si on passe au tour suivant.

## Base modifiée

Après une mise à jour de Pulse Motion, la base d'un style personnel peut avoir changé (fiche, CSS, scènes). `pulse-motion styles` (et `--genre`) rend alors `baseModifiee: true` et `base` pour ce style, **une seule fois** : la marque `.base-signalee.json` est posée aussitôt.

- `creer` : le dire en une phrase (« Le style « <base> », dont votre style « <nom> » est parti, a été amélioré. ») et proposer d'en reprendre les corrections plus tard, avec `/pulse-motion:style`. Rien ne change sans accord.
- `style` : proposer « Voir ce qui a changé (Recommandé) » (planche avec la base) · « Reprendre ses corrections » · « Garder mon style tel quel ». Pour reprendre : comparer la fiche de la base et `guide.md`, proposer les corrections (5 au plus par tour, accord), puis `pulse-motion style base <nom> --a-jour` (la nouvelle version de la base est notée) et `pulse-motion style verifier <nom>`.

Source : lemo-opuscar, `MY-STYLES.md` § 1 à § 4 (MIT, © 2026 LemoLab), idées et tableau traduits et adaptés.
