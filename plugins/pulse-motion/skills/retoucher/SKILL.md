---
description: Retoucher la vidéo en une phrase (« ralentis la scène 3 », « change le titre », « annule ») et la voir aussitôt
argument-hint: "[la retouche en une phrase]"
disable-model-invocation: true
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

`pulse-motion historique sauvegarder .` **avant** tout changement. (Un changement de style se sauvegarde lui-même : passer directement à l'étape 4.)

## 4. Appliquer

Classer la demande, puis :

| Catégorie | Exemples | Où |
|---|---|---|
| Texte | « change le titre », « corrige la faute » | `scenes[].textes` du déroulé |
| Rythme, durée | « ralentis la scène 3 » (rythme 0,8), « accélère » (1,25), « laisse plus de temps à la fin » (duree + 1 à 2 s) | `rythme` ou `duree` du déroulé |
| Visuel d'une scène | « le chiffre doit rebondir », « mets la liste à droite » | le fichier de la scène (agent `animateur` pour une refonte, sinon modification directe) |
| Effet de particules | « plus d'étincelles », « en bleu », « fais-les partir autrement », « enlève les confettis », « ajoute des confettis à la fin » | la balise `data-effet` de la scène : `data-reglages`, `data-graine`, `data-calque`, `data-start`/`data-dur` ; l'ajouter ou la supprimer |
| Style | « passe en style éditorial », « quelque chose de plus chaleureux » | `pulse-motion styles --genre <genre>` pour trouver le style (en cas de doute, proposer 2 styles avec `pulse-motion comparer . <style1>,<style2> --ouvrir`), puis `pulse-motion changer-style . <style>` : les scènes toutes faites sont recopiées ; les scènes de `aReecrire` sont confiées à un agent `animateur` chacune, en parallèle, dans le nouveau style |
| Global | « mets mes couleurs », « baisse la musique », « change la transition » | `charte/charte.json` (couleurs, polices, logo), `musique`, `transition` du déroulé ; « prends les couleurs de mon logo » : `pulse-motion charte depuis-logo charte/logo.<ext> --style <style>` ; « applique la charte Dupont » : `pulse-motion charte appliquer <nom> .` ; « change la police des titres » : `pulse-motion police "<famille>"` ; « passe en sombre » : `"ton": "sombre"` dans `charte` du déroulé |
| Structure | « ajoute une scène sur… », « supprime la scène 4 » | déroulé + fichier de scène (agent `animateur`) ; numéroter les fichiers dans l'ordre ; écrire « type » (le nom de la scène) pour une scène tirée d'une scène toute faite du style, le retirer pour une scène composée |

Lire `pulse-motion reference moteur` avant de toucher au fichier d'une scène, et `pulse-motion reference particules` pour un effet (table « Retouches en une phrase »).

## 5. Vérifier et montrer

1. `pulse-motion assembler .` puis `pulse-motion controler .` ; corriger ce que la retouche a cassé (deux tours au plus). Les `corrections` de `sortie/controle.json` (faites seules par le contrôle : typographie, durées) sont dites à la personne ; `pulse-motion controler . --sans-correction` si elle a demandé une durée ou une graphie précise.
2. Aperçu : si `apercu.actif` est faux dans `pulse-motion etat .`, lancer `pulse-motion apercu . --ouvrir` en arrière-plan ; sinon il s'est rechargé seul.
3. Le contrôle de l'étape 1 a vérifié la vidéo rendue (débordements, chevauchements, marges, zone des boutons en 9:16…) ; `renduVerifie: false` se dit à la personne.

## 6. Fin

✅ **Fait** : <la retouche, en une phrase>.
📄 **Fichiers** : `sortie/<titre>.html` est à jour ; l'aperçu s'est rechargé.
➡️ **Ensuite** : une autre retouche avec `/pulse-motion:retoucher`, « annule » pour revenir en arrière, ou l'export en MP4 avec `/pulse-motion:exporter`.
