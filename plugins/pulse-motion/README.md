# Pulse Motion

Plugin Claude Code qui fabrique, sur votre ordinateur et sans cloud, des vidéos de motion design (CSS et SVG animés), livrées en page HTML animée autonome et en MP4 (fabriqué dans Chrome ou Edge, sans rien installer de plus).

## Installation

Dans Claude Code, une commande à la fois :

```
/plugin marketplace add jdelauney/pulse-motion
/plugin install pulse-motion@pulse-motion
```

Fermez puis relancez Claude Code.

## Ce que vous pouvez demander

Tout se fait par une demande dans Claude Code, jamais dans un terminal : une phrase suffit, ou la commande commençant par `/`. Pulse Motion ne crée une vidéo ou un style que si vous le demandez.

| Commande | Comment la lancer | Exemples de demandes |
|---|---|---|
| `/pulse-motion:creer` | une phrase, ou avec le `/` | « fais-moi une vidéo d'une minute sur la chaîne du froid », « que sait faire Pulse Motion ? », `/pulse-motion:creer Les règles d'hygiène en cuisine` |
| `/pulse-motion:style` | une phrase, ou avec le `/` | « crée mon propre style, sombre avec des touches néon », « adapte le style éditorial à notre marque » (ce qu'on peut changer sans risque, cinq changements par tour, le style de départ à gauche et le vôtre à droite), `/pulse-motion:style Un style papercraft aux couleurs pop-art` |
| `/pulse-motion:retoucher` | une phrase, ou avec le `/` | « ralentis la scène 3 », « baisse la musique », « ouvre l'aperçu », « montre-moi les autres styles » (chacun joue la même petite histoire, on choisit en regardant), « fais une planche des scènes 2 et 3 », « note ma vidéo », « ça fait cheap », « enregistre ma charte », « annule », « rétablis », « garde cette version sous le nom envoyée au client », « un pop-in sur le titre », « mets un #006 sur le titre » (dictionnaire de mouvements : « quels mouvements existent ? »), « mets une icône de camion à côté du titre », « ajoute une flèche de Client à Serveur quand je dis envoie », « entoure le prix quand je dis cher », « fais un graphique en barres avec ces chiffres », « montre la formule =SOMME(B2:B13), puis passe à la moyenne », « laisse la caméra bouger toute seule », « plus rythmé pour les réseaux », « ajoute des petits sons » |
| `/pulse-motion:voix` | une phrase, ou avec le `/` | « j'enregistre la scène 2 », « j'ai un fichier de ma voix », « mets une voix provisoire », « mets une voix de synthèse » (voix française fabriquée sur l'ordinateur, installée avec votre accord, livrable telle quelle), « recale les mots », « fais-moi écouter la musique » |
| `/pulse-motion:exporter` | une phrase, ou avec le `/` | « exporte ma vidéo », « exporte-la pour LinkedIn », « une version légère pour l'envoyer par courriel », « un GIF de la scène 3 », « un PDF des scènes », « une version à fond transparent pour mon montage » |
| `/pulse-motion:filmer` | une phrase, ou avec le `/` | « filme comment on crée une facture sur app.exemple.fr », « j'ai enregistré mon écran », « floute les noms des clients » (un site en ligne avec votre accord, votre compte où vous vous connectez vous-même, une page de votre ordinateur ou une vidéo de votre écran, montrés avec pointeur, zooms et projecteur ; données personnelles floutées dans les images) |
| `/pulse-motion:reprendre` | une phrase, ou avec le `/` | « où en est ma vidéo ? », « on reprend » |
| `/pulse-motion:outils` | une phrase, ou avec le `/` | « vérifie mon ordinateur », « installe la transcription », « installe ffmpeg », « installe la voix de synthèse » |
| `/pulse-motion:dessiner-personnage` | une phrase, ou avec le `/` | « dessine-moi un cuisinier rondouillard avec une toque », « change sa tenue en rouge » |
| `/pulse-motion:decouper-personnage` | une phrase, ou avec le `/` | « voici notre mascotte en SVG, fais-la marcher », « découpe ce dessin pour l'animer » |
| `/pulse-motion:animer-personnage` | une phrase, ou avec le `/` | « fais une pose où il se gratte la tête », « il marche trop vite », « montre-moi la course de face » |
| `/pulse-motion:atelier-personnages` | une phrase, ou avec le `/` | « ouvre l'éditeur de personnage », « je veux régler son salut moi-même » |
| `/pulse-motion:atelier-particules` | une phrase, ou avec le `/` | « ouvre l'éditeur de particules », « laisse-moi régler les étincelles » |

## Prérequis

- Claude Code
- Node.js 20 ou plus (aucune dépendance à installer)
- Chrome ou Edge pour regarder l'aperçu

## Contenu

| Dossier | Rôle |
|---|---|
| `skills/` | `creer`, `style`, `retoucher`, `voix`, `exporter`, `filmer`, `reprendre`, `outils`, `dessiner-personnage`, `decouper-personnage`, `animer-personnage`, `atelier-personnages`, `atelier-particules` (voir « Ce que vous pouvez demander ») |
| `agents/` | `animateur` : écrit une scène ; `critique` : relit la vidéo d'après ses planches, comme un spectateur qui ne l'a pas vue fabriquer |
| `moteur/` | Moteur JavaScript inclus dans chaque page : courbes, minutage, transitions, horloge déterministe, lecteur, débordements ; écrans des tutoriels de logiciel (capture dans un cadre de navigateur, de fenêtre, de téléphone ou de tablette, pointeur à graine, clics, projecteur, zooms enchaînés, texte tapé) et blocs « interface » génériques (`moteur/blocs/`, `pulse-motion bloc`) ; calque de dessin des vidéos explicatives (`moteur/dessin/` : relevé des boîtes de chaque scène, flèches entre éléments, annotations au mot, tracé à main levée à graine, graphiques de données (barres, courbe, anneau, nombres à la française), code coloré qui se transforme d'une étape à l'autre, dessins libres par `M.dessin`) ; caméra automatique (`moteur/camera-auto.js` : plans calculés depuis le relevé, rapprochement, recul final, sans couper un texte) ; texte dit balisé (repères, forme affichée et forme dite), alignement des nombres, années, décimales et sigles, allure globale, ampleur par scène et bruitages automatiques par type d'entrée ; vingt-trois bruitages synthétisés (dont les sons tenus du feutre, de la craie, du crayon et du papier), calés sur leur pic, moments forts (la musique se tait avant), cordes pincées par modèle physique et huit ambiances musicales ; formules en MathML natif (police mathématique embarquée seulement si besoin, `vendor/polices/`) ; lecture image par image des applications filmées (`moteur/film.js`) ; texte écrit à la main lettre après lettre (`data-lettres="ecrit"`) ; modules d'un style, inclus seulement s'il les déclare (`moteur/medium/` : encre des tableaux redessinée dans un canevas, au feutre ou à la craie ; « une seule ligne » du carnet ; isométrie des styles `iso-*`, avec sa feuille `iso.css` ; encres du crayon gras et du riso, aplats surimprimés du riso) ; capture et export MP4 (servis par l'aperçu seulement) |
| `scripts/` | Assemblage, aperçu (remarques sur l'image, réglages rapides, comparaison de versions), contrôles (mise en page, réalisation, vérité des chiffres, images figées, son mesuré), état, historique (rétablir, versions nommées, avant / après), export par usage (`scripts/usages.json` : web, réseaux, présentation, master, courriel, brouillon) et vérifié (`sortie/verification.json`), livrables joints (couverture, chapitres, crédits), extraits, GIF, cadre de téléphone, PDF des planches, flou de mouvement du master, fond transparent (MOV ou WebM) et vidéo en boucle ; tournage d'une application web, en ligne après accord ou locale (parcours en phrases, connexion par la personne, profil du navigateur hors du projet, flou des données personnelles dans les images, prises figées dans `films/`), import d'une vidéo de l'écran ou d'une animation (ffmpeg ou Chrome) ; `pm.js` derrière la commande `pulse-motion` (`bin/`) |
| `vendor/` | Mediabunny (MPL-2.0), assemblage du MP4 ; icônes Lucide (ISC), posées dans une scène par `data-icone` et cherchées en français (`references/icones-fr.json`) ; polices du code et des formules (JetBrains Mono, Libertinus Math, OFL), embarquées seulement si besoin ; voir les `PROVENANCE.md` |
| `styles/` | Dix-neuf styles livrés (six essentiels ; `info-sans-son`, l'info qui se lit son coupé ; `plan-technique`, un dessin technique qui se trace ; `lancement`, le film de lancement d'un produit ; `tableau-blanc`, le feutre sur tableau blanc ; `tableau-noir`, la craie sur ardoise ; `carnet`, le carnet de croquis qui se dessine ; `recit-donnees`, le graphique qui raconte ; `iso-infographie`, le système en diorama isométrique ; `iso-album`, la règle du quotidien jouée par de petits personnages ; `crayon`, la page d'album au crayon gras et au lavis ; `papier-decoupe`, les couches de papier et leurs ombres ; `riso`, les encres surimprimées ; `pictogrammes`, la signalétique qui bat sur les temps) : CSS, charte, polices, neuf scènes toutes faites (dont le moyeu, une idée au centre et ses parties reliées), identité (catégorie, usages, mots-clés pour les trouver par leur nom de médium, palette sonore) |
| `personnages/` | Personnages animés : poses, mouvements, expressions, gabarits et six dessins livrés (`touffu`, une écolière, un soignant, une grand-mère, un technicien, une cuisinière ; bibliothèque du plugin, une vidéo peut avoir les siens) |
| `references/` | Consignes lues par Claude : moteur, rythme, contrôles ; fiches de style en 11 sections (essence, matières, couleur, mouvement, caméra, son, gestes, pièges, variation ; l'animateur n'en lit que l'extrait utile), contenu témoin qui montre chaque style (« la chaîne du froid » : deux images fixes et une boucle) et style personnel guidé (trois groupes de réglages, journal des changements, base signalée quand elle change) ; savoir-faire de réalisation (doctrine `realisation`, directions, revue notée, anti-clichés, pièges, mixage fin, compositions, actifs de marque, cadres et pointeur, écran des tutoriels (`ecran`), vidéo explicative (`explication` : flèches, annotations, main levée, graphiques, code, formules, cinq squelettes dont le moyeu, caméra automatique, voix d'abord, allure, bruitages automatiques), sorties, scènes témoins, recettes de rythme) ; remarques de la personne (impressions → réglages, remarques épinglées sur l'image) et réglages rapides de l'aperçu ; `moteur`, `particules`, `audio` et `rythme` en un tronc et des parties lues à la carte (`moteur/`, `particules/`, `audio/`, `rythme/`) ; `mouvements/` : le dictionnaire de mouvements numérotés |
| `modeles/` | Neuf modèles de vidéo (`modeles/videos/`) : formation courte, tutoriel logiciel (scènes filmées à l'écran, variante « astuce en 30 s » sur téléphone), vidéo explicative (caméra et petits sons automatiques), présentation de produit, histoire, publication pour les réseaux, accueil, pitch, annonce |
| `exemples/` | « La chaîne du froid » : vidéo de formation de 60 s ; un exemple fini par modèle de vidéo, dont « Créer une facture dans Facturo » (30 s, 4 étapes filmées) et « Du devis au paiement : le trajet d'une facture » (vidéo explicative de 66 s : moyeu, flèches, annotation, formule de tableur, graphique, caméra automatique) ; « Facturo », l'application d'essai à filmer (`exemples/tutoriel-logiciel/appli/`) |
| `tests/` | Tests (`npm test`), dont des tests dans Chrome ou Edge sans fenêtre |

## Tests

```bash
cd plugins/pulse-motion
npm test
```

La non-régression visuelle du moteur compare deux vidéos étalons (`tests/fixtures/etalon/`) à leurs images de référence, enregistrées par système ; quand un changement de rendu est voulu, `node scripts/lancer-tests.js --etalon` les réenregistre (à dire dans le message de commit). Les tests unitaires tournent aussi sur Windows, macOS et Linux à chaque envoi (`.github/workflows/tests.yml`) ; la phase navigateur se lance sur le poste de développement. Les évaluations de déclenchement des compétences (`tests/evaluations/`) se lancent à part, avec `claude plugin eval` (mode d'emploi en tête de `tests/evaluations/evaluer.js`), et un test copie le plugin hors du dépôt pour fabriquer et exporter l'exemple comme une fois installé.

Pour contribuer (installer le dépôt, règles, ajouter un style, un effet, un mouvement ou un modèle) : `CONTRIBUTING.md` et `ARCHITECTURE.md`, à la racine du dépôt.

## Licence

MIT. Le code ou les tracés repris citent leur origine en tête de fichier ; licences des polices : `styles/clair-pedagogique/polices/LICENCES.md`.
