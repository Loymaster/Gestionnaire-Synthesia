# Passage à la v2 — procédure

L'outil actuel (Google Sheets) continue de fonctionner tant que l'étape 5 n'est pas faite. Les étapes 1 à 4 peuvent être faites et refaites sans risque.

## 1. Mettre la v2 en ligne (sans toucher à l'outil actuel)
Fusionner la demande de fusion GitHub qui ajoute les fichiers de `v2/`. Rien ne change à l'adresse historique.

| Page | Adresse |
|---|---|
| Outil v2 (formulaire classique, espace administrateur) | `…/v2/index.html` · administrateur : `…/v2/index.html?admin` |
| Formulaire Syren | `…/v2/syren.html` |
| Suivi, validation, modification, mise à jour, attestation | `…/v2/suivi.html?suivi=…` (liens des courriels) |
| Reprise des demandes de l'ancien outil | `…/v2/reprise.html` |
| Clés de chiffrement | `…/v2/cles.html` |

## 2. Mettre à jour le script d'envoi des courriels
Copier `v2/courriels.gs` dans le projet Apps Script « Gestionnaire Synthesia v2 — courriels », enregistrer, puis **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer** (l'adresse `/exec` ne change pas).

## 3. Première connexion à l'espace administrateur
`…/v2/index.html?admin` : adresse et mot de passe Supabase, puis activation de la double authentification (application d'authentification), puis fichier de clé privée et phrase secrète.

## 4. Reprendre les demandes
Dans le même navigateur que l'ancien outil (pour retrouver son jeton), ouvrir `…/v2/reprise.html`, lire les demandes, puis « Reprendre les demandes ».
- Les noms, adresses et signatures sont chiffrés dans le navigateur avant l'envoi.
- « En correction » et « Corrigée » deviennent « Validée ».
- Les liens des anciens courriels restent valables : ils sont redirigés vers la bonne demande.
- Les pièces jointes de l'ancien outil restent sur Google Drive ; la fiche en garde les liens.
- La page peut être relancée : sans la case « Remplacer », les demandes déjà reprises sont ignorées.

## 5. Bascule (le jour J)
1. Refaire l'étape 4 **avec la case « Remplacer »** pour récupérer les dernières modifications faites dans l'ancien outil.
2. Remplacer `index.html` à la racine par `v2/bascule/racine-index.html` (demande de fusion dédiée). L'adresse historique renvoie alors vers la v2 en conservant les paramètres :
   - `?formulaire` (formulaire intégré dans Moodle) et `?tableau` (tableau d'avancement) continuent de fonctionner sans changer les intégrations ;
   - les liens `?valider=`, `?modifier=`, `?suivi=`, `?attestation=` des anciens courriels mènent à la page de suivi v2.
3. Publier le lien du formulaire Syren là où il est destiné.
4. Garder le classeur Google et l'ancien script en l'état (sauvegarde). Ils ne reçoivent plus de demandes.

## Maintenance automatique
- **Chaque jour à 4 h 17 (heure de Paris)**, une tâche Supabase supprime les pièces jointes 30 jours après la validation, anonymise les données personnelles 2 ans après la dernière validation et vide le journal des tentatives au-delà de 12 mois.
- **Chaque jour**, une action GitHub (`.github/workflows/maintien-supabase.yml`) appelle Supabase pour éviter la mise en pause de l'offre gratuite après 7 jours d'inactivité.
