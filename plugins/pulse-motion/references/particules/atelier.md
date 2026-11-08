# Régler à l'œil : l'atelier

Quand la personne veut régler un effet en le regardant (« laisse-moi régler les étincelles », « je veux voir ce que ça donne »), ou pour vérifier un effet de la bibliothèque :

- **Dans l'aperçu** : bouton **Effets** du lecteur. Choisir l'effet dans la liste (ou cliquer dessus dans l'image) ; les curseurs des réglages changent l'image tout de suite, sans recharger, et la lecture boucle sur l'effet. « Enregistrer » écrit `data-reglages` et `data-graine` dans la scène. « Recette complète » donne tous les champs de la recette ; « Enregistrer comme nouvel effet » écrit `effets/<nom>.json` (par `etend`) et fait pointer la balise dessus.
- **Hors de la vidéo** : `pulse-motion atelier [<effet>]` en arrière-plan, depuis le dossier de la vidéo, ouvre la page d'atelier : l'effet seul en boucle, fond clair (charte) ou sombre, zone d'émission à déplacer et redimensionner à la souris ; « Enregistrer » écrit dans `effets/` du projet (les réglages choisis deviennent les valeurs par défaut).
- **Milieux** (`data-milieu`) : ni le panneau Effets ni la page d'atelier ne les montrent ; un milieu se règle dans sa recette ou par `data-reglages` de sa balise dans la scène, puis se vérifie dans l'aperçu.
- Chaque enregistrement passe par l'historique : « annule » le défait. Si la scène a été modifiée entre-temps (une retouche), l'atelier refuse d'écrire et propose de recharger la page : rien n'est écrasé.
- Noms des nouveaux effets : minuscules, chiffres et tirets, différents de ceux de la bibliothèque (et de ceux du projet, sauf remplacement confirmé).
- Après un enregistrement, lire la scène ou la recette écrite pour savoir ce que la personne a choisi avant de retoucher autre chose.

