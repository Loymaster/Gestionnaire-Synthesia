/*
 * Gestionnaire Synthesia v2 — modèle unique de l'attestation de validation.
 *
 * La même fonction produit l'attestation affichée sur le site et celle jointe en PDF au courriel
 * (copie à l'identique dans courriels.gs, entre les repères « ATTESTATION — DÉBUT / FIN »).
 * Toute modification se fait ici, puis se recopie dans courriels.gs.
 *
 * Mise en page reprise de l'attestation de l'outil v1. Styles en ligne, pour que la conversion PDF de Google
 * les respecte.
 */
/* ATTESTATION — DÉBUT */
function attestationHtml(a) {
  function e(x) {
    return String(x === undefined || x === null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var fonte = "font-family: Marianne, Arial, Helvetica, sans-serif;";
  var gris = 'color: #5a5e67;';
  var ligne = function (libelle, valeur, mono) {
    return '<tr><td style="padding: 9px 12px 9px 0; border-bottom: 1px solid #e8edf6; ' + gris + ' width: 34%; vertical-align: top;">' + e(libelle) + '</td>' +
      '<td style="padding: 9px 0; border-bottom: 1px solid #e8edf6; vertical-align: top;' + (mono ? ' font-size: 11.5px; word-break: break-all;' : '') + '">' + e(valeur) + '</td></tr>';
  };
  var decl = (a.declarations || []).map(function (d) {
    return '<tr><td style="width: 24px; vertical-align: top; padding: 0 0 12px;">' +
      '<div style="width: 14px; height: 14px; background: #154194; color: #ffffff; font-size: 10px; line-height: 14px; text-align: center; font-weight: bold;">&#10003;</div></td>' +
      '<td style="vertical-align: top; padding: 0 0 12px; font-size: 13px; line-height: 1.6;">' + e(d) + '</td></tr>';
  }).join('');
  var incise = a.fonction ? ', ' + e(a.fonction) + ',' : '';

  return '<div style="' + fonte + ' background: #ffffff; color: #1c2433; padding: 48px 52px; max-width: 760px; margin: 0 auto; box-sizing: border-box;">' +
    '<table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid #154194;"><tr>' +
      '<td style="padding: 0 0 20px; vertical-align: top;"><img src="' + e(a.logo) + '" alt="République française · GIP FCIP académie de Reims · Réseau GRETA" style="height: 54px; width: auto; display: block;"></td>' +
      '<td style="padding: 0 0 20px; vertical-align: top; text-align: right; font-size: 12px; line-height: 1.5; ' + gris + '">' + e(a.entite) + '<br>' + e(a.organisme) + '</td>' +
    '</tr></table>' +
    '<h1 style="margin: 30px 0 6px; font-size: 22px; font-weight: bold; line-height: 1.25; color: #1c2433;">Attestation de validation et d\'autorisation de diffusion</h1>' +
    '<div style="font-size: 13px; color: #154194; margin-bottom: 28px;">Référence ' + e(a.ref) + '</div>' +
    '<p style="margin: 0 0 24px; font-size: 14px; line-height: 1.7;">Je soussigné(e) <strong>' + e(a.nom) + '</strong>' + incise +
      ' déclare avoir procédé à la validation de la vidéo désignée ci-dessous, produite au moyen de l\'outil de génération ' + e(a.outil) +
      ' à ma demande et sous ma responsabilité pédagogique.</p>' +
    '<table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 13.5px;">' +
      ligne('Titre de la vidéo', a.titre) + ligne('Public visé', a.publicVise || '—') + ligne('Durée', a.duree || '—') +
      ligne('Adresse de la vidéo', a.lien || '—', true) + ligne('Demandeur', a.nom) +
    '</table>' +
    '<div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #154194; font-weight: bold; margin-bottom: 14px;">Déclarations acceptées</div>' +
    '<table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">' + decl + '</table>' +
    '<table style="width: 100%; border-collapse: collapse; background: #f4f6fa; border-left: 3px solid #f39200; margin-bottom: 24px;"><tr>' +
      '<td style="padding: 18px 20px; vertical-align: top; width: 50%;"><div style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; ' + gris + ' margin-bottom: 4px;">Signé par</div>' +
        '<div style="font-size: 15px; font-weight: bold;">' + e(a.nom) + '</div><div style="font-size: 13px; ' + gris + '">' + e(a.fonction || 'Fonction non précisée') + '</div></td>' +
      '<td style="padding: 18px 20px; vertical-align: top;"><div style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; ' + gris + ' margin-bottom: 4px;">Date et heure</div>' +
        '<div style="font-size: 15px; font-weight: bold;">' + e(a.signeLe) + '</div><div style="font-size: 13px; ' + gris + '">à ' + e(a.signeHeure) + '</div></td>' +
    '</tr></table>' +
    '<p style="margin: 0 0 18px; font-size: 12.5px; line-height: 1.65; ' + gris + '">' + e(a.mention) + '</p>' +
    '<div style="padding-top: 16px; border-top: 1px solid #e8edf6; font-size: 11.5px; line-height: 1.6; color: #6b7280;">' +
      '<div>Conservation des données de signature : ' + e(a.conservation) + '. Droits d\'accès, de rectification et d\'effacement : ' + e(a.contact) + '.</div>' +
      '<div style="margin-top: 8px; font-size: 10.5px;">Horodatage : ' + e(a.horodatage) + ' · Document édité le ' + e(a.edite) + '</div>' +
      '<div style="margin-top: 8px;">' + e(a.responsable) + ' — ' + e(a.entite) + '</div>' +
    '</div></div>';
}

/* Assemble les données de l'attestation à partir du suivi (lire_suivi) et d'une version validée */
function attestationDonnees(s, v, reglages, logo) {
  var r = reglages || {};
  var c = s.contenu || {};
  var quand = new Date(v.signe_le || v.valide_le);
  var mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var paris = function (d) {
    /* Date et heure de Paris, quel que soit le fuseau de la machine qui produit le document */
    if (typeof Utilities !== 'undefined') {   // Apps Script
      return { jour: Number(Utilities.formatDate(d, 'Europe/Paris', 'd')) + (Utilities.formatDate(d, 'Europe/Paris', 'd') === '1' ? 'er' : '') + ' ' +
        mois[Number(Utilities.formatDate(d, 'Europe/Paris', 'M')) - 1] + ' ' + Utilities.formatDate(d, 'Europe/Paris', 'yyyy'),
        heure: Utilities.formatDate(d, 'Europe/Paris', 'HH:mm') };
    }
    var t = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    var o = {}; t.forEach(function (p) { o[p.type] = p.value; });
    return { jour: Number(o.day) + (o.day === '1' ? 'er' : '') + ' ' + mois[Number(o.month) - 1] + ' ' + o.year, heure: o.hour + ':' + o.minute };
  };
  var signe = paris(quand), edite = paris(new Date());
  return {
    logo: logo,
    entite: r.entite || "GIP FCIP de l'académie de Reims",
    organisme: r.organisme || "Réseau des GRETA de l'académie de Reims",
    ref: s.ref + (v.numero > 1 ? ' v' + v.numero : ''),
    nom: v.nom || 'Signataire non renseigné',
    fonction: v.fonction || '',
    outil: s.type === 'syren' ? 'Synthesia (Syren)' : (r.outilNom || 'Synthesia'),
    titre: c.titre || c.sujet || '',
    publicVise: c.publicVise || '',
    duree: c.duree || '',
    lien: v.lien || s.lien || '',
    declarations: (v.declarations || []).filter(function (x) { return String(x).trim(); }),
    signeLe: signe.jour, signeHeure: signe.heure,
    horodatage: v.signe_le || v.valide_le,
    edite: edite.jour,
    mention: r.mentionLegale || "Attestation établie par voie électronique. La signature du demandeur vaut acceptation des déclarations reproduites ci-dessus et engage sa responsabilité au titre du contenu de la vidéo.",
    conservation: r.conservation || '2 ans à compter de la dernière validation de la vidéo',
    contact: r.contactRgpd || r.contactDpo || 'lois.kerrouche@gipfcip-reims.fr',
    responsable: [r.responsableNom, r.responsableFonction || 'Responsable du service de création vidéo'].filter(Boolean).join(' · ')
  };
}
/* ATTESTATION — FIN */
