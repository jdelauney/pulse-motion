# Spec – Pulse Motion, brique 3 : catalogue de styles et charte

> 2026-10-11 · Statut : à relire · Source : `docs/brief.md`, spec du socle (`2026-10-11-socle-design.md`), références `E:\IA-PULSE\pulse-vibe` (identité, directions, lexique, glossaire) et `E:\IA-PULSE\projets\pulse-boilerplate` (import Bunny Fonts)

## 1. Intention

Faire que deux vidéos Pulse Motion ne se ressemblent pas : la personne choisit son style parmi 3 proposés, rendus **sur son propre déroulé**, applique **sa** charte (couleurs tirées de son logo, polices de sa marque), la réutilise d'une vidéo à l'autre, et peut créer **son propre style** (« un style papercraft aux couleurs pop-art »).

### Critères de réussite

- Le catalogue livré compte 6 styles : `clair-pedagogique` (existant) et 5 nouveaux, chacun avec les 8 scènes du contrat.
- Pour le projet de référence « La chaîne du froid », la planche comparative montre ses 2 premières scènes dans 3 styles, en quelques secondes, et le parcours rapide garde **un seul accord** (déroulé + style).
- Changer de style (« passe en style éditorial ») garde le déroulé et les textes ; seules les scènes composées librement sont à réécrire, et le changement s'annule.
- Un logo PNG ou SVG donne une charte (primaire, accent) dont les contrastes sont vérifiés sur le fond du style choisi.
- Une charte enregistrée (« charte client Dupont ») s'applique à une nouvelle vidéo en une commande.
- Une police de la personne (fichier ou nom Bunny Fonts) est embarquée après contrôle de licence et de couverture des caractères français.
- Un style personnel créé avec `/pulse-motion:style` passe `pulse-motion style verifier` et apparaît dans les propositions.

## 2. Décisions de cadrage

| Sujet | Décision | Raison |
|---|---|---|
| Partage des scènes entre styles | Vocabulaire commun (8 types, mêmes clés de texte), HTML et CSS propres à chaque style (approche A) | Vraies différences de mise en page ; changement de style fiable |
| Catalogue de départ | 6 styles contrastés | Assez pour proposer 3 styles pertinents par genre |
| Montrer les styles | Planche comparative sur le déroulé de la personne (2 scènes × 3 styles) | Elle choisit en voyant sa vidéo |
| Moment du choix | Avec le déroulé (parcours rapide : un seul accord) ; accord séparé en parcours accompagné | Respecte le brief (peu d'accords) |
| Charte | 4 volets : couleurs du logo, charte réutilisable, adaptation clair/sombre, polices de la personne | Choix de la personne |
| Identité d'un style | Fiche `identite.json` inspirée de `design.md` et `directions.md` de pulse-vibe | Structure éprouvée, réduite à ce qui sert une vidéo |
| Polices | Téléchargement Bunny Fonts sur commande explicite, mécanisme de pulse-boilerplate (`assertKnownFamily`, `pickLatinFiles`, feuille refusée si une URL sort de l'hôte) | Polices libres, sans dépendance ; vidéo et export restent locaux |
| Vocabulaire | Lexique (mots de l'outil, pour la personne) et glossaire (mots du métier, dans la charte), comme pulse-vibe | Explications non répétées ; graphie du client respectée |
| Styles personnels | Skill `/pulse-motion:style`, rangés dans `~/.pulse-motion/styles/` | Singularité au-delà du catalogue livré |
| Dépendances | Aucune : Node ≥ 20, bibliothèque standard (`zlib` pour PNG/WOFF, brotli pour WOFF2) | Décision du socle |
| Licences | Polices OFL (ou Apache/UFL) seulement dans les styles livrés | Décision `0001-licences-compatibles-mit.md` |

## 3. Architecture

### Dossiers

```
plugins/pulse-motion/
  styles/<nom>/                 styles livrés (6)
    catalogue.json              8 scènes : nom, rôle, durée, clés de texte et longueurs max
    identite.json               identité du style (§ 4)
    style.css                   mise en page, décor, variante [data-ton="sombre"] si prévue
    scenes/<type>.html          8 scènes toutes faites
    polices/*.woff2 + LICENCES.md
  references/styles/<nom>.md    guide de l'animateur (« L'essentiel », scènes, à faire / à éviter)
  references/styles/recommandation.json   genre → styles recommandés (§ 5)
  modeles/lexique.md            modèle du lexique (§ 9)

~/.pulse-motion/                données de la personne (créé à la demande)
  chartes/<nom>/                charte.json, logo, polices/, glossaire.md
  styles/<nom>/                 styles personnels, même structure qu'un style livré
  lexique.md

<projet>/
  deroule.json                  "style", "charte" (réglages ponctuels + "modele")
  charte/                       copie de la charte appliquée (charte.json, logo, polices/, glossaire.md)
```

Le dossier `~/.pulse-motion` peut être remplacé par la variable d'environnement `PULSE_MOTION_DOSSIER` (utilisée par les tests).

### Unités et responsabilités

| Unité | Rôle |
|---|---|
| `scripts/styles.js` | Trouver un style (livré puis personnel), lister, recommander par genre, vérifier le contrat |
| `scripts/comparer.js` | Planche comparative : 2 scènes du déroulé × 3 styles |
| `scripts/changer-style.js` | Recopier les scènes toutes faites du nouveau style, lister les scènes libres, passer par l'historique |
| `scripts/charte.js` | Enregistrer, lister, appliquer une charte ; détecter une charte enregistrée modifiée |
| `scripts/couleurs.js` | Conversions sRGB ↔ OKLab/OKLCH, contraste WCAG, ajustement de luminosité |
| `scripts/logo.js` | Lire les couleurs d'un SVG et d'un PNG (décodeur PNG maison), extraire primaire et accent |
| `scripts/polices.js` | Bunny Fonts (catalogue, feuille CSS, choix du latin, téléchargement) et police fournie (`fsType`, `cmap`, WOFF/WOFF2) |
| `scripts/vocabulaire.js` | Lexique et glossaire : lecture, ajout trié sans doublon, règle de contrôle |
| `scripts/assembler.js` | Fusion de la charte à 4 étages, ton, variables dérivées (modifié) |
| `scripts/controler.js` | Règles `contraste` et `glossaire` (modifié) |
| `skills/style/SKILL.md` | Création d'un style personnel |
| `skills/creer`, `retoucher`, `reprendre` | Planche comparative avec le déroulé, changement de style, lexique (modifiés) |

Chaque unité s'utilise par `pulse-motion <commande>` et s'exporte en module pour les tests.

## 4. Le contrat d'un style

### `catalogue.json`

Inchangé dans sa forme. Les 8 types de scène sont obligatoires pour tout style : `titre`, `liste`, `chiffre`, `comparaison`, `etape`, `alerte`, `schema`, `conclusion`, avec **les mêmes clés de texte** que `clair-pedagogique`. Les longueurs maximales et les durées peuvent varier d'un style à l'autre ; le contrôle utilise celles du style du projet.

### `identite.json`

```json
{
  "style": "editorial",
  "famille": "editoriale",
  "personnalite": ["élégant", "exigeant", "calme"],
  "eviter": ["publicité criarde", "ton enfantin"],
  "genres": ["storytelling", "formation"],
  "couleur": {
    "strategie": "sobre-avec-une-touche",
    "tons": ["clair", "sombre"],
    "tonDefaut": "clair",
    "roles": { "primaire": "filets et bandeaux", "accent": "chiffres, flèches, mots soulignés" }
  },
  "typographie": {
    "titres": { "famille": "Fraunces", "categorie": "serif", "graisse": 600 },
    "texte": { "famille": "Instrument Sans", "categorie": "sans-serif", "graisse": 400 }
  },
  "mouvement": { "caractere": "lent", "courbes": ["outCubic", "inOutSine"], "dureeType": 0.8, "transitions": ["fondu", "rideau"] },
  "signature": "Filets fins qui se tracent, titres à empattements en très grand",
  "aFaire": ["Laisser respirer : marges larges"],
  "aEviter": ["Plus de deux couleurs vives dans une scène"]
}
```

Champs obligatoires : `style` (égal au nom du dossier), `famille`, `personnalite` (3 mots), `genres` (au moins un parmi `formation`, `produit`, `storytelling`, `social`), `couleur.tons`, `couleur.tonDefaut`, `typographie.titres`, `typographie.texte`, `mouvement.transitions`, `signature`. Les familles reprennent celles de pulse-vibe : `editoriale`, `moderne`, `technique`, `affirmee`, `chaleureuse`.

`charte.json` du style reste la charte par défaut (couleurs et polices) ; ses couleurs doivent passer le contrôle de contraste dans chaque ton déclaré.

### Vérification du contrat

`styles.js` expose `verifierStyle(dossier) → { ok, erreurs[], avertissements[] }` :

- les 8 scènes existent, chacune contient une seule `<section data-scene="<type>">` et toutes ses clés de texte en `data-texte` ;
- `identite.json` est complet et cohérent avec `catalogue.json` (transitions connues du moteur) ;
- chaque police citée a son fichier et une entrée dans `LICENCES.md` ;
- contraste de la charte par défaut dans chaque ton ;
- **avertissement** pour les effets mal rendus par l'export rapide : `filter: url(`, `<feTurbulence`, `<filter`, `mix-blend-mode`, `backdrop-filter`, avec une solution de rechange proposée (image embarquée, ombre décalée).

Le rendu (débordement, déterminisme) est vérifié dans le navigateur (§ 12).

## 5. Proposer 3 styles

`pulse-motion styles [--genre <genre>]` liste les styles (livrés puis personnels, avec `"personnel": true`). Avec `--genre`, la liste est **classée** :

1. les 2 styles de `recommandation.json` pour ce genre ;
2. un 3ᵉ style d'une **autre famille**, pour le contraste ;
3. les styles personnels vérifiés dont `genres` contient le genre, juste après les 2 premiers ;
4. le reste.

| Genre | Recommandés | Contraste |
|---|---|---|
| `formation` | `clair-pedagogique`, `chaleureux` | `minimal` |
| `produit` | `minimal`, `tech-sombre` | `energique` |
| `storytelling` | `editorial`, `chaleureux` | `tech-sombre` |
| `social` | `energique`, `minimal` | `editorial` |

Tant que le plan 3 n'est pas livré, le classement ne retient que les styles présents.

## 6. Planche comparative

`pulse-motion comparer . <style1>,<style2>,<style3> [--ouvrir]`

- Pour chaque style, le script assemble en mémoire une version du projet : les 2 premières scènes du déroulé (ou les scènes passées avec `--scenes a,b`), leurs **textes** et la **charte du projet**, rendues avec la scène toute faite correspondante du style (une scène libre est remplacée par la scène toute faite de même rôle si `type` est connu, sinon par `titre`).
- Capture par la voie de la planche du plan 3 (images clés hors transitions), une colonne par style, nom et personnalité du style en tête de colonne.
- Sortie : `sortie/comparaison/comparaison.html` + PNG ; avertissement si un texte dépasse la longueur maximale d'un des styles.
- Parcours rapide : la planche s'ouvre en même temps que le tableau du déroulé ; le style recommandé est présélectionné ; un seul accord « déroulé + style ». Parcours accompagné : accord séparé sur le style.

## 7. Changer de style

`pulse-motion changer-style . <nom>`

1. Vérifie que le style existe (livré ou personnel vérifié).
2. Enregistre l'état dans l'historique (comme une retouche ; « annule » restaure).
3. Pour chaque scène du déroulé partie d'une scène toute faite (champ `type` écrit à la fabrication), recopie la scène du nouveau style ; les textes ne changent pas.
4. Liste les scènes composées librement : `{ "aReecrire": ["intro", "carte"] }`. Le skill `retoucher` les confie à l'agent `animateur` avec l'identité du nouveau style.
5. Met à jour `deroule.style`, réassemble, contrôle.

Le déroulé gagne le champ optionnel `scenes[].type` (un des 8 types) ; il est écrit quand l'animateur part d'une scène toute faite, absent pour une scène libre.

## 8. La charte

### Fusion

Du plus faible au plus fort : défaut → `charte.json` du style → `charte/charte.json` du projet → `deroule.charte` (réglages ponctuels). `deroule.charte.modele` garde le nom de la charte enregistrée appliquée.

```json
{
  "couleurs": { "primaire": "#0a6cff", "accent": "#ffb000" },
  "polices": { "titres": "Playfair Display", "texte": { "famille": "MaMarque", "fichier": "polices/MaMarque.woff2" } },
  "logo": "logo.svg",
  "ton": "auto"
}
```

### Chartes enregistrées

- `pulse-motion charte enregistrer <nom> .` : copie `charte/` du projet (et la charte ponctuelle du déroulé) dans `~/.pulse-motion/chartes/<nom>/`, avec une empreinte.
- `pulse-motion charte liste` : nom, couleurs, polices, date.
- `pulse-motion charte appliquer <nom> .` : **recopie** la charte dans `charte/` du projet et écrit `deroule.charte.modele`. Le projet reste autonome.
- `pulse-motion etat` signale « la charte "dupont" a changé depuis son application » si l'empreinte diffère ; rien n'est appliqué sans demande.

### Couleurs tirées du logo

`pulse-motion charte depuis-logo <fichier> [--style <nom>] [--ton clair|sombre]` → propose `{ primaire, accent, ajustements[] }` sans rien écrire ; le skill écrit la charte après accord.

- **SVG** : couleurs des attributs et styles `fill`, `stroke`, `stop-color` (hex, `rgb()`, noms CSS courants), pondérées par leur nombre d'occurrences.
- **PNG** : décodeur maison (`zlib.inflateSync`, filtres PNG 0–4, types de couleur 2, 6, 3 avec palette, 0, 4 ; profondeur 8 bits ; entrelacement refusé avec message). Échantillonnage d'au plus 40 000 pixels.
- **JPEG, WebP, autres** : message « Donnez le logo en PNG ou en SVG ».
- **Extraction** : on écarte transparents (alpha < 0,5), quasi blancs (L > 0,95) et quasi noirs (L < 0,12) en OKLab ; regroupement par k-moyennes (k = 5, graine fixe) ; classement par part de surface × (0,5 + chroma). Primaire = premier groupe ; accent = premier groupe dont l'écart de teinte avec la primaire dépasse 30° (sinon variante plus claire ou plus foncée de la primaire). Logo sans couleur exploitable : on garde la charte du style et on le dit.
- **Contraste** : ratio WCAG sur le fond du ton retenu ; 4,5:1 pour une couleur portant du texte, 3:1 pour les grands titres et les formes (rôle déclaré dans `identite.json`). Si insuffisant, ajustement de la luminosité OKLCH par pas de 0,01, teinte et chroma gardées ; écart rapporté (« accent foncé de 12 % pour rester lisible »). Si aucun ajustement n'y parvient : couleur du style, signalée.

### Adaptation au ton

- `charte.ton` ∈ `clair`, `sombre`, `auto` (défaut). En `auto` : le ton (parmi `identite.couleur.tons`) où primaire et accent contrastent le mieux avec le fond ; à égalité, `tonDefaut`.
- L'assemblage pose `data-ton` sur `#pm-scene` ; les styles à deux tons fournissent `[data-ton="sombre"]` dans `style.css`, qui redéfinit `--c-fond` et `--c-texte`.
- Variables dérivées calculées par l'assemblage : `--c-primaire-lisible`, `--c-accent-lisible` (ajustées au fond), `--c-sur-primaire`, `--c-sur-accent` (noir ou blanc selon le meilleur contraste). Les scènes les utilisent et ne calculent rien.
- `controler.js` : règle `contraste` (seuils `contrasteTexte: 4.5`, `contrasteGrand: 3` dans `seuils.json`) sur la charte finale.

## 9. Les polices

### Bunny Fonts

`pulse-motion police "<famille>" [--graisses 400,700] [--dans <dossier>]` (par défaut le `charte/polices/` du projet courant ; `--dans ~/.pulse-motion/chartes/<nom>` pour une charte enregistrée).

1. Catalogue `https://fonts.bunny.net/list`, lu par `parseBunnyCatalog`.
2. Identifiant = nom en minuscules, espaces → tirets ; `assertKnownFamily` : `^[a-z0-9-]+$` **et** présent dans le catalogue téléchargé.
3. Graisses demandées filtrées par celles de la famille ; aucune → erreur.
4. Feuille `https://fonts.bunny.net/css?family=<id>:<graisses>` ; `extractFontUrls` : **une seule URL hors de `https://fonts.bunny.net/` rejette toute la feuille**.
5. `pickLatinFiles` : un fichier par graisse et style, celui qui couvre U+0000-00FF (le français entier, Œ compris).
6. Écriture en `.part` puis renommage, dans `polices/<Famille>-<graisse>.woff2` ; entrée dans `LICENCES.md` (famille, URLs, date, sha256, « licence du catalogue Google Fonts : OFL, Apache 2.0 ou UFL »).
7. Délai de 15 s par requête ; réseau absent → message, rien d'écrit.

Le réseau ne sert que sur cette commande explicite. Les polices des 5 nouveaux styles sont récupérées ainsi pendant le développement, puis **livrées dans le plugin**.

### Police fournie par la personne

`pulse-motion police <fichier.ttf|otf|woff|woff2> [--role titres|texte] [--dans <dossier>]`

- Lecture sans dépendance : TTF/OTF directement, WOFF par `zlib.inflateSync` table par table, WOFF2 par `zlib.brotliDecompressSync` du flux (les tables `OS/2` et `cmap` ne sont pas transformées).
- **Licence** (`OS/2.fsType`) : bit 0x0002 (intégration interdite) → refus avec message ; bit 0x0004 (aperçu et impression) → avertissement et confirmation demandée par le skill ; le message rappelle que ce contrôle ne remplace pas la licence.
- **Couverture** (`cmap`, formats 4 et 12) : `a–z A–Z 0–9 é è ê ë à â ä î ï ô ö ù û ü ÿ ç œ æ É È Ê À Ç Œ « » ’ € % ° …` ; caractères manquants listés, police de remplacement proposée (celle du style, de même `categorie`).
- Copie telle quelle (pas de conversion) dans `polices/`, entrée dans `LICENCES.md` (« fournie par la personne »).

### Dans la charte

`charte.polices.<role>` : nom d'une police du style, nom d'une police présente dans `charte/polices/`, ou `{ "famille", "fichier" }`. La règle `police-non-embarquee` reste ; son message propose `pulse-motion police`.

## 10. Lexique et glossaire

### Lexique (mots de l'outil, pour la personne)

- `~/.pulse-motion/lexique.md`, créé depuis `modeles/lexique.md` à la première écriture. Tableau : Terme | En une phrase | Comme… | Vu le | Statut.
- Images fixes, toujours les mêmes : **déroulé** (la liste des scènes dans l'ordre, comme le conducteur d'une émission), **scène** (un écran animé, comme une diapositive qui bouge), **style** (l'allure de la vidéo, comme un thème de présentation), **charte** (couleurs, polices et logo de la marque), **transition** (le passage d'une scène à la suivante), **export** (la fabrication du fichier vidéo).
- `pulse-motion lexique` affiche ; `pulse-motion lexique noter "<terme>" "<phrase>" "<comme>" "<commande>"` ajoute, trié, sans doublon (casse et accents ignorés pour la comparaison), statut « vu », date du jour.
- Les skills le relisent avant d'expliquer un mot : un mot déjà vu n'est plus réexpliqué en entier.

### Glossaire (mots du métier, dans la charte)

- `charte/glossaire.md` (recopié avec la charte). Tableau : Terme | Sens | À éviter | Prononciation (facultative, pour la brique audio). « À éviter » contient des formes séparées par des virgules.
- `pulse-motion glossaire noter . "<terme>" "<sens>" ["<à éviter>"]` ; pendant le déroulé, Claude propose les sigles et noms propres rencontrés, la personne valide en une réponse.
- `controler.js`, règle `glossaire` (avertissement) : un texte de scène contient une forme « à éviter » (mot entier, sans tenir compte de la casse) ou un terme dans une autre casse que la sienne (« Haccp » pour « HACCP ») ; message avec scène et clé de texte.
- L'agent `animateur` lit le glossaire avant d'écrire une scène.

## 11. Les 5 styles livrés

| Style | Famille | Personnalité | Genres | Tons | Polices (titres / texte) | Signature et mouvement |
|---|---|---|---|---|---|---|
| `clair-pedagogique` | moderne | posé, lisible, rassurant | formation | clair (+ sombre ajouté) | Figtree / Inter | inchangé ; `identite.json` et ton sombre ajoutés |
| `editorial` | editoriale | élégant, exigeant, calme | storytelling, formation | clair (crème), sombre | Fraunces / Instrument Sans | filets fins qui se tracent, titres à empattements très grands, apparitions lentes par masque ; fondu, rideau |
| `energique` | affirmee | audacieux, rapide, percutant | social, produit | couleur saturée (clair), sombre | Anton / Archivo | blocs pleins, mots qui tombent un à un, rebonds (`outBack`, `outElastic`), zooms ; coupe, balayage, zoom ; pensé aussi pour le 9:16 |
| `tech-sombre` | technique | précis, moderne, technique | produit, formation | sombre, clair | Space Grotesk / JetBrains Mono | grille de fond, texte qui s'écrit au clavier avec curseur, chiffres à chasse fixe, accent lumineux ; fondu, glissement |
| `chaleureux` | chaleureuse | accueillant, doux, humain | formation, storytelling | clair (tons chauds) | Fredoka / Nunito Sans | formes organiques SVG qui respirent, rayons généreux, mouvement doux qui s'arrête net ; terre cuite, sauge, pêche |
| `minimal` | moderne | net, sûr, essentiel | produit, social | clair (blanc), sombre | Schibsted Grotesk | grille suisse, beaucoup d'espace, un seul accent, typographie démesurée, mouvements courts ; coupe, fondu |

Transitions nouvelles demandées au moteur : `rideau`, `zoom`, `coupe` (ajoutées à `transitions.js` dans le plan 3 avec leurs tests). Une famille absente de Bunny au moment de la réalisation est remplacée par une police de même catégorie, notée dans le guide du style.

Chaque style tient :

- les 8 scènes du contrat et les formats `16:9`, `9:16`, `1:1` (tailles en `cqh`) ;
- uniquement les mécanismes du moteur (`data-tween`, `--p`, `data-etat`, SMIL, courbes de `courbes.js`) ; pas de particules (autre brique) ;
- le déterminisme (pas d'aléa hors de `M.chaqueImage`) ;
- la pause finale de 0,5 s de la dernière scène ;
- son guide `references/styles/<nom>.md` (« L'essentiel », tableau `| \`type\` | rôle | durée s |`, à faire / à éviter).

## 12. Style personnel

### Parcours `/pulse-motion:style`

1. La personne décrit le style voulu.
2. Entretien d'identité, une question à la fois, chacune avec réponses proposées et une « (Recommandé) » : personnalité (3 mots) et à éviter, références, ton et stratégie de couleur, polices (Bunny proposées par catégorie), mouvement.
3. `pulse-motion style nouveau <nom> --depuis <style>` crée `~/.pulse-motion/styles/<nom>/` (copie du style de départ, `identite.json` à réécrire, guide à compléter).
4. Claude écrit `identite.json`, `charte.json`, `style.css`, puis 2 scènes témoins (`titre`, `liste`) ; planche de ces 2 scènes avec de vrais textes ; validation ou corrections.
5. Les 6 autres scènes, réparties entre agents `animateur` en parallèle, à partir de la même identité ; planche finale des 8 scènes.
6. `pulse-motion style verifier <nom>` ; tant qu'il échoue, le style n'est pas proposé.

### Règles

- Nom : `^[a-z0-9-]+$`, distinct des styles livrés.
- Un projet dont le style personnel est absent de l'ordinateur : erreur « Style personnel « papercraft » introuvable sur cet ordinateur : copiez son dossier dans `~/.pulse-motion/styles/` ». La page HTML déjà assemblée reste autonome.
- Les avertissements d'effets mal rendus par l'export rapide sont expliqués avec une solution (texture de papier en image embarquée plutôt que `feTurbulence`, ombre de découpe en ombre décalée).

## 13. Erreurs

| Cas | Comportement |
|---|---|
| Style inconnu ou personnel absent | Erreur avec la liste des styles et le chemin attendu |
| Changement de style avec scènes libres | Fait ; scènes à réécrire listées ; annulable |
| Texte trop long pour un style | Avertissement dans la comparaison ; erreur au contrôle (existant) |
| Logo JPEG/WebP, PNG entrelacé ou 16 bits, illisible, sans couleur | Message clair ; charte du style gardée |
| Contraste impossible après ajustement | Couleur du style, signalée |
| Bunny : réseau absent, délai dépassé, famille inconnue, graisse absente, feuille douteuse | Rien d'écrit (`.part` supprimé), raison donnée |
| Police interdite d'intégration | Refus |
| Caractères français manquants | Avertissement, liste, remplacement proposé |
| Charte enregistrée modifiée | Signalée par `etat`, jamais appliquée seule |
| Noms de charte, de style, de police | `^[a-z0-9-]+$` (familles Bunny : catalogue) ; aucun chemin ne sort du dossier prévu |
| `~/.pulse-motion` non inscriptible | Message avec le chemin et `PULSE_MOTION_DOSSIER` |

Tous les messages sont en français et disent quoi faire.

## 14. Tests

`node:test`, sans dépendance, **sans réseau** (catalogue et feuilles Bunny enregistrés dans `tests/fixtures/`, `fetch` remplaçable).

- **Unitaires** : `couleurs.js` (conversions, contraste, ajustement) ; `logo.js` sur des logos d'essai PNG (palette, RGBA, filtres variés) et SVG, primaire et accent attendus ; `polices.js` (`assertKnownFamily`, `pickLatinFiles`, feuille douteuse refusée, `fsType`, `cmap` sur de petites polices d'essai TTF/WOFF/WOFF2) ; `vocabulaire.js` (ajout trié, doublons, règle glossaire) ; `styles.js` (recommandation, styles personnels, refus des noms dangereux) ; `charte.js` (enregistrer, appliquer, modification détectée) ; fusion à 4 étages et ton `auto`.
- **Contrat** : pour chaque style livré, `verifierStyle` sans erreur ; s'applique d'office à tout nouveau style.
- **Navigateur** : chaque scène de chaque style, avec les textes à longueur maximale, sans débordement de `#pm-scene` ; deux rendus au même `t` identiques ; en 16:9 et 9:16.
- **Jargon** : les phrases des skills adressées à la personne n'emploient pas `HTML`, `CSS`, `JSON`, `DOM`, `tween`, `render`, `payload`, `cqh` sans explication (modèle `tests/jargon.js` de pulse-vibe).
- **Plugin** : skills et commandes citées existent (test existant étendu à `style`, `comparer`, `changer-style`, `charte`, `police`, `lexique`, `glossaire`).
- **Vérification visuelle** pendant l'exécution : planche de chaque style en 16:9 et 9:16.

## 15. Découpage en plans

1. **Socle du catalogue** : contrat et `verifierStyle`, `identite.json` de `clair-pedagogique`, `styles.js` (livrés + personnels, recommandation), `scenes[].type`, `comparer`, `changer-style`, lexique, skills `creer` (planche avec le déroulé), `retoucher` (changement de style), `reprendre`.
2. **Charte** : fusion à 4 étages, chartes enregistrées, couleurs du logo, contraste et ton, variables dérivées, `pulse-motion police` (Bunny et fichier), glossaire et règles `contraste` et `glossaire`.
3. **Les 5 styles livrés** : une tâche par style (polices, `identite.json`, `charte.json`, `style.css`, 8 scènes, guide), transitions `rideau`, `zoom`, `coupe`, ton sombre de `clair-pedagogique`, `recommandation.json` complet.
4. **Style personnel** : skill `/pulse-motion:style`, `style nouveau --depuis`, `style verifier` (avertissements export rapide).

## 16. Hors périmètre

- Conversion de polices (TTF → WOFF2), décodage JPEG/WebP.
- Partage de styles ou de chartes entre personnes autrement que par copie de dossier.
- Effets nécessitant l'export fidèle (filtres SVG, modes de fusion) : brique 4.
- Particules : autre session.
- Prononciation utilisée par une voix : brique 5.

## 17. Provenance et licences

- Logique Bunny reprise de `pulse-boilerplate` (`bunny-catalog.ts`, même auteur), réécrite en JavaScript.
- Structure d'identité, directions, lexique et glossaire inspirés de pulse-vibe (même auteur).
- Polices des styles : OFL (Fraunces, Instrument Sans, Anton, Archivo, Space Grotesk, JetBrains Mono, Fredoka, Nunito Sans, Schibsted Grotesk), provenance Bunny Fonts notée dans chaque `LICENCES.md`.
