/* Couche de stockage de l'outil de gestion des demandes vidéo Synthesia.
 *
 * L'adresse de l'API est inscrite ICI, pas dans la configuration du poste :
 * elle doit être connue de tous les visiteurs, y compris les formateurs qui
 * déposent une demande depuis leur propre ordinateur.
 *
 * Le JETON D'ADMINISTRATION, lui, reste dans la configuration du navigateur
 * de l'administrateur et ne doit jamais figurer dans ce fichier.
 *
 * Trois niveaux d'accès, reflétés par l'API (voir apps-script.gs) :
 *   - public            : déposer une demande        -> deposer()
 *   - jeton de suivi    : lire, valider, modifier UNE demande -> lireSuivi(), retour()
 *   - jeton d'admin     : tout le reste              -> charger(), pousser()
 */
(function () {

  /* ═══════════════════════════════════════════════════════════════════
     À RENSEIGNER : adresse du déploiement Apps Script (se termine par /exec)
     ═══════════════════════════════════════════════════════════════════ */
  var API = "https://script.google.com/macros/s/AKfycbzliBwNkvjJgQXksuRWQRJr1_e4tuReKGHF2gX6kCBkM384OnxMQK4nIkix5NDiRL_bBw/exec";
  /* Exemple :
     var API = "https://script.google.com/macros/s/AKfycb…/exec";
     Laisser vide fait fonctionner l'outil en mode local (démonstration). */

  var CLES = {
    demandes: "synthesia_demandes_v1",
    courriels: "synthesia_courriels_v1",
    modeles: "synthesia_modeles_v1",
    config: "synthesia_config_v1"
  };

  function lireLocal(collection, defaut) {
    try {
      var brut = localStorage.getItem(CLES[collection]);
      if (brut) {
        var d = JSON.parse(brut);
        if (d !== null && typeof d === "object") return d;
      }
    } catch (e) {}
    return defaut;
  }

  function ecrireLocal(collection, valeur) {
    try { localStorage.setItem(CLES[collection], JSON.stringify(valeur)); } catch (e) {}
  }

  /* Écritures distantes différées, une file par collection. */
  var differes = {};
  var minuteurs = {};

  function config() { return lireLocal("config", {}) || {}; }  function jetonAdmin() { return (config().baseCle || "").trim(); }
  function enLigne() { return !!API; }

  function signaler(message) {
    if (typeof Stockage.onErreur === "function") Stockage.onErreur(message);
    try { window.dispatchEvent(new CustomEvent("stockage-erreur", { detail: message })); } catch (e) {}
  }

  /* fetch avec limite de temps : une requête qui n'aboutit jamais ne doit pas
   * laisser l'interface en attente indéfinie. */
  async function requete(adresse, options) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var minuteur = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    try {
      var o = Object.assign({}, options || {});
      if (ctrl) o.signal = ctrl.signal;
      var r = await fetch(adresse, o);
      if (!r.ok) throw new Error("réponse " + r.status);
      var d = await r.json();
      if (d && d.erreur) throw new Error(d.erreur);
      return d;
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error("délai dépassé (20 s), le service n'a pas répondu");
      throw e;
    } finally {
      clearTimeout(minuteur);
    }
  }

  function lireApi(params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
    return requete(API + "?" + q, { method: "GET" });
  }

  function ecrireApi(charge) {
    return requete(API, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(charge)
    });
  }

  var Stockage = {
    CLES: CLES,
    onErreur: null,
    config: config,
    ecrireConfig: function (c) { ecrireLocal("config", c); },
    apiConfiguree: enLigne,
    adresseApi: function () { return API; },

    /* ---- Public : déposer une demande ----
     * Ne nécessite aucun jeton. Le serveur attribue la référence et le jeton
     * de suivi, ce qui évite les collisions entre deux dépôts simultanés. */
    deposer: async function (demande, courriels) {
      if (!enLigne()) {
        var local = lireLocal("demandes", []);
        var max = local.reduce(function (m, x) {
          var n = parseInt(String(x.ref).split("-").pop(), 10);
          return isNaN(n) ? m : Math.max(m, n);
        }, 0);
        var champs = Object.assign({}, demande);
        var prefixe = champs.prefixe || "VID-2026-";
        delete champs.prefixe;
        var maintenant = new Date();
        var p = function (n) { return ("0" + n).slice(-2); };
        var d = Object.assign(champs, {
          id: "d" + Date.now(),
          ref: prefixe + ("00" + (max + 1)).slice(-3),
          token: "t-" + Math.random().toString(36).slice(2, 12),
          statut: "nouvelle", lien: "", pieces: [],
          depose: maintenant.toISOString(),
          historique: [{
            qui: champs.demandeur, texte: "Demande déposée.",
            quand: p(maintenant.getDate()) + "/" + p(maintenant.getMonth() + 1) + " · "
                 + p(maintenant.getHours()) + ":" + p(maintenant.getMinutes()),
            point: "oklch(0.42 0.01 250)"
          }]
        });
        local.unshift(d);
        ecrireLocal("demandes", local);
        return { ok: true, ref: d.ref, token: d.token, demande: d, local: true };
      }
      return await ecrireApi({ action: "deposer", demande: demande, courriels: courriels || [] });
    },

    /* ---- Jeton de suivi : lire une seule demande ---- */
    lireSuivi: async function (suivi) {
      if (!enLigne()) {
        var local = lireLocal("demandes", []);
        var v = String(suivi).toLowerCase();
        return local.filter(function (x) {
          return String(x.token).toLowerCase() === v || String(x.ref).toLowerCase() === v;
        })[0] || null;
      }
      try { return await lireApi({ suivi: suivi }); }
      catch (e) { return null; }
    },

    /* ---- Jeton de suivi : valider ou demander une modification ----
     * La branche locale doit appliquer réellement le changement : la page
     * affiche un accusé de signature, il ne peut pas être mensonger. */
    retour: async function (suivi, type, charge, courriels) {
      if (!enLigne()) {
        var local = lireLocal("demandes", []);
        var v = String(suivi).toLowerCase();
        var trouve = false;
        var maj = local.map(function (t) {
          if (String(t.token).toLowerCase() !== v && String(t.ref).toLowerCase() !== v) return t;
          if (t.statut !== "validation") return t;
          trouve = true;
          var c = Object.assign({}, t);
          var maintenant = new Date();
          var p = function (n) { return ("0" + n).slice(-2); };
          var quand = p(maintenant.getDate()) + "/" + p(maintenant.getMonth() + 1) + " · "
                    + p(maintenant.getHours()) + ":" + p(maintenant.getMinutes());
          if (type === "validation") {
            c.statut = "validee";
            c.validation = charge.validation || {};
            c.historique = (t.historique || []).concat([{
              qui: (charge.validation || {}).nom || t.demandeur, quand: quand,
              texte: charge.note || "Vidéo validée.", point: "oklch(0.4 0.1 155)"
            }]);
          } else {
            c.statut = "modif";
            var ch = charge.champs || {};
            if (ch.script !== undefined) c.script = ch.script;
            if (ch.precisions !== undefined) c.precisions = ch.precisions;
            if (ch.storyboard !== undefined) c.storyboard = ch.storyboard;
            c.historique = (t.historique || []).concat([{
              qui: t.demandeur, quand: quand,
              texte: charge.note || "Modification demandée.", point: "oklch(0.47 0.14 25)"
            }]);
          }
          return c;
        });
        if (!trouve) throw new Error("demande introuvable ou non soumise à validation");
        ecrireLocal("demandes", maj);
        return { ok: true, local: true };
      }
      return await ecrireApi(Object.assign(
        { action: "retour", suivi: suivi, type: type, courriels: courriels || [] }, charge));
    },

    /* ---- Administration : lecture complète ---- */
    charger: async function (defauts) {
      var repli = {
        demandes: lireLocal("demandes", null) || (defauts && defauts.demandes) || [],
        courriels: lireLocal("courriels", null) || [],
        modeles: lireLocal("modeles", null) || {},
        source: enLigne() ? "hors-ligne" : "local",
        erreur: ""
      };
      if (!enLigne()) return repli;
      var jeton = jetonAdmin();
      if (!jeton) {
        repli.erreur = "Jeton d'administration absent : saisissez-le dans Configuration pour accéder aux demandes du service.";
        return repli;
      }
      try {
        var res = await Promise.all([
          lireApi({ jeton: jeton, collection: "demandes" }),
          lireApi({ jeton: jeton, collection: "courriels" }),
          lireApi({ jeton: jeton, collection: "modeles" })
        ]);
        var d = {
          demandes: Array.isArray(res[0]) ? res[0] : [],
          courriels: Array.isArray(res[1]) ? res[1] : [],
          modeles: res[2] && !Array.isArray(res[2]) ? res[2] : {},
          source: "api", erreur: ""
        };
        ecrireLocal("demandes", d.demandes);
        ecrireLocal("courriels", d.courriels);
        ecrireLocal("modeles", d.modeles);
        return d;
      } catch (e) {
        repli.erreur = "Base injoignable (" + e.message + "). Affichage de la dernière copie connue ; vos modifications ne seront pas enregistrées.";
        return repli;
      }
    },

    /* ---- Administration : modification ciblée d'une demande ----
     * Jamais de réécriture de la collection entière : deux administrateurs, ou un
     * administrateur et un formateur simultanés, se détruiraient leurs écritures. */
    majDemande: async function (id, ref, patch, entree, courriels) {
      var local = lireLocal("demandes", []);
      var maj = local.map(function (t) {
        if (t.id !== id && t.ref !== ref) return t;
        var c = Object.assign({}, t, patch);
        if (entree) c.historique = (t.historique || []).concat([entree]);
        return c;
      });
      ecrireLocal("demandes", maj);
      if (!enLigne()) return { ok: true, local: true, demandes: maj };
      var jeton = jetonAdmin();
      if (!jeton) throw new Error("jeton d'administration absent");
      await ecrireApi({ jeton: jeton, action: "majDemande", id: id, ref: ref,
                        patch: patch, entree: entree, courriels: courriels || [] });
      return { ok: true, demandes: maj };
    },

    supprimerDemande: async function (id, ref) {
      var local = lireLocal("demandes", []).filter(function (t) { return t.id !== id && t.ref !== ref; });
      ecrireLocal("demandes", local);
      if (!enLigne()) return { ok: true, local: true, demandes: local };
      var jeton = jetonAdmin();
      if (!jeton) throw new Error("jeton d'administration absent");
      await ecrireApi({ jeton: jeton, action: "supprimerDemande", id: id, ref: ref });
      return { ok: true, demandes: local };
    },

    /* ---- Administration : écriture d'une collection entière ----
     * Réservé aux modèles et réglages partagés. Le serveur refuse « demandes ».
     * L'écriture distante est différée : sans cela, la saisie d'un modèle
     * déclencherait un appel par caractère frappé. */
    pousser: function (collection, valeur) {
      ecrireLocal(collection, valeur);
      if (!enLigne()) return;
      var jeton = jetonAdmin();
      if (!jeton) return;
      differes[collection] = valeur;
      clearTimeout(minuteurs[collection]);
      minuteurs[collection] = setTimeout(function () {
        var charge = differes[collection];
        delete differes[collection];
        ecrireApi({ jeton: jeton, collection: collection, donnees: charge }).catch(function (e) {
          signaler("Enregistrement distant impossible (" + e.message + "). La modification n'existe que sur ce poste.");
        });
      }, 1200);
    },

    /* ---- Administration : expédier un courriel ---- */
    expedier: function (courriel) {
      if (!enLigne()) return;
      var jeton = jetonAdmin();
      if (!jeton) return;
      ecrireApi({ jeton: jeton, action: "courriel", courriel: courriel }).catch(function (e) {
        signaler("Envoi du courriel à " + courriel.dest + " impossible (" + e.message + ").");
      });
    },

    /* Remplacement délibéré de la collection des demandes, depuis la page
     * Base de données uniquement. Le serveur l'exige explicite (force). */
    remplacerDemandes: async function (valeur) {
      ecrireLocal("demandes", valeur);
      if (!enLigne()) return { ok: true, local: true };
      var jeton = jetonAdmin();
      if (!jeton) throw new Error("jeton d'administration absent");
      return await ecrireApi({ jeton: jeton, collection: "demandes", donnees: valeur, force: true });
    },

    /* ---- Modèles et paramètres partagés, lisibles sans jeton ----
     * Le navigateur du formateur en a besoin pour afficher les déclarations
     * du formulaire de validation. */
    lireModelesPublic: async function () {
      if (!enLigne()) return lireLocal("modeles", {}) || {};
      try {
        var d = await lireApi({ collection: "modeles" });
        if (d && !Array.isArray(d)) { ecrireLocal("modeles", d); return d; }
      } catch (e) {}
      return lireLocal("modeles", {}) || {};
    },

    /* ---- Bouton « Tester la connexion » ---- */
    tester: async function () {
      if (!enLigne()) return { ok: false, message: "Aucune adresse d'API n'est inscrite dans stockage.js. L'outil fonctionne en mode local." };
      var jeton = jetonAdmin();
      if (!jeton) return { ok: false, message: "Saisissez le jeton d'administration avant de tester." };
      try {
        var d = await lireApi({ jeton: jeton, collection: "demandes" });
        var n = Array.isArray(d) ? d.length : 0;
        return { ok: true, message: "Connexion établie : " + n + (n === 1 ? " demande lue." : " demandes lues.") };
      } catch (e) {
        return { ok: false, message: "Échec : " + e.message + "." };
      }
    }
  };

  window.Stockage = Stockage;
})();
