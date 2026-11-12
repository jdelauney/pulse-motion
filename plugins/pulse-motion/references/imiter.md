# Imiter une animation

La personne montre une animation qu'elle aime (« fais pareil que ce GIF », « une vidéo qui bouge comme cette pub ») : on en mesure le rythme, les mouvements, les courbes, les couleurs et la « main », puis on écrit une scène à elle qui bouge de la même façon. C'est une branche de `retoucher` (une scène existante) et de `creer` (au départ) : aucune compétence à part.

## L'essentiel

- **On imite une manière, jamais une œuvre.** On reprend le rythme, l'ordre et les courbes des mouvements ; jamais un personnage, une mascotte, un logo, une marque, une musique, un texte ou une image de la référence.
- **La référence sert seulement à mesurer** : elle est copiée dans `assets/references/` et n'entre jamais dans la vidéo (règle `reference-embarquee` de l'assemblage).
- **Rien n'est téléchargé, aucun site n'est lu.** Une adresse internet est refusée ; l'animation d'un site se filme d'abord, avec l'accord de la personne (`/pulse-motion:filmer`), puis sa prise s'imite.
- **Mesurer, pas deviner** : chaque chiffre de la fiche dit sa source (fenêtre, suivi, planche).
- **Regarder toutes les planches** de la référence avec `Read`, et la planche de comparaison à la fin.

## 1. Cadrer

Dans la première réponse, une seule fois :

- **Le fichier** : GIF, WebP ou PNG animés, MP4, WebM, MOV ; ou une prise filmée (`films/<nom>`). La personne le dépose dans le dossier de la vidéo ; on ne le cherche jamais en ligne. Un fichier Lottie ne se lit pas encore : demander un GIF ou un MP4.
- **Le passage** : début et fin dans la référence ; 10 s au plus (au-delà, demander le passage).
- **La cible** : quelle scène, quel élément.
- **Le niveau de fidélité**, déduit des mots par `pulse-motion imiter niveau "<la phrase de la personne>"`, et annoncé avec la phrase qu'il rend (`annonce`) :

| Niveau | Phrases | Doit concorder | Peut différer |
|---|---|---|---|
| dans l'esprit (défaut) | « dans l'esprit de », « inspire-toi de », « ce genre de rythme » | rythme global, familles de mouvements, ordre, sens | minutage exact, couleurs, formes, textes |
| même mouvement | « fais pareil », « exactement le même mouvement », « même timing » | début, durée et décalage de chaque étape à 0,08 s près, famille de courbe, sens et ampleur relative | textes, couleurs, polices, images |
| au pixel | « identique », « copie exacte » | **refusé** | — |

Refus, dits tels quels (`refus` de la commande) :
- au pixel, ou les textes et les images de la référence : « Je reprends le mouvement et le rythme, pas l'image : les dessins, le logo et les textes de cette vidéo appartiennent à leur auteur. »
- un personnage, une mascotte : « Je ne peux pas recopier ce personnage : il appartient à sa marque. Je peux en créer un original qui bouge de la même façon. »
- un logo, une marque : « Je ne peux pas recopier ce logo ni cette marque : ils appartiennent à leur propriétaire. Je reprends le mouvement avec votre logo à vous. »
- la musique : « Je ne reprends pas la musique de cette vidéo : elle appartient à son auteur. Je peux en composer une au même tempo. »
- une adresse internet : « Je ne télécharge pas de vidéo : enregistrez-la dans le dossier de la vidéo, si vous en avez le droit. »

## 2. Mesurer

`pulse-motion imiter analyser <fichier> [--de <s> --a <s>] [--zone x,y,l,h] [--couleurs #hex,…] [--niveau esprit|mouvement] .` (une prise : `pulse-motion imiter analyser films/<nom> [--etape <n>] .`). Chrome sans fenêtre, sans ffmpeg ; 600 images au plus. Tout va dans `sortie/imiter/<nom>/` :

| Fichier | Ce qu'il dit |
|---|---|
| `planche-NN.png` | 24 images par planche, 6 colonnes, « #i  t s », à la cadence d'origine : **toutes à lire** (`jetonsEstimes` dit leur coût) |
| `activite.json`, `activite.png` | l'écart moyen de chaque image avec la précédente (image réduite à 160 px de large, flou de rayon 1) |
| `fenetres.json` | les mouvements (première et dernière image qui change de plus de 0,5 %, prolongés tant que l'image change encore ; leur pic), les coupes (plus de 25 % sur une seule image), les tenues (0,5 s ou plus sans changement) ; `parActivite` : la courbe par la règle du tiers |
| `suivi.json` | avec `--couleurs` (et `--zone`, en % de l'image) : les bords du sujet à chaque image (un point à moins de 40 d'une des couleurs, dans une suite de 6 points au moins), sa trajectoire, la courbe ajustée, et les petits mouvements de vie |
| `couleurs.json` | la palette (6 couleurs au plus), le fond, l'encre la plus sombre, les accents, leur part, la clé de valeur (claire, moyenne, sombre), le contraste, une proposition de charte |
| `main.json` | le trait (présence, épaisseur, régularité), les bords (nets, doux), le grain, la trame ; une phrase (« trait fin et régulier, bords nets, aplats sans grain ») ; `styles` : les trois styles du catalogue les plus proches, avec leurs raisons |
| `fiche.md` | le squelette de la fiche (§ 4), à compléter |

`alertes` : rien ne bouge, sujet non suivi, passage tronqué. Le sujet se repère sur une planche : sa zone (en %) et ses deux ou trois couleurs, puis on relance avec `--zone` et `--couleurs`.

## 3. Courbes

- **Avec le suivi** : la trajectoire est comparée aux courbes du moteur (`linear`, puis `quad` à `expo`, `sine`, `circle`, `back`, `elastic`, `bounce`, en `in`, `out` et `inout`) ; la durée est libre, de 1 à 2 fois la durée visible, par pas de 0,05 s (le début d'un `in` et la fin d'un `out` se voient mal). Le résultat donne le début, la durée, le dépassement en % et un verdict : « bon », « approché » ou « mauvais ».
- **Dépassement de plus de 2 %** : la famille `back` (un seul dépassement ; `css` donne le `cubic-bezier` au même dépassement, à poser dans `--pm-courbe`), ou `elastic` s'il oscille (`ressort` : la courbe `ressort` du moteur, `pulse-motion reference mouvement-vivant`).
- **Sans suivi** (règle du tiers, sur l'activité cumulée) : plus de la moitié du chemin au premier tiers du temps donne `out` ; moins du quart, `in` ; symétrique, `inout` ; des marches régulières, `linear`. La courbe proposée est celle du mouvement vivant : `quint-out` pour arriver, `quart-inout` pour se déplacer, `circle-in` pour partir.
- **Vie** : pendant une tenue, une variation de 1 à 5 % de la taille ou de la place du sujet est un mouvement de vie ; `vie` donne son ampleur, sa période et une boucle du dictionnaire à essayer (#077 pour la taille, #072 pour la hauteur, sinon #069), réglée avec les chiffres mesurés.

## 4. Fiche

Claude complète `sortie/imiter/<nom>/fiche.md` : une ligne par élément et par propriété.

| Élément | Propriété | Déclencheur | Début | Durée | Décalage | De → à | Courbe | Source |
|---|---|---|---|---|---|---|---|---|
| titre | y | entrée de la scène | 1,00 s | 0,50 s | — | 12 → 0 % | quint-out | fenêtre 1, suivi, planche 1 |
| trois cartes | opacité, y | après le titre | 1,40 s | 0,45 s | 0,08 s | 0 → 1 | quart-out (out) | fenêtres 2 à 4, règle du tiers, planche 2 |

Chaque chiffre dit sa source. Aucun « ? » ne reste : `pulse-motion imiter fiche <nom> .` le vérifie.

## 5. Traduire

- **Les mouvements** : chaque ligne devient une entrée du dictionnaire (`pulse-motion mouvements chercher <mot>`, puis `pulse-motion mouvements afficher <n°>`), avec `data-start` pour le début et `data-pas` pour le décalage d'une cascade (« #002 fondu montant, 0,45 s, cascade de 0,08 s »). Au niveau « même mouvement », les durées et la courbe de la fiche ; « dans l'esprit », les courbes du mouvement vivant de la même famille.
- **Les couleurs** : une proposition de charte (`proposition`), appliquée seulement si la personne l'accepte, dans `charte/charte.json` ; le contrôle vérifie ensuite qu'elles sont lisibles.
- **La main** : le style du catalogue le plus proche (`styles` de `main.json`) ; sinon un style personnel au format des styles personnels (`pulse-motion style nouveau <nom> --depuis <style proche> --emprunts <second>`, puis `pulse-motion reference style-personnel`), la phrase de la main notée dans le guide. Emprunter la main, jamais l'image.

## 6. Construire

L'agent `animateur` écrit la scène avec la fiche (son contenu, pas la référence) ; puis `pulse-motion controler .` et les planches de regard (`pulse-motion planche . --regard --scenes <id>`), comme toute scène. Les personnages, les logos et les textes sont ceux de la personne : un personnage se crée (`dessiner-personnage`) pour bouger de la même façon, sans ressembler à celui de la référence.

## 7. Vérifier

`pulse-motion imiter comparer <nom> --scene <id> .` rend la scène à la cadence de la référence, aligne les deux courbes d'activité (15 images au plus de décalage, sur les 10 premières secondes) et donne, pour chaque mouvement, l'écart de début, de fin et de pic, plus une planche « référence | notre scène » à regarder.

- Au niveau « même mouvement », chaque écart doit être de 0,08 s au plus (`conforme`).
- Deux tours de correction au plus ; ce qui reste se dit en chiffres, avec `phrases` (« Le deuxième mouvement finit 0,1 s plus tard que dans votre vidéo. »).
- Un décalage de toute la scène se dit à part : c'est normal si la scène commence par une transition.

## 8. Interdits

- Embarquer la référence, ou une image tirée d'elle : erreur `reference-embarquee` (« La vidéo de référence ne doit pas entrer dans la vidéo : elle sert seulement à mesurer. »).
- Redessiner un personnage, un logo, une mascotte ou une marque reconnaissable de la référence ; en reprendre les textes, la musique ou les images.
- Télécharger une vidéo, lire une adresse internet, ou filmer un site sans l'accord de la personne.
- Une copie « au pixel ».

Sources : reanimate (MIT, © 2026 Niaz Morshed) pour la courbe d'activité, l'alignement, la table des courbes, la règle du tiers, les niveaux de fidélité et la fiche avec sa colonne « source » ; rossark-motion-skill (MIT, © 2026 rossark0) pour le suivi des bords et les planches étiquetées ; take-one pour l'idée d'apprendre la « main » d'une référence (principes seulement). Idées et valeurs traduites et adaptées.
