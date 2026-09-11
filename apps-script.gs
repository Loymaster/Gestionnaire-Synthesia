/* API de l'outil de gestion des demandes vidéo Synthesia — académie de Reims.
   Déployer en application web : exécution « moi », accès « tout le monde ».

   Deux niveaux d'accès :
     - sans jeton  : déposer une demande, lire/valider/modifier UNE demande via son
                     jeton de suivi. Rien d'autre n'est accessible.
     - avec jeton  : toutes les opérations d'administration.
   Le jeton d'administration ne doit jamais figurer dans la page publique. */

const JETON = 'REMPLACEZ-PAR-UNE-CHAINE-LONGUE-ET-ALEATOIRE';
const EXPEDITEUR = 'Service de création vidéo · Académie de Reims';
const ADRESSE_NOTIF = 'videos@ac-reims.fr';

/* Adresse publique du site, pour composer les liens de suivi des courriels.
   Sans barre oblique finale, ex. 'https://moncompte.github.io/videos-synthesia' */
const SITE = 'https://REMPLACEZ-PAR-VOTRE-ADRESSE-GITHUB-PAGES';

/* ---------- feuilles ---------- */

function feuille_(nom) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nom) || ss.insertSheet(nom);
}

function lire_(nom, defaut) {
  const v = feuille_(nom).getRange('A1').getValue();
  if (!v) return defaut;
  try { return JSON.parse(v); } catch (e) { return defaut; }
}

function ecrire_(nom, donnees) {
  feuille_(nom).getRange('A1').setValue(JSON.stringify(donnees));
  if (nom === 'demandes') tableauLisible_(donnees);
}

/* Miroir en colonnes, pour trier et exporter depuis le tableur. */
function tableauLisible_(demandes) {
  const f = feuille_('lisible');
  f.clear();
  const entetes = ['Référence', 'Statut', 'Demandeur', 'Courriel', 'Titre',
                   'Public visé', 'Durée', 'Urgence', 'Déposée le', 'Lien vidéo', 'Signée par'];
  const lignes = (demandes || []).map(function (d) {
    return [d.ref, d.statut, d.demandeur, d.email, d.titre, d.publicVise, d.duree,
            d.urgence, d.depose, d.lien || '', d.validation ? d.validation.nom : ''];
  });
  f.getRange(1, 1, 1, entetes.length).setValues([entetes]).setFontWeight('bold');
  if (lignes.length) f.getRange(2, 1, lignes.length, entetes.length).setValues(lignes);
  f.setFrozenRows(1);
}

/* Sérialise les écritures concurrentes : deux formateurs peuvent déposer en même temps. */
function avecVerrou_(operation) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try { return operation(); } finally { verrou.releaseLock(); }
}

/* ---------- lecture ---------- */

function doGet(e) {
  const p = e.parameter || {};

  /* Accès administrateur : jeton exigé, renvoie tout. */
  if (p.jeton && p.jeton === JETON) {
    const collection = p.collection || 'demandes';
    return sortie_(lire_(collection, collection === 'modeles' ? {} : []));
  }

  /* Accès par lien de suivi : une seule demande, identifiée par son jeton. */
  if (p.suivi) {
    const demandes = lire_('demandes', []);
    const d = demandes.filter(function (x) {
      return x.token === p.suivi || String(x.ref).toLowerCase() === String(p.suivi).toLowerCase();
    })[0];
    return d ? sortie_(publique_(d)) : sortie_({ erreur: 'introuvable' });
  }

  /* Modèles de courriels : lisibles sans jeton, ils ne contiennent rien de sensible. */
  if (p.collection === 'modeles') return sortie_(lire_('modeles', {}));

  return sortie_({ erreur: 'accès refusé' });
}

/* Retire du ticket ce qui ne regarde pas le demandeur. */
function publique_(d) {
  const c = JSON.parse(JSON.stringify(d));
  delete c.id;
  return c;
}

/* ---------- écriture ---------- */

function doPost(e) {
  let corps;
  try { corps = JSON.parse(e.postData.contents); }
  catch (err) { return sortie_({ erreur: 'charge utile illisible' }); }

  const admin = corps.jeton === JETON;

  /* --- dépôt d'une demande : ouvert, sans jeton --- */
  if (corps.action === 'deposer') {
    const d = corps.demande || {};
    if (!d.titre || !d.email || !d.demandeur) return sortie_({ erreur: 'demande incomplète' });
    return sortie_(avecVerrou_(function () {
      const demandes = lire_('demandes', []);
      const max = demandes.reduce(function (m, x) {
        const n = parseInt(String(x.ref).split('-').pop(), 10);
        return isNaN(n) ? m : Math.max(m, n);
      }, 0);
      const prefixe = d.prefixe || 'VID-2026-';
      const nouvelle = {
        id: 'd' + Date.now(),
        ref: prefixe + ('00' + (max + 1)).slice(-3),
        token: Utilities.getUuid(),
        demandeur: String(d.demandeur).slice(0, 120),
        email: String(d.email).slice(0, 160),
        titre: String(d.titre).slice(0, 300),
        publicVise: String(d.publicVise || 'Non précisé').slice(0, 200),
        duree: d.duree || '', urgence: d.urgence || 'Normal',
        nbAvatars: d.nbAvatars || '1',
        avatars: Array.isArray(d.avatars) ? d.avatars.slice(0, 5) : [],
        script: String(d.script || '').slice(0, 20000),
        storyboard: Array.isArray(d.storyboard) ? d.storyboard.slice(0, 100) : [],
        precisions: String(d.precisions || '').slice(0, 5000),
        pieces: [], statut: 'nouvelle', lien: '',
        depose: new Date().toISOString(),
        historique: [{ qui: String(d.demandeur).slice(0, 120), quand: horodatage_(),
                       texte: 'Demande déposée.', point: 'oklch(0.42 0.01 250)' }]
      };
      demandes.unshift(nouvelle);
      ecrire_('demandes', demandes);
      if (corps.courriels) (corps.courriels).forEach(function (c) { envoyer_(c, nouvelle); });
      return { ok: true, ref: nouvelle.ref, token: nouvelle.token };
    }));
  }

  /* --- retour du demandeur : validation ou modification, authentifié par le jeton de suivi --- */
  if (corps.action === 'retour') {
    const suivi = corps.suivi;
    if (!suivi) return sortie_({ erreur: 'jeton de suivi manquant' });
    return sortie_(avecVerrou_(function () {
      const demandes = lire_('demandes', []);
      let cible = null;
      for (let i = 0; i < demandes.length; i++) {
        if (demandes[i].token === suivi) { cible = demandes[i]; break; }
      }
      if (!cible) return { erreur: 'introuvable' };
      if (cible.statut !== 'validation') return { erreur: 'demande non soumise à validation' };

      if (corps.type === 'validation') {
        cible.statut = 'validee';
        cible.validation = corps.validation || {};
        cible.historique.push({ qui: (corps.validation || {}).nom || cible.demandeur,
                                quand: horodatage_(), texte: corps.note || 'Vidéo validée.',
                                point: 'oklch(0.4 0.1 155)' });
      } else if (corps.type === 'modification') {
        cible.statut = 'modif';
        if (corps.champs) {
          if (corps.champs.script !== undefined) cible.script = corps.champs.script;
          if (corps.champs.precisions !== undefined) cible.precisions = corps.champs.precisions;
          if (corps.champs.storyboard !== undefined) cible.storyboard = corps.champs.storyboard;
        }
        cible.historique.push({ qui: cible.demandeur, quand: horodatage_(),
                                texte: corps.note || 'Modification demandée.',
                                point: 'oklch(0.47 0.14 25)' });
      } else {
        return { erreur: 'type de retour inconnu' };
      }
      ecrire_('demandes', demandes);
      if (corps.courriels) (corps.courriels).forEach(function (c) { envoyer_(c, cible); });
      return { ok: true, ref: cible.ref, statut: cible.statut };
    }));
  }

  /* --- au-delà, tout exige le jeton d'administration --- */
  if (!admin) return sortie_({ erreur: 'accès refusé' });

  /* Mise à jour ciblée d'une demande : seul le ticket visé est touché.
     Écrire la collection entière écraserait les dépôts survenus entre-temps. */
  if (corps.action === 'majDemande') {
    return sortie_(avecVerrou_(function () {
      const demandes = lire_('demandes', []);
      let cible = null;
      for (let i = 0; i < demandes.length; i++) {
        if (demandes[i].id === corps.id || demandes[i].ref === corps.ref) { cible = demandes[i]; break; }
      }
      if (!cible) return { erreur: 'demande introuvable' };
      const patch = corps.patch || {};
      Object.keys(patch).forEach(function (k) { cible[k] = patch[k]; });
      if (corps.entree) cible.historique.push(corps.entree);
      ecrire_('demandes', demandes);
      if (corps.courriels) corps.courriels.forEach(function (c) { envoyer_(c, cible); });
      return { ok: true, demande: cible };
    }));
  }

  if (corps.action === 'supprimerDemande') {
    return sortie_(avecVerrou_(function () {
      const demandes = lire_('demandes', []).filter(function (d) {
        return d.id !== corps.id && d.ref !== corps.ref;
      });
      ecrire_('demandes', demandes);
      return { ok: true };
    }));
  }

  if (corps.action === 'courriel') {
    envoyer_(corps.courriel || {}, null);
    return sortie_({ ok: true });
  }

  if (corps.collection) {
    /* Réservé aux modèles de courriels. La collection « demandes » ne doit jamais
       être réécrite en bloc depuis un navigateur : voir majDemande. */
    if (corps.collection === 'demandes' && !corps.force) {
      return sortie_({ erreur: 'réécriture globale des demandes refusée' });
    }
    return sortie_(avecVerrou_(function () {
      ecrire_(corps.collection, corps.donnees);
      return { ok: true, collection: corps.collection };
    }));
  }

  return sortie_({ erreur: 'action inconnue' });
}

/* ---------- courriels ---------- */

/* Remplace les jetons laissés en attente par la page : elle ignore la référence
   au moment où elle compose le message, c'est le serveur qui l'attribue. */
function resoudre_(texte, d) {
  if (!texte) return '';
  const base = String(SITE).replace(/\/+$/, '');
  return String(texte)
    .split('{{ref}}').join(d.ref)
    .split('{{lienSuivi}}').join(base + '/?valider=' + d.token)
    .split('{{lienValidation}}').join(base + '/?valider=' + d.token)
    .split('{{lienModification}}').join(base + '/?modifier=' + d.token);
}

function envoyer_(c, demande) {
  if (!c || !c.dest || !c.objet) return;
  const dest = c.dest === '@admin' ? ADRESSE_NOTIF : c.dest;
  const objet = demande ? resoudre_(c.objet, demande) : c.objet;
  const corps = demande ? resoudre_(c.corps, demande) : (c.corps || '');
  try {
    MailApp.sendEmail({ to: dest, subject: objet, body: corps, name: EXPEDITEUR });
  } catch (err) {
    const je = lire_('courriels', []);
    je.unshift({ id: 'e' + Date.now(), dest: dest, objet: objet, corps: corps,
                 ref: demande ? demande.ref : (c.ref || ''), canal: 'Échec : ' + err.message,
                 envoye: new Date().toISOString() });
    ecrire_('courriels', je.slice(0, 500));
    return;
  }
  const j = lire_('courriels', []);
  j.unshift({ id: 'e' + Date.now(), dest: dest, objet: objet, corps: corps,
              ref: demande ? demande.ref : (c.ref || ''),
              canal: 'E-mail envoyé', expediteur: EXPEDITEUR,
              envoye: new Date().toISOString() });
  ecrire_('courriels', j.slice(0, 500));
}

function horodatage_() {
  const d = new Date();
  const p = function (n) { return ('0' + n).slice(-2); };
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function sortie_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
