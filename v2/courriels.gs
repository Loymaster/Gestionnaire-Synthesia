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

const MODELES = {
  depot_confirmation: {
    objet: 'Votre demande de vidéo a bien été reçue · {{ref}}',
    corps: "Bonjour {{demandeur}},\n\nNous vous remercions pour votre demande de vidéo, déposée dans le cadre du projet de création de vidéos de l'académie de Reims. Elle a bien été enregistrée sous la référence {{ref}}.\n\nVotre projet « {{titre}} » va être étudié dans les meilleurs délais. Vous serez informé par courriel dès que la production sera lancée, puis dès que la vidéo sera prête à être visionnée.\n\nVous pouvez suivre l'avancement de votre demande et, le moment venu, valider la vidéo depuis ce lien personnel :\n{{lienSuivi}}\n\nNous vous invitons à conserver ce courriel : ce lien est votre unique accès au suivi de votre demande.\n\nEn vous remerciant de votre confiance,\n{{signature}}"
  },
  depot_admin: {
    objet: 'Nouvelle demande de vidéo {{type}} · {{ref}}',
    corps: "Bonjour,\n\nUne nouvelle demande vient d'être déposée.\n\nRéférence : {{ref}}\nType : {{type}}\nDemandeur : {{demandeur}} ({{email}})\nTitre : {{titre}}\nDurée souhaitée : {{duree}}\n\nLa demande est disponible dans l'espace administrateur.\n{{lienAdmin}}"
  },
  attestation: {
    objet: 'Attestation de validation · {{ref}}',
    corps: "Bonjour {{demandeur}},\n\nNous accusons réception de votre validation pour la vidéo « {{titre}} » ({{refVersion}}).\n\nVotre accord a été enregistré et horodaté. Vous trouverez ci-joint l'attestation correspondante, au format PDF, reproduisant les déclarations que vous avez acceptées. Elle reste également consultable à l'adresse suivante :\n{{lienAttestation}}\n\nNous vous invitons à en conserver un exemplaire.\n\nSi le contenu de votre vidéo doit évoluer plus tard, vous pourrez demander une nouvelle version depuis ce lien :\n{{lienMiseAJour}}\nLa version validée aujourd'hui restera en ligne jusqu'à la validation de la nouvelle.\n\nNous vous remercions pour votre collaboration,\n{{signature}}"
  },
  validee_admin: {
    objet: '{{refVersion}} · vidéo validée par {{demandeur}}',
    corps: "Bonjour,\n\n{{demandeur}} vient de valider la vidéo « {{titre}} » ({{refVersion}}).\n\n{{lienAdmin}}"
  },
  modif_confirmation: {
    objet: 'Votre demande de modification a bien été reçue · {{ref}}',
    corps: "Bonjour {{demandeur}},\n\nNous vous confirmons la réception de votre demande de modification concernant la vidéo « {{titre}} » ({{refVersion}}).\n\nVoici ce que vous nous avez transmis :\n{{commentaire}}\n{{compteurApresModif}}\nNous allons produire une nouvelle version en tenant compte de ces éléments, et vous serez informé par courriel dès qu'elle sera prête à valider. Vous pouvez suivre l'avancement à tout moment :\n{{lienSuivi}}\n\nNous vous remercions pour votre vigilance,\n{{signature}}"
  },
  modif_admin: {
    objet: 'Modification demandée sur la vidéo {{refVersion}}',
    corps: "Bonjour,\n\n{{demandeur}} souhaite une modification de la vidéo « {{titre}} » ({{refVersion}}).\n{{compteurAdmin}}\nRemarques transmises :\n{{commentaire}}\n\n{{lienAdmin}}"
  },
  maj_confirmation: {
    objet: 'Votre demande de mise à jour a bien été reçue · {{ref}}',
    corps: "Bonjour {{demandeur}},\n\nNous vous confirmons la réception de votre demande de mise à jour de la vidéo « {{titre}} ». Une nouvelle version est ouverte : {{refVersion}}.\n\nVoici ce que vous nous avez transmis :\n{{commentaire}}\n\nLa version validée précédemment reste en ligne jusqu'à la validation de la nouvelle. Vous serez informé par courriel dès que celle-ci sera prête à valider. Suivi :\n{{lienSuivi}}\n\nNous vous remercions,\n{{signature}}"
  },
  maj_admin: {
    objet: 'Mise à jour demandée · {{refVersion}}',
    corps: "Bonjour,\n\n{{demandeur}} demande une nouvelle version de la vidéo « {{titre}} » : {{refVersion}}.\n{{compteurAdmin}}\nDescription de la mise à jour :\n{{commentaire}}\n\n{{lienAdmin}}"
  },
  prise_en_charge: {
    objet: 'Votre vidéo {{ref}} est en cours de réalisation',
    corps: "Bonjour {{demandeur}},\n\nNous avons le plaisir de vous informer que votre demande « {{titre}} » ({{refVersion}}) est désormais prise en charge : la production de votre vidéo est lancée.\n\nNous reviendrons vers vous dès que la vidéo sera disponible, afin que vous puissiez la visionner et nous faire part de votre avis.\n\nVous pouvez suivre l'avancement à tout moment depuis votre lien personnel :\n{{lienSuivi}}\n\nRestant à votre disposition,\n{{signature}}"
  },
  pret_a_valider: {
    objet: 'Votre vidéo {{ref}} est prête à être validée',
    corps: "Bonjour {{demandeur}},\n\nNous avons le plaisir de vous annoncer que la vidéo « {{titre}} » ({{refVersion}}) est terminée et disponible à cette adresse :\n{{lienVideo}}\n\nNous vous invitons à la visionner puis, si elle vous convient, à la valider en signant le formulaire prévu à cet effet :\n{{lienValidation}}\n{{blocModification}}\nEn vous remerciant par avance pour votre retour,\n{{signature}}"
  },
  relance: {
    objet: 'Rappel · votre vidéo {{ref}} attend votre validation',
    corps: "Bonjour {{demandeur}},\n\nNous nous permettons de revenir vers vous au sujet de la vidéo « {{titre}} » ({{refVersion}}), actuellement en attente de votre validation.\n\nDès réception de votre retour, nous pourrons finaliser votre projet.\n\nValider la vidéo :\n{{lienValidation}}\n{{blocModification}}\nSi vous avez besoin d'un délai supplémentaire ou d'un échange préalable, n'hésitez pas à nous le faire savoir.\n\nAvec nos remerciements,\n{{signature}}"
  }
};

const MODELES_ADMIN = ['prise_en_charge', 'pret_a_valider', 'relance', 'libre'];
const MODELES_FORMATEUR = { attestation: 'validee_admin', modif_confirmation: 'modif_admin', maj_confirmation: 'maj_admin' };

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
  envoyer_(email, MODELES.depot_confirmation, v);
  if (reglage_('ADRESSE_ADMIN')) envoyer_(reglage_('ADRESSE_ADMIN'), MODELES.depot_admin, v);
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

  const pj = c.modele === 'attestation' ? [attestationPdf_(suivi, v)] : [];
  envoyer_(email, MODELES[c.modele], v, pj);
  if (reglage_('ADRESSE_ADMIN')) envoyer_(reglage_('ADRESSE_ADMIN'), MODELES[MODELES_FORMATEUR[c.modele]], v);
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
  const modele = (c.objet && c.corps) ? { objet: texte_(c.objet, 300), corps: texte_(c.corps, 20000) } : MODELES[c.modele];
  if (!modele) return { ok: false, erreur: 'modèle libre sans texte' };
  let resultat = 'envoyé';
  try { envoyer_(email, modele, v); } catch (err) { resultat = 'échec : ' + err.message; }
  rest_('POST', 'courriels', { demande_id: d.id, modele: texte_(c.modele || 'libre', 40), resultat: resultat }, c.jwt);
  return resultat === 'envoyé' ? { ok: true } : { ok: false, erreur: resultat };
}

/* ---------- contenu des courriels ---------- */

function variables_(s, token, extra) {
  const site = String(reglage_('SITE_V2')).replace(/\/+$/, '');
  const suivi = site + '/suivi.html?';
  const c = s.contenu || {};
  const syren = s.type === 'syren';
  const reste = s.modifs_restantes;
  const lienModif = suivi + 'modifier=' + token;
  const pluriel = function (n) { return n + ' demande' + (n > 1 ? 's' : '') + ' de modification'; };

  let blocModification = "\nSi vous souhaitez au contraire y apporter des modifications, ce formulaire est à votre disposition :\n" + lienModif +
    "\n\nVos remarques sont précieuses : n'hésitez pas à être précis (minutage, formulation, visuels).\n";
  if (syren && reste > 0) blocModification += 'Il vous reste ' + pluriel(reste) + ' pour cette vidéo.\n';
  if (syren && reste === 0) blocModification = "\nVous avez utilisé les 2 demandes de modification prévues pour cette vidéo : elle peut être validée telle quelle. Pour toute situation particulière, répondez directement à ce courriel.\n";

  return Object.assign({
    ref: s.ref,
    refVersion: s.ref + (s.version > 1 ? ' v' + s.version : ''),
    type: syren ? 'Syren' : 'Classique',
    titre: texte_(c.titre || c.sujet || '(sans titre)', 300),
    duree: texte_(c.duree || '—', 60),
    lienVideo: s.lien || '',
    lienSuivi: suivi + 'suivi=' + token,
    lienValidation: suivi + 'valider=' + token,
    lienModification: lienModif,
    lienMiseAJour: suivi + 'mise-a-jour=' + token,
    lienAttestation: suivi + 'attestation=' + token,
    lienAdmin: site + '/admin.html',
    blocModification: blocModification,
    compteurApresModif: syren ? '\n' + (reste > 0 ? 'Il vous reste ' + pluriel(reste) + ' pour cette vidéo.' : "C'était votre dernière demande de modification pour cette vidéo.") + '\n' : '',
    compteurAdmin: syren ? 'Demandes de modification restantes : ' + reste + ' sur 2.\n' : '',
    commentaire: '',
    signature: reglage_('SIGNATURE')
  }, extra || {});
}

function remplir_(texte, v) {
  return String(texte).replace(/\{\{(\w+)\}\}/g, function (m, k) { return v[k] === undefined || v[k] === null ? '' : String(v[k]); });
}

function envoyer_(dest, modele, v, pieces) {
  const options = { to: dest, subject: remplir_(modele.objet, v), body: remplir_(modele.corps, v), name: reglage_('EXPEDITEUR') };
  if (pieces && pieces.length) options.attachments = pieces;
  MailApp.sendEmail(options);
}

function attestationPdf_(s, v) {
  const version = (s.versions || []).filter(function (x) { return x.numero === s.version; })[0] || {};
  const quand = version.valide_le ? Utilities.formatDate(new Date(version.valide_le), 'Europe/Paris', "dd/MM/yyyy 'à' HH:mm") : '';
  const decl = (version.declarations || []).map(function (t) { return '<li>' + html_(t) + '</li>'; }).join('');
  const page =
    '<html><body style="font-family:Arial,sans-serif;font-size:11pt;color:#1b1b35;margin:40px">' +
    '<p style="color:#666">' + html_(reglage_('ENTITE')) + '</p>' +
    '<h1 style="font-size:18pt;margin:24px 0 8px">Attestation de validation</h1>' +
    '<p style="margin:0 0 24px;color:#666">' + html_(v.refVersion) + '</p>' +
    '<table style="border-collapse:collapse;width:100%;margin-bottom:24px">' +
    ligne_('Vidéo', v.titre) + ligne_('Type', v.type) + ligne_('Lien', v.lienVideo) +
    ligne_('Validée par', v.demandeur) + ligne_('Date et heure', quand) + '</table>' +
    '<p><strong>Le demandeur a déclaré :</strong></p><ul>' + decl + '</ul>' +
    '<p style="margin-top:32px;font-size:9pt;color:#666">Attestation établie par voie électronique. La validation, horodatée, vaut acceptation des déclarations reproduites ci-dessus. ' +
    'Diffusion prévue au sein du ' + html_(reglage_('ORGANISME')) + '.</p></body></html>';
  return Utilities.newBlob(page, 'text/html', 'attestation.html').getAs('application/pdf').setName('Attestation ' + v.refVersion + '.pdf');
}

function ligne_(a, b) {
  return '<tr><td style="padding:6px 12px 6px 0;color:#666;width:140px;vertical-align:top">' + html_(a) + '</td><td style="padding:6px 0">' + html_(b) + '</td></tr>';
}

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

/* ---------- test depuis l'éditeur ---------- */

/** Vérifie la connexion à Supabase sans rien envoyer. */
function testerConnexion() {
  const t = rpc_('tableau_public', {});
  Logger.log('Supabase répond : ' + (t ? t.length : 0) + ' demande(s) dans le tableau public.');
  Logger.log('Adresse des alertes : ' + (reglage_('ADRESSE_ADMIN') || '⚠ non renseignée'));
}
