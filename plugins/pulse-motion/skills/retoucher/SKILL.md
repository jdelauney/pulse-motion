---
description: Retoucher la vidéo Pulse Motion du dossier en une phrase et la voir aussitôt (« ralentis la scène 3 », « change le titre », « baisse la musique », « ouvre l'aperçu », « fais une planche des scènes 2 et 3 », « enregistre ma charte », « annule »). Pour enregistrer ou importer une voix, c'est /pulse-motion:voix ; pour une nouvelle vidéo, /pulse-motion:creer.
argument-hint: "[la retouche en une phrase]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:retoucher – Une phrase, une retouche

Appliquer la retouche demandée, puis laisser l'aperçu se recharger à la même position.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande.
- Une retouche = le plus petit changement qui répond à la phrase. Ne pas « améliorer » autre chose.
- Phrase ambiguë (quelle scène ? de combien ?) : une seule question avec `AskUserQuestion`, réponse recommandée en premier.
- Lexique : avant d'expliquer un mot de l'outil (déroulé, scène, style, charte, transition, export…), lire `pulse-motion lexique`. Un mot déjà noté n'est pas réexpliqué en entier ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:retoucher"`, en reprenant l'image fixe du lexique quand elle existe.

## 1. Vérifier

`pulse-motion etat .` : sans vidéo (`projet` faux), proposer `/pulse-motion:creer` et s'arrêter. La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## 2. « Annule » (ou « reviens en arrière »)

`pulse-motion historique annuler .`, puis aller à l'étape 5. Échec « Aucune retouche à annuler » : le dire simplement.

## 3. Sauvegarder

`pulse-motion historique sauvegarder .` **avant** tout changement. (Un changement de style se sauvegarde lui-même : passer directement à l'étape 4.) Les demandes qui ne modifient pas la vidéo (ouvrir l'aperçu, faire une planche, comparer des styles, enregistrer la charte, noter un terme au glossaire) : ni copie ni contrôle, aller directement à l'étape 4 puis à la fin.

## 4. Appliquer

Classer la demande, puis :

| Catégorie | Exemples | Où |
|---|---|---|
| Texte | « change le titre », « corrige la faute » | `scenes[].textes` du déroulé |
| Rythme, durée | « ralentis la scène 3 » (rythme 0,8), « accélère » (1,25), « laisse plus de temps à la fin » (duree + 1 à 2 s) | `rythme` ou `duree` du déroulé |
| Visuel d'une scène | « le chiffre doit rebondir », « mets la liste à droite » | le fichier de la scène (agent `animateur` pour une refonte, en lui donnant les `scenes[].mouvements` de la scène à garder ; sinon modification directe) |
| Mouvement nommé | « un pop-in sur le titre », « mets un #012 », « un whip pan entre la scène 2 et la 3 », « le titre en machine à écrire » | `pulse-motion mouvements afficher <n° ou nom>` (sinon `pulse-motion mouvements chercher <mot>` ; rien d'exact : proposer les deux plus proches avec `AskUserQuestion`) ; une transition : `transition` de la scène qui **entre**, dans le déroulé ; sinon appliquer la recette dans le fichier de la scène, sur l'élément visé (en retirant sa classe d'entrée du style : `entre-bas`, `tombe`…), et l'ajouter à `scenes[].mouvements` : `"#001"`, ou `{ "mouvement": "#001", "element": "logo" }` quand il ne vise pas le titre |
| Effet de particules | « plus d'étincelles », « en bleu », « fais-les partir autrement », « enlève les confettis », « ajoute des confettis à la fin » | la balise `data-effet` de la scène : `data-reglages`, `data-graine`, `data-calque`, `data-start`/`data-dur` ; l'ajouter ou la supprimer |
| Style | « passe en style éditorial », « quelque chose de plus chaleureux » | `pulse-motion styles --genre <genre>` pour trouver le style (en cas de doute, proposer 2 styles avec `pulse-motion comparer . <style1>,<style2> --ouvrir`), puis `pulse-motion changer-style . <style>` : les scènes toutes faites sont recopiées ; les scènes de `aReecrire` sont confiées à un agent `animateur` chacune, en parallèle, dans le nouveau style, avec leurs `scenes[].mouvements` à ré-appliquer |
| Global | « mets mes couleurs », « baisse la musique », « change la transition » | `charte/charte.json` (couleurs, polices, logo), `musique`, `transition` du déroulé ; « prends les couleurs de mon logo » : `pulse-motion charte depuis-logo charte/logo.<ext> --style <style>` ; « applique la charte Dupont » : `pulse-motion charte appliquer <nom> .` ; « change la police des titres » : `pulse-motion police "<famille>"` ; « passe en sombre » : `"ton": "sombre"` dans `charte` du déroulé |
| Voix | « baisse la voix », « je réenregistre la scène 3 », « j'ai un nouvel enregistrement », « change ce que je dis dans l'intro », « ajoute une voix à la vidéo » | `voix.volume` du déroulé ; ajouter une voix : écrire le `voix.texte` de chaque scène (une idée par phrase, au plus 3,5 mots par seconde ; allonger la scène sinon), `"sousTitres": {}` si la personne en veut, puis `pulse-motion voix provisoire .` ; enregistrement de toute la vidéo, ou toute autre demande sur les prises : suivre `/pulse-motion:voix` (`pulse-motion consignes voix`) ; réenregistrer : `pulse-motion voix studio <id> .` en arrière-plan (le studio s'ouvre dans l'aperçu ; la prise gardée recale la scène toute seule) ; fichier pour une scène : `pulse-motion voix importer "<chemin>" --scene <id> .` (sans copie) ; texte dit changé : `scenes[].voix.texte`, puis `pulse-motion voix provisoire --scene <id> .` si la scène est en voix provisoire, ou proposer de réenregistrer ; mots recalés par la transcription : `pulse-motion voix transcrire .` |
| Musique | « plus calme », « plus entraînant », « une autre variante », « baisse la musique », « enlève la musique », « coupe la musique pendant la scène 4 », « la musique à fond sur la démo » | ambiance (`musique.generee`) ou `intensite` (plus bas = plus calme) ; humeur d'une scène : `scenes[].musique` (`silence`, `calme`, `normale`, `intense`) ; partition écrite : une piste par scène (`"scene": "<id>"`, `pulse-motion reference audio`) ; « une autre variante » : `graine` + 1 ; `musique.volume` ; retirer `musique` ; « fais-moi écouter » : `pulse-motion musique ecouter . --ouvrir` (la musique seule s'ouvre dans le lecteur) |
| Bruitages | « enlève les bruitages », « mets un son quand le titre arrive », « moins fort » | retirer les `data-son` des scènes et `bruitages.transitions` ; `data-son` sur l'élément (sons : `pulse-motion reference audio`) ; `bruitages.volume` ou `data-son-volume` |
| Sous-titres | « sous-titres en haut », « mot par mot », « enlève-les de l'image », « enlève les sous-titres » | `sousTitres.position` (`haut`) ; `sousTitres.mode` (`mot`) ; `sousTitres.incrustes: false` (les fichiers `.srt` et `.vtt` restent) ; retirer `sousTitres` |
| Aperçu et images | « ouvre l'aperçu », « fais une planche des scènes 2 et 3 », « compare avec un autre style » | `pulse-motion apercu . --ouvrir` en arrière-plan (il rouvre l'aperçu déjà lancé, ou le démarre ; attendre sa ligne « Aperçu ») ; `pulse-motion planche . <ids> --ouvrir` (images fixes dans `sortie/planche/`, à regarder aussi soi-même avec `Read`) ; `pulse-motion comparer . <style1>,<style2> --ouvrir` en arrière-plan (images dans `sortie/comparaison/`) |
| Charte et glossaire | « enregistre ma charte sous le nom dupont », « applique la charte dupont », « note HACCP au glossaire » | `pulse-motion charte enregistrer <nom> .` (nom en minuscules et tirets) ; `pulse-motion charte appliquer <nom> .` (une retouche : les réglages remplacés se disent en une phrase) ; `pulse-motion glossaire noter . "<terme>" "<sens>" "<formes à éviter>"` |
| Structure | « ajoute une scène sur… », « supprime la scène 4 » | déroulé + fichier de scène (agent `animateur`) ; numéroter les fichiers dans l'ordre ; écrire « type » (le nom de la scène) pour une scène tirée d'une scène toute faite du style, le retirer pour une scène composée ; vidéo avec une voix : écrire aussi le `voix.texte` de la nouvelle scène, puis `pulse-motion voix provisoire --scene <id> .` (ou proposer de l'enregistrer dans le studio) |
| Personnages | « dessine-moi un cuisinier », « il marche trop vite », « fais-lui une tête surprise », « ouvre l'éditeur de personnage » | suivre le skill dédié (`pulse-motion consignes <skill>`) : dessiner ou retoucher un dessin → `dessiner-personnage` ; animer une illustration fournie (SVG) → `decouper-personnage` ; pose, mouvement, expression, planche → `animer-personnage` ; régler à la souris → `atelier-personnages` |

Lire `pulse-motion reference moteur` avant de toucher au fichier d'une scène, `pulse-motion reference audio` pour le son, et `pulse-motion reference particules` pour un effet (table « Retouches en une phrase »).

Régler un effet de particules ou un personnage en le regardant (« ouvre l'éditeur », « laisse-moi régler ») : suivre `pulse-motion consignes atelier-particules` ou `pulse-motion consignes atelier-personnages` (demander lequel si la phrase ne le dit pas).

## 5. Vérifier et montrer

1. `pulse-motion assembler .` puis `pulse-motion controler .` ; corriger ce que la retouche a cassé (deux tours au plus). Les `corrections` de `sortie/controle.json` (faites seules par le contrôle : typographie, durées, taille d'un texte qui débordait ; liste complète : `pulse-motion reference controles`) sont dites à la personne ; `pulse-motion controler . --sans-correction` si elle a demandé une durée ou une graphie précise.
2. Aperçu : il se recharge seul s'il est ouvert ; s'il a été fermé (`apercu.actif` faux dans `pulse-motion etat .`), `pulse-motion apercu . --ouvrir` en arrière-plan.
3. Le contrôle de l'étape 1 a vérifié la vidéo rendue (débordements, chevauchements, marges, zone des boutons en 9:16…) ; `renduVerifie: false` se dit à la personne.

## 6. Fin

✅ **Fait** : <la retouche, en une phrase>.
📄 **Fichiers** : `sortie/<titre>.html` est à jour ; l'aperçu s'est rechargé.
➡️ **Ensuite** : une autre retouche avec `/pulse-motion:retoucher`, « annule » pour revenir en arrière, ou l'export en MP4 avec `/pulse-motion:exporter`.
