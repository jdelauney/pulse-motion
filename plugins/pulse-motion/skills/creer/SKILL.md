---
description: "Créer une NOUVELLE vidéo Pulse Motion, seulement quand la personne le demande (« fais-moi une vidéo sur… », « crée une vidéo », « que sait faire Pulse Motion ? »). Pour modifier une vidéo existante : /pulse-motion:retoucher."
argument-hint: "[le sujet de la vidéo en une phrase]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Bash(winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements) Bash(brew install python) Monitor Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:creer – De l'idée à la vidéo

Guider une personne **sans notion de code** de son idée jusqu'à une vidéo animée qu'elle regarde dans son navigateur. Une vidéo = le dossier courant.

## Règles

- Parler simplement, en français, sans jargon (pas de « HTML », « JSON », « CSS » dans les messages à la personne : dire « le déroulé », « la scène », « l'aperçu »).
- Vocabulaire : **genre** (ce que fait la vidéo), **style** (à quoi elle ressemble), **charte** (logo, couleurs, polices), **déroulé** (la liste des scènes), **parcours** (rapide ou accompagné).
- Questions avec `AskUserQuestion`, 4 au plus par ronde, une option « (Recommandé) » en premier.
- Ne jamais montrer de commande à la personne ; les lancer soi-même.
- Étape longue : l'annoncer en une phrase avec sa durée ; en arrière-plan, la suivre par `Monitor` sur `pulse-motion avancement . --suivre`, une phrase par minute au plus (sans lui : « l'avancement s'affiche dans l'aperçu »).
- Problème du contrôle : dire son `message`, corriger avec sa `consigne`.
- Lexique : avant d'expliquer un mot de l'outil (déroulé, scène, style, charte, transition, export…), lire `pulse-motion lexique`. Un mot déjà noté n'est pas réexpliqué en entier ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:creer"`, en reprenant l'image fixe du lexique quand elle existe.

## 0. Vérifier

**Rien n'est écrit dans le dossier avant la réponse à la première ronde** : jusque-là, seuls `pulse-motion etat .`, `modeles trouver`, `modeles afficher`, `modeles liste`, `modeles apercu`, `charte liste` et les lectures (`lexique`, `reference`).

`pulse-motion etat .`
- La commande échoue avec « Node.js introuvable » : proposer « Installer Node.js (Recommandé) » · « Je l'installe moi-même » (accord : `/pulse-motion:outils`, étape « Installer Node.js »), puis relancer `pulse-motion etat .`. S'arrêter sinon.
- `node.ok` faux : expliquer le message `node.message` et s'arrêter.
- `projet` vrai : une vidéo existe déjà ici. Proposer `/pulse-motion:reprendre`, ou de créer la nouvelle vidéo dans un autre dossier. S'arrêter.
- « Que sait faire Pulse Motion ? », ou demande sans sujet : présenter ce qu'il fait d'après `pulse-motion reference demandes`, sans rien écrire, puis demander le sujet.

## 1. Questions (une ronde)

Le sujet vient de l'argument ; sinon, le demander d'abord en une question ouverte.

La première question rappelle ce qui va se passer : « Nouvelle vidéo sur « <sujet> » dans ce dossier ».

**Modèle de vidéo.** `pulse-motion modeles trouver "<sujet>"` (ou `pulse-motion modeles afficher <id>` si la personne en nomme un : « à partir du modèle pitch »). Un modèle trouvé fixe le genre, le format, l'ambiance musicale et l'ordre des styles (`styles`, le premier recommandé) ; sa durée (`duree`, par exemple « 45 s ») devient la première réponse de la question Durée, « (Recommandé) », à la place de la plus proche ; le déroulé (étape 2) part de ses scènes : mêmes `type`, `intention`, `transition`, `mouvements` et `effet` (l'effet se donne à l'animateur de la scène), durées ajustées à la durée choisie, textes écrits pour le sujet en suivant la consigne de chaque clé (une clé dont la consigne dit « à retirer » peut manquer). Le dire en une phrase, avant les questions : « Je pars du modèle « <nom> » : <n> scènes, environ <durée>. » Son `sousTitres` dit si la réponse « Oui » est recommandée à la question Sous-titres. La personne peut tout changer ensuite. Aucun modèle (`null`) : continuer comme ci-dessous, sans en parler.
« Quels modèles ? », « montre-moi un exemple de pitch », un mouvement nommé : `pulse-motion reference demandes`.

**Première ronde** :

1. **Durée** : 30 s · 1 min (Recommandé pour une formation courte) · 3 min · 5 min.
2. **Public** : grand public · professionnels du métier · élèves ou stagiaires (adapter selon le sujet).
3. **Parcours** : Rapide (Recommandé) – « je valide seulement le déroulé » · Accompagné – « je valide aussi le style et la vidéo finale ».
4. **À ajouter** (choix multiple) : mon logo et mes couleurs · rien pour l'instant.

Sujet qui nomme une entreprise ou un produit précis : la question 4 devient celle des visuels, une seule fois (`pulse-motion reference actifs-marque` : logo, photos du produit, captures, couleurs et polices) ; ne jamais redessiner le produit, poser une zone réservée s'il manque.

Puis une deuxième ronde, **Le son** (lire d'abord `pulse-motion reference audio`, et `pulse-motion reference audio/musique` pour décrire les ambiances) :

1. **Musique** : « Une musique composée pour la vidéo (Recommandé) » · « J'ai un fichier » · « Pas de musique ». L'ambiance se choisit selon le genre (formation → `calme` ou `inspirant`, produit → `corporate` ou `tech`, storytelling → `inspirant` ou `suspense`, social → `entrainant`) et se décrit en trois mots, jamais par son nom technique.
2. **Voix** : « Je l'enregistre (Recommandé) » · « J'ai un fichier » · « Pas de voix ».
3. **Sous-titres** : « Oui (Recommandé) » · « Non ». Ils reprennent le texte dit : avec « Pas de voix » à la question 2, ignorer cette réponse et dire en une phrase qu'il n'y aura pas de sous-titres sans voix. En 9:16, proposer d'abord les sous-titres mot par mot (`mode` `mot`), qui retiennent l'œil sur les réseaux.
4. **L'ordinateur**, seulement si `pulse-motion outils --plan` liste un outil utile (la transcription avec une voix, ou ffmpeg) : « Préparer l'ordinateur pendant que je travaille : <liste> (Recommandé) » · « Plus tard ». Accord : les installations partent en arrière-plan, une à la fois (`pulse-motion consignes outils`, étape « Tout installer »).

Le genre se déduit du sujet (formation, produit, storytelling, social). Format : 16:9, sauf genre `social` → 9:16 (4:5 si la personne vise le fil LinkedIn ou Instagram).
Puis `pulse-motion etat . --parcours rapide|accompagne`.

La charte (logo, couleurs, polices) vit dans `charte/` du projet ; la musique dans `assets/`. Les fichiers se demandent à la personne (chemin ou glisser-déposer) et se **copient**.
- `pulse-motion charte liste` : s'il existe des chartes enregistrées, la question 4 propose d'abord « Ma charte <nom> ». Elle s'applique après l'écriture du déroulé (étape 2) : `pulse-motion charte appliquer <nom> .` ; les réglages listés dans `retires` (couleurs, polices propres à la vidéo) sont remplacés par ceux de la charte : le dire en une phrase. Le glossaire déjà noté est gardé.
- Logo : le copier dans `charte/logo.<ext>`, puis `pulse-motion charte depuis-logo charte/logo.<ext> --style <style>` (style recommandé, étape 2) : couleur primaire et couleur d'accent, déjà rendues lisibles sur le fond du style. Les écrire dans `charte/charte.json` (`{ "couleurs": { "primaire": "…", "accent": "…" }, "logo": "logo.<ext>" }`) et dire les `ajustements` en une phrase. Logo en JPEG ou WebP : demander un PNG ou un SVG. Pas de couleur exploitable : garder les couleurs du style et le dire.
- Couleurs en mots (« bleu marine ») : les traduire en `#rrggbb` dans `charte/charte.json` et le dire.
- Police citée sans fichier (« ma police, c'est Montserrat ») : `pulse-motion police "<famille>"` la récupère depuis Bunny Fonts dans `charte/polices/` ; si elle n'y est pas, garder la plus proche des polices du style (celles de son guide ; pour `clair-pedagogique`, Figtree pour les titres, Inter pour le texte) et le dire. Fichier fourni : `pulse-motion police <fichier> --style <style> --role titres|texte` (le rôle qu'elle prend dans la charte) ; réponse `aConfirmer` : poser la question à la personne, puis relancer avec `--confirmer` ; `avertissements` (caractères absents, avec la police du style à utiliser à la place) : les dire. Puis l'indiquer dans `charte/charte.json` (`"polices": { "titres": "<famille>" }`).
- Musique composée : `"musique": { "generee": "<ambiance>", "tempo": 120, "volume": 0.5 }` dans le déroulé (volume 0,5 sous une voix, 0,8 sans voix ; pas de `tempo` en haut du déroulé en plus). Ce tempo devient celui de la vidéo (gestes calés sur les temps : `data-start="2t"`) ; la musique se cale ensuite sur les scènes : les durées restent libres. Une scène qui doit changer l'humeur de la musique : `scenes[].musique` (`silence`, `calme`, `normale`, `intense`).
- Musique en fichier : copier le fichier dans `assets/`. Si la personne connaît son tempo (ou le titre l'indique : « 120 bpm »), l'écrire dans le déroulé (`"tempo": { "bpm": 120 }`) : les animateurs caleront les entrées sur les temps. Un fichier ne se recale pas sur les scènes : chaque scène doit alors commencer sur un temps (contrôle `hors-tempo`) ; à 120 bpm, des durées en demi-secondes.

## 2. Déroulé et style

1. `pulse-motion styles --genre <genre>` : les styles classés pour ce genre, avec leur personnalité et leurs scènes toutes faites. Les **3 premiers** sont ceux à proposer ; le premier est le style recommandé. Avec un modèle : ses `styles`, dans leur ordre, remplacent ces trois-là (le premier est le recommandé). Demande floue (« fais quelque chose de beau », « surprends-moi ») : trois directions contrastées à la place (`pulse-motion reference directions`).
2. Lire `pulse-motion reference rythme`, puis `pulse-motion reference recettes-rythme` : choisir le caractère de la vidéo et sa courbe d'énergie (formation longue : cycles courts) ; puis `pulse-motion reference realisation` (ses `cadrans`, ses `faits`).
3. Écrire `deroule.json` (schéma ci-dessous) dans le style recommandé : une idée par scène, structure du genre, durées ≥ 1,5 s + 0,3 s par mot, total proche de la durée demandée. Pour chaque scène, choisir une scène toute faite et l'écrire dans `type` (`titre`, `liste`, `chiffre`, `comparaison`, `etape`, `alerte`, `schema` ou `conclusion`) ; pas de `type` pour une scène à composer librement. Avec une voix : écrire le texte dit de chaque scène dans `voix.texte` (une idée par phrase, phrases courtes, au plus 3,5 mots par seconde : la scène dure au moins mots / 3,5 + 0,7 s ; allonger sa durée sinon) ; avec des sous-titres, ajouter `"sousTitres": {}` (`"mode": "mot"` si la personne l'a choisi). Sigles et noms propres du sujet (HACCP, nom d'un produit) : proposer en une question de les noter au glossaire, `pulse-motion glossaire noter . "<terme>" "<sens>" "<formes à éviter>"` (`--cle` : 1 à 3 termes clés).
4. S'il y a au moins 2 styles : `pulse-motion comparer . <style1>,<style2>,<style3> --ouvrir` **en arrière-plan** (avec les 3 premiers styles) : la comparaison des styles, faite sur les deux premières scènes de la personne, s'ouvre dans son navigateur. Regarder soi-même les images de `sortie/comparaison/` (avec `Read`) ; un avertissement (texte trop long pour un style) se dit en une phrase.
5. Présenter le déroulé en tableau : n°, scène, texte à l'écran, texte dit (avec une voix), durée ; durée totale en dessous. Puis demander :
   - **Parcours rapide** : une seule question : « Je valide, avec le style <1> (Recommandé) » · « Je valide, avec le style <2> » · « Je valide, avec le style <3> » · « Je veux changer quelque chose ». Décrire chaque style par sa personnalité (trois mots), jamais par son nom technique seul.
   - **Parcours accompagné** : d'abord l'accord sur le déroulé (« Je valide » (Recommandé) · « Je veux changer quelque chose »), puis une question à part sur le style, avec les mêmes styles.
   - Un seul style disponible : pas de comparaison ; le dire et ne demander que l'accord sur le déroulé.
6. Changements : corriger, représenter. Accord : `pulse-motion etat . --accord deroule`. Style choisi : s'il diffère du style recommandé, changer `style` dans `deroule.json` tant qu'aucune scène n'est écrite ; si des scènes existent déjà, lancer `pulse-motion changer-style . <style>` (puis réécrire les scènes de `aReecrire`, étape 3). Enfin `pulse-motion etat . --accord style`.

```json
{
  "version": 1, "titre": "…", "genre": "formation", "parcours": "rapide",
  "format": { "ratio": "16:9", "ips": 30 }, "style": "clair-pedagogique",
  "charte": { "ton": "auto" },
  "musique": { "fichier": "assets/musique.mp3", "volume": 0.6 },
  "scenes": [
    { "id": "intro", "type": "titre", "fichier": "scenes/01-intro.html", "duree": 7, "intention": "poser la question", "textes": { "etiquette": "…", "titre": "…", "sous": "…" }, "transition": "fondu" }
  ]
}
```

`charte` du déroulé ne garde que les réglages ponctuels (`ton` : `clair`, `sombre` ou `auto` ; une couleur à changer pour cette vidéo seulement) ; la charte elle-même est dans `charte/`. `charte`, `musique` et `tempo` sont facultatifs. Clés de `textes` : celles de la scène toute faite (`pulse-motion reference styles/<style>`).

Mouvements nommés (« un pop-in sur les titres », « #006 pour le titre », « une plante qui vit », « montre-moi les mouvements ») : `pulse-motion reference demandes`, section « Mouvements nommés ».

## 3. Fabrication

0. Voix, avant les animateurs (la voix fixe la durée des scènes et le moment de chaque mot) :
   - Transcription : `pulse-motion whisper` (installée pendant la ronde 2 : attendre sa fin si besoin). `pret` faux : proposer une fois de l'installer (« Installer la transcription (Recommandé) » · « Plus tard ») : elle cale sous-titres et animations sur les vrais mots, et découpe un enregistrement de toute la vidéo. Accord : `pulse-motion consignes outils`, étape « Installer la transcription » (Python d'abord s'il manque, puis relancer `pulse-motion whisper` ; toujours introuvable : en dernier recours, relancer Claude Code, et continuer sans), puis `pulse-motion whisper installer` en arrière-plan, et attendre sa fin. Refus ou échec : dire en une phrase que les mots seront calés au mieux.
   - La personne enregistrera elle-même : `pulse-motion voix provisoire .` (la voix de l'ordinateur lit les textes, pour caler l'animation ; elle sera remplacée). Échec « aucune voix du système » : le dire, les sous-titres se répartiront sur la scène.
   - Elle a un fichier : le copier dans `assets/`. Une prise par scène : `pulse-motion voix importer assets/<fichier> --scene <id> .`. Un enregistrement de toute la vidéo : `pulse-motion voix importer assets/<fichier> .` (découpé par scène, transcription requise) ; s'il a été refusé faute de transcription et qu'elle vient d'être installée, relancer `pulse-motion voix importer assets/<fichier> .` ; sans transcription, se replier sur `pulse-motion voix provisoire .` et proposer d'enregistrer dans l'aperçu. Un `avertissement` (scène mal reconnue) se dit en une phrase.
   - Prises déjà là quand la transcription arrive : `pulse-motion voix transcrire .`.
1. **Consigne de chaque animateur** : dossier, scène (id, fichier, durée, rythme, intention, textes), style, format, scène toute faite conseillée (son `type`). Vous décidez quelles scènes reçoivent un effet de particules : au plus deux effets simultanés à l'écran, et en formation courte un ou deux effets dans toute la vidéo. Dire à l'animateur de ces scènes quel effet poser (étincelles sur un chiffre clé, confettis en conclusion) ; les autres n'en ajoutent pas. Donner aussi à chaque animateur les mouvements demandés pour sa scène (`scenes[].mouvements`, avec l'élément visé). Avec du son : donner aussi le texte dit de la scène et dire si elle a une prise de voix (ancres `mot:` permises) ; demander 1 à 3 bruitages (`data-son`) sur les éléments clés. Selon la scène, à lire : `compositions` (mur de vignettes, signature de fin), `cadres-pointeur` (logiciel montré), `mixage-fin` (son travaillé), `actifs-marque` (produit nommé).
2. **Modèle de l'animateur**, passé à l'appel (paramètre `model`) :

   | La scène | Modèle passé à l'appel |
   |---|---|
   | Un `type`, sans effet de particules, personnage, fond par shader ni caméra narrative ; au plus 3 mouvements nommés ; sa transition peut être un shader (c'est le déroulé qui la pose) | `sonnet` |
   | Composée (sans `type`), ou avec effet, personnage, fond par shader, caméra, partition calée sur la scène | aucun paramètre (modèle de la session) |
   | Scène témoin, même toute faite ; seconde écriture d'une scène qui garde une erreur | aucun paramètre |

   Jamais un modèle plus cher que celui de la session : si la session tourne déjà en Sonnet ou en Haiku, aucun paramètre. Jamais `haiku`.
3. **Lancer les animateurs** (annoncés en une phrase avec leur durée). Moins de 6 scènes : un agent par scène, tous dans le même message (en parallèle). 6 scènes ou plus, en deux vagues :
   - **Scènes témoins** : deux agents sans paramètre de modèle, dans le même message, chacun prévenu qu'il écrit une scène témoin : l'ouverture (la première scène) et la scène **composée** la plus différente d'elle, sans personnage ; sans scène composée, la plus risquée hors personnage (à effet, au texte le plus long) ; jamais deux scènes du même `type`.
   - `pulse-motion planche . <id1>,<id2>`, regarder soi-même `sortie/planche/` (avec `Read`), corriger si besoin ; les scènes pas encore écrites ne gênent pas.
   - **Grammaire** : d'après la planche, 4 à 6 lignes « Grammaire de la vidéo » : les choix de cette vidéo dans le style (titres, listes, chiffre clé, accent, marges, transitions ; `pulse-motion reference scenes-temoins`).
   - **Seconde vague** : toutes les autres scènes, dans le même message ; aux seules scènes **composées**, les chemins des deux témoins (marges, tailles, rythme d'entrée, couleurs à reprendre) et la note, telle quelle.
4. Un agent qui a **composé** la scène (sans partir de la scène toute faite) le dit : retirer alors son `type` dans `deroule.json`.
5. `pulse-motion controler .` (il assemble aussi la page).
6. `pulse-motion controler .` corrige seul les cas sûrs (typographie, durées, pause finale, texte qui déborde ; liste complète : `pulse-motion reference controles`) : lire `corrections` dans `sortie/controle.json` et les dire en une phrase à la personne. Erreurs ou alertes restantes : les corriger (dans la scène, ou dans le déroulé pour une durée), relancer `pulse-motion controler .`. Une scène écrite en `sonnet` qui garde une erreur après ce premier tour : la faire réécrire par un agent sans paramètre de modèle. Deux tours au plus ; ce qui reste est dit à la personne.

## 4. Aperçu

1. **Regarder avant de montrer** (la personne ne doit jamais être la première à regarder ; sans question) : `pulse-motion planche . --regard`, puis regarder avec `Read` `sortie/regard/ouverture.png`, `telephone-*.png` et `temps-forts-*.png` (pas `bandes.png`), en trois passes, une sorte de défaut à la fois : la lisibilité sur la planche téléphone ; la composition et le rythme sur les temps forts ; l'accroche et le mouvement sur l'ouverture. Corriger ce qui se voit (un tour au plus), puis relancer `pulse-motion controler .` et `pulse-motion planche . --regard --scenes <scènes corrigées>`. `ok` faux : le dire au bilan. Puis, dès 3 scènes, la **relecture** : agent `critique`, modèle passé à l'appel (`model`), selon `realisation` § 13.
2. `pulse-motion apercu . --ouvrir` **en arrière-plan** : le navigateur s'ouvre sur la vidéo.
3. `pulse-motion controler .` vérifie aussi la vidéo rendue (Chrome ou Edge sans fenêtre) : textes qui débordent, éléments qui se chevauchent ou sortent de l'image, marges, zone des boutons en 9:16, logo masqué, textes trop vite effacés, mouvements trop rapides. Corriger ce qui est signalé (l'aperçu se recharge seul). `renduVerifie: false` avec une alerte `rendu-non-verifie` ou `rendu-impossible` : la dire à la personne (navigateur introuvable ou page en erreur) avec le message du contrôle ; avec `--sans-rendu`, rien à dire.
4. Parcours accompagné (le style est déjà choisi, à l'étape 2) :
   - **Vidéo finale** : faire regarder la vidéo entière dans l'aperçu et demander l'accord (`--accord video`).
   - Un refus : demander ce qui ne va pas et passer par `/pulse-motion:retoucher`.
5. Voix à enregistrer : dire à la personne « Pour enregistrer votre voix, cliquez sur « Voix » dans la barre de l'aperçu : le texte défile, vous parlez, vous réécoutez, vous gardez ou refaites. » Chaque prise gardée remplace la voix de l'ordinateur et recale la scène. Pour lui faire entendre la musique seule : `pulse-motion musique ecouter .` (fichier `sortie/musique.wav`).
6. Pour montrer deux scènes en images fixes (à la demande de la personne) : `pulse-motion planche . <id1>,<id2> --ouvrir`, puis regarder soi-même les images de `sortie/planche/` (avec `Read`).

## 5. Fin

Si la charte a été créée pour cette vidéo, proposer de l'enregistrer pour les suivantes (« Enregistrer ma charte » (Recommandé) · « Pas maintenant ») : `pulse-motion charte enregistrer <nom> .` (nom en minuscules et tirets, ex. `client-dupont`).

Terminer par ce bloc, sans rien après. La ligne 🔎 n'affirme que ce qui a été mesuré ou vu, et dit toujours ce qui n'a pas pu l'être (« sans Chrome, la vidéo rendue n'a pas été contrôlée ni regardée »).

✅ **Fait** : la vidéo « <titre> » (<n> scènes, <durée>) est prête et s'affiche dans votre navigateur.
📄 **Fichiers** : la vidéo animée est dans `sortie/<titre>.html` (elle s'ouvre sans connexion).
🔎 **Vérifié** : <ce qui a été mesuré, en mots simples : lisibilité, contrastes, temps de lecture…> ; <n> images de la vidéo regardées (`vignettes` des planches) ; relue par un relecteur qui n'a pas vu la fabrication (<prête, ou corrigée après relecture, non relue>), scène la plus faible « <id> » (<raison courte>)[ ; le son a été mesuré, pas écouté]. Ce que je corrigerais ensuite : <une phrase>.
➡️ **Ensuite** : décrivez une retouche en une phrase avec `/pulse-motion:retoucher` (par exemple « ralentis la scène 3 »), ou exportez la vidéo en MP4 avec `/pulse-motion:exporter`.
