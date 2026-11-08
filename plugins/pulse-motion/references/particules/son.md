# Effets qui suivent le son

Une recette peut suivre la musique ou la voix (analysées une fois à l'ouverture de la page : l'export est identique à l'aperçu).

```json
{ "version": 1, "nom": "etincelles-basses", "etend": "etincelles",
  "modulation": {
    "debit": { "par": "basses", "de": 0.2, "a": 1.5 },
    "couleur": { "par": "battement", "de": 1, "a": 2.5 }
  },
  "emetteurs": [{ "nom": "gerbe", "naissance": { "salves": [{ "au": "battement", "nombre": 40 }] } }] }
```

| Champ | Effet |
|---|---|
| `modulation.debit` | débit × coefficient (les émetteurs à `debit` seulement) |
| `modulation.forces` | forces × coefficient (l'émetteur est alors simulé pas à pas) |
| `modulation.couleur` | éclat × coefficient (au-delà de 1, le halo du calque s'allume) |
| `modulation.taille` | taille × coefficient |
| `par` | `volume`, `basses`, `mediums`, `aigus`, `battement`, `phase` (musique) ; `enveloppe`, `syllabe` (voix) |
| `de`, `a` | coefficient au silence et au plus fort (1 par défaut) ; `"piste": "voix"` pour suivre la voix avec une grandeur de la musique |
| salve `{ "au": "battement", "nombre": 40 }` | une salve à chaque battement de la musique pendant l'effet (`"au": "syllabe"` : à chaque syllabe de la voix) ; une par émetteur, à la place de `t` |

- Les cordes, tissus et fragments ne sont pas modulés.
- Sans musique (ou sans voix) : contrôle `son-sans-piste` ; aucun battement détecté : alerte dans l'aperçu, la salve ne part pas.
- Dosage : moduler une seule grandeur par effet ; `de` pas trop bas pour un débit (l'effet disparaît dans les silences).

