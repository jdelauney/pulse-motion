---
description: "Retoucher la vidéo Pulse Motion du dossier en une phrase et la revoir (« ralentis la scène 3 », « change le titre », « baisse la musique », « annule »). Voix : /pulse-motion:voix ; nouvelle vidéo : /pulse-motion:creer."
argument-hint: "[la retouche en une phrase]"
allowed-tools: Bash(pulse-motion *) Bash(node *) Monitor Read Glob Grep Write Edit Agent AskUserQuestion
---

# /pulse-motion:retoucher – Une phrase, une retouche

Appliquer la retouche demandée, puis laisser l'aperçu se recharger à la même position.

## État de la vidéo, lu au lancement

!`pulse-motion etat . 2>&1 || true`

Si ce bloc est vide ou contient une erreur, lancer `pulse-motion etat .`.

Lexique de la personne :

!`pulse-motion lexique 2>&1 || true`

Si ce bloc est vide ou contient une erreur, lancer `pulse-motion lexique`.

## Règles

- Parler simplement, en français, sans jargon ; ne jamais montrer de commande.
- Une retouche = le plus petit changement qui répond à la phrase. Ne pas « améliorer » autre chose.
- Phrase ambiguë (quelle scène ? de combien ?) : une seule question avec `AskUserQuestion`, réponse recommandée en premier.
- Problème du contrôle : dire son `message`, corriger avec sa `consigne`.
- Travail long (scènes réécrites, contrôle complet) : l'annoncer en une phrase avec sa durée ; en arrière-plan, le suivre par `Monitor` sur `pulse-motion avancement . --suivre`, une phrase par minute au plus.
- Lexique : un mot de l'outil déjà noté ci-dessus n'est pas réexpliqué en entier ; un mot expliqué pour la première fois se note avec `pulse-motion lexique noter "<terme>" "<phrase>" "<comme…>" "/pulse-motion:retoucher"`.

## 1. Vérifier

L'état ci-dessus : sans vidéo (`projet` faux), proposer `/pulse-motion:creer` et s'arrêter. « Node.js introuvable » : l'installer (`/pulse-motion:outils`), et s'arrêter.

## 2. Historique

« annule », « reviens en arrière » : `pulse-motion historique annuler .` ; « rétablis », « finalement remets-le » : `pulse-motion historique retablir .` ; « reviens à la version envoyée au client » : `pulse-motion historique revenir <nom ou numéro> .` ; puis l'étape 5. « garde cette version sous le nom « envoyée au client » » : `pulse-motion historique nommer "<nom>" .` (« oublie la version … » : `historique oublier "<nom>" .`) ; « quelles versions ai-je ? » : `pulse-motion historique liste .`, dite en mots simples (date, retouche, nom) ; puis la fin.

## 3. Sauvegarder

`pulse-motion historique sauvegarder . --phrase "<la demande>"` **avant** tout changement. (Un changement de style se sauvegarde lui-même.) Une demande qui ne modifie pas la vidéo (aperçu, planche, comparaison, charte enregistrée, glossaire) : ni copie ni contrôle, l'étape 4 puis la fin.

## 4. Appliquer

Classer la demande, puis :

| Catégorie | Exemples | Où |
|---|---|---|
| Texte | « change le titre », « corrige la faute » | `scenes[].textes` du déroulé |
| Rythme, durée | « ralentis la scène 3 » (rythme 0,8), « accélère » (1,25), « laisse plus de temps à la fin » (duree + 1 à 2 s) | `rythme` ou `duree` du déroulé |
| Visuel d'une scène | « le chiffre doit rebondir », « mets la liste à droite » | le fichier de la scène (agent `animateur` pour une refonte, avec ses `scenes[].mouvements` à garder ; sinon modification directe) |
| Mouvement nommé | « un pop-in sur le titre », « mets un #012 », « un whip pan entre la scène 2 et la 3 », « le titre en machine à écrire », « fais vivre la plante » (#069) | `pulse-motion mouvements afficher <n° ou nom>` (sinon `mouvements chercher <mot>` ; rien d'exact : les deux plus proches avec `AskUserQuestion`) ; une transition : `transition` de la scène qui **entre** ; sinon la recette sur l'élément visé (sans sa classe d'entrée du style), ajoutée à `scenes[].mouvements` (`pulse-motion reference demandes`, « Mouvements nommés ») |
| Effet de particules | « plus d'étincelles », « en bleu », « enlève les confettis », « ajoute des confettis à la fin » | la balise `data-effet` de la scène : `data-reglages`, `data-graine`, `data-calque`, `data-start`/`data-dur` ; l'ajouter ou la supprimer |
| Style | « passe en style éditorial », « quelque chose de plus chaleureux » | demande floue : la direction la plus proche (`pulse-motion reference directions`) ; `pulse-motion styles --genre <genre>` (doute : 2 styles par `pulse-motion comparer . <style1>,<style2> --ouvrir`), puis `pulse-motion changer-style . <style>` ; les scènes de `aReecrire` : un agent `animateur` chacune, en parallèle, avec leurs `scenes[].mouvements` |
| Global | « mets mes couleurs », « baisse la musique », « change la transition » | `charte/charte.json` (couleurs, polices, logo), `musique`, `transition` du déroulé ; « prends les couleurs de mon logo » : `pulse-motion charte depuis-logo charte/logo.<ext> --style <style>` ; « change la police des titres » : `pulse-motion police "<famille>"` ; « passe en sombre » : `"ton": "sombre"` dans `charte` du déroulé |
| Voix | « baisse la voix », « je réenregistre la scène 3 », « j'ai un nouvel enregistrement », « change ce que je dis dans l'intro », « ajoute une voix à la vidéo » | `voix.volume` ; ajouter une voix : le `voix.texte` de chaque scène (3,5 mots par seconde au plus), puis `pulse-motion voix provisoire .` ; toute la vidéo ou toute autre demande sur les prises : suivre `/pulse-motion:voix` (`pulse-motion consignes voix`) ; réenregistrer : `pulse-motion voix studio <id> .` en arrière-plan ; texte dit changé : `scenes[].voix.texte`, puis `pulse-motion voix provisoire --scene <id> .` (voix provisoire) ou proposer de réenregistrer ; mots recalés : `pulse-motion voix transcrire .` |
| Musique | « plus calme », « plus entraînant », « une autre variante », « baisse la musique », « enlève la musique », « coupe la musique pendant la scène 4 », « la musique à fond sur la démo » | ambiance (`musique.generee`) ou `intensite` (plus bas = plus calme) ; humeur d'une scène : `scenes[].musique` (`silence`, `calme`, `normale`, `intense`) ; « une autre variante » : `graine` + 1 ; `musique.volume` ; retirer `musique` ; « fais-moi écouter » : `pulse-motion musique ecouter . --ouvrir` |
| Bruitages | « enlève les bruitages », « mets un son quand le titre arrive », « moins fort » | retirer les `data-son` des scènes et `bruitages.transitions` ; `data-son` sur l'élément (sons : `pulse-motion reference audio/bruitages`) ; `bruitages.volume` ou `data-son-volume` |
| Sous-titres | « sous-titres en haut », « mot par mot », « enlève-les de l'image », « enlève les sous-titres » | `sousTitres.position` (`haut`) ; `sousTitres.mode` (`mot`) ; `sousTitres.incrustes: false` ; retirer `sousTitres` |
| Aperçu et images | « ouvre l'aperçu », « fais une planche des scènes 2 et 3 », « compare avec un autre style » | `pulse-motion apercu . --ouvrir` en arrière-plan (attendre sa ligne « Aperçu ») ; `pulse-motion planche . <ids> --ouvrir` (à regarder aussi avec `Read`) ; `pulse-motion comparer . <style1>,<style2> --ouvrir` en arrière-plan |
| Charte et glossaire | « enregistre ma charte sous le nom dupont », « applique la charte dupont », « note HACCP au glossaire » | `pulse-motion charte enregistrer <nom> .` (nom en minuscules et tirets) ; `pulse-motion charte appliquer <nom> .` (les réglages remplacés se disent) ; `pulse-motion glossaire noter . "<terme>" "<sens>" "<formes à éviter>"` |
| Format | « en vertical », « en carré pour LinkedIn », « pour TikTok », « sans le son », « ajoute des chapitres », « la miniature », « en boucle », « la musique vient de Pixabay » | `pulse-motion reference sorties` : `format.ratio` et scènes recomposées (agent `animateur`) ; plateforme, chapitres, couverture, boucle, crédits : leur ligne ; « sans le son » : retirer musique et bruitages |
| Revue | « note ma vidéo », « qu'en penses-tu ? », « qu'est-ce que tu changerais ? » | suivre `pulse-motion reference revue` : cinq axes notés avec preuves, puis trois retouches rapides proposées (choix multiple) ; appliquer seulement celles cochées, chacune comme une retouche de cette table ; un seul tour |
| Remarque floue | « ça fait cheap », « plus premium », « ça fait diaporama » | `pulse-motion reference remarques` : ses options par `AskUserQuestion`, la première « (Recommandé) » ; jamais appliquée en silence ; 5 changements au plus par tour ; la scène demandée si la phrase ne la dit pas |
| Remarques de l'aperçu | « j'ai laissé des remarques », retour de `remarques attendre`, `remarques.ouvertes` > 0 | `pulse-motion remarques liste .`, puis la boucle de `pulse-motion reference remarques` (« Remarques épinglées ») : lire chaque remarque **et son image** (`Read`), recopier sa phrase, une sauvegarde par remarque ; `pulse-motion remarques faite <id> "<réponse>"` seulement après avoir regardé `pulse-motion planche . --instants <t>` ; goût ou incomprise : `remarques discuter` |
| Réglages rapides | « ouvre les réglages », « un peu plus vif partout », « accent en bleu » | le bouton « Réglages » de l'aperçu ; dits en une phrase : `pulse-motion reference reglages-rapides` |
| Structure | « ajoute une scène sur… », « supprime la scène 4 » | déroulé + fichier de scène (agent `animateur`) ; numéroter les fichiers dans l'ordre ; écrire « type » (le nom de la scène) pour une scène tirée d'une scène toute faite du style, le retirer pour une scène composée ; vidéo avec une voix : écrire aussi le `voix.texte` de la nouvelle scène, puis `pulse-motion voix provisoire --scene <id> .` |
| Personnages | « dessine-moi un cuisinier », « il marche trop vite », « fais-lui une tête surprise », « ouvre l'éditeur de personnage » | suivre (`pulse-motion consignes <skill>`) : dessin → `dessiner-personnage` ; illustration fournie (SVG) → `decouper-personnage` ; pose, mouvement, expression → `animer-personnage` ; à la souris → `atelier-personnages` |

Choisir en regardant (« un truc qui claque pour le titre », « montre-moi les mouvements ») : `pulse-motion reference demandes`, section « Mouvements nommés ».

Avant de toucher au fichier d'une scène : `pulse-motion reference moteur` et la partie utile ; le son : `pulse-motion reference audio` ; un effet : `pulse-motion reference particules` et sa famille.

Agent `animateur` (refonte, scènes de `aReecrire`, nouvelle scène) : modèle passé à l'appel (paramètre `model`) selon la scène :

| La scène | Modèle passé à l'appel |
|---|---|
| Un `type`, sans effet de particules, personnage, fond par shader ni caméra narrative ; au plus 3 mouvements nommés ; sa transition peut être un shader (c'est le déroulé qui la pose) | `sonnet` |
| Composée (sans `type`), ou avec effet, personnage, fond par shader, caméra, partition calée sur la scène | aucun paramètre (modèle de la session) |
| Seconde écriture d'une scène qui garde une erreur après correction | aucun paramètre |

Jamais un modèle plus cher que celui de la session : si la session tourne déjà en Sonnet ou en Haiku, aucun paramètre. Jamais `haiku`.

Régler un effet de particules ou un personnage en le regardant (« ouvre l'éditeur », « laisse-moi régler ») : suivre `pulse-motion consignes atelier-particules` ou `pulse-motion consignes atelier-personnages` (demander lequel si la phrase ne le dit pas).

## 5. Vérifier et montrer

1. `pulse-motion controler .` (il assemble aussi la page) ; `reglagesNonControles` dans l'état : dire en une phrase ce que la personne a changé, `reglagesChanges` ; corriger ce que la retouche a cassé (deux tours au plus). Les `corrections` de `sortie/controle.json` (faites seules : `pulse-motion reference controles`) sont dites à la personne ; `pulse-motion controler . --sans-correction` si elle a demandé une durée ou une graphie précise.
2. Regarder : `pulse-motion planche . --regard --scenes <scènes touchées>`, puis regarder avec `Read` ses planches `temps-forts-*.png` et `telephone-*.png` (deux au plus) ; corriger ce qui se voit (un tour au plus). Une retouche qui ne touche que le son, la charte ou le glossaire n'en fait pas. Retouche visuelle : `pulse-motion planche . --avant precedente` (avant, après, différences), la regarder, la proposer. Refonte (style changé, 3 scènes réécrites ou plus, scène ajoutée ou retirée) : puis la relecture, agent `critique`, `model` passé à l'appel, selon `realisation` § 13.
3. Aperçu : il se recharge seul s'il est ouvert ; s'il a été fermé (`apercu.actif` faux dans `pulse-motion etat .`), `pulse-motion apercu . --ouvrir` en arrière-plan.
4. Le contrôle de l'étape 1 a vérifié la vidéo rendue (débordements, chevauchements, marges, zone des boutons en 9:16…) ; `renduVerifie: false` se dit à la personne.

## 6. Fin

`pulse-motion remarques attendre .` en arrière-plan, puis :

✅ **Fait** : <la retouche, en une phrase>.
📄 **Fichiers** : `sortie/<titre>.html` est à jour ; l'aperçu s'est rechargé.
🔎 **Vérifié** : les scènes touchées ont été contrôlées et regardées ; les autres n'ont pas été modifiées[ ; relue : scène la plus faible « <id> », corrigée, non relue]. (Ce qui n'a pas pu l'être se dit : « sans Chrome, la scène n'a pas été regardée » ; une retouche du son : « le son a été mesuré, pas écouté ».)
[📌 **Remarques** : faites, puis à discuter.]
➡️ **Ensuite** : laissez vos remarques sur l'image, puis cliquez sur « Envoyer à Claude » ; ou une autre retouche avec `/pulse-motion:retoucher`, « annule » pour revenir en arrière, ou l'export en MP4 avec `/pulse-motion:exporter`.
