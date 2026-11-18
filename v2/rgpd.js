/* Gestionnaire Synthesia v2 — mention d'information (RGPD) affichée sur les formulaires. */
window.mentionRgpd = function () {
  var contact = String((window.CONFIG_V2 || {}).contactRgpd || '').replace(/[<>&"]/g, '');
  return '<strong>Vos données.</strong> Le GIP FCIP de l\'académie de Reims recueille votre nom, votre adresse professionnelle et le contenu de votre demande '
    + 'pour produire la vidéo et vous en informer. Votre nom et votre adresse sont chiffrés dès votre navigateur : seul le service peut les lire. '
    + 'Les documents joints sont supprimés 30 jours après la validation de la vidéo ; votre nom et votre adresse, 2 ans après la dernière validation. '
    + 'Prestataires techniques : Supabase (hébergement dans l\'Union européenne), GitHub (site), Google (courriels), Synthesia (production des vidéos), Anthropic (aide à la préparation). '
    + 'Vous pouvez accéder à vos données, les faire rectifier ou effacer, et vous opposer à leur traitement en écrivant à ' + contact + '. '
    + 'Vous pouvez aussi adresser une réclamation à la CNIL.';
};
