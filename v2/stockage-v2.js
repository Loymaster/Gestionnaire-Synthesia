/*
 * Gestionnaire Synthesia v2 — stockage Supabase, avec la même interface que l'ancien stockage.js
 * (Google Sheets), pour que l'outil d'administration et le formulaire classique restent inchangés.
 *
 * Différences de fond :
 *  - un visiteur ne charge jamais la liste des demandes : il dépose, c'est tout ;
 *  - l'administrateur se connecte (mot de passe + double authentification), puis ouvre sa clé privée :
 *    les noms et adresses sont déchiffrés dans son navigateur uniquement ;
 *  - les courriels partent par le script Apps Script (compte GIP), qui vérifie la session administrateur.
 *
 * Dépendances chargées avant ce fichier : config.js, chiffrement.js, api.js, supabase-js (UMD).
 */
(function () {
  'use strict';
  var C = window.CONFIG_V2;
  var sb = null, clePrivee = null;
  var demandes = {};          // id → ligne brute (pour reconstituer l'identité lors d'une modification)
  var tickets = {};           // id → ticket tel que l'outil le manipule
  var parRef = {};            // ref → id

  var PT = { nouvelle: "oklch(0.42 0.01 250)", production: "#154194", validation: "oklch(0.44 0.11 70)", modif: "oklch(0.47 0.14 25)", maj: "#9a5a00", validee: "oklch(0.4 0.1 155)" };
  var POINT_EVENEMENT = { depot: "nouvelle", production: "production", livraison: "validation", relance: "validation", validation: "validee",
    modification: "modif", mise_a_jour: "maj", note: null, purge_pieces: null, anonymisation: null, phase: null, reprise: null };

  function client() {
    if (!sb) {
      sb = window.supabase.createClient(C.supabaseUrl, C.supabaseCle, {
        auth: { persistSession: true, storageKey: 'gestionnaire-synthesia-v2-admin', autoRefreshToken: true }
      });
    }
    return sb;
  }
  function signaler(message) {
    if (Stockage.onErreur) Stockage.onErreur(message);
    try { window.dispatchEvent(new CustomEvent('stockage-erreur', { detail: message })); } catch (e) {}
  }
  function verifier(r, quoi) {
    if (r.error) throw new Error((quoi ? quoi + ' : ' : '') + r.error.message);
    return r.data;
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  function horodatage(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return String(iso || '');
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2) + ' · ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function poids(o) {
    if (!o && o !== 0) return '';
    return o < 1024 * 1024 ? Math.max(1, Math.round(o / 1024)) + ' ko' : (o / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  }

  /* ------------------------------------------------------------------ connexion administrateur */

  /* Étape 1 : adresse et mot de passe. Renvoie l'étape suivante. */
  async function seConnecter(email, mdp) {
    var r = await client().auth.signInWithPassword({ email: String(email || '').trim(), password: mdp || '' });
    if (r.error) throw new Error(/invalid/i.test(r.error.message) ? 'Adresse ou mot de passe incorrect.' : r.error.message);
    return etapeSuivante();
  }

  /* Session déjà ouverte dans ce navigateur (rechargement de la page) */
  async function reprendreSession() {
    var s = await client().auth.getSession();
    if (!s.data || !s.data.session) return { etape: 'identifiants' };
    return etapeSuivante();
  }

  async function etapeSuivante() {
    var niv = verifier(await client().auth.mfa.getAuthenticatorAssuranceLevel());
    if (niv.currentLevel !== 'aal2') {
      var f = verifier(await client().auth.mfa.listFactors());
      var totp = (f.totp || []).filter(function (x) { return x.status === 'verified'; })[0];
      if (totp) return { etape: 'code', facteur: totp.id };
      return { etape: 'enrolement' };
    }
    if (!(await estAdmin())) { await deconnexion(); throw new Error("Ce compte n'a pas les droits d'administration."); }
    if (!clePrivee) return { etape: 'cle' };
    return { etape: 'pret' };
  }

  async function estAdmin() {
    var u = verifier(await client().auth.getUser());
    var r = await client().from('administrateurs').select('user_id').eq('user_id', u.user.id);
    return !r.error && r.data && r.data.length > 0;
  }

  /* Première connexion : création de la double authentification (application d'authentification) */
  async function enrolerDoubleAuth() {
    var anciens = verifier(await client().auth.mfa.listFactors());
    for (var i = 0; i < (anciens.all || []).length; i++) {
      if (anciens.all[i].status !== 'verified') await client().auth.mfa.unenroll({ factorId: anciens.all[i].id });
    }
    var d = verifier(await client().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Gestionnaire Synthesia ' + new Date().toISOString().slice(0, 10) }));
    return { facteur: d.id, qr: d.totp.qr_code, secret: d.totp.secret };
  }

  async function verifierCode(facteur, code) {
    var r = await client().auth.mfa.challengeAndVerify({ factorId: facteur, code: String(code || '').replace(/\s+/g, '') });
    if (r.error) throw new Error(/invalid|expired/i.test(r.error.message) ? 'Code incorrect ou expiré.' : r.error.message);
    return etapeSuivante();
  }

  /* Ouverture de la clé privée : elle reste en mémoire de l'onglet, jamais enregistrée */
  async function ouvrirCle(texteFichier, phrase) {
    var o = await window.Chiffrement.ouvrirClePrivee(texteFichier, phrase);
    if (o.empreinte !== C.empreinte) throw new Error("Ce fichier ne correspond pas à la clé du site (empreinte " + o.empreinte + ", attendue " + C.empreinte + ").");
    clePrivee = o.cle;
    return { etape: 'pret', empreinte: o.empreinte };
  }

  async function deconnexion() {
    clePrivee = null; demandes = {}; tickets = {}; parRef = {};
    try { await client().auth.signOut(); } catch (e) {}
  }

  async function jeton() {
    var s = await client().auth.getSession();
    return s.data && s.data.session ? s.data.session.access_token : '';
  }

  /* ------------------------------------------------------------------ lecture (administrateur) */

  async function dechiffrer(texte) {
    if (!texte) return null;
    try { return await window.Chiffrement.dechiffrer(texte, clePrivee); } catch (e) { return { illisible: true }; }
  }

  function construireTicket(d, ident, versions, hist, pieces, urls) {
    var c = d.contenu || {};
    var syren = d.type === 'syren';
    var vs = versions.slice().sort(function (a, b) { return a.numero - b.numero; });
    var vval = vs.slice().reverse().filter(function (v) { return v.statut === 'validee' || v.statut === 'remplacee'; })[0] || null;
    var nomDemandeur = d.anonymise_le ? '(anonymisé)' : ident && ident.illisible ? '🔒 illisible' : (ident && ident.demandeur) || '';
    var t = Object.assign({}, c, {
      id: d.id, ref: d.ref, token: d.token, type: d.type, statut: d.statut, lien: d.lien || '',
      archive: !!d.archive, version: d.version, modifsUtilisees: d.modifs_utilisees,
      modifsRestantes: syren ? Math.max(0, 2 - d.modifs_utilisees) : null,
      titre: c.titre || c.sujet || '(sans titre)',
      publicVise: c.publicVise || '', duree: c.duree || '', urgence: c.urgence || 'Normal',
      demandeur: nomDemandeur,
      email: d.anonymise_le ? '' : (ident && ident.email) || '',
      identiteIllisible: !!(ident && ident.illisible),
      depose: d.depose_le, derniereValidation: d.derniere_validation_le,
      lienValide: vval ? (vval.lien || d.lien || '') : '',
      piecesPurgees: d.pieces_purgees_le, anonymise: d.anonymise_le,
      accuse: d.accuse_envoye_le,
      versions: vs.map(function (v) { return { numero: v.numero, statut: v.statut, lien: v.lien, validee: v.valide_le, nom: v.validation && v.validation.nom, fonction: v.validation && v.validation.fonction }; }),
      pieces: pieces.map(function (p) {
        return { nom: p.nom, octets: p.taille, taille: poids(p.taille) + (p.version > 1 ? ' · v' + p.version : ''), chemin: p.chemin, version: p.version,
                 supprime: !!p.supprime_le, url: p.supprime_le ? '' : (urls[p.chemin] || ''), signee: true, type_mime: p.type_mime };
      }).concat((c.piecesDrive || []).map(function (p) { return typeof p === 'string' ? p : Object.assign({}, p, { drive: true }); })),
      historique: hist.map(function (h) {
        var k = POINT_EVENEMENT[h.evenement];
        return {
          qui: h.acteur === 'admin' ? 'Administrateur' : h.acteur === 'systeme' ? 'Système' : (nomDemandeur || 'Demandeur'),
          quand: horodatage(h.quand), iso: h.quand, texte: h.texte || '', evenement: h.evenement, version: h.version,
          point: k ? PT[k] : PT.nouvelle
        };
      }),
      validation: vval && vval.validation ? {
        nom: vval.validation.nom || '', fonction: vval.validation.fonction || '', signeLe: vval.validation.signe_le || vval.valide_le,
        engagements: vval.validation.declarations || [], version: vval.numero
      } : null
    });
    if (d.catalogue) t.catalogue = d.catalogue;
    if (!t.storyboard) t.storyboard = [];
    return t;
  }

  async function charger() {
    try {
      var s = await reprendreSession();
      if (s.etape !== 'pret') return { demandes: [], courriels: [], modeles: {}, source: 'verrouille' };
      var res = await Promise.all([
        client().from('demandes').select('*').order('depose_le', { ascending: false }),
        client().from('versions').select('*'),
        client().from('historique').select('*').order('quand'),
        client().from('pieces').select('*').order('ajoute_le'),
        client().from('courriels').select('*').order('envoye_le', { ascending: false }).limit(500),
        client().from('reglages').select('*').eq('cle', 'modeles')
      ]);
      var lignes = verifier(res[0], 'demandes'), vers = verifier(res[1]), hist = verifier(res[2]), pcs = verifier(res[3]), crs = verifier(res[4]), regl = verifier(res[5]);

      var chemins = pcs.filter(function (p) { return !p.supprime_le; }).map(function (p) { return p.chemin; });
      var urls = {};
      if (chemins.length) {
        var su = await client().storage.from('pieces').createSignedUrls(chemins, 3600 * 8);
        (su.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; });
      }
      var idents = await Promise.all(lignes.map(function (d) { return dechiffrer(d.identite_chiffree); }));
      demandes = {}; tickets = {}; parRef = {};
      var liste = lignes.map(function (d, i) {
        demandes[d.id] = d;
        var t = construireTicket(d, idents[i],
          vers.filter(function (v) { return v.demande_id === d.id; }),
          hist.filter(function (h) { return h.demande_id === d.id; }),
          pcs.filter(function (p) { return p.demande_id === d.id; }), urls);
        t._identite = idents[i];
        tickets[d.id] = t; parRef[d.ref] = d.id;
        return t;
      });
      var courriels = crs.map(function (c) {
        var t = tickets[c.demande_id] || {};
        return { id: 'c' + c.id, canal: 'E-mail envoyé', dest: c.modele === 'depot_admin' ? 'Administrateur' : (t.email || ''), objet: libelleModele(c.modele) + (t.ref ? ' · ' + t.ref : ''),
                 corps: c.resultat && c.resultat !== 'envoyé' ? 'Résultat : ' + c.resultat : '', ref: t.ref || '', envoye: c.envoye_le, expediteur: 'Script d\'envoi (compte GIP)' };
      });
      return { demandes: liste, courriels: courriels, modeles: (regl[0] && regl[0].valeur) || {}, source: 'api' };
    } catch (e) {
      signaler('Lecture impossible : ' + e.message);
      return { demandes: [], courriels: [], modeles: {}, source: 'erreur', erreur: e.message };
    }
  }

  function libelleModele(m) {
    return ({ depot_confirmation: 'Accusé de réception', attestation: 'Attestation de validation', modif_confirmation: 'Confirmation de modification',
      maj_confirmation: 'Confirmation de mise à jour', prise_en_charge: 'Prise en charge', pret_a_valider: 'Vidéo prête à valider', relance: 'Relance', libre: 'Message' })[m] || m;
  }

  /* ------------------------------------------------------------------ écriture (administrateur) */

  var COLONNES = ['statut', 'lien', 'archive', 'catalogue'];
  var IGNORES = ['id', 'ref', 'token', 'type', 'historique', 'pieces', 'validation', 'versions', 'depose', 'demandeur', 'email', '_identite',
    'modifsUtilisees', 'modifsRestantes', 'derniereValidation', 'piecesPurgees', 'anonymise', 'accuse', 'identiteIllisible', 'version'];

  function evenementPour(patch, avant) {
    if (patch.statut && patch.statut !== avant.statut) {
      if (patch.statut === 'production' && ['nouvelle', 'modif', 'maj'].indexOf(avant.statut) >= 0) return 'production';
      if (patch.statut === 'validation' && ['production', 'modif', 'maj', 'nouvelle'].indexOf(avant.statut) >= 0) return 'livraison';
      return 'phase';
    }
    return 'note';
  }

  async function majDemande(id, ref, patch, entree, courriels) {
    id = id || parRef[ref];
    var avant = demandes[id];
    if (!avant) throw new Error('demande introuvable');
    patch = patch || {};
    var maj = {}, contenu = null;
    Object.keys(patch).forEach(function (k) {
      if (COLONNES.indexOf(k) >= 0) maj[k] = patch[k];
      else if (IGNORES.indexOf(k) < 0) { contenu = contenu || Object.assign({}, avant.contenu || {}); contenu[k] = patch[k]; }
    });
    if (contenu) maj.contenu = contenu;
    if ('lien' in maj && maj.lien === '') maj.lien = null;
    if (patch.statut === 'validee' && avant.statut !== 'validee') maj.derniere_validation_le = new Date().toISOString();

    /* Correction de l'identité par l'administrateur : nouveau chiffrement avec la clé publique */
    if ('email' in patch || 'demandeur' in patch) {
      var ident = Object.assign({}, tickets[id] && tickets[id]._identite && !tickets[id]._identite.illisible ? tickets[id]._identite : {});
      if ('email' in patch) ident.email = patch.email;
      if ('demandeur' in patch) ident.demandeur = patch.demandeur;
      maj.identite_chiffree = await window.ApiV2.chiffrer({ demandeur: ident.demandeur || '', email: ident.email || '' });
      if (tickets[id]) tickets[id]._identite = ident;
    }

    if (Object.keys(maj).length) {
      var r = await client().from('demandes').update(maj).eq('id', id).select();
      var lignes = verifier(r, 'enregistrement');
      if (!lignes.length) throw new Error("la base a refusé la modification (droits d'administration ?)");
      demandes[id] = lignes[0];
      if ('lien' in maj && maj.lien) {
        verifier(await client().from('versions').update({ lien: maj.lien }).eq('demande_id', id).eq('numero', lignes[0].version), 'version');
      }
    }
    if (entree && entree.texte) {
      verifier(await client().from('historique').insert({ demande_id: id, acteur: 'admin', evenement: evenementPour(patch, avant), texte: String(entree.texte).slice(0, 10000), version: (demandes[id] || avant).version }), 'historique');
    }
    (courriels || []).forEach(function (c) { expedier(c); });
    return { ok: true };
  }

  async function supprimerDemande(id, ref) {
    id = id || parRef[ref];
    var pcs = verifier(await client().from('pieces').select('chemin').eq('demande_id', id).is('supprime_le', null));
    if (pcs.length) verifier(await client().storage.from('pieces').remove(pcs.map(function (p) { return p.chemin; })), 'suppression des fichiers');
    verifier(await client().from('courriels').delete().eq('demande_id', id));
    verifier(await client().from('demandes').delete().eq('id', id), 'suppression');
    delete demandes[id]; delete tickets[id];
    return { ok: true };
  }

  /* Suppression anticipée des pièces jointes d'une demande */
  async function purgerPieces(id) {
    var pcs = verifier(await client().from('pieces').select('chemin').eq('demande_id', id).is('supprime_le', null));
    if (!pcs.length) return 0;
    var chemins = pcs.map(function (p) { return p.chemin; });
    verifier(await client().storage.from('pieces').remove(chemins), 'suppression des fichiers');
    return verifier(await client().rpc('admin_pieces_supprimees', { p_chemins: chemins }), 'journal de suppression');
  }

  var minuteurs = {};
  function pousser(collection, valeur) {
    if (collection !== 'modeles') return;     // le journal des courriels est tenu par la base
    clearTimeout(minuteurs[collection]);
    minuteurs[collection] = setTimeout(async function () {
      var r = await client().from('reglages').upsert({ cle: 'modeles', valeur: valeur, maj_le: new Date().toISOString() });
      if (r.error) signaler('Enregistrement des modèles impossible : ' + r.error.message);
    }, 600);
  }

  /* Courriel composé par l'administrateur (modèle personnalisé) : expédié par le script, qui vérifie la session */
  async function expedier(c) {
    if (!c || !c.dest || c.dest === '@admin') return;
    var id = parRef[c.ref];
    if (!id) { signaler("Courriel non envoyé : demande " + (c.ref || '?') + " introuvable."); return; }
    var r = await window.ApiV2.courriel({ action: 'admin', jwt: await jeton(), id: id, destinataire: c.dest, nom: (tickets[id] || {}).demandeur || '',
      modele: c.modele || 'libre', objet: c.objet, corps: c.corps });
    if (!r || !r.ok) signaler('Courriel non envoyé à ' + c.dest + ' : ' + ((r && r.erreur) || 'erreur inconnue'));
    return r;
  }

  /* Reprise de données (migration depuis l'ancien outil) : identités chiffrées ici, avant l'envoi */
  async function importerDemande(t) {
    var d = verifier(await client().rpc('admin_importer_demande', { p: t }), 'import ' + (t.ref || ''));
    return d;
  }

  /* ------------------------------------------------------------------ public */

  /* Dépôt du formulaire classique : identité chiffrée, pièces envoyées une à une, accusé de réception */
  async function deposer(demande, courriels) {
    var contenu = {};
    Object.keys(demande).forEach(function (k) {
      if (['demandeur', 'email', 'fichiers', 'cle', 'prefixe'].indexOf(k) < 0) contenu[k] = demande[k];
    });
    contenu.documents = (demande.fichiers || []).map(function (f) { return f.nom; });
    var r = await window.ApiV2.deposer(demande.cle, 'classique', { demandeur: demande.demandeur, email: demande.email }, contenu);
    var echecs = [];
    for (var i = 0; i < (demande.fichiers || []).length; i++) {
      var f = demande.fichiers[i];
      try {
        var octets = Uint8Array.from(atob(f.donnees || ''), function (ch) { return ch.charCodeAt(0); });
        var blob = new File([octets], f.nom, { type: f.type || 'application/octet-stream' });
        if (!r.deja) await window.ApiV2.envoyerFichier(r.id, r.token, blob, i);
      } catch (e) { echecs.push(f.nom + ' (' + e.message + ')'); }
    }
    var accuse = { ok: true };
    if (!r.deja && (courriels || []).length) {
      accuse = await window.ApiV2.courriel({ action: 'depot', token: r.token, email: demande.email, nom: demande.demandeur });
    }
    return { ok: true, ref: r.ref, token: r.token, deja: r.deja, echecs: echecs, accuse: accuse && accuse.ok };
  }

  async function lireTableau() {
    var l = await window.ApiV2.tableau();
    return (l || []).map(function (d) {
      return { ref: d.ref + (d.version > 1 ? ' v' + d.version : ''), titre: d.titre, demandeur: '', publicVise: d.public_vise || '', duree: d.duree || '',
               statut: d.statut, depose: d.depose_le, urgence: d.urgence || '', type: d.type };
    });
  }

  async function lireModelesPublic() {
    var r = await window.ApiV2.reglagesPublics();
    var m = {};
    if (r && Array.isArray(r.declarations)) m.__declarations = r.declarations;
    if (r && r.reglages) m.__reglages = r.reglages;
    return m;
  }

  async function tester() {
    try {
      var n = (await window.ApiV2.tableau() || []).length;
      var s = await reprendreSession();
      return { ok: true, message: 'Supabase répond : ' + n + ' demande(s) visibles dans le tableau public. Session : ' + (s.etape === 'pret' ? 'administrateur, double authentification, clé ouverte.' : 'étape « ' + s.etape + ' ».') };
    } catch (e) { return { ok: false, message: 'Échec : ' + e.message }; }
  }

  var Stockage = {
    onErreur: null,
    apiConfiguree: function () { return true; },
    adresseApi: function () { return C.supabaseUrl + ' (Supabase, Union européenne)'; },
    config: function () { return {}; }, ecrireConfig: function () {},
    /* connexion */
    seConnecter: seConnecter, reprendreSession: reprendreSession, enrolerDoubleAuth: enrolerDoubleAuth,
    verifierCode: verifierCode, ouvrirCle: ouvrirCle, deconnexion: deconnexion, cleOuverte: function () { return !!clePrivee; },
    /* administrateur */
    charger: charger, majDemande: majDemande, supprimerDemande: supprimerDemande, purgerPieces: purgerPieces,
    pousser: pousser, expedier: expedier, tester: tester, importerDemande: importerDemande,
    remplacerDemandes: async function () { throw new Error("Le remplacement global de la base n'existe plus en v2 : utilisez la reprise des demandes."); },
    client: client,
    /* public */
    deposer: deposer, lireTableau: lireTableau, lireModelesPublic: lireModelesPublic,
    lireSuivi: async function () { return null; },
    retour: async function () { throw new Error('La validation se fait désormais sur la page de suivi.'); }
  };
  window.Stockage = Stockage;
})();
