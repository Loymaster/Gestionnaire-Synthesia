# Mise en ligne — procédure complète

Cette procédure décrit le montage recommandé : **GitHub Pages** pour l'interface, **Google Sheets + Apps Script** pour les données et l'envoi des courriels. Gratuit, sans serveur à administrer, sans clé exposée dans la page, sans mise en veille automatique.

Comptez une heure et demie la première fois.

---

## Vue d'ensemble

```
 Navigateur du formateur                Votre compte Google
┌────────────────────────┐            ┌──────────────────────────┐
│  GitHub Pages          │            │  Apps Script (API)       │
│  page HTML + JS        │ ──HTTPS──> │  ├─ lit/écrit la feuille │
│                        │            │  └─ envoie les courriels │
└────────────────────────┘            │  Google Sheets (données) │
                                      └──────────────────────────┘
```

La page ne contient aucun secret : elle appelle une seule adresse Apps Script, et c'est le script — côté Google — qui détient l'accès à la feuille et au service de messagerie.

---

## Étape 1 — Créer la base

1. Ouvrez [sheets.new](https://sheets.new). Nommez le classeur `Demandes vidéo Synthesia`.
2. Créez trois onglets, nommés exactement : `demandes`, `courriels`, `modeles`.
3. Laissez-les vides. Le script écrit tout en cellule A1 de chaque onglet.

> Pourquoi une seule cellule par onglet ? Les demandes contiennent des listes imbriquées (storyboard, historique) qu'un tableau à colonnes représente mal. Le script conserve le JSON en A1, et l'onglet `lisible` créé à l'étape 3 vous donne la vue tableau pour le tri et l'export.

---

## Étape 2 — Créer l'API

Dans le classeur : **Extensions → Apps Script**. Supprimez le contenu par défaut, collez ceci :

```javascript
/* API de l'outil de gestion des demandes vidéo Synthesia.
   Déployer en application web, exécution « moi », accès « tout le monde ». */

const JETON = 'REMPLACEZ-PAR-UNE-CHAINE-LONGUE-ET-ALEATOIRE';
const EXPEDITEUR = 'Service de création vidéo · Académie de Reims';

function feuille_(nom) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nom) || ss.insertSheet(nom);
}

function lire_(nom, defaut) {
  const v = feuille_(nom).getRange('A1').getValue();
  if (!v) return defaut;
  try { return JSON.parse(v); } catch (e) { return defaut; }
}

function ecrire_(nom, donnees) {
  feuille_(nom).getRange('A1').setValue(JSON.stringify(donnees));
  if (nom === 'demandes') tableauLisible_(donnees);
}

/* Miroir en colonnes, pour trier et exporter depuis le tableur. */
function tableauLisible_(demandes) {
  const f = feuille_('lisible');
  f.clear();
  const entetes = ['Référence', 'Statut', 'Demandeur', 'Courriel', 'Titre',
                   'Public visé', 'Durée', 'Urgence', 'Déposée le', 'Lien vidéo', 'Signée par'];
  const lignes = (demandes || []).map(d => [
    d.ref, d.statut, d.demandeur, d.email, d.titre, d.publicVise, d.duree,
    d.urgence, d.depose, d.lien || '', d.validation ? d.validation.nom : ''
  ]);
  f.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
  if (lignes.length) f.getRange(2, 1, lignes.length, entetes.length).setValues(lignes);
  f.setFrozenRows(1);
}

function doGet(e) {
  const collection = e.parameter.collection || 'demandes';
  const defaut = collection === 'modeles' ? {} : [];
  return sortie_(lire_(collection, defaut));
}

function doPost(e) {
  let corps;
  try { corps = JSON.parse(e.postData.contents); }
  catch (err) { return sortie_({ erreur: 'charge utile illisible' }); }

  if (corps.jeton !== JETON) return sortie_({ erreur: 'jeton invalide' });

  if (corps.action === 'courriel') {
    const c = corps.courriel || {};
    MailApp.sendEmail({
      to: c.dest,
      subject: c.objet,
      body: c.corps,
      name: EXPEDITEUR
    });
    return sortie_({ ok: true, envoye: c.dest });
  }

  if (corps.collection) {
    ecrire_(corps.collection, corps.donnees);
    return sortie_({ ok: true, collection: corps.collection });
  }

  return sortie_({ erreur: 'action inconnue' });
}

function sortie_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**Remplacez `JETON`** par une longue chaîne aléatoire — par exemple le résultat d'un gestionnaire de mots de passe, 32 caractères. Enregistrez (Ctrl+S).

---

## Étape 3 — Déployer l'API

1. **Déployer → Nouveau déploiement**.
2. Type : **Application web**.
3. Description : `API demandes vidéo v1`.
4. Exécuter en tant que : **moi**.
5. Qui a accès : **tout le monde**.
6. **Déployer**. Google demande une autorisation : acceptez (l'écran « application non vérifiée » est normal pour un script personnel — *Paramètres avancés → Accéder au projet*).
7. **Copiez l'URL** qui se termine par `/exec`. C'est l'adresse à saisir dans l'outil.

> À chaque modification du script, refaites **Déployer → Gérer les déploiements → crayon → Nouvelle version**. Sans cette étape, l'URL continue de servir l'ancien code.

---

## Étape 4 — Rien à faire

Cette étape existait dans une version antérieure de la procédure : il fallait adapter trois fonctions de `stockage.js` aux particularités d'Apps Script. C'est désormais automatique — le module détecte une adresse `script.google.com` et bascule seul sur le bon format (collection en paramètre, jeton dans le corps, type `text/plain` pour contourner le blocage CORS d'Apps Script).

Passez directement à l'étape 5.

---

## Étape 5 — Publier sur GitHub Pages

1. Créez un dépôt sur GitHub, par exemple `videos-synthesia`. **Public** (Pages est payant sur dépôt privé).
2. Téléversez ces quatre fichiers à la racine :
   - `Gestion demandes vidéo.dc.html` — renommé **`index.html`**
   - `Base de données.dc.html`
   - `stockage.js`
   - `support.js`
3. Dans `index.html`, corrigez le lien vers la page base de données si vous avez renommé les fichiers.
4. **Settings → Pages → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`. Enregistrez.
5. Attendez deux à trois minutes. L'adresse est `https://<votre-compte>.github.io/videos-synthesia/`.

---

## Étape 6 — Relier les deux

Sur le site en ligne : **Espace administrateur** (identifiants par défaut `admin` / `reims2026`) **→ Configuration**.

**Base de données**
- Mode : `API externe`
- Adresse : l'URL `/exec` copiée à l'étape 3
- Clé ou jeton : le `JETON` du script
- Envoyer les écritures en POST : **coché** (inutile si l'adresse est bien celle d'Apps Script, la bascule est automatique — mais sans effet néfaste)
- Expédier réellement les courriels : **coché**
- Cliquez **Tester la connexion** — le message doit confirmer la lecture.

**Accès administrateur** — changez immédiatement l'identifiant et le mot de passe.

**Expéditeur et signature** — l'adresse d'expédition réelle sera celle du compte Google qui a déployé le script ; le nom affiché est celui de la constante `EXPEDITEUR`.

**Notifications** — saisissez votre adresse académique.

---

## Étape 7 — Recette

Dans cet ordre, en vérifiant la feuille Google après chaque étape :

1. Déposez une demande depuis le formulaire public → elle apparaît dans l'onglet `lisible` et vous recevez le courriel d'alerte.
2. Espace administrateur → ouvrez le ticket → **Marquer en production** → le demandeur reçoit la prise en charge.
3. Collez un lien Synthesia → **Envoyer pour validation** → le courriel contient les deux liens, validation et modification.
4. Ouvrez le lien de modification depuis le courriel → le formulaire se charge prérempli → envoyez une modification.
5. Reprenez la main côté admin, renvoyez une version, puis ouvrez le lien de validation → signez.
6. Vérifiez que le ticket porte la carte **Validation signée** et que la feuille le reflète.

---

## Ce qu'il reste à décider

**Sécurité de l'accès administrateur.** La connexion de l'outil est locale : elle décourage, elle ne protège pas. Sur un dépôt public, n'importe qui connaissant l'adresse atteint l'écran de connexion. Deux façons de durcir :
- publier l'interface sur un espace authentifié de l'académie plutôt que sur GitHub Pages ;
- ou faire vérifier le mot de passe par le script Apps Script, qui ne renvoie les données qu'après contrôle. C'est une trentaine de lignes, je peux les écrire si vous voulez.

**Les jetons de suivi** doivent rester confidentiels : ils donnent accès à la validation d'une vidéo. Ils sont générés aléatoirement, ne les publiez nulle part.

**Quotas Google** : 100 courriels par jour avec un compte gratuit, 1 500 avec un compte Workspace académique. Largement au-dessus de vos volumes.

**Sauvegarde** : `Fichier → Créer une copie` du classeur une fois par trimestre, ou l'export JSON depuis la page *Base de données*.

**Données personnelles** : nom, adresse, fonction et signature horodatée sont conservés. La durée de conservation annoncée dans le formulaire de validation (trois ans) et le périmètre de mutualisation sont à faire valider par votre DPO académique avant l'ouverture aux formateurs.

---

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| « Base externe injoignable (Failed to fetch) » | Déploiement pas en accès « tout le monde », ou URL sans `/exec` |
| Test réussi mais rien ne s'enregistre | Jeton absent ou différent entre la page et le script |
| Les courriels ne partent pas | Case « Expédier réellement » décochée, ou autorisation `MailApp` non accordée |
| Modification du script sans effet | Nouveau déploiement non créé (voir étape 3) |
| Page blanche sur GitHub Pages | `support.js` ou `stockage.js` absent du dépôt |
