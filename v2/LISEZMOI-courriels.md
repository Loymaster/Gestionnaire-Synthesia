# Script d'envoi des courriels — installation

Ce script remplace l'ancien `apps-script.gs` pour la version 2 de l'outil. Il ne fait qu'**envoyer des courriels** depuis l'adresse GIP : les demandes vivent dans Supabase.

L'ancien script continue de fonctionner tant que la bascule n'est pas faite. Le nouveau s'installe dans un **projet Apps Script séparé**.

## Installation (10 minutes, avec le compte GIP)

1. Ouvrir <https://script.google.com> avec le compte **GIP**, puis cliquer sur **Nouveau projet**. Le nommer « Gestionnaire Synthesia v2 — courriels ».
2. Remplacer le contenu de `Code.gs` par celui de `v2/courriels.gs`, puis enregistrer.
3. Choisir la fonction **`configurer`** dans la liste en haut, puis cliquer sur **Exécuter**. Google demande des autorisations : les accepter. Elles couvrent l'envoi de courriels et les appels vers Supabase.
4. Ouvrir **Paramètres du projet** (roue dentée), puis **Propriétés du script**. Renseigner `ADRESSE_ADMIN`, l'adresse qui reçoit les alertes.
5. Choisir la fonction **`testerConnexion`**, puis cliquer sur **Exécuter**. Le journal doit afficher « Supabase répond ».
6. Cliquer sur **Déployer**, puis **Nouveau déploiement**, puis le type **Application web**.
   - Exécuter en tant que : **Moi**.
   - Qui a accès : **Tout le monde**.
7. Copier l'adresse qui se termine par `/exec` et la transmettre : elle sera inscrite dans le site.

## Ce que le script accepte

| Appel | Qui l'envoie | Contrôle |
|---|---|---|
| Accusé de réception | Navigateur du formateur, au dépôt | Une seule fois par demande, dans les 15 min suivant le dépôt |
| Attestation, confirmation de modification ou de mise à jour | Navigateur du formateur, juste après son action, avec l'adresse qu'il vient de retaper | Une seule fois par action, dans les 15 min |
| Prise en charge, vidéo prête, relance, message libre | Espace administrateur | Session Supabase de l'administrateur vérifiée à chaque appel, double authentification exigée |

- **Modèles fixes.** Les appels publics n'utilisent que des modèles fixes : on ne peut pas faire envoyer un texte de son choix.
- **Limite horaire.** Elle est de 40 courriels publics par heure (réglage `LIMITE_HORAIRE`).
- **Aucune donnée conservée.** Le script ne garde aucune donnée. Les envois sont journalisés dans Supabase (table `courriels`), sans le contenu des messages.

## Réglages (Propriétés du script)

| Clé | Rôle |
|---|---|
| `ADRESSE_ADMIN` | Destinataire des alertes (obligatoire) |
| `EXPEDITEUR` | Nom affiché de l'expéditeur |
| `SIGNATURE` | Signature des courriels |
| `SITE` | Adresse du site, pour les liens |
| `LIMITE_HORAIRE` | Plafond d'envois publics par heure |
| `EXIGER_DOUBLE_AUTH` | `oui` par défaut |
| `SUPABASE_URL`, `SUPABASE_CLE` | Connexion à Supabase (clé publique) |
