# Brancher l'outil sur une base de données externe

L'interface (`Gestion demandes vidéo.dc.html`) ne contient aucune règle métier liée au stockage : tout passe par `stockage.js`. Deux modes, réglables dans **Espace administrateur → Configuration → Base de données** :

| Mode | Où vivent les données |
| --- | --- |
| Locale (ce navigateur) | `localStorage`, clés `synthesia_*_v1` |
| API externe | Votre service HTTP, avec copie locale de sécurité |

En mode API externe, chaque écriture est d'abord miroitée en local puis envoyée au service. Si le réseau tombe, l'outil continue de fonctionner sur la copie locale et affiche un bandeau dans Configuration.

## Contrat attendu

Trois collections, deux verbes. `{baseUrl}` est l'adresse saisie dans Configuration.

```
GET  {baseUrl}/demandes    -> [ Demande, … ]
PUT  {baseUrl}/demandes    <- [ Demande, … ]      (remplace la collection)
GET  {baseUrl}/courriels   -> [ Courriel, … ]
PUT  {baseUrl}/courriels   <- [ Courriel, … ]
GET  {baseUrl}/modeles     -> { "<id>": { objet, corps }, … }
PUT  {baseUrl}/modeles     <- { "<id>": { objet, corps }, … }
```

Authentification : la clé saisie est envoyée dans l'en-tête choisi (`Authorization: Bearer <clé>` par défaut).

Si le service n'accepte pas `PUT` — c'est le cas de Google Apps Script — cochez **Envoyer les écritures en POST**. Les écritures deviennent alors :

```
POST {baseUrl}    <- { "collection": "demandes", "donnees": [ … ] }
```

Le service doit répondre avec les en-têtes CORS appropriés (`Access-Control-Allow-Origin`) puisque la page est servie depuis un autre domaine (GitHub Pages).

## Forme des données

### Demande

```json
{
  "id": "d1757500000000",
  "ref": "VID-2026-042",
  "token": "t-k3x9a2b",
  "demandeur": "Claire Vasseur",
  "email": "claire.vasseur@ac-reims.fr",
  "titre": "Prise en main de l'espace d'évaluation",
  "publicVise": "Professeurs de cycle 3",
  "duree": "3 min",
  "urgence": "Urgent",
  "nbAvatars": "1",
  "avatars": ["Avatar du formateur"],
  "script": "Bonjour et bienvenue…",
  "storyboard": [
    { "plan": "1", "schema": "Titre sur fond uni.", "presence": "Schéma + Avatar" }
  ],
  "precisions": "Captures à droite de l'avatar.",
  "pieces": ["captures.zip"],
  "statut": "validation",
  "lien": "https://share.synthesia.io/…",
  "depose": "2026-09-10T09:12:00.000Z",
  "historique": [
    { "qui": "Claire Vasseur", "quand": "10/09 · 09:12", "texte": "Demande déposée.", "point": "oklch(0.42 0.01 250)" }
  ],
  "validation": {
    "nom": "Claire Vasseur",
    "fonction": "Formatrice, GRETA Marne",
    "signeLe": "2026-09-12T08:30:00.000Z",
    "engagements": ["visionnage intégral", "…"]
  }
}
```

`statut` prend l'une des cinq valeurs : `nouvelle`, `production`, `validation`, `modif`, `validee`.
`token` est le jeton du lien de suivi : il remplace le compte formateur, il ne doit pas être devinable.
`validation` n'existe que sur les demandes signées.

### Courriel

```json
{
  "id": "m1757500000000abc",
  "canal": "E-mail envoyé",
  "dest": "claire.vasseur@ac-reims.fr",
  "expediteur": "Service de création vidéo · Académie de Reims <videos@ac-reims.fr>",
  "objet": "Votre vidéo Synthesia VID-2026-042 est prête à être validée",
  "corps": "Bonjour Claire Vasseur,\n\n…",
  "ref": "VID-2026-042",
  "envoye": "2026-09-11T14:05:00.000Z"
}
```

### Modèles

Objet dont les clés sont les identifiants de modèles : `depot_admin`, `depot_confirmation`, `prise_en_charge`, `pret_a_valider`, `relance`, `lien_remplace`, `validee`, `modif_demandee`. Seuls les modèles personnalisés y figurent ; les autres restent aux textes d'origine du code.

### Configuration

La configuration (identifiants admin, adresses de notification, signature, réglages de la base) reste **toujours locale** : elle décrit ce poste, pas les données. Clé `synthesia_config_v1`.

## Option A — Google Sheets + Apps Script (recommandée)

Gratuit, pas de clé exposée, envoi de courriels natif. Créez une feuille de calcul, puis **Extensions → Apps Script** :

```javascript
const ID_FEUILLE = SpreadsheetApp.getActiveSpreadsheet().getId();
const JETON = 'choisissez-un-jeton-long';

function feuille_(nom) {
  const ss = SpreadsheetApp.openById(ID_FEUILLE);
  return ss.getSheetByName(nom) || ss.insertSheet(nom);
}

function lire_(nom, defaut) {
  const v = feuille_(nom).getRange('A1').getValue();
  return v ? JSON.parse(v) : defaut;
}

function ecrire_(nom, donnees) {
  feuille_(nom).getRange('A1').setValue(JSON.stringify(donnees));
}

function doGet(e) {
  const collection = (e.parameter.collection || 'demandes');
  const defaut = collection === 'modeles' ? {} : [];
  return sortie_(lire_(collection, defaut));
}

function doPost(e) {
  const corps = JSON.parse(e.postData.contents);
  if (corps.jeton !== JETON) return sortie_({ erreur: 'jeton invalide' });
  ecrire_(corps.collection, corps.donnees);
  if (corps.courriel) {
    MailApp.sendEmail({
      to: corps.courriel.dest,
      subject: corps.courriel.objet,
      body: corps.courriel.corps
    });
  }
  return sortie_({ ok: true });
}

function sortie_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Déployez en **application web**, accès « tout le monde ». Apps Script ne route pas les chemins : passez la collection en paramètre. Dans Configuration, saisissez comme adresse `…/exec?collection=` et cochez POST — ou adaptez `stockage.js` (fonctions `url` et `ecrireDistant`, une ligne chacune) au format de votre déploiement.

**Envoi réel des courriels.** L'outil journalise aujourd'hui les messages sans les expédier. Pour les envoyer, ajoutez dans `stockage.js` un appel qui poste `{ collection: 'courriels', donnees: […], courriel: { dest, objet, corps } }` : le `doPost` ci-dessus s'occupe de l'expédition via `MailApp`.

## Option B — Supabase

Le contrat « une collection = un document JSON » se transpose en une table à une ligne par collection :

```sql
create table collections (
  nom   text primary key,
  donnees jsonb not null default '[]'::jsonb,
  maj   timestamptz not null default now()
);

insert into collections (nom, donnees) values
  ('demandes', '[]'), ('courriels', '[]'), ('modeles', '{}');
```

L'API REST de Supabase répond alors sur `/rest/v1/collections?nom=eq.demandes`, ce qui n'est pas le chemin attendu : prévoyez soit une fonction Edge qui expose `/demandes`, `/courriels`, `/modeles`, soit l'ajustement des deux fonctions `url` et `ecrireDistant` de `stockage.js`.

Si vous préférez une vraie table relationnelle par demande :

```sql
create table demandes (
  id          text primary key,
  ref         text unique not null,
  token       text unique not null,
  demandeur   text not null,
  email       text not null,
  titre       text not null,
  public_vise text,
  duree       text,
  urgence     text check (urgence in ('Urgent','Normal','Faible')),
  nb_avatars  int default 1,
  avatars     jsonb default '[]'::jsonb,
  script      text,
  storyboard  jsonb default '[]'::jsonb,
  precisions  text,
  pieces      jsonb default '[]'::jsonb,
  statut      text not null check (statut in ('nouvelle','production','validation','modif','validee')),
  lien        text,
  depose      timestamptz not null default now(),
  historique  jsonb default '[]'::jsonb,
  validation  jsonb
);

create table courriels (
  id         text primary key,
  ref        text references demandes(ref) on delete set null,
  canal      text,
  dest       text not null,
  expediteur text,
  objet      text not null,
  corps      text not null,
  envoye     timestamptz not null default now()
);

create index on demandes (statut);
create index on courriels (ref);
```

Dans ce cas, `stockage.js` doit être étendu de trois méthodes par ligne (`creer`, `majPartielle`, `supprimer`) plutôt que d'écrire la collection entière. Les points d'écriture de l'interface sont déjà centralisés dans les fonctions `sauver`, `sauverMails` et `sauverModeles` : il n'y a que là à intervenir.

## Sécurité

- **Aucune clé sensible dans la page.** Sur un site statique, tout ce que contient le JavaScript est lisible. La clé saisie dans Configuration reste sur le poste de l'administrateur, mais elle circule dans les requêtes : ne l'utilisez qu'avec un service dont les droits sont limités en écriture aux trois collections.
- **La connexion administrateur de cette maquette est locale** : elle empêche un accès distrait, pas un accès déterminé. En production, l'authentification doit être portée par le service qui héberge les données.
- **Les jetons de suivi** (`token`) tiennent lieu d'identification du formateur. Générez-les longs et aléatoires, et ne les affichez jamais dans une page publique indexable.
- **Données personnelles** : nom, adresse électronique, fonction et signature horodatée. Prévoyez la durée de conservation et l'information des personnes ; le formulaire de validation en porte déjà la mention, à faire valider par votre DPO académique.
