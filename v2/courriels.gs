/**
 * Gestionnaire Synthesia v2 — script d'envoi des courriels (Google Apps Script, compte GIP)
 *
 * Ce script ne stocke rien et ne décide de rien : il envoie des courriels depuis l'adresse GIP.
 * Les données vivent dans Supabase ; il les lit uniquement pour vérifier qu'un envoi est légitime
 * et pour remplir les modèles.
 *
 * Trois sortes d'appels (POST, corps JSON envoyé en text/plain) :
 *  1. « depot »     — navigateur du formateur, juste après le dépôt : accusé de réception
 *                     + alerte à l'administrateur. Accepté une seule fois par demande,
 *                     dans les 15 minutes suivant le dépôt (contrôlé par Supabase).
 *  2. « formateur » — navigateur du formateur, juste après une validation, une demande de
 *                     modification ou une demande de mise à jour. Le formateur a retapé son
 *                     adresse : elle n'est pas stockée. Accepté une seule fois par action,
 *                     dans les 15 minutes (contrôlé par Supabase).
 *  3. « admin »     — espace administrateur : le navigateur de l'administrateur a déchiffré
 *                     l'adresse et transmet sa session Supabase, vérifiée ici à chaque appel.
 *
 * Les appels 1 et 2 n'acceptent que les modèles fixes ci-dessous : personne ne peut se servir
 * du script pour envoyer un texte de son choix. Une limite horaire s'y ajoute.
 *
 * Installation : voir v2/LISEZMOI-courriels.md
 */

/* ---------- réglages (Propriétés du script) ---------- */

const REGLAGES_DEFAUT = {
  SUPABASE_URL: 'https://ybrivfxiepaabpjdnido.supabase.co',
  SUPABASE_CLE: 'sb_publishable_UIQicfFS1ZEczJy2K4rm5A_AuYoN-sP', // clé publique, sans valeur secrète
  SITE_V2: 'https://loymaster.github.io/Gestionnaire-Synthesia/v2',
  ADRESSE_ADMIN: '',                                   // à renseigner : adresse qui reçoit les alertes
  EXPEDITEUR: 'CAFOC · GIP FCIP de Reims',
  SIGNATURE: "Le CAFOC\nGIP FCIP de l'académie de Reims",
  ENTITE: "GIP FCIP de l'académie de Reims",
  ORGANISME: "Réseau des GRETA de l'académie de Reims",
  CONTACT_RGPD: 'lois.kerrouche@gipfcip-reims.fr',       // contact affiché sur l'attestation
  CLE_ROBOT: '',                                       // envois automatiques : clé du script (créée dans l'outil, Configuration)
  JETON_SCRIPT: '',                                    // envois automatiques : jeton du script (créé avec la clé)
  HEURE_ENVOIS: '8',                                   // heure des envois automatiques quotidiens
  LIMITE_HORAIRE: '40',                                // courriels publics (1 et 2) par heure, au total
  EXIGER_DOUBLE_AUTH: 'oui'                            // la session administrateur doit être en double authentification
};

function reglage_(cle) {
  const v = PropertiesService.getScriptProperties().getProperty(cle);
  return (v === null || v === '') ? REGLAGES_DEFAUT[cle] : v;
}

/** À exécuter une fois depuis l'éditeur : écrit les réglages par défaut sans écraser ceux déjà saisis. */
function configurer() {
  const p = PropertiesService.getScriptProperties();
  Object.keys(REGLAGES_DEFAUT).forEach(function (k) {
    if (p.getProperty(k) === null) p.setProperty(k, REGLAGES_DEFAUT[k]);
  });
  Logger.log('Réglages : ' + JSON.stringify(p.getProperties(), null, 2));
  if (!p.getProperty('ADRESSE_ADMIN')) Logger.log('⚠ Renseignez ADRESSE_ADMIN dans Paramètres du projet > Propriétés du script.');
}

/* ---------- modèles ---------- */

/* Textes par défaut : ceux de l'outil (page « Modèles de courriels »).
   Un modèle personnalisé dans l'outil remplace celui-ci (lu dans la base à chaque envoi). */
const MODELES = {
  attestation: {
    objet: "Attestation de validation · {{ref}}",
    corps: "Bonjour {{demandeur}},\n\nNous accusons réception de votre validation pour la vidéo « {{titre}} », produite avec l'outil Synthesia dans le cadre du projet de création de vidéos de l'académie de Reims.\n\nVotre accord a été enregistré et horodaté. Vous trouverez ci-joint l'attestation correspondante, au format PDF, reproduisant les déclarations que vous avez acceptées. Elle reste également consultable et imprimable à l'adresse suivante :\n{{lienAttestation}}\n\nNous vous invitons à en conserver un exemplaire. Ce document atteste que vous avez visionné la vidéo dans son intégralité et autorisé sa diffusion en l'état au sein du réseau des GRETA de l'académie de Reims.\n\nSi le contenu de votre vidéo doit évoluer plus tard, vous pourrez demander une nouvelle version depuis ce lien :\n{{lienMiseAJour}}\nLa version validée aujourd'hui restera en ligne jusqu'à la validation de la nouvelle.\n\nNous vous remercions pour votre collaboration,\n{{signature}}"
  },
  modif_confirmation: {
    objet: "Votre demande de modification a bien été reçue · {{ref}}",
    corps: "Bonjour {{demandeur}},\n\nNous vous confirmons la réception de votre demande de modification concernant la vidéo « {{titre}} », produite avec l'outil Synthesia dans le cadre du projet de création de vidéos de l'académie de Reims.\n\nVoici ce que vous nous avez transmis :\n{{commentaire}}\n{{compteurModifs}}\nNous allons produire une nouvelle version en tenant compte de ces éléments, et vous serez informé par courriel dès qu'elle sera prête à valider. Vous pouvez suivre l'avancement à tout moment :\n{{lienSuivi}}\n\nNous vous remercions pour votre vigilance,\n{{signature}}"
  },
  depot_admin: {
    objet: "Nouvelle demande de vidéo Synthesia · {{ref}}",
    corps: "Bonjour,\n\nUne nouvelle demande vient d'être déposée dans le cadre du projet de création de vidéos Synthesia de l'académie de Reims.\n\nDemandeur : {{demandeur}} ({{email}})\nTitre : {{titre}}\nPublic visé : {{public}}\nDurée souhaitée : {{duree}}\nUrgence : {{urgence}}\nStoryboard : {{plans}}\n\nLe ticket {{ref}} est disponible dans l'espace administrateur, avec le script et les visuels transmis.\n\nBonne journée."
  },
  depot_confirmation: {
    objet: "Votre demande de vidéo Synthesia a bien été reçue · {{ref}}",
    corps: "Bonjour {{demandeur}},\n\nNous vous remercions pour votre demande de vidéo, déposée dans le cadre du projet de création de vidéos Synthesia de l'académie de Reims. Elle a bien été enregistrée sous la référence {{ref}}.\n\nVotre projet « {{titre}} » va être étudié dans les meilleurs délais. Vous serez informé par courriel dès que la production sera lancée, puis dès que la vidéo sera prête à être visionnée.\n\nVous pouvez suivre l'avancement de votre demande et, le moment venu, valider la vidéo depuis ce lien personnel :\n{{lienSuivi}}\n\nNous vous invitons à conserver ce courriel : ce lien est votre unique accès au suivi de votre demande.\n\nEn vous remerciant de votre confiance,\n{{signature}}"
  },
  prise_en_charge: {
    objet: "Votre vidéo Synthesia {{ref}} est en cours de réalisation",
    corps: "Bonjour {{demandeur}},\n\nNous avons le plaisir de vous informer que votre demande « {{titre}} » ({{ref}}) est désormais prise en charge : la production de votre vidéo Synthesia est lancée.\n\nNous reviendrons vers vous dès que la première version sera disponible, afin que vous puissiez la visionner et nous faire part de votre avis.\n\nVous pouvez suivre l'avancement à tout moment depuis votre lien personnel :\n{{lienSuivi}}\n\nRestant à votre disposition,\n{{signature}}"
  },
  pret_a_valider: {
    objet: "Votre vidéo Synthesia {{ref}} est prête à être validée",
    corps: "Bonjour {{demandeur}},\n\nNous avons le plaisir de vous annoncer que la vidéo « {{titre}} », réalisée avec Synthesia dans le cadre du projet académique, est terminée et disponible à cette adresse :\n{{lienVideo}}\n\nNous vous invitons à la visionner puis, si elle vous convient, à la valider en signant le formulaire prévu à cet effet :\n{{lienValidation}}\n\nSi vous souhaitez au contraire y apporter des modifications, ce formulaire est prérempli avec la référence de votre vidéo :\n{{lienModification}}\n{{compteurModifs}}\nVos remarques sont précieuses : n'hésitez pas à être précis (minutage, formulation, visuels), afin que la version suivante réponde pleinement à vos attentes.\n\nEn vous remerciant par avance pour votre retour,\n{{signature}}"
  },
  relance: {
    objet: "Rappel · votre vidéo Synthesia {{ref}} attend votre validation",
    corps: "Bonjour {{demandeur}},\n\nNous nous permettons de revenir vers vous au sujet de la vidéo « {{titre}} » ({{ref}}), réalisée avec Synthesia et actuellement en attente de votre validation.\n\nDès réception de votre retour, nous pourrons finaliser votre projet.\n\nValider la vidéo :\n{{lienValidation}}\n\nDemander une modification :\n{{lienModification}}\n{{compteurModifs}}\nSi vous avez besoin d'un délai supplémentaire ou d'un échange préalable, n'hésitez pas à nous le faire savoir.\n\nAvec nos remerciements,\n{{signature}}"
  },
  validee: {
    objet: "{{ref}} · vidéo validée par {{demandeur}}",
    corps: "Bonjour,\n\n{{demandeur}} vient de valider la vidéo « {{titre}} » ({{ref}}), réalisée avec Synthesia.\n\nLe projet est terminé : la vidéo peut être diffusée auprès du public visé ({{public}}).\n\nBonne journée."
  },
  avert_suppression: {
    objet: "Votre vidéo {{ref}} sera supprimée le {{dateSuppression}} sans nouvelle de votre part",
    corps: "Bonjour {{demandeur}},\n\nLa vidéo « {{titre}} » ({{ref}}) vous a été envoyée pour validation, et nous n'avons pas encore reçu votre réponse.\n\nSans nouvelle de votre part, votre vidéo sera supprimée {{delaiSuppression}}, le {{dateSuppression}}.\n\nPour la conserver, il vous suffit de la valider ou de demander une modification :\nValider la vidéo : {{lienValidation}}\nDemander une modification : {{lienModification}}\n{{compteurModifs}}\nSi vous avez besoin d'un délai supplémentaire, répondez simplement à ce courriel.\n\nAvec nos remerciements,\n{{signature}}"
  },
  video_supprimee: {
    objet: "Votre vidéo {{ref}} a été supprimée",
    corps: "Bonjour {{demandeur}},\n\nSans réponse de votre part 3 mois après son envoi, la vidéo « {{titre}} » ({{ref}}) a été supprimée, ainsi que votre demande et les documents transmis.\n\nSi vous avez toujours besoin de cette vidéo, vous pouvez déposer une nouvelle demande.\n\nNous vous remercions de votre compréhension,\n{{signature}}"
  },
  suppression_concepteur: {
    objet: "À supprimer dans Synthesia · {{ref}}",
    corps: "Bonjour,\n\nLa demande {{ref}} « {{titre}} » est restée sans réponse 3 mois après l'envoi de la vidéo : elle vient d'être supprimée de l'outil (il n'en reste qu'une trace anonyme).\n\nMerci de supprimer la vidéo dans Synthesia :\n{{lienVideo}}\n\nLe demandeur a été prévenu."
  },
  maj_confirmation: {
    objet: "Votre demande de mise à jour a bien été reçue · {{ref}}",
    corps: "Bonjour {{demandeur}},\n\nNous vous confirmons la réception de votre demande de mise à jour de la vidéo « {{titre}} ». Une nouvelle version est ouverte : {{ref}}.\n\nVoici ce que vous nous avez transmis :\n{{commentaire}}\n\nLa version validée précédemment reste en ligne jusqu'à la validation de la nouvelle. Vous serez informé par courriel dès que celle-ci sera prête à valider. Vous pouvez suivre l'avancement à tout moment :\n{{lienSuivi}}\n\nNous vous remercions,\n{{signature}}"
  },
  maj_admin: {
    objet: "Mise à jour demandée · {{ref}}",
    corps: "Bonjour,\n\n{{demandeur}} demande une nouvelle version de la vidéo « {{titre}} » ({{ref}}).\n{{compteurModifs}}\nDescription de la mise à jour :\n{{commentaire}}\n\nLa demande est au statut « Mise à jour demandée » dans l'espace administrateur."
  },
  modif_demandee: {
    objet: "Modification demandée sur la vidéo {{ref}}",
    corps: "Bonjour,\n\n{{demandeur}} a visionné la vidéo « {{titre}} » ({{ref}}) et souhaite une modification avant validation.\n\nRemarques transmises :\n{{commentaire}}\n\nLa demande est repassée au statut « Modification demandée » dans l'espace administrateur, où figure l'historique complet.\n\nBonne journée."
  }
};

const MODELES_ADMIN = ['prise_en_charge', 'pret_a_valider', 'relance', 'libre'];
const MODELES_FORMATEUR = { attestation: 'validee', modif_confirmation: 'modif_demandee', maj_confirmation: 'maj_admin' };

/* ---------- point d'entrée ---------- */

function doPost(e) {
  let corps;
  try { corps = JSON.parse(e.postData.contents); } catch (err) { return sortie_({ ok: false, erreur: 'requête illisible' }); }
  try {
    if (corps.action === 'depot') return sortie_(depot_(corps));
    if (corps.action === 'formateur') return sortie_(formateur_(corps));
    if (corps.action === 'admin') return sortie_(admin_(corps));
    return sortie_({ ok: false, erreur: 'action inconnue' });
  } catch (err) {
    console.error(err);
    return sortie_({ ok: false, erreur: String(err && err.message || err) });
  }
}

function doGet() {
  return sortie_({ ok: true, service: 'courriels Gestionnaire Synthesia v2' });
}

/* 1. Accusé de réception au dépôt */
function depot_(c) {
  const email = adresse_(c.email), nom = texte_(c.nom, 120);
  if (!email || !nom || !c.token) return { ok: false, erreur: 'adresse, nom ou jeton manquant' };
  const suivi = rpc_('lire_suivi', { p_token: c.token });
  if (!suivi) return { ok: false, erreur: 'demande introuvable' };
  limiteHoraire_();
  if (rpc_('marquer_accuse', { p_token: c.token }) !== true) return { ok: false, erreur: 'accusé déjà envoyé ou délai dépassé' };

  const v = variables_(suivi, c.token, { demandeur: nom, email: email });
  envoyer_(email, modele_('depot_confirmation'), v);
  if (reglage_('ADRESSE_ADMIN')) envoyer_(reglage_('ADRESSE_ADMIN'), modele_('depot_admin'), v);
  return { ok: true };
}

/* 2. Courriels déclenchés par une action du formateur */
function formateur_(c) {
  const email = adresse_(c.email), nom = texte_(c.nom, 120);
  if (!email || !nom || !c.token || !MODELES_FORMATEUR[c.modele]) return { ok: false, erreur: 'paramètres manquants' };
  limiteHoraire_();
  if (rpc_('marquer_courriel_formateur', { p_token: c.token, p_modele: c.modele }) !== true)
    return { ok: false, erreur: 'aucune action récente correspondante, ou courriel déjà envoyé' };
  const suivi = rpc_('lire_suivi', { p_token: c.token });

  const ev = { attestation: 'validation', modif_confirmation: 'modification', maj_confirmation: 'mise_a_jour' }[c.modele];
  const derniere = (suivi.historique || []).filter(function (h) { return h.acteur === 'formateur' && h.evenement === ev; }).pop();
  const v = variables_(suivi, c.token, { demandeur: nom, email: email, commentaire: derniere && derniere.texte || '' });
  if (c.modele === 'modif_confirmation' && suivi.type === 'syren' && suivi.modifs_restantes === 0)
    v.compteurModifs = "C'était votre dernière demande de modification pour cette vidéo.\n";

  const pj = c.modele === 'attestation' ? [attestationPdf_(suivi, v)] : [];
  envoyer_(email, modele_(c.modele), v, pj);
  if (reglage_('ADRESSE_ADMIN')) envoyer_(reglage_('ADRESSE_ADMIN'), modele_(MODELES_FORMATEUR[c.modele]), v);
  return { ok: true };
}

/* 3. Envois de l'administrateur */
function admin_(c) {
  const utilisateur = verifierAdmin_(c.jwt);
  const email = adresse_(c.destinataire), nom = texte_(c.nom, 120);
  const libre = !!(c.objet && c.corps);
  if (!email || !c.id || (!libre && MODELES_ADMIN.indexOf(c.modele) < 0)) return { ok: false, erreur: 'paramètres manquants' };

  const lignes = rest_('GET', 'demandes?select=id,ref,type,statut,version,lien,contenu,token,modifs_utilisees&id=eq.' + encodeURIComponent(c.id), null, c.jwt);
  if (!lignes || !lignes.length) return { ok: false, erreur: 'demande introuvable' };
  const d = lignes[0];
  const suivi = { ref: d.ref, type: d.type, statut: d.statut, version: d.version, lien: d.lien, contenu: d.contenu,
                  modifs_restantes: d.type === 'syren' ? Math.max(0, 2 - d.modifs_utilisees) : null };
  const v = variables_(suivi, d.token, { demandeur: nom, email: email });

  // Texte personnalisé possible pour l'administrateur (session vérifiée) ; sinon modèle par défaut
  const modele = (c.objet && c.corps) ? { objet: texte_(c.objet, 300), corps: texte_(c.corps, 20000) } : modele_(c.modele);
  if (!modele) return { ok: false, erreur: 'modèle libre sans texte' };
  let resultat = 'envoyé';
  try { envoyer_(email, modele, v); } catch (err) { resultat = 'échec : ' + err.message; }
  rest_('POST', 'courriels', { demande_id: d.id, modele: texte_(c.modele || 'libre', 40), resultat: resultat }, c.jwt);
  return resultat === 'envoyé' ? { ok: true } : { ok: false, erreur: resultat };
}

/* ---------- contenu des courriels ---------- */

let personnalises_ = null;
function modele_(id) {
  if (personnalises_ === null) {
    try { personnalises_ = rpc_('modeles_courriels', {}) || {}; } catch (e) { personnalises_ = {}; console.warn('modèles personnalisés indisponibles', e); }
  }
  const p = personnalises_[id] || {};
  const d = MODELES[id] || {};
  return { objet: p.objet || d.objet, corps: p.corps || d.corps };
}

function variables_(s, token, extra) {
  const site = String(reglage_('SITE_V2')).replace(/\/+$/, '');
  const suivi = site + '/suivi.html?';
  const c = s.contenu || {};
  const syren = s.type === 'syren';
  const reste = s.modifs_restantes;
  const nbPlans = (c.storyboard || []).length;
  let compteur = '';
  if (syren && reste > 0) compteur = 'Il vous reste ' + reste + ' demande' + (reste > 1 ? 's' : '') + ' de modification pour cette vidéo.\n';
  if (syren && reste === 0) compteur = 'Les 2 demandes de modification prévues pour cette vidéo ont été utilisées : elle peut être validée telle quelle. Pour toute situation particulière, répondez à ce courriel.\n';
  return Object.assign({
    ref: s.ref + (s.version > 1 ? ' v' + s.version : ''),
    refVersion: s.ref + (s.version > 1 ? ' v' + s.version : ''),
    type: syren ? 'Syren' : 'Classique',
    titre: texte_(c.titre || c.sujet || '(sans titre)', 300),
    duree: texte_(c.duree, 60), urgence: texte_(c.urgence, 40), public: texte_(c.publicVise, 300),
    plans: nbPlans ? (nbPlans === 1 ? '1 plan' : nbPlans + ' plans') : 'aucun plan',
    lienVideo: s.lien || '',
    lienSuivi: suivi + 'suivi=' + token,
    lienValidation: suivi + 'valider=' + token,
    lienModification: suivi + 'modifier=' + token,
    lienMiseAJour: suivi + 'mise-a-jour=' + token,
    lienAttestation: suivi + 'attestation=' + token,
    lienAdmin: site + '/index.html?admin',
    compteurModifs: compteur,
    commentaire: '',
    signature: reglage_('SIGNATURE')
  }, extra || {});
}

function remplir_(texte, v) {
  return String(texte).replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) {
    return v[k] === undefined || v[k] === null || v[k] === '' ? (k === 'compteurModifs' ? '' : '—') : String(v[k]);
  });
}

function envoyer_(dest, modele, v, pieces) {
  const options = { to: dest, subject: remplir_(modele.objet, v), body: remplir_(modele.corps, v), name: reglage_('EXPEDITEUR') };
  if (pieces && pieces.length) options.attachments = pieces;
  MailApp.sendEmail(options);
}

function attestationPdf_(s, v) {
  const version = (s.versions || []).filter(function (x) { return x.numero === s.version; })[0] || {};
  const reglages = { contactRgpd: reglage_('CONTACT_RGPD'), entite: reglage_('ENTITE'), organisme: reglage_('ORGANISME') };
  const page = '<html><head><meta charset="utf-8"></head><body style="margin: 0;">' +
    attestationHtml(attestationDonnees(s, version, reglages, logoAttestation_())) + '</body></html>';
  return Utilities.newBlob(page, 'text/html', 'attestation.html').getAs('application/pdf').setName('Attestation ' + v.refVersion + '.pdf');
}

/* Logo intégré au PDF (la conversion de Google ne charge pas les images distantes) */
function logoAttestation_() {
  try {
    const r = UrlFetchApp.fetch(String(reglage_('SITE_V2')).replace(/\/+$/, '') + '/logo-attestation.jpg', { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) return 'data:image/jpeg;base64,' + Utilities.base64Encode(r.getBlob().getBytes());
  } catch (e) { console.warn('logo indisponible', e); }
  return '';
}

/* Modèle de l'attestation : copie à l'identique de v2/attestation.js (site) */
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

/* ---------- Supabase ---------- */

function rpc_(fonction, params, jwt) {
  return rest_('POST', 'rpc/' + fonction, params, jwt);
}

function rest_(methode, chemin, charge, jwt) {
  const r = UrlFetchApp.fetch(reglage_('SUPABASE_URL') + '/rest/v1/' + chemin, {
    method: methode.toLowerCase(),
    contentType: 'application/json',
    headers: { apikey: reglage_('SUPABASE_CLE'), Authorization: 'Bearer ' + (jwt || reglage_('SUPABASE_CLE')) },
    payload: charge ? JSON.stringify(charge) : undefined,
    muteHttpExceptions: true
  });
  const code = r.getResponseCode(), txt = r.getContentText();
  if (code >= 300) throw new Error('Supabase ' + code + ' sur ' + chemin.split('?')[0]);
  return txt ? JSON.parse(txt) : null;
}

function verifierAdmin_(jwt) {
  if (!jwt) throw new Error('session administrateur absente');
  const r = UrlFetchApp.fetch(reglage_('SUPABASE_URL') + '/auth/v1/user', {
    headers: { apikey: reglage_('SUPABASE_CLE'), Authorization: 'Bearer ' + jwt }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('session administrateur invalide ou expirée');
  const u = JSON.parse(r.getContentText());
  if (reglage_('EXIGER_DOUBLE_AUTH') === 'oui') {
    const charge = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(jwt.split('.')[1] + '==='.slice((jwt.split('.')[1].length + 3) % 4))).getDataAsString());
    if (charge.aal !== 'aal2') throw new Error('double authentification requise');
  }
  const admins = rest_('GET', 'administrateurs?select=user_id&user_id=eq.' + encodeURIComponent(u.id), null, jwt);
  if (!admins || !admins.length) throw new Error('compte non administrateur');
  return u;
}

/* ---------- garde-fous ---------- */

function limiteHoraire_() {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const cle = 'envois_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    const n = Number(cache.get(cle) || 0);
    if (n >= Number(reglage_('LIMITE_HORAIRE'))) throw new Error("limite horaire d'envoi atteinte, réessayez plus tard");
    cache.put(cle, String(n + 1), 3700);
  } finally { verrou.releaseLock(); }
}

function adresse_(x) {
  const a = String(x || '').trim();
  return (a.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i.test(a)) ? a : '';
}

function texte_(x, max) {
  return String(x === undefined || x === null ? '' : x).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max).trim();
}

function html_(x) {
  return String(x === undefined || x === null ? '' : x).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

function sortie_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}


/* =====================================================================================================
 * ENVOIS AUTOMATIQUES (jalons après l'envoi d'une vidéo au demandeur)
 *   - relance 15 jours sans réponse ;
 *   - avertissements un mois puis une semaine avant la suppression ;
 *   - suppression au bout de 3 mois : courriel au demandeur, courriel à l'administrateur (vidéo à supprimer dans Synthesia).
 * Supabase calcule les jalons dus ; le script déchiffre l'adresse (clé CLE_ROBOT), envoie, puis fait noter le jalon.
 * Installation : exécuter une fois installerEnvoisQuotidiens().
 * ===================================================================================================== */

/** Tâche quotidienne (déclencheur). */
function envoisDuJour() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) return;
  try {
    const jeton = reglage_('JETON_SCRIPT');
    if (!jeton || !reglage_('CLE_ROBOT')) { console.warn('Envois automatiques : CLE_ROBOT ou JETON_SCRIPT manquant.'); return; }
    const r = rpc_('robot_jalons', { p_jeton: jeton });
    if (!r || !r.actif) { console.log('Envois automatiques désactivés dans l\'outil.'); return; }
    const bilan = [], echecs = [];
    (r.jalons || []).forEach(function (j) {
      try { bilan.push(traiterJalon_(j, jeton)); }
      catch (e) { echecs.push(j.ref + ' (' + j.jalon + ') : ' + e.message); console.error(j.ref, e); }
    });
    console.log('Envois automatiques : ' + bilan.length + ' jalon(s) traité(s), ' + echecs.length + ' échec(s).');
    if (echecs.length && reglage_('ADRESSE_ADMIN')) {
      MailApp.sendEmail({ to: reglage_('ADRESSE_ADMIN'), name: reglage_('EXPEDITEUR'), subject: 'Envois automatiques : ' + echecs.length + ' échec(s)',
        body: "Bonjour,\n\nCes jalons n'ont pas pu être traités ce matin. Ils seront retentés demain ; vous pouvez aussi les envoyer depuis la fiche de chaque demande.\n\n" + echecs.join('\n') });
    }
  } finally { verrou.releaseLock(); }
}

function traiterJalon_(j, jeton) {
  const s = { ref: j.ref, type: j.type, version: j.version, lien: j.lien, modifs_restantes: j.modifs_restantes,
              contenu: { titre: j.titre, duree: j.duree, publicVise: j.public_vise } };
  const echeance = new Date(j.echeance_suppression);
  const extra = { dateSuppression: Utilities.formatDate(echeance, 'Europe/Paris', 'dd/MM/yyyy'),
                  delaiSuppression: j.jalon === 'avert_mois' ? 'dans un mois' : j.jalon === 'avert_semaine' ? 'dans une semaine' : '' };
  let contact = null;
  try { contact = dechiffrerContact_(j.contact_robot); } catch (e) { contact = null; }

  if (j.jalon === 'suppression') {
    // Le courriel à l'administrateur part dans tous les cas ; celui au demandeur si son adresse est lisible
    const v = variables_(s, j.token, Object.assign({ demandeur: contact ? contact.nom : '', email: contact ? contact.email : '' }, extra));
    let resultat = 'envoyé';
    if (contact && adresse_(contact.email)) envoyer_(contact.email, modele_('video_supprimee'), v);
    else resultat = 'adresse du demandeur indisponible : courriel au demandeur non envoyé';
    if (reglage_('ADRESSE_ADMIN')) envoyer_(reglage_('ADRESSE_ADMIN'), modele_('suppression_concepteur'), v);
    rpc_('robot_jalon_fait', { p_jeton: jeton, p_id: j.id, p_jalon: 'suppression', p_resultat: resultat });
    return j.ref + ' supprimée';
  }

  if (!contact || !adresse_(contact.email)) throw new Error("adresse du demandeur indisponible (ouvrez l'outil pour la préparer)");
  const v = variables_(s, j.token, Object.assign({ demandeur: contact.nom, email: contact.email }, extra));
  envoyer_(contact.email, modele_(j.jalon === 'relance' ? 'relance' : 'avert_suppression'), v);
  rpc_('robot_jalon_fait', { p_jeton: jeton, p_id: j.id, p_jalon: j.jalon, p_resultat: 'envoyé' });
  return j.ref + ' ' + j.jalon;
}

/** À exécuter une fois : crée le déclencheur quotidien (et supprime un éventuel doublon). */
function installerEnvoisQuotidiens() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'envoisDuJour') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('envoisDuJour').timeBased().everyDays(1).atHour(Number(reglage_('HEURE_ENVOIS')) || 8).inTimezone('Europe/Paris').create();
  Logger.log('Déclencheur créé : envoisDuJour chaque jour vers ' + (reglage_('HEURE_ENVOIS') || 8) + ' h (heure de Paris).');
}

/** Vérifie la clé du script sans rien envoyer : cohérence de la clé, jeton, et liste de ce qui partirait aujourd'hui. */
function testerEnvoisAutomatiques() {
  const cle = cleRobot_();
  const m = 123456789n, e = 65537n;
  const ok = modPow_(modPow_(m, e, cle.n), cle.d, cle.n) === m;
  Logger.log('Clé du script : ' + (ok ? 'valide' : 'INVALIDE') + ' (' + cle.k * 8 + ' bits).');
  const r = rpc_('robot_jalons', { p_jeton: reglage_('JETON_SCRIPT') });
  Logger.log('Jeton : accepté. Envois automatiques ' + (r.actif ? 'ACTIFS' : 'désactivés dans l\'outil') + '.');
  (r.jalons || []).forEach(function (j) {
    let qui = '?';
    try { qui = dechiffrerContact_(j.contact_robot).email; } catch (err) { qui = 'adresse indisponible'; }
    Logger.log(j.ref + ' → ' + j.jalon + ' → ' + qui);
  });
  if (!(r.jalons || []).length) Logger.log("Aucun jalon dû aujourd'hui" + (r.actif ? '.' : ' (la liste n\'est calculée que si les envois sont actifs).'));
}

/* ---------- déchiffrement RSA-OAEP (SHA-256) de l'adresse, sans bibliothèque ---------- */

function cleRobot_() {
  const c = JSON.parse(reglage_('CLE_ROBOT'));
  return { n: BigInt('0x' + c.n), d: BigInt('0x' + c.d), k: c.n.length / 2 };
}

function dechiffrerContact_(texte) {
  if (!texte) throw new Error('adresse non préparée');
  const env = JSON.parse(Utilities.newBlob(Utilities.base64Decode(texte)).getDataAsString('UTF-8'));
  const cle = cleRobot_();
  const c = octetsVersBig_(Utilities.base64Decode(env.c));
  const em = bigVersOctets_(modPow_(c, cle.d, cle.n), cle.k);
  const message = oaepDecoder_(em, cle.k);
  return JSON.parse(Utilities.newBlob(message.map(signe_)).getDataAsString('UTF-8'));
}

function modPow_(b, e, m) {
  let r = 1n; b = b % m;
  while (e > 0n) { if (e & 1n) r = (r * b) % m; e >>= 1n; b = (b * b) % m; }
  return r;
}
function octetsVersBig_(o) {
  let h = '0x0';
  for (let i = 0; i < o.length; i++) h += ((o[i] & 255) + 256).toString(16).slice(1);
  return BigInt(h);
}
function bigVersOctets_(x, k) {
  let h = x.toString(16); while (h.length < k * 2) h = '0' + h;
  const o = []; for (let i = 0; i < h.length; i += 2) o.push(parseInt(h.substr(i, 2), 16));
  return o;
}
function signe_(x) { return x > 127 ? x - 256 : x; }
function sha256Octets_(o) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, o.map(signe_)).map(function (x) { return x & 255; });
}
function mgf1_(graine, longueur) {
  let sortie = [];
  for (let c = 0; sortie.length < longueur; c++) sortie = sortie.concat(sha256Octets_(graine.concat([(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255])));
  return sortie.slice(0, longueur);
}
function oaepDecoder_(em, k) {
  const h = 32;
  if (em[0] !== 0) throw new Error('déchiffrement invalide (clé du script incorrecte ?)');
  const grainemasquee = em.slice(1, 1 + h), dbmasque = em.slice(1 + h);
  const masqueGraine = mgf1_(dbmasque, h);
  const graine = grainemasquee.map(function (x, i) { return x ^ masqueGraine[i]; });
  const masque = mgf1_(graine, k - h - 1);
  const db = dbmasque.map(function (x, i) { return x ^ masque[i]; });
  const lHash = sha256Octets_([]);
  for (let i = 0; i < h; i++) if (db[i] !== lHash[i]) throw new Error('déchiffrement invalide (clé du script incorrecte ?)');
  let i = h; while (i < db.length && db[i] === 0) i++;
  if (db[i] !== 1) throw new Error('déchiffrement invalide');
  return db.slice(i + 1);
}

/* ---------- test depuis l'éditeur ---------- */

/** Vérifie la connexion à Supabase sans rien envoyer. */
function testerConnexion() {
  const t = rpc_('tableau_public', {});
  Logger.log('Supabase répond : ' + (t ? t.length : 0) + ' demande(s) dans le tableau public.');
  Logger.log('Adresse des alertes : ' + (reglage_('ADRESSE_ADMIN') || '⚠ non renseignée'));
}
