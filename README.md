# Gestion des demandes vidéo Synthesia

Outil de gestion des demandes de création de vidéos Synthesia pour l'académie de Reims : dépôt des demandes par les formateurs, suivi de production, validation signée et journal des courriels.

## Contenu du dépôt

| Fichier | Rôle |
| --- | --- |
| `index.html` | L'outil complet : formulaire de demande, formulaires de modification et de validation, espace administrateur |
| `base.html` | Vue technique des données enregistrées, export JSON, schéma de la table |
| `stockage.js` | Couche de persistance : mode local ou API externe |
| `support.js` | Bibliothèque de rendu, requise par les deux pages |
| `MISE-EN-LIGNE.md` | Procédure de déploiement pas à pas |
| `INTEGRATION.md` | Forme des données, schémas SQL, variantes d'hébergement |

Les six fichiers vont **à la racine du dépôt**. Ne les rangez pas dans un sous-dossier : `index.html` charge `support.js` et `stockage.js` par chemin relatif.

## Mise en ligne

1. Créez un dépôt public sur GitHub.
2. Téléversez les six fichiers à la racine.
3. **Settings → Pages → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Deux minutes plus tard, le site répond sur `https://<compte>.github.io/<depot>/`.

La procédure complète — création de la base Google Sheets, déploiement de l'API, raccordement, recette — est dans `MISE-EN-LIGNE.md`.

## Premier accès

Espace administrateur : identifiant `admin`, mot de passe `reims2026`.

**Changez-les immédiatement** dans Configuration → Accès administrateur.

## Les trois adresses publiques

| Page | Adresse |
| --- | --- |
| Déposer une demande | `/` |
| Demander une modification | `/?modifier=VID-2026-042` |
| Valider une vidéo | `/?valider=VID-2026-042` |

Les deux dernières sont insérées automatiquement dans les courriels envoyés aux formateurs.

## Avertissement de sécurité

La connexion administrateur de cette version est vérifiée par le navigateur : elle empêche un accès distrait, pas un accès déterminé. Sur un dépôt public, toute personne connaissant l'adresse atteint l'écran de connexion.

Avant l'ouverture aux formateurs, choisissez l'une de ces deux options :
- héberger l'interface sur un espace déjà authentifié de l'académie ;
- faire contrôler le mot de passe par le script Apps Script, qui ne renvoie les données qu'après vérification.

Les jetons de suivi (`token`) donnent accès à la validation d'une vidéo : ne les publiez nulle part.
