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

## 1. Vérifier

`pulse-motion etat .` : sans vidéo (`projet` faux), proposer `/pulse-motion:creer` et s'arrêter. La commande échoue avec « node » introuvable (Node.js n'est pas installé) : expliquer qu'il faut installer Node.js en version LTS depuis https://nodejs.org, puis relancer Claude Code, et s'arrêter.

## 2. « Annule » (ou « reviens en arrière »)

`pulse-motion historique annuler .`, puis aller à l'étape 5. Échec « Aucune retouche à annuler » : le dire simplement.

## 3. Sauvegarder

`pulse-motion historique sauvegarder .` **avant** tout changement.

## 4. Appliquer

Classer la demande, puis :

| Catégorie | Exemples | Où |
|---|---|---|
| Texte | « change le titre », « corrige la faute » | `scenes[].textes` du déroulé |
| Rythme, durée | « ralentis la scène 3 » (rythme 0,8), « accélère » (1,25), « laisse plus de temps à la fin » (duree + 1 à 2 s) | `rythme` ou `duree` du déroulé |
| Visuel d'une scène | « le chiffre doit rebondir », « mets la liste à droite » | le fichier de la scène (agent `animateur` pour une refonte, sinon modification directe) |
| Effet de particules | « plus d'étincelles », « en bleu », « fais-les partir autrement », « enlève les confettis », « ajoute des confettis à la fin » | la balise `data-effet` de la scène : `data-reglages`, `data-graine`, `data-calque`, `data-start`/`data-dur` ; l'ajouter ou la supprimer |
| Global | « mets mes couleurs », « baisse la musique », « change la transition » | `charte`, `musique`, `transition` du déroulé |
| Structure | « ajoute une scène sur… », « supprime la scène 4 » | déroulé + fichier de scène (agent `animateur`) ; numéroter les fichiers dans l'ordre |

Lire `pulse-motion reference moteur` avant de toucher au fichier d'une scène, et `pulse-motion reference particules` pour un effet (table « Retouches en une phrase »).

## 5. Vérifier et montrer

1. `pulse-motion assembler .` puis `pulse-motion controler .` ; corriger ce que la retouche a cassé (deux tours au plus).
2. Aperçu : si `apercu.actif` est faux dans `pulse-motion etat .`, lancer `pulse-motion apercu . --ouvrir` en arrière-plan ; sinon il s'est rechargé seul.
3. Quelques secondes après, `pulse-motion controler .` pour les textes qui débordent.

## 6. Fin

✅ **Fait** : <la retouche, en une phrase>.
📄 **Fichiers** : `sortie/<titre>.html` est à jour ; l'aperçu s'est rechargé.
➡️ **Ensuite** : une autre retouche avec `/pulse-motion:retoucher`, « annule » pour revenir en arrière, ou l'export en MP4 avec `/pulse-motion:exporter`.
