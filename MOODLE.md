# Intégrer le formulaire dans Moodle (e-greta-cfa)

Le formulaire de demande s'affiche dans une tuile Moodle, sans que les formateurs quittent la plateforme. Seul le **dépôt** est intégré : l'espace administrateur et les liens de validation restent en accès direct.

## Le code à coller

Dans votre tuile : **Ajouter une activité ou ressource → Page**. Dans le champ *Contenu*, passez l'éditeur en mode source HTML (bouton `<>` ou *Outils → Code source* selon votre éditeur), puis collez :

```html
<iframe id="demande-video"
        src="https://VOTRE-COMPTE.github.io/videos-synthesia/?formulaire"
        style="width:100%; height:900px; border:0; display:block;"
        title="Demande de vidéo Synthesia"
        loading="lazy"></iframe>
<script>
(function () {
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'synthesia-hauteur') return;
    var f = document.getElementById('demande-video');
    if (f) f.style.height = (e.data.hauteur + 24) + 'px';
  });
})();
</script>
```

Remplacez l'adresse par la vôtre. Le paramètre `?formulaire` est ce qui bascule la page en mode intégré : barre de navigation masquée, en-tête allégé, marges réduites, et pas d'accès administrateur.

## Si le bloc disparaît à l'enregistrement

Moodle nettoie le HTML des auteurs qui ne sont pas « de confiance » : les balises `<iframe>` et `<script>` sautent silencieusement.

Demandez à votre administrateur Moodle d'activer **Administration du site → Sécurité → Sécurité du site → Autoriser le contenu de confiance** (`enabletrusttext`), puis de vous accorder la capacité `moodle/site:trustcontent` sur l'espace concerné.

**Sans cette autorisation**, deux solutions de repli :

- Le script de redimensionnement est facultatif. Gardez l'iframe seule avec une hauteur généreuse — `height:1600px` couvre le formulaire complet sans défilement interne dans la plupart des cas.
- Si l'iframe elle-même est refusée, utilisez une ressource **URL** pointant vers `…/?formulaire`, en cochant *Affichage : intégrer*. Moodle place alors lui-même la page dans un cadre.

## Ce qu'il ne faut pas mettre dans Moodle

**L'espace administrateur.** Les navigateurs cloisonnent le stockage des contenus affichés en iframe : votre jeton et vos réglages seraient perdus à chaque visite. Utilisez l'adresse directe, en favori.

**Les liens de validation et de modification.** Ils doivent rester des liens directs vers le site, tels que les courriels les génèrent. Les faire passer par Moodle obligerait le formateur à s'y reconnecter pour valider, et la constante `SITE` du script Apps Script ne les composerait plus correctement.

## Vérification

Une fois la page enregistrée, ouvrez-la en tant qu'étudiant (**Changer de rôle → Étudiant**) et déposez une demande de test. Elle doit apparaître dans votre feuille Google et déclencher les deux courriels.

Vérifiez aussi que le cadre s'ajuste : après avoir ajouté trois plans au storyboard, l'iframe doit grandir au lieu de faire défiler son contenu.
