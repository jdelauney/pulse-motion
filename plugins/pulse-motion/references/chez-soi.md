# Chez soi : goûts, charte du site, vidéos, bibliothèque, signalement, page qui fait son MP4

Ce que Pulse Motion garde pour la personne d'une vidéo à l'autre, et ce qu'elle peut faire sans Claude. Tout reste sur l'ordinateur ; rien ne part sur internet sans son accord.

## Mémoire des goûts

- Lire avant d'écrire : `pulse-motion preferences liste --genre <genre> --style <style>` (les préférences qui valent pour cette vidéo, une ligne chacune). `creer` les lit avant le déroulé et les transmet aux animateurs dans leur consigne ; `retoucher` et `style` les lisent avant d'appliquer.
- **Ordre de priorité** : la demande du moment, puis les préférences, puis le style, puis les valeurs par défaut. Une demande qui contredit une préférence l'emporte, et une seule question : « Seulement pour cette vidéo (Recommandé) » · « Je change votre préférence ».
- **Quand proposer de retenir** : une phrase de portée générale (« jamais », « toujours », « je n'aime pas », « à chaque fois »), ou la même catégorie de retouche demandée deux fois dans une vidéo, ou une remarque floue (`pulse-motion reference remarques`) qui vaut pour toutes les vidéos. Après l'avoir appliquée, une seule question : « Je le retiens pour vos prochaines vidéos ? » : « Le retenir (Recommandé) » · « Seulement cette vidéo ».
- **Noter** : `pulse-motion preferences noter "<sa phrase, telle quelle>" "<la règle en réglages précis>" --domaine <mouvement|texte|couleur|son|rythme|structure|autre> [--genre <g>] [--style <s>] --video "<titre>"`. La règle se vérifie dans le code (« pas d'entrée rebondie (#001, #007) ni de finition rebond ou élastique (#028, #029) »). Portée : ni genre ni style, sauf si la personne l'a dit (« pour mes formations »).
- « Quelles sont mes préférences ? » : `pulse-motion preferences liste`, dites en mots simples (sa phrase et la date) ; « oublie ma préférence sur les rebonds » : `pulse-motion preferences retirer <id>`. 30 au plus : au-delà, le message demande d'en retirer une.

## Charte depuis le site

« Prends les couleurs de notre site », « À ajouter » → « Le site de mon entreprise ».

1. **Accord d'abord** (le site est lu sur internet) : « Je lis la page d'accueil de <adresse> pour en tirer couleurs, polices et logo ; rien n'est changé avant votre accord. » : « Lire le site (Recommandé) » · « Non, je donne mes couleurs ».
2. `pulse-motion charte depuis-site <adresse> --style <style> .` : une **proposition** (`couleurs` rendues lisibles sur le fond du style, `ton`, `polices` du site, `logo`, `ajustements`, `messages`), rangée à part ; la charte de la vidéo ne change pas.
3. Montrer la proposition en mots simples (le logo trouvé, les deux couleurs, les ajustements de lisibilité), puis demander : « Appliquer (Recommandé) » · « Seulement les couleurs » · « Non merci ».
4. Accord : `pulse-motion charte depuis-site --appliquer .` (« Seulement les couleurs » : retirer d'abord le logo de la proposition avec `Edit`), puis la comparaison (`pulse-motion comparer . <style> --ouvrir` en arrière-plan) et le contrôle. Les polices : seulement proposées, une à une, par `pulse-motion police "<famille>"` (Bunny Fonts, licence vérifiée) ; aucun fichier de police du site n'est copié, aucun texte ni slogan repris.
5. Échec (site injoignable, page vide ou protégée, délai dépassé) : dire le `message` ; aucun logo trouvé : garder les couleurs et demander le fichier du logo.

## Mes vidéos

« Quelles sont mes vidéos ? », « retrouve ma vidéo sur la chaîne du froid » : `pulse-motion videos`. Un tableau en mots simples : titre, où en est la vidéo (`etape`), durée, format, style, MP4 (`mp4` : poids et date, ou « pas encore »), dernière modification. `introuvable` : « ce dossier a été déplacé ou supprimé » ; l'entrée reste (jamais retirée sans accord). « Ouvre-la » : ouvrir sa page `page` dans le navigateur. Pour la retoucher, il faut ouvrir Claude Code dans son dossier : le dire.

## Bibliothèque personnelle

Ce que la personne garde pour toutes ses vidéos : chartes (`charte enregistrer`), styles personnels, effets, personnages, musiques, goûts. **Par copie** : un élément gardé se copie dans la vidéo qui s'en sert ; la vidéo reste complète, et changer la bibliothèque ne change aucune vidéo déjà faite.

- **Garder** (« garde cet effet pour mes prochaines vidéos », « garde ce personnage ») : `pulse-motion effet enregistrer <nom> .` ; `pulse-motion personnages enregistrer <nom> --dossier .` (ses poses, mouvements et expressions de la vidéo suivent). Nom d'un élément livré (`nom-livre`) : proposer un autre nom, puis `--sous <nom>`. Déjà gardé, autrement (`pris`) : « Le garder sous un autre nom (Recommandé) » · « Remplacer celui de votre bibliothèque » (`--sous` ou `--remplacer`). « Garde cette musique pour mes prochaines vidéos » : avec sa licence, `pulse-motion reference audio/musique`, « Vos musiques ».
- **Proposer** : `pulse-motion effet liste --dossier .` et `pulse-motion personnages liste --dossier .` disent la provenance (`source` : `video`, `personnel`, `plugin`) ; `personnel` : « de votre bibliothèque ».
- **Utiliser** : avant de le poser dans une scène, `pulse-motion effet utiliser <nom> .` ou `pulse-motion personnages utiliser <nom> --dossier .` (sauvegarde d'historique comprise). La vidéo en a déjà un autre de ce nom (`conflits`) : demander avant `--remplacer`. Le contrôle dit « dans la bibliothèque personnelle » : le copier ainsi, puis contrôler à nouveau.
- **Emporter sur un autre ordinateur** (« emporte mes chartes sur mon autre ordinateur ») : `pulse-motion bibliotheque liste`, dite en mots simples, puis « Tout emporter (Recommandé) » · « Choisir ». `pulse-motion bibliotheque exporter [--chartes a,b] [--styles …] [--effets …] [--personnages …] [--musiques …] [--gouts]` (sans choix : tout) : un fichier ZIP dans ses Documents (`fichier`) ; dire où il est, et qu'il se copie comme un autre fichier (clé USB, courriel). Les connexions aux sites filmés ne partent jamais.
- **Reprendre** (« importe ma bibliothèque », un fichier `.zip`) : `pulse-motion bibliotheque importer <fichier> --voir`, le bilan dit simplement (`importes`, `identiques`, `pris`, `refuses` et leur `raison`), puis `pulse-motion bibliotheque importer <fichier>` : rien de ce qui est déjà là n'est remplacé. Chaque `pris` : « Garder le mien (Recommandé) » · « Prendre celui de l'archive », puis `--remplacer <sorte>:<nom>,…`. Les goûts s'ajoutent aux siens (30 au plus).

## Signaler un problème

« Signale un problème », « ça ne marche pas, préviens l'auteur » :

1. `pulse-motion rapport .` : `corps` (version, système, outils, étape de la vidéo, 3 dernières erreurs ; chemins anonymisés, **rien de la vidéo**), `fichier` (le même résumé, sur l'ordinateur), `url`.
2. Montrer le résumé, puis : « Ouvrir la page de signalement (Recommandé) » · « Seulement le fichier, je l'enverrai moi-même ».
3. Accord pour la page : `pulse-motion rapport . --ouvrir` l'ouvre dans son navigateur, titre et résumé préremplis. Elle relit, complète « Ce qui s'est passé » et envoie elle-même ; un compte GitHub est nécessaire, sinon le `fichier` s'envoie par courriel. Rien n'est jamais envoyé par Pulse Motion.

## Page qui sait faire son MP4

Facultative : la page livrée par défaut ne fait pas de MP4 sans Claude.

- À la fin d'un export (et en fin de création), une seule question : « Voulez-vous aussi une page qui sait faire son MP4, même sans moi ? Elle pèse environ 250 Ko de plus. » : « Oui, aussi cette page » · « Non merci (Recommandé) ». « Une page qui sait faire son MP4 » : de même ; « une page plus légère, sans le bouton MP4 » : l'inverse.
- Oui : `pulse-motion page . --bouton-mp4 oui` (sauvegarde, déroulé et page réécrits ; la vidéo ne change pas d'aspect). Non, ou l'inverse : `--bouton-mp4 non`.
- À dire, quand la page l'a : « Plus tard, même sans moi, ouvrez la page dans Chrome ou Edge et cliquez sur « MP4 ». » Pour la meilleure qualité, l'export par Claude reste conseillé.
