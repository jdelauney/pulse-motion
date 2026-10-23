# Vibe Connection — Scénario

12 octobre 2026 · Jérôme Delauney — mis à jour le 17 octobre 2026 pour suivre le film exporté (`sortie/vibe-connection.mp4`)

## Fiche technique

Une mini-vidéo de 1 min 40 qui fait la promotion de pulse-motion, un plugin de motion design pour Claude Code, à travers un faux film muet et rétro. Les images sont animées avec pulse-motion : le film est à la fois la publicité et la preuve.

| Élément | Choix |
| --- | --- |
| Titre | Vibe Connection |
| Durée | 1 min 40, en 7 séquences |
| Diffusion | LinkedIn, format carré 1:1 (1080 × 1080), 25 images/s |
| Voix | Aucune, uniquement des textes à l'écran |
| Musique | Musique composée, ambiance inspirante (nappes et mélodie douces, sans sonorités chiptune), 120 bpm, volume bas (0,45) pour laisser la place aux bruitages |
| Bruitages | Palette dessin animé : boing, bonk, plop, pièce, explosion, splat, slurp, tink, bip d'erreur… (sons originaux fabriqués pour le film, pas de reprise de Mario) |
| Générique | PulseIA présente, un film animé avec pulse-motion, pour Claude Code, avec les Tousfous |
| Charte | PulseIA (couleurs, typographie Figtree) |

### Les Tousfous

- **Corps :** stickman blanc au trait épais et arrondi, membres fins.
- **Tête :** ovale allongé verticalement, plus grand que celle d'un stickman classique.
- **Yeux :** deux grands yeux ronds côte à côte, qui portent toute l'émotion : panique, surprise, fierté, soulagement. Ils restent toujours dans la tête et ne se recouvrent jamais, quel que soit l'angle (profil, trois quarts, face) ou l'expression.
- **Cheveux :** une touffe verte en épis qui rebondit à chaque pas. C'est la seule couleur du personnage.
- **Démarche :** pas mécanique, légèrement penché en avant, comme une petite armée qui ne réfléchit pas.

Rôles récurrents : le Tousfou « designer » (séquences 3 à 6), le Tousfou n°1 et le Tousfou n°2 (séquence 7).

### Direction artistique

Toute la vidéo suit la charte PulseIA, transposée dans un univers nocturne aux formes lisses, sans pixel-art : collines arrondies, sol plat à bord net bordé d'une fine mousse mauve, dégradés continus, petites étoiles rondes. Un fond sombre et une source de lumière chaude dominante par plan.

- **Format :** 1080 × 1080 px, 25 images/s. Les positions sont données en % du cadre : x depuis la gauche, y depuis le haut. (50 %, 50 %) est le centre.
- **Fond :** Noir de Chambre, oklch(0.141 0.005 285.823). Décors en Ardoise Vive et Pénombre Mauve, roches et terre en Braise Sourde, ciels et lointains en Mauve de Rémanence.
- **Lumière :** une source chaude dominante par plan, en Orange Incandescent oklch(0.68 0.2 30), sur moins de 10 % de l'image. Exception : la séquence 5 (lanternes, pont lumineux, porte), le moment de la victoire.
- **Traînée de marque** (#FF6B35 → #FF8C42 → #C56CF0 → #9B59B6 → #8E44AD) : réservée au générique, au titre, au pont pulse-motion et au logo final.
- **Tousfous :** corps Blanc de Trait, pupilles Noir de Chambre. La touffe verte est la seule exception au « jamais de vert » de la charte. Hauteur : 14 % du cadre en plan large.
- **Textes :** Figtree uniquement. Titres en 900, cartons en 700, mentions secondaires en 500. Blanc de Trait par défaut, Gris de Veille pour les mentions secondaires, Orange Incandescent pour un seul mot clé par carton au maximum. **Aucun texte plus petit que 38 px** (3,5 % de la hauteur de l'image).
- **Cartons :** position par défaut (50 %, 18 %), 40 à 48 px, lisibles au moins 2 s une fois entièrement affichés, sortie en fondu de 300 ms.
- **Animations de texte :** montée en fondu (le texte monte de 24 px en 400 ms), fondu flouté (flou de 12 px à 0 en 500 ms), frappe (lettre par lettre), onde (vague sur les lettres, 20 ms par lettre). Chaque animation joue une fois puis s'arrête.
- **Décor commun des séquences 3 à 6 :** sol des deux rives à y 75 % ; rive gauche jusqu'en x 45 % ; précipice aux parois droites de x 45 % à x 75 % ; rive droite de x 75 % à x 100 % ; porte de sortie orange centrée en x 90 %, posée au sol ; panneau DEADLINE planté en x 40 % ; pelote du designer en x 30 %.
- **Interdit :** aucun minuteur ni horodatage à l'écran en haut à droite.

## Séquence 1 — Générique d'ouverture (0:00 – 0:20)

Une ouverture de grand film hollywoodien. Le décalage comique arrive dès la première seconde.

**Beat 1 : chut (0:00 – 0:04)**

- **Caméra :** la vidéo s'ouvre en gros plan (zoom ×3) sur le visage d'un Tousfou en (50 %, 72 %). À 0:01,2, dézoom rapide (400 ms) vers le plan large.
- **Première image :** déjà pleine. Le Tousfou regarde la caméra, yeux ronds : « chut ». Aucune image noire au départ.
- **Décor révélé par le dézoom :** horizon lisse dans le tiers bas (ligne d'horizon à y 70 %) : plateau Braise Sourde aux courbes douces, ciel en dégradé de Pénombre Mauve vers Mauve de Rémanence. Des rayons Orange Incandescent partent du centre en éventail, derrière le logo PULSEIA : ils tournent de façon bien visible (environ 12° par seconde) et leur éclat respire pendant tout le beat.
- **Action :** à 0:01,8, le logo PULSEIA tombe derrière le Tousfou en (50 %, 42 %), largeur 36 % du cadre, avec une secousse de la caméra (6 px, 200 ms). Le Tousfou sursaute, sa touffe se hérisse, et il sort du cadre en courant par la droite.
- **Texte :** « présente », Figtree 500, 38 px, Gris de Veille, en (50 %, 62 %). Montée en fondu à 0:02,5.
- **Son :** « chut », impact à la chute du logo, « swoosh » de la sortie en courant.

**Beat 2 : le film (0:04 – 0:07)**

- **Caméra :** plan fixe.
- **Décor :** fondu au noir de 300 ms. Fond Noir de Chambre uni, faible halo Braise Sourde au centre.
- **Textes :** « un film animé avec », Figtree 500, 38 px, Gris de Veille, en (50 %, 44 %), en montée en fondu. Puis « PULSE-MOTION », Figtree 900, 60 px, rempli avec la traînée de marque, lettres espacées de 0,2 em, en (50 %, 52 %). Apparition en onde de gauche à droite (20 ms par lettre) : chaque lettre monte puis retombe avec un léger rebond. C'est la signature visuelle du plugin.
- **Personnage :** un petit Tousfou assombri (hauteur 8 %, au loin) traverse l'arrière-plan de x 0 % à x 100 % sur la ligne y 80 %, en 3 s, sans s'arrêter.

**Beat 3 : pour qui (0:07 – 0:09)**

- **Caméra et décor :** identiques au beat 2.
- **Textes :** « pour », Figtree 500, 38 px, Gris de Veille, en (50 %, 44 %). Puis « Claude Code », Figtree 700, 48 px, Blanc de Trait, en (50 %, 52 %), en fondu flouté. Texte seul, sans logo.

**Beat 4 : les acteurs (0:09 – 0:12,6)**

- **Caméra et décor :** identiques au beat 2, avec un rebord sombre au bas du cadre (y 86 %).
- **Textes :** « avec », Figtree 500, 38 px, Gris de Veille, en (50 %, 30 %). Puis « les Tousfous », Figtree 700, 48 px, Blanc de Trait, en (50 %, 38 %). Montée en fondu.
- **Personnages :** 7 Tousfous identiques, alignés de x 20 % à x 80 %, cachés derrière le rebord. Leurs touffes vertes surgissent l'une après l'autre (une toutes les 250 ms, sur les demi-temps), puis à 0:10,9 les 7 Tousfous montent ensemble et apparaissent en entier, les pieds posés sur le rebord, tous à la même hauteur, regard caméra. Le 4e, au centre, agite la main pour dire « bonjour » ; le 5e lui attrape le bras et le baisse. Tous redescendent ensemble derrière le rebord à 0:12,1.
- **Son :** un « pop » sur une touffe sur deux, un « tsk » quand le bras est baissé.

**Beat 5 : le titre (0:12,6 – 0:20)**

- **Caméra :** plan fixe, secousse de 6 px pendant 200 ms à l'impact du titre.
- **Décor :** retour de l'horizon lisse du beat 1, assombri, rayons toujours en rotation.
- **Texte :** « VIBE CONNECTION » sur deux lignes (VIBE / CONNECTION), Figtree 900, 96 px, rempli avec la traînée de marque, contour Blanc de Trait de 2 px, centré en (50 %, 45 %). Une bouffée de fumée Mauve de Rémanence et Gris de Veille gonfle au centre à 0:12,4 ; le titre s'y révèle en fondu flouté à 0:12,8 pendant que la fumée se dissipe.
- **Personnage :** un Tousfou entre par la droite sur la ligne de base du titre et marche vers la gauche. À 0:14, il bute contre le dernier N, qui pivote de 30° et reste penché. Il tombe sur les fesses, se relève à 0:15,2, fixe la caméra environ 1 s avec un visage gêné, redresse le N d'une main (0:17,1) et traverse tout l'écran en courant vers la gauche, d'une course posée (1,4 s pour sortir du cadre). Le titre reste seul jusqu'à 0:20.
- **Son :** fumée (souffle), impact du titre, « bonk » contre le N, « plop » de la chute, « boing » en se relevant, petit clic quand il redresse le N, « swoosh » de la sortie.

## Séquence 2 — L'installation (0:20 – 0:26)

On découvre le monde des Tousfous et leur marche aveugle vers l'avant.

**Beat 1 : la trappe (0:20 – 0:23)**

- **Caméra :** plan large fixe.
- **Décor :** paysage nocturne aux formes lisses. Ciel Pénombre Mauve en dégradé, petites étoiles rondes Gris de Veille qui scintillent. Une corniche Braise Sourde plate à bord net traverse le cadre de gauche à droite (surface à y 75 %), bordée d'une fine mousse Mauve de Rémanence. Collines lisses sur deux plans. À l'horizon à droite, une lueur Orange Incandescent : la source chaude du plan.
- **Objet :** une trappe en bois suspendue dans le ciel, en haut à gauche au-dessus de la corniche (vers x 12 %, y 21 à 30 %) : un cadre brun en forme de « Π » et un battant en planches. À 0:20,5, le battant s'ouvre vers le bas d'un coup, avec un rebond de 200 ms, puis se balance de moins en moins. Pas de portail.
- **Personnages :** 6 Tousfous tombent de la trappe, un toutes les 250 ms à partir de 0:21, en chute verticale qui accélère jusqu'à la corniche. Ils sont invisibles avant de sortir de la trappe. À l'atterrissage, chacun s'écrase (tassé à 80 % de sa hauteur, bras écartés) puis se redresse et part vers la droite au pas mécanique.
- **Texte :** « Dans un monde où tout s'anime à la main… », Figtree 700, 40 px, Blanc de Trait, sur deux lignes, centré en (50 %, 18 %). Apparition en frappe à 0:21,5 (30 ms par lettre), les points de suspension arrivent un par un.
- **Son :** « whoosh » et « bonk » léger du battant qui s'ouvre, un « plop » sur un atterrissage sur deux.

**Beat 2 : la marche (0:23 – 0:26)**

- **Caméra :** travelling latéral vers la droite, la file glisse vers le centre du cadre.
- **Décor :** parallaxe sur quatre plans : ciel et étoiles (lent), collines lointaines, collines proches, corniche (rapide).
- **Personnages :** les touffes vertes rebondissent à chaque pas.
- **Texte :** le carton du beat 1 reste affiché, puis sort en fondu à 0:25,7.

## Séquence 3 — Le problème (0:26 – 0:43)

Le Tousfou designer tente de sauver tout le monde en dessinant à la main un pont au-dessus du précipice, et échoue.

**Beat 1 : le précipice (0:26 – 0:30)**

- **Caméra :** le travelling accélère, dépasse la file et s'arrête sur un plan large du précipice.
- **Décor :** la corniche s'interrompt en x 45 %. De x 45 % à x 75 %, un précipice sans fond aux parois droites : noir profond, brume Pénombre Mauve qui monte lentement. L'autre rive va de x 75 % à x 100 %, à la même hauteur (y 75 %). Sur elle, centrée en x 90 % et posée au sol, une porte de sortie : un rectangle de lumière Orange Incandescent dans un cadre sombre, source chaude du plan.
- **Objets :** à 0:29, un panneau en bois tombe du ciel et se plante près du bord, avec une vibration de 300 ms et une petite secousse de la caméra : un seul poteau brun en x 40 %, planche brune centrée en (40 %, 50 %), largeur 20 %. Il porte « DEADLINE », Figtree 700, 38 px, Rouge d'Alerte. Une horloge ronde blanche est posée au sommet du poteau, son aiguille avance à chaque temps. Le panneau reste planté au même endroit jusqu'à la séquence 6.
- **Personnages :** la file entre par la gauche, toujours au pas. Le designer marche en tête.
- **Son :** « bonk » du panneau qui se plante, puis le tic-tac de l'horloge (un par seconde).

**Beat 2 : le designer (0:30 – 0:35)**

- **Caméra :** plan moyen sur le bord du précipice (cadrage de x 21 % à x 71 %).
- **Personnage :** le designer quitte la file d'un bond et se poste au bord, en x 43 %, devant le poteau. Il tient un crayon de taille normale (la longueur de son avant-bras), corps Blanc de Trait, mine Orange Incandescent.
- **Action :** il trace dans le vide, depuis le bord, des planches en traits blancs tremblotants, une toutes les 600 ms. Les traits vibrent légèrement, effet dessin à la main. Il recule, vise le pont, efface une planche (elle part en miettes rondes), puis la redessine. En 5 s, le pont n'avance que jusqu'en x 52 %.
- **Arrière-plan :** la file continue d'avancer lentement derrière lui.
- **Son :** grattements de crayon sur une partie des planches, gomme, tic-tac.

**Beat 3 : l'effondrement et la chute (0:35 – 0:43)**

- **0:35 – 0:37 :** l'action passe en accéléré ×2. Le designer trace frénétiquement et le pont atteint l'autre rive en x 75 %, mais il est tordu, en forme de vague, planches de travers. Il pose les mains sur les hanches, fier, sourire et regard caméra.
- **0:36,4 – 0:38,5 :** le Tousfou en tête de la file s'engage sur le pont tordu et avance jusqu'au milieu (x 60 %), en suivant ses vagues.
- **0:38,5 :** le pont se défait en gribouillis sous ses pieds. Les traits s'envolent, retombent sur le designer et s'enroulent autour de lui en une pelote de traits blancs serrée autour du corps, d'où dépassent sa tête et sa touffe. Cette pelote garde exactement le même dessin, la même taille et la même place jusqu'à la séquence 6.
- **0:38,5 – 0:40,5 :** le Tousfou reste suspendu en l'air, comme dans un dessin animé, et se tourne de face vers la caméra. Il regarde ses pieds, puis la caméra : la surprise puis la peur, il tremble. La caméra zoome sur son visage (0:38,8 – 0:39,2), puis dézoome (0:40 – 0:40,4).
- **0:40,5 – 0:41,7 :** il tombe de face en battant des bras de bas en haut, de plus en plus vite, jusqu'au fond du précipice.
- **0:41,7 :** il s'écrase dans la brume du fond : une explosion (éclair, gerbe de débris, nuage de fumée) monte du précipice.
- **0:41,8 – 0:43 :** la fumée retombe. Le designer, prisonnier de sa pelote, recule par petits bonds de x 43 % à x 30 %. Derrière, la file reprend sa marche vers le bord. À 0:43, la file est en x 38 %, 23 %, 18 % et 13 %, la pelote en x 30 %.
- **Texte :** carton en (50 %, 15 %), Figtree 700, 40 px, Blanc de Trait, en deux temps. À 0:35, « Des heures à tout dessiner à la main. » en fondu flouté, pendant l'accéléré. À 0:37,5, dessous, « Et la deadline approche. », le mot « deadline » en Orange Incandescent. Les deux lignes tiennent jusqu'à 0:43.
- **Son :** le tic-tac accélère pendant l'accéléré, craquement de papier quand le pont se défait, petite montée de tension pendant la suspension, sifflet de chute, explosion, puis un bip d'erreur et un « plop » d'un bond de recul.

## Séquence 4 — Le tournant (0:43 – 0:51)

Le moment de suspense : tout s'arrête au bord du vide, et le terminal apparaît.

**Beat 1 : le pied dans le vide (0:43 – 0:45,5)**

- **Caméra :** plan large, puis zoom rapide (300 ms) en gros plan sur le visage du premier Tousfou de la file.
- **Décor :** identique à la séquence 3 : panneau DEADLINE planté en x 40 %, designer immobile dans sa pelote en x 30 %, au milieu de la file.
- **Personnage :** le premier Tousfou passe de x 38 % à x 45 % et se penche au-dessus du vide, devant le poteau ; le bout de son pied dépasse du bord.
- **Arrêt sur image à 0:44 :** le décor, le panneau, l'horloge et la pelote se figent et l'image se désature légèrement. En gros plan, les yeux du Tousfou s'écarquillent (surprise puis peur).
- **Son :** « scratch » de disque rayé à l'arrêt sur image.

**Beat 2 : le silence (0:45,5 – 0:48)**

- **Décor :** un voile Noir de Chambre à 70 % d'opacité recouvre l'image figée.
- **Texte :** « Jusqu'à aujourd'hui. », Figtree 900, 60 px, Blanc de Trait, centré en (50 %, 50 %). Apparition en fondu flouté sur 500 ms à 0:45,6, sortie en fondu de 300 ms à 0:47,7.
- **Son :** silence (aucun bruitage).

**Beat 3 : le terminal (0:48 – 0:51)**

- **Caméra :** dézoom vers le plan large (0:48 – 0:48,4). Les couleurs reviennent.
- **Objet :** une fenêtre de terminal Claude Code s'ouvre dans le ciel au-dessus du précipice à 0:48,2, en (50 %, 30 %), largeur 70 %, hauteur 22 %. Fond Ardoise Vive, coins arrondis de 16 px, liseré mauve de 1 px, trois pastilles Gris de Veille dans la barre de titre. Elle s'ouvre depuis son centre (échelle de 0 à 100 % en 400 ms, léger rebond).
- **Contenu :** une invite « > » en Orange Incandescent, suivie d'un curseur bloc Blanc de Trait qui clignote au rythme des temps.
- **Personnages :** les Tousfous lèvent les yeux vers la fenêtre à 0:48,5. À 0:51, la file est en x 45 %, 37 %, [pelote 30 %], 23 % et 16 %.
- **Son :** « pop » à l'ouverture du terminal, un clic à chaque fois que le curseur se rallume.

## Séquence 5 — La démo pulse-motion (0:51 – 1:14)

Le cœur de la vidéo : une seule commande dans Claude Code, et le pont se construit de lui-même.

**Beat 1 : la commande (0:51 – 0:57)**

- **Caméra :** zoom avant sur le terminal, qui occupe 80 % du cadre ; il s'agrandit en hauteur pour accueillir le texte, le panneau DEADLINE reste visible dessous.
- **Texte dans le terminal :** « /pulse-motion:creer un pont qui se construit planche par planche », Figtree 500, 38 px, Blanc de Trait, sur deux lignes, à la suite de l'invite orange. Apparition en frappe à 0:51,5 (environ 2,6 s). À la validation (0:54,1), la ligne clignote une fois en Orange Incandescent.
- **Réponse :** trois lignes Gris de Veille, 38 px, défilent en frappe rapide : « Analyse de la scène… », « Animation des scènes… », « Vidéo prête. », la dernière précédée d'une coche Orange Incandescent. Tout est affiché à 0:55,4.
- **Son :** quelques frappes de clavier, puis un « power-up » ascendant à la validation.

**Beat 2 : le pont se construit (0:57 – 1:04)**

- **Caméra :** dézoom vers le plan large du précipice (0:57 – 0:58). Le terminal se replie en un point lumineux orange qui tombe sous le pied du premier Tousfou.
- **Décor :** les couleurs sont pleinement restaurées. Le panneau DEADLINE reste planté en x 40 % ; le designer reste immobile dans sa pelote en x 30 % et suit le pont des yeux.
- **Objet :** de 0:57,5 à 1:00,25, le pont se construit depuis le bord gauche (x 45 %) jusqu'à la rive droite (x 75 %). 12 planches lisses aux bords arrondis, Braise Sourde, au liseré lumineux en traînée de marque, une toutes les 250 ms (un demi-temps). Chaque planche descend de 40 px et se pose avec un léger rebond. Le pont est droit et net, à l'opposé du gribouillis de la séquence 3.
- **Personnage :** la première planche se pose exactement sous le pied du premier Tousfou. Il regarde ses pieds, puis la caméra, yeux ronds d'incrédulité ; puis tous passent à la joie.
- **Texte :** « Une commande », Figtree 700, 48 px, Blanc de Trait, en (50 %, 15 %). Montée en fondu à 1:00.
- **Son :** « whoosh » du terminal qui tombe, un « tink » sur une planche sur deux, et sur la dernière.

**Beat 3 : la traversée (1:04 – 1:14)**

- **Caméra :** travelling latéral lent qui suit la file de gauche à droite.
- **Personnages :** les 4 Tousfous qui restent (le designer est resté sur la rive gauche dans sa pelote, un autre a disparu dans le précipice) traversent au pas. Leurs touffes rebondissent en vague, avec 60 ms de décalage d'un Tousfou à l'autre. Sur la rive droite, chacun fait un petit saut de joie puis entre dans la porte lumineuse. À côté de la porte se dresse un poteau : dès que le premier Tousfou a fini de traverser le pont (il pose le pied sur la rive droite, 1:07,1), un drapeau suisse (rouge, croix blanche) se hisse en haut du poteau en 1 s et flotte au vent. À chaque Tousfou qui passe la porte, une salve de confettis aux couleurs de la traînée de marque éclate au-dessus de la porte.
- **Objets :** au fil de la traversée, le pont s'enrichit. À 1:06, des rambardes se dessinent d'un trait continu ; à 1:08, des lanternes Orange Incandescent s'allument une à une sur les poteaux ; à 1:10, une onde aux couleurs de la traînée parcourt le tablier.
- **Textes :** « Du motion design pro » à 1:06, puis « En quelques minutes » à 1:10. Même style et même position que « Une commande » ; chaque carton remplace le précédent en fondu flouté.
- **Son :** un « boing » à chaque saut de joie, le drapeau qui se hisse, une « pièce » à chaque Tousfou qui passe la porte, un carillon discret sur le dernier.

Le terminal n'affiche que l'idée de départ. Le déroulé complet qui fabrique ce film reste hors champ.

## Séquence 6 — La chute comique (1:14 – 1:24)

Le designer se libère et savoure la fin de ses galères, en pause café pendant que les Tousfous jouent sur le pont pulse-motion.

**Beat 1 : le designer se libère (1:14 – 1:17)**

- **Caméra :** plan moyen sur la rive gauche.
- **Personnage :** le designer, toujours prisonnier de sa pelote (la même qu'en séquences 3 à 5), en x 30 %. Ses yeux vont vers le pont pulse-motion à droite, reviennent sur sa pelote, puis il soupire : la pelote se soulève et retombe.
- **Action :** il s'extirpe par le haut d'un coup sec, comme un bouchon, et retombe sur ses pieds. Il compacte la pelote en boule et la lance par-dessus son épaule sans regarder. Elle sort du cadre en haut à gauche.
- **Son :** soupir, « fwip », « pop » de bouchon, « swoosh » du lancer, puis un « splat » hors champ.

**Beat 2 : la pause café (1:17 – 1:24)**

- **Caméra :** plan large, avec une très lente avancée.
- **Décor :** le pont pulse-motion terminé (planches, rambardes, lanternes), le panneau DEADLINE toujours planté en x 40 %.
- **Objets :** une chaise longue lisse Mauve de Rémanence apparaît en fondu vers x 30 %, avec une tasse de café fumante Blanc de Trait dans la main du designer.
- **Personnage :** le designer s'y allonge (dos incliné, jambes tendues) et boit deux gorgées. Il reste allongé jusqu'à la fin de la séquence et regarde les sauteurs.
- **Arrière-plan :** sur le pont, trois Tousfous rebondissent comme sur un trampoline. Chaque saut déclenche une animation différente du pont : il ondule, puis se teinte aux couleurs de la traînée, puis forme une vague qui projette les trois Tousfous plus haut ; les rebonds s'amortissent jusqu'à la fin de la séquence.
- **Texte :** « Vos formations, vos produits, vos idées. », Figtree 700, 40 px, Blanc de Trait sur un bandeau Noir de Chambre à 80 %, en bas du cadre (50 %, 88 %), sans cacher le designer ni le pont. Montée en fondu à 1:20,5, tient jusqu'à 1:24.
- **Son :** « plop » quand il s'installe, un « slurp » à chaque gorgée, un « boing » à chaque rebond.

## Séquence 7 — Les pancartes (1:24 – 1:40)

L'appel à l'action, porté par deux Tousfous maladroits et leurs pancartes.

**Beat 1 : la grande annonce (1:24 – 1:26,5)**

- **Caméra :** plan moyen fixe (très léger zoom continu).
- **Décor :** fond Noir de Chambre uni. Le sol est une corniche lisse Braise Sourde à y 80 %, plate et à bord net, bordée d'une fine mousse mauve, qui s'arrête en x 85 % par un bord droit, avec un halo Braise Sourde au sol qui respire.
- **Personnage :** le Tousfou n°1 entre par la gauche en marchant, sa pancarte en main. Il s'arrête en x 40 % et, à 1:25,5, lève sa pancarte au-dessus de sa tête à deux mains.
- **Objet :** pancarte Blanc de Trait aux coins arrondis de 16 px, largeur 58 % du cadre, centrée en (45 %, 31 %), tenue par un long manche. Le texte est à l'envers. Le Tousfou ne remarque rien et sourit.
- **Son :** « whoosh » de la pancarte levée.

**Beat 2 : la correction (1:26,5 – 1:28)**

- **Personnage :** il regarde la pancarte (1:26,5), ses yeux s'écarquillent (1:27). Il fait pivoter la pancarte de 180° d'un coup sec (300 ms, avec rebond) à 1:27,5, puis sourit à la caméra.
- **Texte sur la pancarte :** « Ne laissez plus vos animations tomber dans le vide. », Figtree 700, 38 px, Noir de Chambre, sur deux lignes. Dessous : « Essayez pulse-motion », Figtree 900, 50 px, Orange Incandescent légèrement assombri pour rester lisible sur le blanc. Lisible de 1:27,8 jusqu'à la pose des pancartes.
- **Son :** bip d'erreur quand il découvre que la pancarte est à l'envers, « pièce » à la fin du pivot.

**Beat 3 : le collègue (1:28 – 1:30,75)**

- **Personnage :** le Tousfou n°2 entre en courant par la droite à 1:28, freine en glissant accroupi et s'arrête en x 52 %, puis lève sa petite pancarte.
- **Objet :** une petite pancarte Blanc de Trait, largeur 38 %, sous la grande : « Lisez le commentaire », Figtree 700, 38 px, Noir de Chambre, avec une grosse flèche Orange Incandescent épinglée dessus, qui pointe vers le haut.
- **Action :** le n°1 le regarde, l'air las. Il tend le bras vers la flèche, qui se décroche, tourne et se repique pointe vers le bas, vers la zone des commentaires LinkedIn (1:30).
- **Son :** « whoosh » de l'arrivée, « swoosh » du freinage, « tut-tut », puis un « ding » quand la flèche est repiquée.

**Beat 4 : la sortie (1:30,75 – 1:34,2)**

- **Personnages :** à 1:30,75, les deux Tousfous se tapent dans la main en hauteur (petites étoiles Orange Incandescent au contact) et des feux d'artifice aux couleurs de la traînée de marque partent derrière eux. Ils posent leurs pancartes (elles tombent à plat et disparaissent) et repartent vers la droite au pas à 1:31,5. Le n°2 pose un pied au-delà du bord de la corniche. Arrêt sur image de 500 ms à 1:33, puis trois planches pulse-motion se posent sous son pied avec le même rebond qu'en séquence 5, et ils sortent du cadre sans rien remarquer.
- **Son :** « clap » de la tape dans la main, « bonk » des pancartes posées, deux « tink » pour les planches.

**Beat 5 : le logo (1:34,2 – 1:40)**

- **Décor :** de 1:34,2 à 1:34,9, tout le décor (sol, halo, planches) disparaît en fondu : le logo arrive sur un fond Noir de Chambre uni.
- **Logo :** à 1:35, le logo pulse-motion apparaît en (50 %, 40 %), largeur 50 %, en onde (20 ms par lettre) aux couleurs de la traînée de marque.
- **Textes :** dessous, en (50 %, 52 %) : « le plugin motion design pour Claude Code », Figtree 500, 38 px, Gris de Veille, en montée en fondu (1:35,4). Puis en (50 %, 61 %) : « Merci d'avoir regardé », Figtree 500, 41 px, Blanc de Trait (1:35,7). Les deux restent jusqu'à la dernière image, qui tient 0,5 s sans mouvement.
- **Effet :** feux d'artifice derrière le logo : trois salves de fusées partent du bas et éclatent vers 60 % de la hauteur, aux couleurs de la traînée, et s'éteignent avant la dernière image.
- **Son :** « souffle » pendant le fondu du décor, carillon à l'arrivée du logo, puis l'accord final de la musique.

## Notes de production

| Séquence | Timing | Durée |
| --- | --- | --- |
| 1 — Générique d'ouverture | 0:00 – 0:20 | 20 s |
| 2 — L'installation | 0:20 – 0:26 | 6 s |
| 3 — Le problème | 0:26 – 0:43 | 17 s |
| 4 — Le tournant | 0:43 – 0:51 | 8 s |
| 5 — La démo pulse-motion | 0:51 – 1:14 | 23 s |
| 6 — La chute comique | 1:14 – 1:24 | 10 s |
| 7 — Les pancartes | 1:24 – 1:40 | 16 s |

- **Tempo :** 120 bpm sur tout le film, soit 2 temps par seconde. Toutes les séquences commencent sur un temps ; passage sec d'une séquence à l'autre (coupe), sans fondu enchaîné.
- **Marge :** la séquence 6 peut perdre 2 à 3 secondes (fin de la pause café) si la vidéo doit raccourcir.
- **Lecture muette :** sans voix off, tout passe par les cartons et l'expressivité des yeux et des touffes. Chaque carton reste lisible au moins 2 secondes une fois entièrement affiché.
- **Post LinkedIn :** placer le lien d'installation dans le premier commentaire, comme l'annonce la pancarte de la séquence 7.
- **Personnages :** les Tousfous restent une création originale (corps de stickman, sans tunique ni design repris d'un jeu existant). Les bruitages sont des sons originaux.
- **Son :** musique composée par pulse-motion (ambiance inspirante, 120 bpm, volume 0,45), recalée sur chaque séquence. Bruitages : 21 sons originaux fabriqués pour le film dans `assets/sons/` (`boing`, `bonk`, `plop`, `pop-touffe`, `chut`, `tsk`, `sifflet-chute`, `explosion`, `splat`, `piece`, `tink`, `crayon`, `gomme`, `craquement`, `clap`, `fwip`, `slurp`, `scratch`, `power-up`, `tut-tut`, `drapeau`), complétés par les sons de pulse-motion (`whoosh`, `swoosh-inverse`, `pop`, `clic`, `tic`, `impact`, `montee`, `carillon`, `ding`, `blip`, `souffle`). Au plus 3 sons qui démarrent dans la même seconde : les actions répétées vite (touffes, atterrissages, planches) n'ont un son qu'une fois sur deux. Tout est mixé dans la page et dans l'export MP4.

## Fabrication avec pulse-motion

Un projet, une scène composée librement par séquence (`scenes/01-generique.html` … `scenes/07-pancartes.html`). Ce que chaque effet demande au moteur :

| Besoin du scénario | Outil pulse-motion |
| --- | --- |
| Format carré, 25 images/s | `"format": { "ratio": "1:1", "ips": 25 }`, style `tech-sombre`, ton sombre, charte PulseIA dans `charte/` |
| Tout calé sur la musique | musique composée (`"musique": { "generee": "inspirant", "tempo": 120, "intensite": 0.5, "volume": 0.45 }`), qui se cale sur l'image : une section par séquence, pile à son début ; gestes calés en temps `data-start="4t"` |
| Bruitages | une balise vide par son, directement dans la scène et hors des conteneurs animés, à l'instant de l'action : `<span data-son="assets/sons/bonk.wav" data-start="14.02"></span>` ; `data-son-volume` pour doser ; `"bruitages": { "volume": 0.9 }` dans le déroulé |
| « PULSE-MOTION » en onde, logo final | `data-lettres="onde" data-pas="0.02"` + `class="pm-degrade"` (traînée en `--pm-degrade`) |
| « VIBE CONNECTION » révélé dans la fumée | effet de particules `fumee` (Mauve de Rémanence, Gris de Veille) devant le titre, titre en `data-mots="flou"` + `class="pm-degrade pm-contour"` |
| Cartons en frappe, en fondu flouté | `data-lettres="frappe" data-pas="0.03"`, `data-mots="flou"` |
| Gros plan d'ouverture, dézoom, secousse du logo | `data-camera="zoom 3→1 1.2+0.4 cubic-out; y 72→50 1.2+0.4 cubic-out; secousse 0.6 1.8+0.2"` |
| Travelling avec parallaxe (séquences 2 et 5) | `data-camera="x 50→100 3+3 linear"` + `data-profondeur` sur chaque plan du décor |
| Accéléré ×2 du designer (séquence 3) | `data-vitesse="9+2 x2"` sur le conteneur du décor, du pont, du designer, du crayon et de la pelote : un personnage vit au temps de ce qui le contient |
| Arrêt sur image désaturé (séquence 4) | `data-gel="1+7"` sur le décor, le panneau et la pelote + `saturation 1→0.6` puis `0.6→1` dans la caméra ; les Tousfous hors du conteneur figé, sans action pendant le gel, puis l'action `regarder` vers le terminal |
| Planches posées une par une | `data-start` en demi-temps (`0.5t` d'écart), courbe `back-out` |
| Étoiles de la tape dans la main | effet de particules `paillettes` |
| Explosion du Tousfou au fond du précipice (séquence 3) | effet `explosion` à l'impact, calé sur la fin de sa chute |
| Drapeau suisse hissé (séquence 5) | drapeau dessiné en SVG (rouge, croix blanche), hissé en 1 s le long du poteau quand le premier Tousfou atteint la rive droite |
| Confettis à chaque Tousfou qui passe la porte (séquence 5) | quatre effets `confettis`, chacun calé sur l'entrée d'un Tousfou dans la porte : exception assumée à la règle « une seule fois par vidéo » |
| Feux d'artifice (séquence 7) | effet du projet `effets/feu-artifice-final.json` (variante de `feu-artifice`, trois salves qui s'éteignent avant la dernière image), une fois à la tape dans la main, une fois derrière le logo |
| Décor qui disparaît avant le logo (séquence 7) | conteneur du décor en `data-tween="opacity 1→0 sine-inout"` de 0,7 s ; le feu d'artifice et le logo restent hors de ce conteneur |
| Files de Tousfous (séquences 1 à 5) | groupes : `data-groupe`, `data-ecart`, `data-decalage`, `data-depart="commun"` (trappe), `data-membre` pour un geste à part |
| Attraper, se taper dans la main, regarder | actions `atteindre` (rencontre de deux mains) et `regarder` (une cible, ou la caméra) |
| Tousfous | personnages de pulse-motion avec le dessin « touffu » : `<div data-personnage="touffu" data-x="…" data-sol="…" data-taille="14">` et leurs actions minutées (`marcher`, `courir`, `glisser`, `bondir`, `pose`, `jouer`, `tourner`, `expression`, `regarder`, `atteindre`). Copie du dessin dans `personnages/dessins/touffu.json`, yeux plus petits et écartés pour qu'ils restent dans la tête sans se recouvrir à tous les angles |
| Gestes propres au film | mouvements rangés dans `personnages/` du projet : `clips/chute-fesses` (chute contre le N), `clips/atterrir` (écrasement à la sortie de la trappe), `clips/battre-des-bras` (chute dans le précipice), `poses/allonge` (chaise longue) |
| Tousfous qui montent du bas (séquence 1) | sol de départ sous l'image, puis l'action `glisser` jusqu'au rebord ; le designer bondit de côté et hors de sa pelote avec `bondir` |
| Crayon, pancartes, flèche, tasse, pelote | objets de la scène tenus en main : `data-tenu-par="#designer"`, `data-main` (`deux` pour les pancartes et la pelote), `data-orientation="main"` pour le crayon, `data-lacher="tombe"` pour les pancartes |
| Pelote du designer (séquences 3 à 6) | un seul dessin SVG, recopié à l'identique (même taille 7 % × 7,6 % du cadre, même place autour du designer) dans les quatre scènes |
| Terminal, pont, panneau DEADLINE, trappe, chaise longue | éléments dessinés en SVG dans les scènes, animés aux instants du scénario |

* [x] Valider la version courte de la commande affichée dans le terminal en séquence 5 (`/pulse-motion:creer …`)
* [x] Composer la musique à 120 bpm et fabriquer les bruitages originaux
* [x] Exporter le film en MP4 (`sortie/vibe-connection.mp4`, export fidèle, avec le son)
* [ ] Préparer le lien d'installation pour le commentaire
* [ ] Dessiner le designer (béret Pénombre Mauve sur sa touffe) et le petit Tousfou en silhouette du générique
* [ ] Créer les gestes propres au film encore approchés : « chut » avec le doigt sur la bouche, touffe qui s'aplatit puis se redresse comme un ressort, visage gêné aux yeux plissés, mesurer avec le pouce, marche fière torse bombé, soupir aux épaules qui se soulèvent, pancartes posées sur l'épaule
* [ ] Régler l'humeur de la musique par séquence si besoin (silence pendant le tournant, plus intense pendant la démo, plus calme pendant la pause café)

La fabrication pas à pas, commande par commande, est le tutoriel 3 du wiki : `docs/tutoriels/vibe-connection.html`.
