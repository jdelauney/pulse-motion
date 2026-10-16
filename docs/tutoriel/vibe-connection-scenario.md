# Vibe Connection — Scénario (version corrigée)

12 octobre 2026 · Jérôme Delauney

## Ce qui change par rapport à la première version

| Sujet | Avant | Maintenant | Pourquoi |
| --- | --- | --- | --- |
| Accroche | Logo qui zoome lentement, premier gag vers 0:13 | Un Touffu en gros plan dès la première image, gag « chut » avant 0:02 | Sur LinkedIn, on décide de rester en 2 à 3 s, et la vidéo démarre sans le son |
| Générique | « Claude présente » avec le logo Claude | « PulseIA présente », puis « pour Claude Code » en texte, sans logo | Ne pas laisser croire qu'Anthropic soutient le film |
| Personnages | Les LemSticks, une trappe d'où ils tombent | Les **Touffus**, qui sortent d'un portail mauve | Le nom et la trappe renvoyaient directement à Lemmings |
| Cartons | Le carton de la séquence 2 restait lisible 0,06 s ; celui de la séquence 3 durait 3 s pendant l'action | Textes raccourcis, frappe plus rapide, cartons d'au moins 2 s | Lecture sans le son |
| Preuve | Rien n'indiquait que le film était fait avec le plugin | Un vrai extrait de vidéo pulse-motion (séquence 6) et la mention « Ce film a été animé avec pulse-motion » à la fin | Montrer ce que le plugin produit vraiment |
| Promesse | « En quelques secondes » | « En quelques minutes » | La fabrication prend quelques minutes, pas quelques secondes |
| Commande | Commande inventée | La vraie commande, `/pulse-motion:creer …` | Le terminal doit montrer ce que la personne tapera |
| Format | 1:1 ou 4:5 | 1:1 | Toutes les positions sont calculées pour un carré |
| Lumière | Une seule source chaude par plan, partout | Une source chaude dominante ; la séquence 5 est l'exception assumée | La victoire de la séquence 5 a besoin d'éclat |
| Musique | Tempo libre | 120 bpm sur tout le film, détente en demi-tempo | Les pas, les planches et les cartons se calent sur les temps |

## Fiche technique

Une mini-vidéo de 1 min 32 qui fait la promotion de pulse-motion, un plugin de motion design pour Claude Code, à travers un faux film muet et rétro. Les images sont animées avec pulse-motion : le film est à la fois la publicité et la preuve.

| Élément | Choix |
| --- | --- |
| Titre | Vibe Connection |
| Durée | 1 min 32, en 7 séquences |
| Diffusion | LinkedIn, format carré 1:1 (1080 × 1080) |
| Voix | Aucune, uniquement des textes à l'écran |
| Musique | Chiptune rétro-gaming à 120 bpm, de la fanfare 8-bit à la musique de boss final |
| Bruitages | Palette jeu rétro : boing, bonk, pièce, bip d'erreur, fin de niveau (sons originaux, pas de reprise de Mario) |
| Générique | PulseIA présente, un film animé avec pulse-motion, pour Claude Code, avec les Touffus |
| Charte | PulseIA (couleurs, typographie Figtree) |

### Les Touffus

- **Corps :** stickman blanc au trait épais et arrondi, membres fins.
- **Tête :** ovale allongé verticalement, plus grand que celle d'un stickman classique.
- **Yeux :** deux grands yeux ronds rapprochés qui portent toute l'émotion : panique, surprise, fierté, soulagement.
- **Cheveux :** une touffe verte en épis qui rebondit à chaque pas. C'est la seule couleur du personnage, et ce qui lui donne son nom.
- **Démarche :** pas mécanique, un pas par demi-temps (250 ms à 120 bpm), légèrement penché en avant, comme une petite armée qui ne réfléchit pas.

Rôles récurrents : le Touffu « designer » (séquences 3 et 6), le Touffu n°1 et le Touffu n°2 (séquence 7).

### Direction artistique

Toute la vidéo suit la charte PulseIA, transposée dans un univers pixel-art nocturne : un fond sombre et une source de lumière chaude dominante par plan.

- **Format :** 1080 × 1080 px, 25 images/s. Les positions sont données en % du cadre : x depuis la gauche, y depuis le haut. (50 %, 50 %) est le centre.
- **Fond :** Noir de Chambre, oklch(0.141 0.005 285.823). Décors en Ardoise Vive et Pénombre Mauve, roches et terre en Braise Sourde, ciels et lointains en Mauve de Rémanence.
- **Lumière :** une source chaude dominante par plan, en Orange Incandescent oklch(0.68 0.2 30), sur moins de 10 % de l'image. Exception : la séquence 5 (lanternes, pont lumineux, porte), le moment de la victoire.
- **Traînée de marque** (#FF6B35 → #FF8C42 → #C56CF0 → #9B59B6 → #8E44AD) : réservée au générique, au titre, au pont pulse-motion et au logo final.
- **Touffus :** corps Blanc de Trait, pupilles Noir de Chambre. La touffe verte est la seule exception au « jamais de vert » de la charte. Hauteur : 14 % du cadre en plan large.
- **Textes :** Figtree uniquement. Titres en 900, cartons en 700, mentions secondaires en 500. Blanc de Trait par défaut, Gris de Veille pour les mentions secondaires, Orange Incandescent pour un seul mot clé par carton au maximum.
- **Cartons :** position par défaut (50 %, 18 %), 40 à 48 px, lisibles au moins 2 s une fois entièrement affichés, sortie en fondu de 300 ms.
- **Animations de texte :** montée en fondu (le texte monte de 24 px en 400 ms), fondu flouté (flou de 12 px à 0 en 500 ms), frappe (lettre par lettre), onde (vague sur les lettres, 20 ms par lettre). Chaque animation joue une fois puis s'arrête.
- **Interdit :** aucun minuteur ni horodatage à l'écran en haut à droite.

## Séquence 1 — Générique d'ouverture (0:00 – 0:16)

Une ouverture de grand film hollywoodien en version 8-bit. Le décalage comique arrive dès la première seconde.

**Beat 1 : chut (0:00 – 0:04)**

- **Caméra :** la vidéo s'ouvre en gros plan (zoom ×3) sur le visage d'un Touffu en (50 %, 72 %). À 0:01,2, dézoom rapide (400 ms) vers le plan large.
- **Première image :** déjà pleine. Le Touffu regarde la caméra, yeux ronds, un doigt sur la bouche : « chut ». Aucune image noire au départ.
- **Décor révélé par le dézoom :** horizon pixel-art dans le tiers bas (ligne d'horizon à y 70 %) : plateau rocheux Braise Sourde, ciel en dégradé de Pénombre Mauve vers Mauve de Rémanence. Des rayons Orange Incandescent partent du centre en éventail et tournent lentement.
- **Action :** à 0:01,8, le logo PULSEIA tombe derrière le Touffu en (50 %, 42 %), largeur 36 % du cadre, avec une secousse de la caméra (6 px, 200 ms). Le Touffu sursaute, sa touffe se hérisse, et il sort du cadre en courant par la droite.
- **Texte :** « présente », Figtree 500, 24 px, Gris de Veille, en (50 %, 62 %). Montée en fondu à 0:02,5.
- **Son :** silence, un « chut » 8-bit, puis la fanfare chiptune éclate à la chute du logo.

**Beat 2 : le film (0:04 – 0:07)**

- **Caméra :** plan fixe.
- **Décor :** fondu au noir de 300 ms. Fond Noir de Chambre uni, faible halo Braise Sourde au centre.
- **Textes :** « un film animé avec », Figtree 500, 20 px, Gris de Veille, en (50 %, 44 %), en montée en fondu. Puis « PULSE-MOTION », Figtree 900, 60 px, rempli avec la traînée de marque, lettres espacées de 0,2 em, en (50 %, 52 %). Apparition en onde de gauche à droite (20 ms par lettre) : chaque lettre monte puis retombe avec un léger rebond. C'est la signature visuelle du plugin.
- **Personnage :** un petit Touffu en silhouette Pénombre Mauve (hauteur 8 %, au loin) traverse l'arrière-plan de x 0 % à x 100 % sur la ligne y 80 %, en 3 s, sans s'arrêter.
- **Son :** arpège rapide et montant, la tension grimpe.

**Beat 3 : pour qui (0:07 – 0:09)**

- **Caméra et décor :** identiques au beat 2.
- **Textes :** « pour », Figtree 500, 20 px, Gris de Veille, en (50 %, 44 %). Puis « Claude Code », Figtree 700, 48 px, Blanc de Trait, en (50 %, 52 %), en fondu flouté. Texte seul, sans logo.
- **Son :** une note grave tenue, façon violoncelle synthétique.

**Beat 4 : les acteurs (0:09 – 0:12)**

- **Caméra et décor :** identiques au beat 2.
- **Textes :** « avec », Figtree 500, 20 px, Gris de Veille, en (50 %, 30 %). Puis « les Touffus », Figtree 700, 48 px, Blanc de Trait, en (50 %, 38 %). Montée en fondu.
- **Personnages :** 7 Touffus alignés de x 20 % à x 80 %, cachés sous le bord inférieur. Leurs touffes vertes surgissent l'une après l'autre (un toutes les 250 ms, sur les demi-temps), puis les têtes montent jusqu'aux yeux (y 85 %) et s'immobilisent, regard caméra. Le 4e, au centre, agite la main ; le 5e lui attrape le bras et le baisse. Tous redescendent ensemble à 0:11,8.
- **Son :** un « pop » à chaque touffe, un « tsk » quand le bras est baissé.

**Beat 5 : le titre (0:12 – 0:16)**

- **Caméra :** plan fixe, secousse de 6 px pendant 200 ms à l'impact du titre.
- **Décor :** retour de l'horizon pixel-art du beat 1, assombri.
- **Texte :** « VIBE CONNECTION » sur deux lignes (VIBE / CONNECTION), Figtree 900, 96 px, rempli avec la traînée de marque, contour Blanc de Trait de 2 px, centré en (50 %, 45 %). Une bouffée de fumée Mauve de Rémanence et Gris de Veille gonfle au centre à 0:12 ; le titre s'y révèle en fondu flouté pendant que la fumée se dissipe.
- **Personnage :** un Touffu entre par la droite sur la ligne de base du titre (y 58 %) et marche vers la gauche. Il bute contre le dernier N, qui pivote de 30° et reste penché. Sa touffe s'aplatit puis se redresse comme un ressort. Il fixe la caméra 1 s, yeux plissés de gêne, redresse le N d'une main et sort par la gauche.
- **Son :** coup de timbale à l'impact, « bonk » au choc, « boing » de la touffe.

## Séquence 2 — L'installation (0:16 – 0:22)

On découvre le monde des Touffus et leur marche aveugle vers l'avant.

**Beat 1 : le portail (0:16 – 0:19)**

- **Caméra :** plan large fixe.
- **Décor :** paysage pixel-art nocturne. Ciel Pénombre Mauve parsemé d'étoiles Gris de Veille. Une corniche rocheuse Braise Sourde traverse le cadre de gauche à droite (surface à y 75 %), couverte d'une mousse Mauve de Rémanence. À l'horizon à droite, une lueur Orange Incandescent : la source chaude du plan.
- **Objet :** un portail pixel-art Mauve de Rémanence se dessine sur la corniche en (8 %, 66 %), haut de 18 % : un arceau de pierre dont l'intérieur ondule. Il s'allume avec un rebond de 200 ms.
- **Personnages :** 6 Touffus sortent du portail, un toutes les 250 ms, avec un petit saut et un écrasement à l'atterrissage (compression à 80 % de leur hauteur pendant 100 ms). Ils partent vers la droite au pas mécanique, un pas toutes les 250 ms, calé sur le tempo.
- **Texte :** « Dans un monde où tout s'anime à la main… », Figtree 700, 40 px, Blanc de Trait, sur deux lignes, centré en (50 %, 18 %). Apparition en frappe à 0:17,5 (30 ms par lettre), les points de suspension arrivent un par un en 600 ms. Entièrement affiché à 0:19,3.
- **Son :** bourdonnement du portail, un « plop » par sortie, puis départ d'une boucle de marche chiptune à 120 bpm.

**Beat 2 : la marche (0:19 – 0:22)**

- **Caméra :** travelling latéral vers la droite à la vitesse de marche, la file reste centrée dans le cadre.
- **Décor :** parallaxe sur trois plans : étoiles (lent), collines Ardoise Vive (moyen), corniche (rapide).
- **Personnages :** les touffes vertes rebondissent à l'unisson à chaque pas.
- **Texte :** le carton du beat 1 reste affiché, puis sort en fondu à 0:21,7 (lisible 2,4 s).
- **Son :** la boucle de marche continue, tambours 8-bit réguliers.

## Séquence 3 — Le problème (0:22 – 0:39)

Le Touffu designer tente de sauver tout le monde en dessinant à la main un pont au-dessus du précipice, et échoue.

**Beat 1 : le précipice (0:22 – 0:26)**

- **Caméra :** le travelling accélère, dépasse la file et s'arrête sur un plan large du précipice.
- **Décor :** la corniche s'interrompt en x 45 %. De x 45 % à x 75 %, un précipice sans fond : noir profond, brume Pénombre Mauve qui monte lentement. L'autre rive va de x 75 % à x 100 %, à la même hauteur. Sur elle, en (90 %, 62 %), une porte de sortie : un rectangle de lumière Orange Incandescent, source chaude du plan.
- **Objets :** un panneau en bois tombe du ciel et se plante au bord en (42 %, 66 %), avec une vibration de 300 ms. Il porte « DEADLINE », Figtree 700, 28 px, Rouge d'Alerte. Une petite horloge pixel-art pend sous le panneau, son aiguille tourne.
- **Personnages :** la file entre par la gauche vers x 10 %, toujours au pas.
- **Son :** note grave inquiétante, puis un tic-tac 8-bit démarre, calé sur la marche.

**Beat 2 : le designer (0:26 – 0:31)**

- **Caméra :** plan moyen sur le bord du précipice (cadrage de x 25 % à x 70 %).
- **Personnage :** un Touffu quitte la file d'un saut de côté et se poste au bord, en (43 %, 70 %). Il porte un béret Pénombre Mauve posé sur sa touffe et un crayon géant aussi grand que lui, corps Blanc de Trait, mine Orange Incandescent.
- **Action :** il trace dans le vide, depuis le bord, des planches en traits blancs tremblotants, une toutes les 600 ms. Les traits vibrent légèrement, effet dessin à la main. Il recule, mesure avec le pouce, efface une planche avec la gomme (elle part en miettes), puis la redessine. En 5 s, le pont n'avance que jusqu'en x 52 %.
- **Arrière-plan :** la file continue d'avancer lentement derrière lui.
- **Son :** grattements de crayon, « scritch » de gomme, tic-tac.

**Beat 3 : l'effondrement et la chute (0:31 – 0:39)**

- **0:31 – 0:33 :** l'action passe en accéléré ×2. Le designer trace frénétiquement et le pont atteint l'autre rive en x 75 %, mais il est tordu, en forme de vague, planches de travers. Il s'essuie le front, fier.
- **0:33 – 0:34,5 :** le Touffu en tête de la file s'engage sur le pont tordu et avance jusqu'au milieu (x 60 %), en suivant ses vagues.
- **0:34,5 :** le pont se défait en gribouillis sous ses pieds. Les traits s'envolent, retombent sur le designer et s'enroulent autour de lui en une pelote blanche dont ne dépassent que ses yeux paniqués et son béret.
- **0:34,5 – 0:36,5 :** le Touffu reste suspendu en l'air, comme dans un dessin animé. Il regarde ses pieds, puis la caméra : yeux écarquillés, pupilles rétrécies, touffe hérissée, la surprise puis la peur. La caméra zoome sur son visage (0:34,8 – 0:35,2), puis dézoome (0:36 – 0:36,4).
- **0:36,5 – 0:37,7 :** il tombe en agitant les bras de bas en haut, de plus en plus vite, jusqu'au fond du précipice.
- **0:37,7 :** il s'écrase dans la brume du fond : une explosion (éclair, gerbe de débris, nuage de fumée) monte du précipice.
- **0:37,7 – 0:39 :** la fumée retombe. Derrière, la file reprend sa marche vers le bord.
- **Texte :** carton en (50 %, 15 %), Figtree 700, 40 px, Blanc de Trait, en deux temps. À 0:31, « Des heures à tout dessiner à la main. » en fondu flouté, pendant l'accéléré. À 0:33,5, dessous, « Et la deadline approche. », le mot « deadline » en Orange Incandescent. Les deux lignes tiennent jusqu'à 0:39.
- **Son :** le tic-tac accélère, craquement de papier quand le pont se défait, silence suspendu, sifflement de chute, boum de l'explosion, puis un « bip » d'erreur.

## Séquence 4 — Le tournant (0:39 – 0:47)

Le moment de suspense : tout s'arrête au bord du vide, et le terminal apparaît.

**Beat 1 : le pied dans le vide (0:39 – 0:41,5)**

- **Caméra :** plan large, puis zoom rapide (300 ms) en gros plan sur le visage du premier Touffu de la file.
- **Personnage :** le premier Touffu arrive au bord en (44 %, 70 %) et avance un pied au-dessus du vide (pied en x 46 %).
- **Arrêt sur image à 0:40 :** l'image se fige et le décor se désature légèrement. En gros plan, les yeux du Touffu s'écarquillent, ses pupilles rétrécissent et sa touffe se hérisse en épis droits, en 3 images.
- **Son :** la musique s'arrête net sur un « scratch » de disque.

**Beat 2 : le silence (0:41,5 – 0:44)**

- **Décor :** un voile Noir de Chambre à 70 % d'opacité recouvre l'image figée.
- **Texte :** « Jusqu'à aujourd'hui. », Figtree 900, 60 px, Blanc de Trait, centré en (50 %, 50 %). Apparition en fondu flouté sur 500 ms à 0:41,6, sortie en fondu de 300 ms à 0:43,7 (lisible 1,6 s après son apparition complète, 2,1 s au total).
- **Son :** silence total.

**Beat 3 : le terminal (0:44 – 0:47)**

- **Caméra :** dézoom vers le plan large. Les couleurs reviennent mais les personnages restent figés.
- **Objet :** une fenêtre de terminal Claude Code s'ouvre dans le ciel au-dessus du précipice, en (50 %, 30 %), largeur 70 %, hauteur 22 %. Fond Ardoise Vive, coins arrondis de 16 px, liseré mauve de 1 px, trois pastilles Gris de Veille dans la barre de titre. Elle s'ouvre depuis son centre (échelle de 0 à 100 % en 400 ms, léger rebond).
- **Contenu :** une invite « > » en Orange Incandescent, suivie d'un curseur bloc Blanc de Trait qui clignote toutes les 500 ms (un clignotement par temps).
- **Personnages :** les Touffus, toujours figés, lèvent lentement les yeux vers la fenêtre. Seules leurs pupilles bougent.
- **Son :** le clic du curseur à chaque clignotement, seul dans le silence.

## Séquence 5 — La démo pulse-motion (0:47 – 1:10)

Le cœur de la vidéo : une seule commande dans Claude Code, et le pont se construit de lui-même.

**Beat 1 : la commande (0:47 – 0:53)**

- **Caméra :** zoom avant sur le terminal, qui occupe 80 % du cadre.
- **Texte dans le terminal :** « /pulse-motion:creer un pont qui se construit planche par planche », Figtree 500, 28 px, Blanc de Trait, à la suite de l'invite orange. Apparition en frappe à 0:47,5 (40 ms par lettre, 2,5 s). À la validation, la ligne clignote une fois en Orange Incandescent.
- **Réponse :** trois lignes Gris de Veille défilent en frappe rapide (15 ms par lettre) : « Analyse de la scène… », « Animation des scènes… », « Vidéo prête. », la dernière précédée d'une coche Orange Incandescent. Tout est affiché à 0:51,5.
- **Son :** frappes de clavier 8-bit, puis un « power-up » ascendant à la validation.

**Beat 2 : le pont se construit (0:53 – 1:00)**

- **Caméra :** dézoom vers le plan large du précipice. Le terminal se replie en un point lumineux orange qui tombe sous le pied suspendu du Touffu.
- **Décor :** les couleurs sont pleinement restaurées, l'arrêt sur image se libère.
- **Objet :** le pont se construit depuis le bord gauche (x 45 %) jusqu'à la rive droite (x 75 %). 12 planches pixel-art Braise Sourde aux bords lumineux en traînée de marque, une toutes les 250 ms (un demi-temps). Chaque planche descend de 40 px et se pose avec un léger rebond. Le pont est droit et net, à l'opposé du gribouillis de la séquence 3.
- **Personnage :** la première planche se pose exactement sous le pied du Touffu. Il regarde ses pieds, puis la caméra, yeux ronds d'incrédulité.
- **Texte :** « Une commande », Figtree 700, 48 px, Blanc de Trait, en (50 %, 15 %). Montée en fondu à 0:56.
- **Son :** la musique explose en chiptune épique, façon boss final, avec un « tink » à chaque planche posée.

**Beat 3 : la traversée (1:00 – 1:10)**

- **Caméra :** travelling latéral lent qui suit la file de gauche à droite.
- **Personnages :** les 4 Touffus qui restent (le designer est resté sur la rive gauche, un autre a disparu dans le précipice) traversent au pas. Leurs touffes rebondissent en vague, avec 60 ms de décalage d'un Touffu à l'autre. Sur la rive droite, chacun fait un petit saut de joie puis entre dans la porte lumineuse. À côté de la porte se dresse un poteau : quand le premier Touffu passe la porte, un drapeau suisse (rouge, croix blanche) se hisse en haut du poteau en 1 s et flotte au vent. À chaque Touffu qui passe la porte, une salve de confettis aux couleurs de la traînée de marque éclate au-dessus de la porte.
- **Objets :** au fil de la traversée, le pont s'enrichit. À 1:02, des rambardes se dessinent d'un trait continu ; à 1:04, des lanternes Orange Incandescent s'allument une à une ; à 1:06, une onde aux couleurs de la traînée parcourt le tablier.
- **Textes :** « Du motion design pro » à 1:02, puis « En quelques minutes » à 1:06. Même style et même position que « Une commande » ; chaque carton remplace le précédent en fondu flouté.
- **Son :** la mélodie épique continue, un son de pièce à chaque Touffu qui atteint la rive.

Le terminal n'affiche que l'idée de départ. Le déroulé complet qui fabrique ce film reste hors champ.

## Séquence 6 — La chute comique et la preuve (1:10 – 1:20)

Le designer se libère et savoure la fin de ses galères, puis on découvre ce qu'il regarde : une vraie vidéo pulse-motion.

**Beat 1 : le designer se libère (1:10 – 1:13)**

- **Caméra :** plan moyen sur la rive gauche (cadrage de x 20 % à x 60 %).
- **Personnage :** le designer, toujours prisonnier de sa pelote de traits de crayon, en (35 %, 70 %). Ses yeux vont vers le pont pulse-motion à droite, reviennent sur sa pelote, puis il soupire : la pelote se soulève et retombe.
- **Action :** il s'extirpe par le haut d'un coup sec, comme un bouchon, et retombe sur ses pieds. Il compacte la pelote en boule et la lance par-dessus son épaule sans regarder. Elle sort du cadre en haut à gauche.
- **Son :** « fwip » de déroulement, « pop » de bouchon, « swoosh », puis un « splat » hors champ.

**Beat 2 : la pause café (1:13 – 1:16)**

- **Caméra :** plan large fixe sur le précipice et le pont.
- **Objets :** une chaise longue pixel-art Mauve de Rémanence apparaît en fondu en (30 %, 72 %), avec une tasse de café fumante Blanc de Trait et un petit ordinateur portable Ardoise Vive posé sur les genoux du designer.
- **Personnage :** le designer s'y allonge, croise les jambes, boit une gorgée et lance une vidéo sur son ordinateur.
- **Arrière-plan :** sur le pont, trois Touffus rebondissent comme sur un trampoline. Chaque saut déclenche une animation différente du pont : il ondule, puis se teinte aux couleurs de la traînée, puis forme une vague qui projette les trois Touffus plus haut.
- **Son :** la musique passe en version détente 8-bit, en demi-tempo (même grille à 120 bpm), avec un « boing » par saut et un « slurp » à chaque gorgée.

**Beat 3 : la preuve (1:16 – 1:20)**

- **Caméra :** zoom rapide (400 ms) dans l'écran de l'ordinateur, qui remplit tout le cadre à 1:16,5.
- **Image :** une image tirée d'une vraie vidéo fabriquée avec pulse-motion (par exemple la scène « chiffre » de « La chaîne du froid », l'exemple livré avec le plugin), en couleurs réelles, sans retouche. La caméra continue d'avancer lentement dessus (zoom de 100 % à 104 %).
- **Texte :** « Vos formations, vos produits, vos idées. », Figtree 700, 40 px, Blanc de Trait sur un bandeau Noir de Chambre à 80 %, en (50 %, 85 %). Montée en fondu à 1:16,5, tient jusqu'à 1:20 (3,5 s).
- **Son :** la musique de détente continue, un « ding » doux à l'entrée dans l'écran.

## Séquence 7 — Les pancartes (1:20 – 1:32)

L'appel à l'action, porté par deux Touffus maladroits et leurs pancartes.

**Beat 1 : la grande annonce (1:20 – 1:22,5)**

- **Caméra :** plan moyen fixe.
- **Décor :** fond Noir de Chambre uni. Le sol est une corniche Braise Sourde à y 80 % qui s'arrête en x 85 %, avec un halo Braise Sourde au sol.
- **Personnage :** le Touffu n°1 entre par la gauche d'une marche fière, torse bombé et genoux hauts. Il s'arrête en x 40 % et lève sa pancarte au-dessus de sa tête d'un geste solennel.
- **Objet :** pancarte Blanc de Trait aux coins arrondis de 16 px, largeur 50 % du cadre, centrée en (45 %, 45 %), tenue par un manche. Le texte est à l'envers. Le Touffu ne remarque rien et bombe le torse.
- **Son :** jingle de victoire 8-bit, coupé net par un « bip » d'erreur.

**Beat 2 : la correction (1:22,5 – 1:25)**

- **Personnage :** ses pupilles montent lentement vers la pancarte (500 ms), marquent une pause, puis ses yeux s'écarquillent. Il fait pivoter la pancarte de 180° d'un coup sec (300 ms, avec rebond) à 1:23,5. Sa touffe se redresse de fierté.
- **Texte sur la pancarte :** « Ne laissez plus vos animations tomber dans le vide. », Figtree 700, 32 px, Noir de Chambre, sur trois lignes. Dessous : « Essayez pulse-motion », Figtree 900, 40 px, Orange Incandescent. Lisible de 1:23,8 jusqu'à la sortie (environ 5 s).
- **Son :** « pling » de pièce ramassée.

**Beat 3 : le collègue (1:25 – 1:27,5)**

- **Personnage :** le Touffu n°2 entre en courant par la droite, freine en glissant dans un petit nuage de poussière et s'arrête en x 75 %, haletant.
- **Objet :** une petite pancarte Blanc de Trait, largeur 30 %, en (75 %, 50 %) : « Lisez le commentaire », Figtree 700, 28 px, Noir de Chambre, avec une grosse flèche Orange Incandescent épinglée dessus, qui pointe vers le haut.
- **Action :** le n°1 le regarde et soupire, les épaules se soulèvent. Il tend le bras, décroche la flèche et la repique pointe vers le bas, vers la zone des commentaires LinkedIn.
- **Son :** petit « tut-tut » chiptune, puis un « ding ».

**Beat 4 : la sortie (1:27,5 – 1:29)**

- **Personnages :** les deux Touffus se tapent dans la main (petites étoiles Orange Incandescent au contact) et des feux d'artifice aux couleurs de la traînée de marque partent derrière eux ; posent leurs pancartes sur l'épaule et repartent vers la droite au pas mécanique. Le n°2 pose un pied au-delà du bord de la corniche. Arrêt sur image de 500 ms, puis trois planches pulse-motion se posent sous son pied avec le même rebond qu'en séquence 5, et il sort du cadre sans rien remarquer.
- **Son :** « clap » de la tape dans la main, trois « tink ».

**Beat 5 : le logo (1:29 – 1:32)**

- **Logo :** le logo pulse-motion apparaît en (50 %, 40 %), largeur 50 %, en onde (20 ms par lettre) aux couleurs de la traînée de marque.
- **Textes :** dessous, en (50 %, 52 %) : « le plugin motion design pour Claude Code », Figtree 500, 24 px, Gris de Veille, en montée en fondu. Puis en (50 %, 60 %) : « Ce film a été animé avec pulse-motion. », Figtree 500, 20 px, Gris de Veille. Les deux restent jusqu'à la dernière image, qui tient 0,5 s sans mouvement.
- **Son :** mélodie de fin de niveau rétro.

## Notes de production

| Séquence | Timing | Durée |
| --- | --- | --- |
| 1 — Générique d'ouverture | 0:00 – 0:16 | 16 s |
| 2 — L'installation | 0:16 – 0:22 | 6 s |
| 3 — Le problème | 0:22 – 0:39 | 17 s |
| 4 — Le tournant | 0:39 – 0:47 | 8 s |
| 5 — La démo pulse-motion | 0:47 – 1:10 | 23 s |
| 6 — La chute comique et la preuve | 1:10 – 1:20 | 10 s |
| 7 — Les pancartes | 1:20 – 1:32 | 12 s |

- **Tempo :** 120 bpm sur tout le film, soit 2 temps par seconde. Toutes les séquences commencent sur un temps.
- **Marge :** la séquence 6 peut perdre 2 à 3 secondes (beat 2) si la vidéo doit raccourcir. Garder le beat 3, la preuve.
- **Lecture muette :** sans voix off, tout passe par les cartons et l'expressivité des yeux et des touffes. Chaque carton reste lisible au moins 2 secondes une fois entièrement affiché.
- **Post LinkedIn :** placer le lien d'installation dans le premier commentaire, comme l'annonce la pancarte de la séquence 7.
- **Personnages :** les Touffus restent une création originale (corps de stickman, sans tunique ni design repris d'un jeu existant). Les bruitages sont des sons originaux.
- **Son :** la musique est une partition écrite pour le film (déroulé) ; les bruitages sont les sons fabriqués par pulse-motion (`whoosh`, `pop`, `clic`, `tic`, `impact`, `carillon`, `ding`, `blip`, `montee`, `souffle`…), ou des fichiers WAV originaux rangés dans `assets/sons/`, tous mixés dans la page et dans l'export MP4. Correspondances : voir l'étape 15 du tutoriel 3 du wiki (`docs/tutoriels/vibe-connection.html`).

## Fabrication avec pulse-motion

Un projet, une scène par séquence (`scenes/01-generique.html` … `scenes/07-pancartes.html`). Ce que chaque effet demande au moteur :

| Besoin du scénario | Outil pulse-motion |
| --- | --- |
| Format carré, 25 images/s | `"format": { "ratio": "1:1", "ips": 25 }` |
| Tout calé sur la musique | musique composée à 120 bpm (`"musique": { "generee": "entrainant", "tempo": 120 }`), qui se cale sur l'image : une section par séquence, pile à son début ; humeur par séquence (`scenes[].musique` : `silence` pour la 4, `intense` pour la 5, `calme` pour la 6) ; gestes calés en temps `data-start="4t"` |
| « PULSE-MOTION » en onde, logo final | `data-lettres="onde" data-pas="0.02"` + `class="pm-degrade"` (traînée en `--pm-degrade`) |
| « VIBE CONNECTION » révélé dans la fumée | effet de particules `fumee` (Mauve de Rémanence, Gris de Veille) devant le titre, titre en `data-mots="flou"` + `class="pm-degrade pm-contour"` |
| Cartons en frappe, en fondu flouté | `data-lettres="frappe" data-pas="0.03"`, `data-mots="flou"` |
| Gros plan d'ouverture, dézoom, secousse du logo | `data-camera="zoom 3→1 1.2+0.4 cubic-out; y 72→50 1.2+0.4 cubic-out; secousse 0.6 1.8+0.2"` |
| Travelling avec parallaxe (séquences 2 et 5) | `data-camera="x 50→90 3+3 linear"` + `data-profondeur="0.1"` (étoiles), `"0.5"` (collines) |
| Accéléré ×2 du designer (séquence 3) | `data-vitesse="9+2 x2"` sur le conteneur du décor, du pont et du designer : un personnage vit au temps de ce qui le contient |
| Arrêt sur image désaturé (séquence 4) | `data-gel="1+7"` (jusqu'à la fin de la scène) sur le décor et la file de Touffus, qui se figent avec lui + `saturation 1→0.6 1+0.3 ; saturation 0.6→1 5+0.4` dans sa caméra, qui continue de zoomer ; le premier Touffu hors du conteneur figé, `data-calme="non"`, puis l'action `regarder` vers le terminal |
| Planches posées une par une | `data-start` en demi-temps (`0.5t` d'écart), courbe `back-out` |
| Lanternes, étoiles de la tape dans la main | effets de particules `etincelles`, `paillettes` |
| Explosion du Touffu au fond du précipice (séquence 3) | effet `explosion` à l'impact, calé sur la fin de sa chute |
| Drapeau suisse hissé (séquence 5) | copie de l'effet `drapeau` dont l'apparence prend l'image `assets/drapeau-suisse.svg` (sans dégradé : une seule texture), attachée à une drisse (`"a": "#drisse"`), petit élément qui monte le long du poteau |
| Confettis à chaque Touffu qui passe la porte (séquence 5) | quatre effets `confettis`, chacun calé sur l'arrivée d'un membre du groupe (`#traversee-1:fin` …) : exception assumée à la règle « une seule fois par vidéo » |
| Feux d'artifice à la tape dans la main (séquence 7) | effet `feu-artifice`, calé sur la rencontre des deux mains |
| Files de Touffus (séquences 1 à 5) | groupes : `data-groupe`, `data-ecart`, `data-decalage`, `data-depart="commun"` (portail), `data-membre` pour un geste à part |
| Attraper, se taper dans la main, regarder | actions `atteindre` (rencontre de deux mains) et `regarder` (une cible, ou la caméra) |
| Touffus | personnages de pulse-motion : `<div data-personnage="touffu" data-x="…" data-sol="…" data-taille="14">` et leurs actions minutées (`marcher`, `courir`, `pose`, `jouer`, `tourner`, `expression`) ; le designer et la silhouette sont deux dessins dérivés du Touffu (`touffu-designer` avec son béret en accessoire, `touffu-silhouette`) ; les gestes propres au film (« chut », « sursaut », « dessiner », « mesurer », « fier »…) sont des poses et mouvements rangés dans `personnages/` du projet |
| Touffus qui montent du bas (séquence 1) | sol de départ sous l'image (`data-sol="110"`), puis l'action `glisser` jusqu'au sol 92 ; le designer bondit de côté et hors de sa pelote avec `bondir` |
| Crayon, pancartes, flèche, tasse, ordinateur, pelote | objets de la scène tenus en main : `data-tenu-par="#designer"`, `data-main` (`deux` pour la pancarte et l'ordinateur), `data-orientation="main"` pour le crayon, `data-lacher="tombe"` pour la pelote |
| Terminal, pont | éléments dessinés en SVG dans des scènes composées librement (pas de scène toute faite), animés aux instants du scénario |
| Extrait réel de la séquence 6 | image PNG tirée de l'export de « La chaîne du froid », dans `assets/` ; la caméra zoome dessus (le moteur n'embarque pas encore de fichier vidéo) |

* [x] Valider la version courte de la commande affichée dans le terminal en séquence 5 (`/pulse-motion:creer …`)
* [ ] Préparer le lien d'installation pour le commentaire
* [ ] Composer ou choisir la musique à 120 bpm et les bruitages originaux

La fabrication pas à pas, commande par commande, est le tutoriel 3 du wiki : `docs/tutoriels/vibe-connection.html`.
