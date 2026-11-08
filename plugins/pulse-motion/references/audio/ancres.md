# Ancres `mot:`

Dans une scène qui **a une prise**, un élément peut entrer quand la voix dit un mot :

| Écriture | Instant |
|---|---|
| `data-start="mot:froid"` | début du premier « froid » (accents, majuscules et ponctuation ignorés) |
| `data-start="mot:froid#2"` | deuxième « froid » |
| `data-start="mot:froid:fin"` | fin du mot |
| `data-start="mot:froid+0.2"` | 0,2 s après le début du mot (`-0.2` : avant) |

Réenregistrer la scène recale tout seul les ancres. Une ancre sur un mot que la voix ne dit pas, ou dans une scène sans prise, est une erreur (`ancre-mot-introuvable`).

