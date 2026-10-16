---
description: Créer une vidéo de motion design en quelques questions, valider son déroulé, puis la regarder dans le navigateur
argument-hint: "[le sujet de la vidéo en une phrase]"
disable-model-invocation: true
allowed-tools: Bash(pulse-motion *) Bash(node *) Bash(winget install --id Python.Python.3.12 -e --accept-source-agreements --accept-package-agreements) Bash(brew install python) Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:creer – De l'idée à la vidéo

Guider une personne **sans notion de code** de son idée jusqu'à une vidéo animée qu'elle regarde dans son navigateur. Une vidéo = le dossier courant.

## Règles

- Parler simplement, en français, sans jargon (pas de « HTML », « JSON », « CSS » dans les messages à la personne : dire « le déroulé », « la scène », « l'aperçu »).
- Vocabulaire : **genre** (ce que fait la vidéo), **style** (à quoi elle ressemble), **charte** (logo, couleurs, polices), **déroulé** (la liste des scènes), **parcours** (rapide ou accompagné).
- Questions avec `AskUserQuestion`, 4 au plus par ronde, une option « (Recommandé) » en premier.
- Ne jamais montrer de commande à la personne ; les lancer soi-même.
- Lexique : avant d'expliquer un mot de l'outil (déroulé, scène, style, charte, transition, export…), lire `pulse-motion lexique`. Un mot déjà noté n'est pas réexpliqué en entier ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:creer"`, en reprenant l'image fixe du lexique quand elle existe.

## 0. Vérifier

`pulse-motion etat .`
- La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org (Windows et macOS : programme d'installation ; Linux : gestionnaire de paquets), puis relancer Claude Code. S'arrêter.
- `node.ok` faux : expliquer le message `node.message` et s'arrêter.
- `projet` vrai : une vidéo existe déjà ici. Proposer `/pulse-motion:reprendre`, ou de créer la nouvelle vidéo dans un autre dossier. S'arrêter.

## 1. Questions (une ronde)

Le sujet vient de l'argument ; sinon, le demander d'abord en une question ouverte. Puis une ronde :

1. **Durée** : 30 s · 1 min (Recommandé pour une formation courte) · 3 min · 5 min.
2. **Public** : grand public · professionnels du métier · élèves ou stagiaires (adapter selon le sujet).
3. **Parcours** : Rapide (Recommandé) – « je valide seulement le déroulé » · Accompagné – « je valide aussi le style et la vidéo finale ».
4. **À ajouter** (choix multiple) : mon logo et mes couleurs · rien pour l'instant.

Puis une deuxième ronde, **Le son** (lire d'abord `pulse-motion reference audio`) :

1. **Musique** : « Une musique composée pour la vidéo (Recommandé) » · « J'ai un fichier » · « Pas de musique ». L'ambiance se choisit selon le genre (formation → `calme` ou `inspirant`, produit → `corporate` ou `tech`, storytelling → `inspirant` ou `suspense`, social → `entrainant`) et se décrit en trois mots, jamais par son nom technique.
2. **Voix** : « Je l'enregistre (Recommandé) » · « J'ai un fichier » · « Pas de voix ».
3. **Sous-titres** : « Oui (Recommandé) » · « Non ». Ils reprennent le texte dit : avec « Pas de voix » à la question 2, ignorer cette réponse et dire en une phrase qu'il n'y aura pas de sous-titres sans voix. En 9:16, proposer d'abord les sous-titres mot par mot (`mode` `mot`), qui retiennent l'œil sur les réseaux.

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

1. `pulse-motion styles --genre <genre>` : les styles classés pour ce genre, avec leur personnalité et leurs scènes toutes faites. Les **3 premiers** sont ceux à proposer ; le premier est le style recommandé.
2. Lire `pulse-motion reference rythme`.
3. Écrire `deroule.json` (schéma ci-dessous) dans le style recommandé : une idée par scène, structure du genre, durées ≥ 1,5 s + 0,3 s par mot, total proche de la durée demandée. Pour chaque scène, choisir une scène toute faite et l'écrire dans `type` (`titre`, `liste`, `chiffre`, `comparaison`, `etape`, `alerte`, `schema` ou `conclusion`) ; pas de `type` pour une scène à composer librement. Avec une voix : écrire le texte dit de chaque scène dans `voix.texte` (une idée par phrase, phrases courtes, au plus 3,5 mots par seconde : la scène dure au moins mots / 3,5 + 0,7 s ; allonger sa durée sinon) ; avec des sous-titres, ajouter `"sousTitres": {}` (`"mode": "mot"` si la personne l'a choisi). Sigles et noms propres du sujet (HACCP, nom d'un produit) : proposer en une question de les noter au glossaire, `pulse-motion glossaire noter . "<terme>" "<sens>" "<formes à éviter>"`.
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

## 3. Fabrication

0. Voix, avant les animateurs (la voix fixe la durée des scènes et le moment de chaque mot) :
   - Transcription : `pulse-motion whisper`. `pret` faux : proposer une fois de l'installer (consignes d'installation de `pulse-motion consignes outils`, étape « Installer la transcription »), elle cale les sous-titres et les animations sur les vrais mots (« Installer la transcription (Recommandé) » · « Plus tard ») ; elle est indispensable pour découper un enregistrement de toute la vidéo.
     - Accord, avec `commandeSysteme` (Python manque) : lancer sa `commande` (sous Linux, `commande` nulle : donner le texte `message` à taper et attendre que la personne dise que c'est fait), puis relancer `pulse-motion whisper`. Python toujours introuvable (sous Windows, l'ordinateur ne le voit qu'après un redémarrage de l'outil) : dire qu'il faudra relancer Claude Code pour finir l'installation, et continuer sans.
     - Puis `pulse-motion whisper installer` en arrière-plan (quelques minutes, environ 800 Mo), et attendre sa fin. `ok` faux : dire en une phrase que la transcription n'a pas pu s'installer, et continuer sans.
     - Refus ou échec : dire en une phrase que les mots seront calés au mieux ; tout fonctionne quand même.
   - La personne enregistrera elle-même : `pulse-motion voix provisoire .` (la voix de l'ordinateur lit les textes, pour caler l'animation ; elle sera remplacée). Échec « aucune voix du système » : le dire, les sous-titres se répartiront sur la scène.
   - Elle a un fichier : le copier dans `assets/`. Une prise par scène : `pulse-motion voix importer assets/<fichier> --scene <id> .`. Un enregistrement de toute la vidéo : `pulse-motion voix importer assets/<fichier> .` (découpé par scène, transcription requise) ; s'il a été refusé faute de transcription et qu'elle vient d'être installée, relancer `pulse-motion voix importer assets/<fichier> .` ; sans transcription, se replier sur `pulse-motion voix provisoire .` et proposer d'enregistrer dans l'aperçu. Un `avertissement` (scène mal reconnue) se dit en une phrase.
   - Prises déjà là quand la transcription arrive : `pulse-motion voix transcrire .`.
1. Lancer **un agent `animateur` par scène, tous dans le même message** (en parallèle). À chacun : dossier, scène (id, fichier, durée, rythme, intention, textes), style, format, scène toute faite conseillée (son `type`). C'est vous qui décidez quelles scènes reçoivent un effet de particules : au plus deux effets simultanés à l'écran, et en formation courte un ou deux effets dans toute la vidéo. Dire à l'animateur de ces scènes quel effet poser (étincelles sur un chiffre clé, confettis en conclusion) ; les autres n'en ajoutent pas. Avec du son : donner aussi le texte dit de la scène et dire si elle a une prise de voix (ancres `mot:` permises) ; demander 1 à 3 bruitages (`data-son`) sur les éléments clés.
2. Un agent qui a **composé** la scène au lieu de partir de la scène toute faite le dit : retirer alors `type` de cette scène dans `deroule.json`.
3. `pulse-motion assembler .` puis `pulse-motion controler .`.
4. `pulse-motion controler .` corrige seul les cas sûrs (typographie française, majuscules accentuées, durée trop courte pour lire, pause finale, temps mort en fin de scène, texte qui déborde réduit jusqu'à 80 % ; liste complète : `pulse-motion reference controles`) : lire `corrections` dans `sortie/controle.json` et les dire en une phrase à la personne (« J'ai allongé la scène 3 d'une seconde pour laisser le temps de lire. »). Erreurs ou alertes restantes : les corriger (dans la scène, ou dans le déroulé pour une durée), relancer assembler et controler. Deux tours au plus ; ce qui reste est dit à la personne.

## 4. Aperçu

1. `pulse-motion apercu . --ouvrir` **en arrière-plan** : le navigateur s'ouvre sur la vidéo.
2. `pulse-motion controler .` vérifie aussi la vidéo rendue (Chrome ou Edge sans fenêtre) : textes qui débordent, éléments qui se chevauchent ou sortent de l'image, marges, zone des boutons en 9:16, logo masqué, textes trop vite effacés, mouvements trop rapides. Corriger ce qui est signalé (l'aperçu se recharge seul). `renduVerifie: false` avec une alerte `rendu-non-verifie` ou `rendu-impossible` : la dire à la personne (navigateur introuvable ou page en erreur) avec le message du contrôle ; avec `--sans-rendu`, rien à dire.
3. Parcours accompagné (le style est déjà choisi, à l'étape 2) :
   - **Vidéo finale** : faire regarder la vidéo entière dans l'aperçu et demander l'accord (`--accord video`).
   - Un refus : demander ce qui ne va pas et passer par `/pulse-motion:retoucher`.
4. Voix à enregistrer : dire à la personne « Pour enregistrer votre voix, cliquez sur « Voix » dans la barre de l'aperçu : le texte défile, vous parlez, vous réécoutez, vous gardez ou refaites. » Chaque prise gardée remplace la voix de l'ordinateur et recale la scène. Pour lui faire entendre la musique seule : `pulse-motion musique ecouter .` (fichier `sortie/musique.wav`).
5. Pour montrer deux scènes en images fixes (à la demande de la personne) : `pulse-motion planche . <id1>,<id2> --ouvrir`, puis regarder soi-même les images de `sortie/planche/` (avec `Read`).

## 5. Fin

Si la charte a été créée pour cette vidéo, proposer de l'enregistrer pour les suivantes (« Enregistrer ma charte » (Recommandé) · « Pas maintenant ») : `pulse-motion charte enregistrer <nom> .` (nom en minuscules et tirets, ex. `client-dupont`).

Terminer par ce bloc, sans rien après :

✅ **Fait** : la vidéo « <titre> » (<n> scènes, <durée>) est prête et s'affiche dans votre navigateur.
📄 **Fichiers** : la vidéo animée est dans `sortie/<titre>.html` (elle s'ouvre sans connexion).
➡️ **Ensuite** : décrivez une retouche en une phrase avec `/pulse-motion:retoucher` (par exemple « ralentis la scène 3 »), ou exportez la vidéo en MP4 avec `/pulse-motion:exporter`.
