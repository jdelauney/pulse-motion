# Smoke test complet : le parcours de création Pulse Motion

> Essai manuel de bout en bout, **comme le ferait une personne qui ne code pas**, entièrement par des demandes dans Claude Code (aucun terminal) : création guidée, charte, style, scènes, effets, son, aperçu, retouches, reprise, export, charte réutilisée, style personnel.
> Durée : environ 4 h, à faire en 3 séances. Séance 1 : parties 0 à 4. Séance 2 : parties 5 à 8. Séance 3 : parties 9 à 12.
> Pour le son dans le détail (grille d'écoute, mesures de sonie), voir aussi [smoke-test-son.md](smoke-test-son.md).

## Comment lire ce document

Chaque étape donne :

- **Vous dites** : la phrase à taper dans Claude Code, ou la réponse à choisir.
- **Attendu** : ce que Claude doit faire et dire, et les fichiers qui doivent apparaître.
- **À vérifier** : les points à cocher, en particulier ce que voit la personne (langage simple, aucune commande montrée).
- **À noter** : ce qu'il faut me rapporter.

Trois règles valent pour **toutes** les étapes. Toute entorse est un défaut à noter.

1. Claude parle simplement, en français, **sans jargon** (jamais « HTML », « JSON », « CSS ») et **ne montre jamais de commande** à la personne, sauf une qu'elle doit taper elle-même.
2. Les questions passent par des choix cliquables, au plus 4 par ronde, avec une option « (Recommandé) » en premier.
3. Un mot de l'outil (déroulé, scène, style, charte, transition, export…) est expliqué la première fois seulement, puis noté dans le lexique.

---

## 0. Préparation (15 min)

### 0.1 Prérequis

- Un micro et un casque, pour la partie 5.
- Le reste se vérifie par une demande à l'étape 0.2.

### 0.2 Installer le plugin local dans Claude Code

Dans Claude Code :

```
/plugin marketplace add E:\IA-PULSE\pulse-motion
/plugin install pulse-motion@pulse-motion
```

Redémarrez Claude Code si on vous le demande.

**Le plugin est déjà installé ?** Mettez-le à jour, **dans cet ordre** (la seconde commande compare avec le catalogue : sans la première, elle répond « à jour » avec une ancienne version) :

```
/plugin marketplace update pulse-motion
/plugin update pulse-motion@pulse-motion
```

puis redémarrez Claude Code.

**Attendu** : `/pulse-motion:` propose `creer`, `style`, `retoucher`, `voix`, `exporter`, `reprendre`, `outils`, `dessiner-personnage`, `animer-personnage`, `atelier-personnages` et `atelier-particules`.

Ouvrez Claude Code dans un dossier quelconque, puis **dites** : `vérifie mon ordinateur`.

**Attendu** : sans slash commande, Claude dit la version de Pulse Motion installée (**elle doit être celle du dépôt**, champ `version` de `plugins/pulse-motion/.claude-plugin/plugin.json` ; sinon, refaire la mise à jour ci-dessus avant d'aller plus loin), vérifie les outils et répond par un tableau en mots simples (Chrome ou Edge, ffmpeg, Python, transcription, voix de l'ordinateur). Pour chacun : prêt ou non, et à quoi il sert. Les outils absents s'installent par une phrase (« installe ffmpeg »), avec votre accord.

### 0.3 Repartir d'un poste « neuf » (recommandé)

Pour voir le comportement d'une première utilisation (lexique vide, aucune charte enregistrée), mettez de côté vos données personnelles Pulse Motion **sans les supprimer**.

**Vous dites** : `renomme mon lexique, mes chartes et mes styles personnels Pulse Motion (dans .pulse-motion de mon dossier personnel) en ajoutant « .sauve », sans rien supprimer`

**Attendu** : Claude renomme `lexique.md`, `chartes` et `styles` s'ils existent, et le dit.

Gardez `whisper` tel quel. Le rétablissement se fait en fin d'essai (partie 13).

### 0.4 Fichiers à avoir sous la main

- **Logo** : `E:\IA-PULSE\pulse-motion\plugins\pulse-motion\exemples\chaine-du-froid\assets\logo.svg`. Vous pouvez aussi utiliser un vrai logo PNG ou SVG de votre choix.
- **Logo JPEG** (facultatif) : n'importe quelle image `.jpg`, pour tester le refus.
- Un nom de police à citer : **Montserrat**.

### 0.5 Dossiers d'essai

Créez deux dossiers vides, `E:\IA-PULSE\essais\video-1` et `video-2`, avec l'explorateur de fichiers.

Ouvrez Claude Code **dans** `E:\IA-PULSE\essais\video-1` (vide).

---

## 1. Création guidée : questions (15 min)

### 1.1 Lancement

**Vous dites** : `/pulse-motion:creer Les règles d'hygiène HACCP en cuisine collective`

**Attendu**
- Claude vérifie l'état sans rien montrer.
- Il pose une **première ronde de 4 questions** :
  - **Durée** : 30 s · 1 min (Recommandé pour une formation courte) · 3 min · 5 min.
  - **Public**.
  - **Parcours** : Rapide (Recommandé) · Accompagné.
  - **À ajouter** : « mon logo et mes couleurs » · « rien pour l'instant ».

**Vous répondez** : **1 min**, **professionnels du métier**, **Accompagné**, **mon logo et mes couleurs**.

### 1.2 Deuxième ronde : le son

**Attendu** : une ronde **« Le son »** de 3 questions :
- **Musique** : « Une musique composée pour la vidéo (Recommandé) » · « J'ai un fichier » · « Pas de musique ». L'ambiance est décrite en mots simples, jamais par un nom technique.
- **Voix** : « Je l'enregistre (Recommandé) » · « J'ai un fichier » · « Pas de voix ».
- **Sous-titres** : « Oui (Recommandé) » · « Non ».

**Vous répondez** : **musique composée**, **je l'enregistre**, **sous-titres oui**.

### 1.3 Logo, couleurs, police

**Attendu** : Claude demande le logo (chemin ou glisser-déposer).

1. *(Facultatif)* Donnez d'abord le **JPEG**. **Attendu** : Claude demande un PNG ou un SVG, sans erreur technique.
2. Donnez le **logo SVG** (chemin de l'étape 0.4).

**Attendu**
- Le logo est copié dans `charte\logo.svg`.
- Claude annonce en une phrase les couleurs tirées du logo (primaire, accent) et les ajustements faits pour qu'elles restent lisibles.
- `charte\charte.json` contient `couleurs.primaire`, `couleurs.accent` et `logo`.

**Vous dites** : `Ma police pour les titres, c'est Montserrat.`

**Attendu** : la police est récupérée (`charte\polices\` contient des fichiers Montserrat) et `charte.json` gagne `"polices": { "titres": "Montserrat" }`. Claude le confirme en une phrase.

**À noter** : le nombre de questions et leur clarté ; toute question posée en double ou inutile.

---

## 2. Déroulé et style (20 min)

### 2.1 Déroulé proposé

**Attendu**
- Claude écrit `deroule.json` : formation, 16:9, environ 6 à 8 scènes, total proche de 60 s.
- Chaque scène a un `type` (titre, liste, chiffre…) et un **`voix.texte`** (le texte dit).
- On trouve aussi `"sousTitres": {}` et `"musique": { "generee": "…", "tempo": 120, "volume": 0.5 }`.

**Glossaire** : Claude propose de noter **HACCP** (sens, formes à éviter).
**Vous répondez** : oui. **Attendu** : `charte\glossaire.md` contient HACCP.

**Comparaison des styles** : le navigateur s'ouvre sur une comparaison de 3 styles appliqués à vos deux premières scènes.
**Attendu** : les images sont dans `sortie\comparaison\`.

**Présentation** : un tableau avec n°, scène, texte à l'écran, **texte dit** et durée, puis la durée totale.
**Question** : « Je valide » (Recommandé) · « Je veux changer quelque chose ».

**À vérifier**
- Les textes dits font une idée par phrase et des phrases courtes.
- Aucune scène n'est trop courte pour son texte : au plus 3,5 mots par seconde.
- Les durées sont en demi-secondes : la musique est à 120 bpm, et chaque scène doit commencer sur un temps.

### 2.2 Une correction du déroulé

**Vous dites** : « Je veux changer quelque chose », puis `Ajoute une scène sur le lavage des mains, avant la conclusion.`

**Attendu** : un déroulé corrigé, représenté avec le même tableau.

**Vous répondez** : « Je valide ».

### 2.3 Choix du style (parcours accompagné)

**Attendu** : une question à part sur le style, avec 3 styles décrits par leur personnalité en trois mots (par exemple « posé, lisible, rassurant »), le premier recommandé.

**Vous choisissez** le **deuxième** style, pour tester le changement.

**Attendu** : `deroule.json` → `"style"` change. Aucune scène n'est encore écrite, donc pas de réécriture.

**À noter** : la comparaison des styles vous aide-t-elle vraiment à choisir ?

---

## 3. Fabrication (15 à 25 min, surtout de l'attente)

### 3.1 Voix provisoire et transcription

**Attendu, avant les scènes**
- Claude génère la **voix provisoire** (voix de l'ordinateur) : `assets\voix\provisoire\*.wav`, et `deroule.json` → `"voix": { "provisoire": true }`.
- Il vérifie la transcription. Si elle n'est pas prête, il propose **une fois** de l'installer : « Installer la transcription (Recommandé) » · « Plus tard ».

**Vous répondez** : **Plus tard**. Elle sera installée en partie 5.

**Attendu** : une phrase simple du type « les mots seront calés au mieux ».

### 3.2 Scènes

**Attendu**
- Plusieurs agents « animateur » travaillent **en parallèle**, un par scène.
- Claude décide des effets de particules : au plus un ou deux dans toute la vidéo (par exemple des étincelles sur un chiffre clé, des confettis en conclusion).
- Les fichiers `scenes\NN-<id>.html` sont écrits.
- `sortie\<titre>.html` est assemblée.

### 3.3 Contrôle et corrections automatiques

**Attendu**
- Claude dit **en une phrase** ce que le contrôle a corrigé seul, par exemple « J'ai allongé la scène 3 d'une seconde pour laisser le temps de lire. ».
- Il corrige le reste, en deux tours au plus.
- Ce qui reste est dit simplement : les alertes « voix provisoire » sont normales à ce stade.
- `sortie\controle.json` existe.

**À vérifier** : `sortie\controle.json` ne contient **aucune erreur** (`"gravite": "erreur"`).

---

## 4. Aperçu et vidéo finale (15 min)

### 4.1 Aperçu

**Attendu**
- Le navigateur s'ouvre sur l'aperçu (`http://localhost:4321/` ou un autre port).
- Une barre de lecture est en bas, avec un bouton **« Voix »**.

**Regardez toute la vidéo, au casque.**

**À vérifier**

| Point | Attendu |
|---|---|
| Mise en page | Aucun texte qui déborde, se chevauche ou sort de l'image ; marges respectées |
| Charte | Vos couleurs ; le logo visible et non masqué ; Montserrat pour les titres |
| Rythme | Chaque texte reste le temps d'être lu ; rien d'immobile plus de 2,5 s ; la dernière image est stable |
| Effets | Les particules posées par Claude sont à propos, et pas sur un texte qu'on lit |
| Musique | Ambiance cohérente avec le sujet ; introduction sans percussion ; montée avant la dernière scène ; fin en fondu |
| Voix provisoire | Chaque scène lit son texte ; la musique baisse sous la voix |
| Bruitages | Quelques sons discrets sur les éléments clés (1 à 3 par scène) ; aucun son fort pendant un mot |
| Sous-titres | Calés sur la voix, 2 lignes au plus, lisibles, ne cachent ni texte ni logo |

### 4.2 Raccourcis du lecteur

| Touche | Attendu |
|---|---|
| Espace | Lecture / pause |
| Flèche droite / gauche | Image suivante / précédente |
| Maj + flèche | Scène suivante / précédente |
| B | Boucle sur la scène en cours (« (boucle) » affiché) ; B de nouveau pour l'arrêter |

### 4.3 Accord sur la vidéo finale

**Attendu** : Claude vous demande de regarder la vidéo entière, puis votre accord.

**Vous répondez** : d'abord un **refus** : `Non, le titre de la première scène est trop long.`

**Attendu** : Claude passe par une retouche (le texte du titre change) et l'aperçu se recharge seul, à la même position.

**Vous répondez** ensuite : **accord**.

### 4.4 Fin de la création

**Attendu**
- Claude propose d'**enregistrer votre charte** pour les prochaines vidéos : « Enregistrer ma charte » (Recommandé) · « Pas maintenant ».
- **Vous répondez** : enregistrer, nom `hygiene-test`. **Attendu** : `~\.pulse-motion\chartes\hygiene-test\` existe, avec `charte.json`, le logo, les polices et le glossaire.
- Le message final est exactement composé de trois lignes, sans rien après :
  - ✅ **Fait** : la vidéo « … » (n scènes, durée) est prête…
  - 📄 **Fichiers** : `sortie/<titre>.html` (s'ouvre sans connexion).
  - ➡️ **Ensuite** : retoucher… ou exporter…

**À vérifier** : `~\.pulse-motion\lexique.md` existe et contient les mots expliqués pendant la création (déroulé, scène, style, charte…).

**À noter** : votre impression générale sur la vidéo produite (qualité visuelle, cohérence, rythme) **avant** toute retouche.

---

## 5. Voix réelle : studio et transcription (20 min)

### 5.1 Installer la transcription

**Vous dites** : `installe la transcription` (sans slash).

**Attendu**
- Claude explique en une phrase à quoi elle sert et sa taille (environ 800 Mo), puis demande votre accord.
- Il installe en arrière-plan, puis confirme.
- À ce stade, il n'y a encore aucune vraie prise : rien à recaler.
- Si elle est déjà prête, il le dit.

### 5.2 Enregistrer dans le studio

**Vous dites** : `j'enregistre la première scène` (sans slash). Le studio s'ouvre dans l'aperçu, sur cette scène ; on peut aussi l'ouvrir par le bouton **« Voix »** de la barre de lecture. Puis **● Enregistrer** → autoriser le micro → compte à rebours → lire le prompteur → **■ Arrêter** → **▶ Réécouter** → **Garder**.

**Attendu**
- « Prise gardée ; transcription en cours, l'aperçu se mettra à jour. ».
- Rechargement, puis « (enregistrée) » dans la liste.
- `deroule.json` → `voix.fichier` est renseigné pour cette scène.
- `assets\voix\<scène>.mots.json` passe à `"approche": "whisper"` après quelques secondes.

Enregistrez **2 ou 3 scènes** de plus, dont celle qui porte le chiffre clé.

**À vérifier**
- Les sous-titres suivent exactement vos mots.
- La scène s'allonge si vous parlez plus lentement que prévu.
- La musique baisse sous votre voix.
- Votre voix est propre, sans souffle grave ni saturation.

### 5.3 Ancre sur un mot

**Vous dites** : `/pulse-motion:retoucher Dans la scène du chiffre, fais apparaître le chiffre au moment où je le dis.`

**Attendu**
- Claude pose `data-start="mot:<mot>"` sur le chiffre, ce qui n'est possible que parce que la scène a une prise.
- À la lecture, le chiffre arrive **sur votre mot**.

Réenregistrez cette scène avec une pause avant le chiffre. **Attendu** : le chiffre attend votre mot, sans autre retouche.

---

## 6. Retouches en une phrase (30 min)

Chaque retouche se dit **telle quelle, sans slash** : c'est aussi le test du déclenchement en langage courant. Pour une retouche sur trois, tapez-la plutôt avec `/pulse-motion:retoucher <phrase>`, pour vérifier les deux façons.

**À vérifier à chaque fois**
- Une copie d'historique est faite.
- C'est le **plus petit changement** qui répond à la phrase.
- Le contrôle est relancé, et ce qu'il corrige seul est dit.
- L'aperçu se recharge à la même position.
- Le bloc de fin ✅📄➡️ apparaît.

| # | Vous dites | Attendu |
|---|---|---|
| 6.1 | `Change le titre de la conclusion en « Un geste, une protection »` | Texte changé dans le déroulé ; rien d'autre ne bouge |
| 6.2 | `Ralentis la scène 2` | `rythme` à 0,8 sur cette scène ; animations plus lentes |
| 6.3 | `Laisse plus de temps à la fin` | Durée de la dernière scène + 1 à 2 s |
| 6.4 | `Le chiffre doit rebondir` | Fichier de la scène modifié (courbe à rebond) |
| 6.5 | `Plus d'étincelles, en bleu` | `data-reglages` : `nombre` doublé, `couleur` en `#rrggbb` ou `primaire` |
| 6.6 | `Enlève les confettis` (ou l'effet de la conclusion) | Balise d'effet retirée |
| 6.7 | `Ajoute de la neige derrière la scène d'introduction` | Effet `neige`, calque arrière, sur toute la scène |
| 6.8 | `Annule` | La dernière retouche est défaite ; l'aperçu revient à l'état d'avant |
| 6.9 | `Baisse la musique` | `musique.volume` plus bas |
| 6.10 | `Une autre variante de la musique` | `graine` + 1 ; même ambiance, autres accords |
| 6.11 | `Plus calme` | Ambiance plus calme ou `intensite` plus basse |
| 6.12 | `Mets un son quand le titre arrive` | `data-son` sur le titre (son doux) |
| 6.13 | `Enlève les bruitages` | Plus de `data-son` ; `bruitages.transitions` retiré |
| 6.14 | `Sous-titres mot par mot` | `sousTitres.mode: "mot"` ; le mot dit passe en couleur d'accent |
| 6.15 | `Sous-titres en haut` | `sousTitres.position: "haut"` |
| 6.16 | `Baisse ma voix` | `voix.volume` < 1 |
| 6.17 | `Je réenregistre la scène 3` | Le studio s'ouvre dans l'aperçu sur la scène 3 (rien n'est modifié tant qu'une prise n'est pas gardée : pas de copie d'historique ni de contrôle à ce moment) |
| 6.18 | `Passe en sombre` | `"ton": "sombre"` dans la charte du déroulé ; couleurs lisibles. Si le style n'a pas de ton sombre (`ton-indisponible`), Claude le dit simplement |
| 6.19 | `Change la transition entre la scène 2 et 3 en balayage` | `transition` de la scène 3 |
| 6.20 | `Passe en style éditorial` | Changement de style : scènes toutes faites recopiées, scènes composées réécrites par les animateurs |
| 6.21 | `Supprime la scène 4` | Scène retirée du déroulé et fichiers renumérotés |
| 6.22 | `Ralentis` (sans préciser) | **Une seule question** (quelle scène ? de combien ?), réponse recommandée en premier |
| 6.23 | `Annule` × 3 | Retours successifs ; au-delà de l'historique : « Aucune retouche à annuler », dit simplement |

**À noter** : chaque retouche mal comprise, trop large (autre chose a changé) ou qui casse l'aperçu.

---

## 7. Reprise d'une vidéo (10 min)

1. Fermez Claude Code, puis rouvrez-le dans `E:\IA-PULSE\essais\video-1`.

   **Attendu** : au démarrage, un rappel de la vidéo en cours dans ce dossier (hook de session).
2. **Vous dites** : `où en est ma vidéo ?` (sans slash ; le refaire une autre fois avec `/pulse-motion:reprendre`)

   **Attendu**
   - Une phrase simple sur l'état de la vidéo (titre, étape).
   - L'aperçu se rouvre s'il était fermé.
   - Claude propose une retouche.
   - Aucun mot déjà expliqué n'est réexpliqué en entier.
3. Fermez l'onglet de l'aperçu, puis **dites** : `/pulse-motion:retoucher Accélère la scène 1`.

   **Attendu** : l'aperçu est relancé et rouvert.
4. **Cas limite** : dans `video-1`, **dites** `/pulse-motion:creer Une autre vidéo`.

   **Attendu** : Claude dit qu'une vidéo existe déjà ici et propose de la reprendre, ou de créer la nouvelle dans un autre dossier.

---

## 8. Export (20 min)

Rétablissez d'abord les réglages pour un export propre. **Vous dites** : `remets les sous-titres en bas, ligne par ligne, et remets les bruitages`.

### 8.1 Export avec voix provisoire restante

**Vous dites** : `exporte ma vidéo` (sans slash).

**Attendu**
- Claude contrôle la vidéo d'abord. Des erreurs bloquantes seraient proposées à la correction ; les alertes sont dites en une phrase.
- Il signale que des scènes ont encore la voix de l'ordinateur et propose : « Enregistrer ma voix d'abord (Recommandé) » · « Exporter une version de travail avec la voix de l'ordinateur ».

**Vous répondez** : « Enregistrer ma voix d'abord ».

**Attendu** : Claude explique comment ouvrir le studio, puis **s'arrête sans exporter**.

### 8.2 Enregistrer les scènes manquantes

Dans le studio, enregistrez toutes les scènes restantes.

### 8.3 Export fidèle

**Vous dites** : `/pulse-motion:exporter`

**Attendu**
- ffmpeg est détecté : export fidèle lancé en arrière-plan, sans installation demandée.
- Le résumé donne la durée, le son et le mode « export fidèle ».
- Fichiers : `sortie\<titre>.mp4`, `sortie\<titre>.html`, `sortie\<titre>.srt` et `sortie\<titre>.vtt`.
- Le bloc de fin mentionne les sous-titres en fichiers, à joindre sur YouTube, LinkedIn ou une plateforme de formation.

**À vérifier**
- Le MP4 se lit dans VLC : image nette, son identique à l'aperçu, particules présentes.
- La page HTML s'ouvre **hors connexion** (Wi-Fi coupé) et se lit avec son.
- Le `.srt` se charge dans VLC et s'affiche en même temps que les sous-titres incrustés.

### 8.4 Variantes

| Vous dites | Attendu |
|---|---|
| `/pulse-motion:exporter` puis « une version plus légère pour l'envoyer par courriel » | Export en 720p |
| « plus fluide » | Export en 60 images/s, environ deux fois plus long |
| Interrompre un export (fermer Claude Code pendant l'export), puis relancer | Les parties déjà faites sont reprises ; aucun fichier incomplet |

**À noter** : la durée de l'export fidèle de 1 min en 1080p, et votre jugement sur la qualité du MP4.

---

## 9. Deuxième vidéo : charte réutilisée, réseaux sociaux en 9:16 (25 min)

Ouvrez Claude Code dans `E:\IA-PULSE\essais\video-2`.

**Vous dites** : `/pulse-motion:creer 3 astuces contre le gaspillage alimentaire, pour Instagram`

**Attendu**
- Genre « social », format **9:16**.
- La question « À ajouter » propose d'abord **« Ma charte hygiene-test »**.
- Le lexique est déjà connu : les mots ne sont plus réexpliqués en entier.
- **Son** : la question des sous-titres propose d'abord le **mode mot par mot**, recommandé en 9:16.

**Vous répondez** :
- **30 s**, **grand public**, **Rapide** ;
- **Ma charte hygiene-test** ;
- musique composée, **pas de voix**, sous-titres **oui**.

**Attendu**
- La charte est appliquée : vos couleurs, le logo, Montserrat ; les réglages remplacés sont dits en une phrase.
- **Pas de voix** : Claude ignore la réponse sur les sous-titres et dit qu'il n'y aura pas de sous-titres sans voix.
- Parcours rapide : une seule question, « Je valide, avec le style … ».
- Ambiance plutôt entraînante.

**À vérifier dans l'aperçu**
- Mise en page en colonne, sans chevauchement.
- Rien dans les **zones des boutons** des réseaux : bandeau du haut, légende du bas, colonne de droite. Le contrôle rendu le vérifie.
- Logo visible et rythme plus vif.

**Exportez** : `/pulse-motion:exporter`. **Attendu** : un MP4 vertical 1080 × 1920, sans question sur la voix.

---

## 10. Style personnel (40 min)

Toujours dans `video-2`, ou dans un dossier vide :

**Vous dites** : `/pulse-motion:style Un style papercraft aux couleurs pop-art`

**Attendu, dans l'ordre**

1. **Entretien**, une question à la fois, avec des réponses proposées :
   - personnalité (trois mots, et ce qu'il faut éviter) ;
   - références ;
   - couleur ;
   - polices (deux familles Bunny Fonts, vérifiées) ;
   - mouvement.
2. **Squelette** :
   - `~\.pulse-motion\styles\<nom>\` est créé à partir du style livré le plus proche ;
   - polices téléchargées, avec licences notées ;
   - `identite.json`, `charte.json` et `style.css` écrits.
3. **Scènes témoins** :
   - les scènes `titre` et `liste` sont écrites ;
   - une **planche** s'ouvre dans le navigateur ;
   - question « C'est ce que je veux (Recommandé) » · « Je veux changer quelque chose ».

   **Vous dites** une fois « Je veux changer quelque chose », par exemple `Les titres plus gros et plus penchés`, puis vous validez.
4. **Les six autres scènes** :
   - écrites en parallèle ;
   - planche des 8 scènes en 16:9 **et** en 9:16 ;
   - planche « textes au maximum » pour vérifier le pire cas.
5. **Vérification** : rien ne doit déborder, à aucun format.
6. Fin : ✅📄➡️ ; le style sera proposé pour les prochaines vidéos.

**Puis dites** : `/pulse-motion:retoucher Passe en style <nom du style>`

**Attendu** : la vidéo 2 passe dans votre style personnel.

**À noter**
- La qualité visuelle du style obtenu : est-il vraiment « papercraft pop-art » ?
- Les débordements éventuels.
- La durée totale.

---

## 11. Cas limites (15 min)

| # | Situation | Attendu |
|---|---|---|
| 11.1 | Dans un dossier vide, `/pulse-motion:retoucher Ralentis` | Pas de vidéo ici : Claude propose `/pulse-motion:creer` |
| 11.2 | `/pulse-motion:exporter` dans un dossier vide | Même réponse |
| 11.3 | Dans video-1, couleur de marque très claire : `/pulse-motion:retoucher Mets la couleur principale en jaune pâle #fff8c0` | Couleur appliquée, mais rendue lisible (variantes lisibles) ; le contrôle signale un contraste insuffisant restant |
| 11.4 | `/pulse-motion:retoucher Change le texte de la scène 2 en` + une phrase de 40 mots | Le contrôle signale un texte trop long, ou réduit le texte jusqu'à 80 % ; Claude le dit et propose de raccourcir |
| 11.5 | Studio : enregistrer sans rien dire | « La prise semble vide… » ; rien n'est gardé |
| 11.6 | Studio : refuser le micro dans Chrome | Message clair qui dit comment autoriser le micro ou importer un fichier |
| 11.7 | `j'ai un fichier de ma voix pour toute la vidéo` + un fichier audio des textes enchaînés | Le fichier est lu où il est, découpé par scène (transcription requise ; sinon Claude propose de l'installer) ; une scène mal reconnue est signalée |
| 11.8 | Fermer l'aperçu, puis `/pulse-motion:reprendre` | Aperçu relancé |

---

## 12. Fiche de résultats à me renvoyer

| Partie | Étape | OK / KO | Remarque |
|---|---|---|---|
| 1 | Questions (2 rondes, clarté) | | |
| 1.3 | Logo (JPEG refusé, SVG pris), couleurs, police | | |
| 2.1 | Déroulé : textes dits, durées, glossaire, comparaison des styles | | |
| 2.3 | Choix du style | | |
| 3 | Voix provisoire, scènes en parallèle, corrections dites | | |
| 4.1 | Aperçu : mise en page, charte, rythme, effets, son, sous-titres | | |
| 4.3 | Refus puis accord de la vidéo finale | | |
| 4.4 | Charte enregistrée, lexique, bloc de fin | | |
| 5 | Transcription, studio, ancre sur un mot | | |
| 6 | Retouches (lister les numéros KO) | | |
| 7 | Rappel au démarrage, reprise | | |
| 8.1 | Export refusé puis arrêt propre | | |
| 8.3 | Export fidèle, HTML hors connexion, SRT | | |
| 8.4 | Variantes d'export | | |
| 9 | Vidéo 9:16 avec charte enregistrée | | |
| 10 | Style personnel | | |
| 11 | Cas limites (lister les numéros KO) | | |
| — | **Jargon ou commande montrée** (noter chaque occurrence) | | |
| — | **Impression générale** : qualité des vidéos, temps total, ce qui a agacé | | |

Joignez aussi :
- les rapports du contrôle des deux vidéos (« montre-moi le rapport du contrôle », dans chaque dossier) ;
- chaque phrase qui n'a pas déclenché la bonne action, telle que vous l'avez tapée ;
- les messages d'erreur en entier ;
- 2 ou 3 captures d'écran des moments qui vous ont déplu.

---

## 13. Remise en état (2 min)

Rétablissez vos données personnelles mises de côté à l'étape 0.3. Regardez d'abord ce que l'essai a créé : la remise en état **supprime** la charte `hygiene-test`, le lexique et les styles personnels créés pendant l'essai. Gardez-les ailleurs si vous voulez les conserver.

**Vous dites** : `dans .pulse-motion de mon dossier personnel, supprime le lexique, les chartes et les styles créés pendant l'essai, puis remets les versions « .sauve » à leur nom d'origine`

**Attendu** : Claude montre ce qu'il va supprimer, demande confirmation, puis rétablit les trois éléments.

Les dossiers `E:\IA-PULSE\essais\video-1` et `video-2` peuvent être gardés comme témoins, ou supprimés.
