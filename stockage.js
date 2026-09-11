/* Couche de stockage de l'outil de gestion des demandes vidéo.
 *
 * Deux modes, choisis dans Configuration → Base de données :
 *   - "Locale (ce navigateur)"  : tout est écrit dans localStorage.
 *   - "API externe"             : les données sont lues et écrites sur une API HTTP,
 *                                 avec miroir local systématique (l'outil reste
 *                                 utilisable si le réseau tombe).
 *
 * Contrat attendu de l'API externe — trois collections, deux verbes :
 *
 *   GET  {baseUrl}/demandes    -> tableau JSON de demandes
 *   PUT  {baseUrl}/demandes    <- tableau JSON complet (remplace)
 *   GET  {baseUrl}/courriels   -> tableau JSON de courriels envoyés
 *   PUT  {baseUrl}/courriels   <- tableau JSON complet
 *   GET  {baseUrl}/modeles     -> objet JSON des modèles personnalisés
 *   PUT  {baseUrl}/modeles     <- objet JSON complet
 *
 * Si le service n'accepte pas PUT (cas de Google Apps Script), cocher
 * « Envoyer en POST » : la même charge utile est postée avec un champ
 * { collection, donnees }.
 *
 * Le détail des champs et un schéma SQL figurent dans INTEGRATION.md.
 */
(function () {
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

  function config() {
    return lireLocal("config", {}) || {};
  }

  function distant(cfg) {
    cfg = cfg || config();
    return cfg.baseMode === "API externe" && !!(cfg.baseUrl || "").trim();
  }

  /* Apps Script ne route pas les chemins et refuse application/json en cross-origin :
   * la collection passe en paramètre, le jeton dans le corps, le type en text/plain.
   * Détection automatique sur l'adresse, forçable par la case « POST » de Configuration. */
  function appsScript(cfg) {
    return !!cfg.basePost || /script\.google\.com/.test(cfg.baseUrl || "");
  }

  function racine(cfg) {
    return String(cfg.baseUrl).replace(/\/+$/, "");
  }

  function url(cfg, collection) {
    return appsScript(cfg)
      ? racine(cfg) + "?collection=" + encodeURIComponent(collection)
      : racine(cfg) + "/" + collection;
  }

  function entetes(cfg) {
    if (appsScript(cfg)) return { "Content-Type": "text/plain;charset=utf-8" };
    var h = { "Content-Type": "application/json" };
    var cle = (cfg.baseCle || "").trim();
    if (cle) {
      var nom = (cfg.baseEntete || "Authorization").trim();
      h[nom] = nom.toLowerCase() === "authorization" ? "Bearer " + cle : cle;
    }
    return h;
  }

  function signaler(message) {
    if (typeof Stockage.onErreur === "function") Stockage.onErreur(message);
    try { window.dispatchEvent(new CustomEvent("stockage-erreur", { detail: message })); } catch (e) {}
  }

  async function lireDistant(cfg, collection) {
    var r = await fetch(url(cfg, collection), { method: "GET", headers: entetes(cfg) });
    if (!r.ok) throw new Error("réponse " + r.status + " sur " + collection);
    var d = await r.json();
    return d;
  }

  async function ecrireDistant(cfg, collection, valeur) {
    var enPost = appsScript(cfg);
    var r = await fetch(enPost ? racine(cfg) : url(cfg, collection), {
      method: enPost ? "POST" : "PUT",
      headers: entetes(cfg),
      body: JSON.stringify(enPost
        ? { jeton: (cfg.baseCle || "").trim(), collection: collection, donnees: valeur }
        : valeur)
    });
    if (!r.ok) throw new Error("réponse " + r.status + " sur " + collection);
    var rep = await r.json().catch(function () { return {}; });
    if (rep && rep.erreur) throw new Error(rep.erreur);
    return true;
  }

  /* Expédition d'un courriel par le service distant.
   * L'outil poste { action: "courriel", courriel: { dest, objet, corps, expediteur } }.
   * Le service (Apps Script, Worker, fonction Edge) se charge de l'envoi réel. */
  async function expedierDistant(cfg, courriel) {
    var r = await fetch(racine(cfg), {
      method: "POST",
      headers: entetes(cfg),
      body: JSON.stringify({ jeton: (cfg.baseCle || "").trim(), action: "courriel", courriel: courriel })
    });
    if (!r.ok) throw new Error("réponse " + r.status);
    var rep = await r.json().catch(function () { return {}; });
    if (rep && rep.erreur) throw new Error(rep.erreur);
    return true;
  }

  var Stockage = {
    CLES: CLES,
    onErreur: null,
    config: config,
    ecrireConfig: function (c) { ecrireLocal("config", c); },
    estDistant: distant,

    /* Hydratation au démarrage. Renvoie toujours un jeu de données utilisable. */
    charger: async function (defauts) {
      var cfg = config();
      var local = {
        demandes: lireLocal("demandes", null),
        courriels: lireLocal("courriels", null),
        modeles: lireLocal("modeles", null)
      };
      var repli = {
        demandes: Array.isArray(local.demandes) ? local.demandes : (defauts && defauts.demandes) || [],
        courriels: Array.isArray(local.courriels) ? local.courriels : [],
        modeles: local.modeles && !Array.isArray(local.modeles) ? local.modeles : {},
        source: "local",
        erreur: ""
      };
      if (!distant(cfg)) return repli;
      try {
        var res = await Promise.all([
          lireDistant(cfg, "demandes"),
          lireDistant(cfg, "courriels"),
          lireDistant(cfg, "modeles")
        ]);
        var d = {
          demandes: Array.isArray(res[0]) ? res[0] : repli.demandes,
          courriels: Array.isArray(res[1]) ? res[1] : [],
          modeles: res[2] && !Array.isArray(res[2]) ? res[2] : {},
          source: "api",
          erreur: ""
        };
        ecrireLocal("demandes", d.demandes);
        ecrireLocal("courriels", d.courriels);
        ecrireLocal("modeles", d.modeles);
        return d;
      } catch (e) {
        repli.erreur = "Base externe injoignable (" + e.message + "). L'outil travaille sur la copie locale.";
        return repli;
      }
    },

    /* Écriture : miroir local immédiat, puis envoi vers l'API si elle est configurée. */
    pousser: function (collection, valeur) {
      ecrireLocal(collection, valeur);
      var cfg = config();
      if (!distant(cfg)) return;
      ecrireDistant(cfg, collection, valeur).catch(function (e) {
        signaler("Enregistrement distant impossible (" + e.message + "). La modification est conservée localement.");
      });
    },

    /* Expédition d'un courriel. Sans envoi configuré, le message reste journalisé
     * dans l'onglet « Courriels envoyés » sans quitter le navigateur. */
    expedier: function (courriel) {
      var cfg = config();
      if (!distant(cfg) || !cfg.envoiReel) return;
      expedierDistant(cfg, courriel).catch(function (e) {
        signaler("Envoi du courriel à " + courriel.dest + " impossible (" + e.message + "). Le message reste consultable dans le journal.");
      });
    },

    /* Bouton « Tester la connexion » de l'écran Configuration. */
    tester: async function (cfgTest) {
      var cfg = cfgTest || config();
      if (!(cfg.baseUrl || "").trim()) return { ok: false, message: "Renseignez l'adresse de l'API." };
      try {
        var d = await lireDistant(cfg, "demandes");
        var n = Array.isArray(d) ? d.length : 0;
        return { ok: true, message: "Connexion établie : " + n + (n === 1 ? " demande lue." : " demandes lues.") };
      } catch (e) {
        return { ok: false, message: "Échec : " + e.message + ". Vérifiez l'adresse, la clé et les autorisations CORS du service." };
      }
    }
  };

  window.Stockage = Stockage;
})();
