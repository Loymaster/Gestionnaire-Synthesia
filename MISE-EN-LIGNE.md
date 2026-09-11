# Mise en ligne — procédure complète

Montage retenu : **GitHub Pages** pour l'interface, **Google Sheets + Apps Script** pour les données et les courriels. Gratuit, sans serveur à administrer, sans mise en veille.

Comptez une heure la première fois.

---

## Le principe, en une image

```
 Formateur (son PC)              Vous (votre PC)
 ┌──────────────┐                ┌──────────────┐
 │ dépose       │                │ administre   │
 │ valide       │                │ jeton admin  │
 │ (sans jeton) │                │ dans son     │
 └──────┬───────┘                │ navigateur   │
        │                        └──────┬───────┘
        └──────────┬────────────────────┘
                   ▼
        Apps Script (votre compte Google)
        ├─ dépôt : ouvert à tous, création seule
        ├─ suivi : une demande, via son jeton
        ├─ admin : tout, jeton exigé
        └─ envoie les courriels
                   ▼
             Google Sheets
```

Trois niveaux d'accès, pour que le formulaire fonctionne depuis n'importe quel ordinateur sans exposer vos données :

| Qui | Peut faire | Comment il s'authentifie |
| --- | --- | --- |
| N'importe qui | Déposer une demande | Rien. Le script n'accepte qu'une création. |
| Le demandeur | Voir, valider, modifier **sa** demande | Le jeton de son lien de suivi |
| Vous | Tout le reste | Le jeton d'administration, saisi dans Configuration |

Le pire qu'un visiteur mal intentionné puisse faire est de créer de fausses demandes, que vous supprimez. Il ne peut ni lire les autres, ni les modifier.

---

## Étape 1 — Créer la base

1. Ouvrez [sheets.new](https://sheets.new). Nommez le classeur `Demandes vidéo Synthesia`.
2. Créez trois onglets nommés exactement : `demandes`, `courriels`, `modeles`. Laissez-les vides.

C'est tout : **aucun autre onglet à créer**. Le script en ajoutera un quatrième, `lisible`, tout seul au premier enregistrement.

| Onglet | Contenu |
| --- | --- |
| `demandes` | Toutes les demandes, en JSON dans la cellule A1 |
| `courriels` | Journal des envois, en JSON dans A1 |
| `modeles` | Modèles de courriels **et** réglages partagés (signature, adresses de notification, préfixe des références, déclarations du formulaire de validation) |
| `lisible` | Créé automatiquement : les demandes en colonnes, pour trier, filtrer et exporter |

Les réglages partagés sont logés dans `modeles` sous deux clés réservées (`__reglages`, `__declarations`) plutôt que dans un onglet séparé : le navigateur du formateur doit pouvoir les lire sans jeton, et cet onglet est le seul en accès public.

---

## Étape 2 — Créer l'API

**Extensions → Apps Script**. Videz le fichier (Ctrl+A, Suppr) et collez le contenu de `apps-script.gs`.

> Copiez le contenu du fichier, pas son affichage dans un lecteur Markdown : les accents graves de balisage feraient échouer le script.

Trois constantes à renseigner en haut :

```javascript
const JETON = '…';            // chaîne longue et aléatoire, 32 caractères
const ADRESSE_NOTIF = '…';    // votre adresse académique
const SITE = '…';             // https://moncompte.github.io/videos-synthesia
```

`SITE` sert à composer les liens de validation et de modification insérés dans les courriels. Vous ne la connaîtrez qu'après l'étape 4 : revenez la renseigner à ce moment-là.

Enregistrez (Ctrl+S).

---

## Étape 3 — Déployer

1. Bouton bleu **Déployer** en haut à droite → **Nouveau déploiement**.
2. Roue dentée → **Application Web**.
3. Exécuter en tant que : **moi**. Qui a accès : **Tout le monde**.
4. **Déployer**, puis autorisez l'accès (l'écran « application non vérifiée » est normal : *Paramètres avancés → Accéder au projet*).
5. Copiez l'URL qui se termine par `/exec`.

**Vérifiez tout de suite** : ouvrez cette URL dans un onglet. Vous devez voir `{"erreur":"accès refusé"}` — ce qui prouve que le script tourne et que le contrôle d'accès fonctionne.

> À chaque modification du script : **Déployer → Gérer les déploiements → crayon → Version : nouvelle version → Déployer**. Sans cela, l'URL sert l'ancien code.

---

## Étape 4 — Préparer les fichiers du site

Ouvrez `stockage.js` dans un éditeur de texte. Ligne 20 environ :

```javascript
  var API = "";
```

Collez-y votre URL :

```javascript
  var API = "https://script.google.com/macros/s/AKfycb…/exec";
```

C'est le seul fichier à modifier. Cette adresse n'est pas un secret : elle doit être lisible par tous les visiteurs. Le jeton, lui, n'apparaît nulle part dans les fichiers publiés.

---

## Étape 5 — Publier

1. Créez un dépôt **public** sur GitHub, par exemple `videos-synthesia`.
2. Téléversez à la racine : `index.html`, `base.html`, `stockage.js`, `support.js`, `logo-greta.jpg`, ainsi que le dossier `fonts/` complet (six fichiers Marianne).
3. **Settings → Pages → Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Deux minutes plus tard : `https://<compte>.github.io/videos-synthesia/`.
5. **Retournez dans Apps Script** renseigner la constante `SITE` avec cette adresse, puis redéployez une nouvelle version.

---

## Étape 6 — Raccorder votre poste

Sur le site : **Espace administrateur** (`admin` / `reims2026`) **→ Configuration → Base de données**.

- L'adresse du service s'affiche : vérifiez qu'elle est bien la vôtre.
- Collez le **jeton d'administration** (la constante `JETON`).
- **Tester la connexion** → « Connexion établie : 0 demande lue. »

Puis, toujours dans Configuration :
- **Accès administrateur** : changez immédiatement l'identifiant et le mot de passe.
- **Expéditeur et signature** — le nom affiché aux destinataires. Ce bloc, comme les notifications, les déclarations de validation et le préfixe des références, est **enregistré dans la base** : il suit le site, y compris sur le navigateur d'un formateur qui dépose une demande.

Seuls l'identifiant, le mot de passe et le jeton restent propres à ce poste — les inscrire dans la base reviendrait à les exposer.

> Cette configuration vit dans votre navigateur. Si vous administrez depuis un autre poste, il faudra ressaisir le jeton — c'est délibéré, il ne doit pas circuler.

---

## Récapitulatif : quoi va où

| Élément | Emplacement | Conséquence |
| --- | --- | --- |
| Demandes, courriels | Feuille Google | Partagés, visibles de partout |
| Modèles de courriels | Onglet `modeles` | Un formateur qui dépose reçoit vos textes |
| Déclarations de validation | Onglet `modeles` | Le formulaire de signature les lit sans jeton |
| Signature, expéditeur, notifications, préfixe | Onglet `modeles` | S'appliquent depuis n'importe quel navigateur |
| Adresse de l'API | `stockage.js` | Publiée avec le site, ce n'est pas un secret |
| Adresse du site (`SITE`) | Script Apps Script | Compose les liens des courriels |
| Adresse de notification (`ADRESSE_NOTIF`) | Script Apps Script | Secours si le réglage partagé est vide |
| Identifiant, mot de passe, jeton | Navigateur de l'administrateur | À ressaisir sur chaque poste |

---

## Étape 7 — Recette

Dans cet ordre, en vérifiant la feuille Google et votre boîte après chaque point.

1. **Depuis un autre navigateur** (ou une fenêtre privée, pour être dans la peau d'un formateur) : déposez une demande. Elle doit apparaître dans l'onglet `lisible`, et deux courriels partir — l'accusé de réception au demandeur, l'alerte à vous.
2. Côté administrateur : la demande figure dans la liste. Ouvrez-la, **Marquer en production** → le demandeur reçoit la prise en charge.
3. Collez un lien Synthesia, **Envoyer pour validation** → le courriel contient les deux liens.
4. Ouvrez le lien de **modification** depuis le courriel : le formulaire se charge prérempli. Cochez « Modifier le script », changez une phrase, envoyez.
5. Côté administrateur : le statut est passé à « Modification demandée », le commentaire figure dans l'historique, le script est à jour. Renvoyez une nouvelle version.
6. Ouvrez le lien de **validation**, cochez les cinq déclarations, signez. Le ticket porte la carte « Validation signée ».

---

## Ce qu'il reste à savoir

**L'accès administrateur.** La connexion est vérifiée par le navigateur : elle décourage, elle ne protège pas absolument. Ce qui protège réellement vos données, c'est le jeton — sans lui, le script ne renvoie rien. Quelqu'un qui forcerait l'écran de connexion verrait une interface vide.

**Quotas Google** : 100 courriels par jour en compte gratuit, 1 500 avec un compte Workspace académique.

**Sauvegarde** : `Fichier → Créer une copie` du classeur chaque trimestre, ou l'export JSON depuis la page *Base de données*.

**Données personnelles** : nom, adresse, fonction, signature horodatée. La durée de conservation annoncée dans le formulaire de validation et le périmètre de mutualisation sont à faire valider par votre DPO académique avant l'ouverture aux formateurs.

---

## Dépannage

| Symptôme | Cause |
| --- | --- |
| `TypeError: "" is not a function (ligne 1)` | Accents graves de balisage collés avec le code |
| Une page de connexion Google au lieu du JSON | Déploiement pas en accès « Tout le monde » |
| « Jeton d'administration absent » | Champ vide dans Configuration |
| « Échec : accès refusé » | Jeton différent de la constante `JETON` du script |
| « Délai dépassé (20 s) » | Script lent ou en erreur : exécutez `doGet` depuis l'éditeur pour voir le journal |
| Les liens des courriels pointent vers `REMPLACEZ-PAR…` | Constante `SITE` non renseignée, ou script non redéployé |
| Une modification du script reste sans effet | Nouvelle version non créée |
| Page blanche | `support.js` ou `stockage.js` absent du dépôt |
| Police système au lieu de Marianne | Dossier `fonts/` non téléversé, ou placé dans un sous-dossier |
| Logo manquant | `logo-greta.jpg` absent de la racine |
