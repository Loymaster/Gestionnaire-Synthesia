/*
 * Gestionnaire Synthesia v2 — échanges publics avec Supabase et le script d'envoi des courriels.
 * Utilisé par les formulaires et les pages du formateur (dépôt, suivi, validation, modification).
 * Aucune donnée secrète : la clé Supabase est publique, les règles d'accès sont dans la base.
 */
(function (global) {
  'use strict';
  const C = () => global.CONFIG_V2;

  function entetes(extra) {
    return Object.assign({ apikey: C().supabaseCle, Authorization: 'Bearer ' + C().supabaseCle }, extra || {});
  }

  async function avecDelai(promesse, ms, message) {
    let minuteur;
    const delai = new Promise((_, ko) => { minuteur = setTimeout(() => ko(new Error(message || "le service n'a pas répondu à temps")), ms); });
    try { return await Promise.race([promesse, delai]); } finally { clearTimeout(minuteur); }
  }

  /* Appel d'une fonction publique de la base */
  async function rpc(nom, params) {
    const r = await avecDelai(fetch(C().supabaseUrl + '/rest/v1/rpc/' + nom, {
      method: 'POST', headers: entetes({ 'Content-Type': 'application/json' }), body: JSON.stringify(params || {})
    }), 30000);
    const texte = await r.text();
    if (!r.ok) {
      let m = 'erreur ' + r.status;
      try { m = JSON.parse(texte).message || m; } catch (e) {}
      throw new Error(m);
    }
    return texte ? JSON.parse(texte) : null;
  }

  /* Vérifie que la clé publique inscrite dans le site est bien celle de l'administrateur */
  let cleVerifiee = null;
  async function verifierCle() {
    if (cleVerifiee === null) {
      const e = await global.Chiffrement.empreinte(C().clePublique);
      cleVerifiee = e === C().empreinte;
    }
    if (!cleVerifiee) throw new Error('clé de chiffrement du site incohérente : envoi bloqué par sécurité. Prévenez le service.');
  }

  async function chiffrer(objet) {
    await verifierCle();
    return global.Chiffrement.chiffrer(objet, C().clePublique);
  }

  /* Dépôt d'une demande : l'identité est chiffrée avant de quitter le navigateur.
     Une même clé de dépôt renvoie la même demande : un second clic ou une nouvelle tentative
     après une coupure ne crée pas de doublon. */
  async function deposer(cle, type, identite, contenu) {
    const identiteChiffree = await chiffrer(identite);
    let derniere;
    for (let essai = 0; essai < 3; essai++) {
      try {
        const r = await rpc('deposer_demande', { p_cle: cle, p_type: type, p_identite: identiteChiffree, p_contenu: contenu });
        if (!r || !r.ok) throw new Error((r && r.erreur) || 'réponse inattendue');
        return r;
      } catch (e) {
        derniere = e;
        if (/invalide|inconnu|trop/.test(e.message)) break;     // erreur de contenu : inutile de réessayer
        await new Promise((ok) => setTimeout(ok, 1500 * (essai + 1)));
      }
    }
    throw derniere;
  }

  /* Envoi d'un fichier, avec progression (0 à 1). Renvoie le chemin enregistré. */
  function envoyerFichier(demandeId, token, fichier, rang, progression) {
    const ext = (String(fichier.name).match(/\.([A-Za-z0-9]{1,8})$/) || [, 'bin'])[1].toLowerCase();
    const chemin = demandeId + '/' + Date.now().toString(36) + '-' + rang + '.' + ext;
    return new Promise((ok, ko) => {
      const x = new XMLHttpRequest();
      x.open('POST', C().supabaseUrl + '/storage/v1/object/pieces/' + chemin);
      const h = entetes({ 'x-upsert': 'false', 'Content-Type': fichier.type || 'application/octet-stream' });
      Object.keys(h).forEach((k) => x.setRequestHeader(k, h[k]));
      x.upload.onprogress = (e) => { if (e.lengthComputable && progression) progression(e.loaded / e.total); };
      x.onload = async () => {
        if (x.status < 200 || x.status >= 300) {
          let m = 'erreur ' + x.status;
          try { m = JSON.parse(x.responseText).message || m; } catch (e) {}
          return ko(new Error(m));
        }
        try {
          const r = await rpc('enregistrer_piece', { p_token: token, p_chemin: chemin, p_nom: fichier.name, p_taille: fichier.size, p_type: fichier.type || '' });
          if (!r || !r.ok) throw new Error((r && r.erreur) || 'enregistrement du fichier refusé');
          ok(chemin);
        } catch (e) { ko(e); }
      };
      x.onerror = () => ko(new Error('connexion interrompue'));
      x.ontimeout = () => ko(new Error('délai dépassé'));
      x.timeout = 300000;
      x.send(fichier);
    });
  }

  /* Demande d'envoi de courriel au script Apps Script (accusé, attestation, confirmations) */
  async function courriel(charge) {
    if (!C().courrielsUrl) return { ok: false, erreur: "script d'envoi non configuré" };
    try {
      const r = await avecDelai(fetch(C().courrielsUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(charge)
      }), 45000);
      return await r.json();
    } catch (e) { return { ok: false, erreur: e.message }; }
  }

  const lireSuivi = (token) => rpc('lire_suivi', { p_token: token });
  const retour = (token, action, donnees) => rpc('retour_formateur', { p_token: token, p_action: action, p_donnees: donnees });
  const tableau = () => rpc('tableau_public', {});
  const reglagesPublics = () => rpc('reglages_publics', {});

  function nouvelleCle() {
    const a = new Uint8Array(12); global.crypto.getRandomValues(a);
    return 'dep-' + Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  const estJeton = (t) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t || ''));
  const adresseValide = (a) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i.test(String(a || '').trim());

  /* Copie de l'adresse chiffrée pour le script d'envoi (relances et avertissements automatiques).
     Sans clé du script configurée, rien n'est envoyé : le dépôt n'en dépend pas. */
  async function contactRobot(token, email, nom) {
    try {
      const r = await reglagesPublics();
      const cle = r && r.cleRobot;
      if (!cle || !cle.publique) return false;
      if (await global.Chiffrement.empreinte(cle.publique) !== cle.empreinte) return false;
      const c = await global.Chiffrement.chiffrerRobot({ email, nom }, cle.publique);
      return await rpc('deposer_contact_robot', { p_token: token, p_contact: c });
    } catch (e) { return false; }
  }

  global.ApiV2 = { contactRobot, rpc, deposer, envoyerFichier, courriel, lireSuivi, retour, tableau, reglagesPublics, chiffrer, verifierCle, nouvelleCle, estJeton, adresseValide };
})(window);
