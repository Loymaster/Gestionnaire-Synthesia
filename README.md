# Gestion des demandes vidéo Synthesia

Outil de gestion des demandes de création de vidéos Synthesia pour l'académie de Reims : dépôt par les formateurs, suivi de production, validation signée, journal des courriels.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `index.html` | L'outil : formulaires public, de modification et de validation, espace administrateur |
| `base.html` | Vue technique des données, export JSON |
| `stockage.js` | Couche de persistance — **contient l'adresse de l'API à renseigner** |
| `support.js` | Bibliothèque de rendu, requise par les deux pages |
| `logo-greta.jpg` | Bandeau institutionnel affiché en haut de chaque page |
| `fonts/` | Marianne (Light, Regular, Italic, Medium, Bold, ExtraBold) |
| `apps-script.gs` | Le code à coller dans Google Apps Script (ne pas téléverser, il ne sert pas au site) |
| `MISE-EN-LIGNE.md` | Procédure complète |

Les quatre premiers fichiers vont **à la racine du dépôt**, pas dans un sous-dossier. Le dossier `fonts/` conserve son nom et sa place à la racine.

## Avant de publier

Dans `stockage.js`, renseignez l'adresse de votre déploiement Apps Script :

```javascript
  var API = "https://script.google.com/macros/s/…/exec";
```

Laissée vide, l'application fonctionne en mode local : chaque visiteur écrit dans son propre navigateur et vous ne voyez rien. C'est le mode de démonstration.

## Trois niveaux d'accès

| Qui | Peut | S'authentifie par |
| --- | --- | --- |
| N'importe qui | Déposer une demande | Rien — le script n'accepte qu'une création |
| Le demandeur | Voir, valider, modifier **sa** demande | Le jeton de son lien de suivi |
| L'administrateur | Tout le reste | Le jeton saisi dans Configuration, jamais publié |

## Premier accès

Espace administrateur : `admin` / `reims2026`. **À changer immédiatement** dans Configuration → Accès administrateur.

Le jeton d'administration se saisit dans Configuration → Base de données. Sans lui, aucune demande ne s'affiche.

## Adresses publiques

| Page | Adresse |
| --- | --- |
| Déposer une demande | `/` |
| Valider une vidéo | `/?valider=<jeton>` |
| Demander une modification | `/?modifier=<jeton>` |

Les deux dernières sont insérées automatiquement dans les courriels. Les jetons de suivi donnent accès à la validation d'une vidéo : ne les publiez nulle part.
