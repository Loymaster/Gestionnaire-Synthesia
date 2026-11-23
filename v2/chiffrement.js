/*
 * Gestionnaire Synthesia v2 — chiffrement des données personnelles dans le navigateur.
 *
 * Schéma hybride :
 *  - chaque donnée est chiffrée avec une clé AES-GCM 256 bits tirée au hasard ;
 *  - cette clé est chiffrée avec la clé publique RSA-OAEP 3072 bits (SHA-256) de l'administrateur.
 * Seule la clé privée de l'administrateur permet de relire. Supabase ne voit que le résultat.
 *
 * La clé privée est conservée dans un fichier protégé par une phrase secrète :
 * dérivation PBKDF2-SHA-256 (600 000 itérations) puis AES-GCM 256 bits.
 *
 * Tout repose sur l'API Web Crypto standard des navigateurs, sans bibliothèque externe.
 */
(function (global) {
  'use strict';
  const sub = global.crypto && global.crypto.subtle;
  const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };
  const ITERATIONS = 600000;

  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => { let s = ''; const o = new Uint8Array(buf); for (let i = 0; i < o.length; i++) s += String.fromCharCode(o[i]); return btoa(s); };
  const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hasard = (n) => global.crypto.getRandomValues(new Uint8Array(n));

  function verifierSupport() {
    if (!sub) throw new Error("Ce navigateur ne permet pas le chiffrement (page à ouvrir en https, navigateur récent).");
  }

  /* ---- paire de clés (page d'administration des clés) ---- */

  async function genererPaire() {
    verifierSupport();
    const paire = await sub.generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
    const publique = b64(await sub.exportKey('spki', paire.publicKey));
    return { paire, publique, empreinte: await empreinte(publique) };
  }

  /* Empreinte courte de la clé publique, pour vérifier d'un coup d'œil que le site utilise la bonne */
  async function empreinte(publiqueB64) {
    const h = new Uint8Array(await sub.digest('SHA-256', deb64(publiqueB64)));
    return Array.from(h.slice(0, 8), (x) => x.toString(16).padStart(2, '0')).join('').match(/.{4}/g).join('-').toUpperCase();
  }

  async function cleDePhrase(phrase, sel) {
    const base = await sub.importKey('raw', enc.encode(phrase), 'PBKDF2', false, ['deriveKey']);
    return sub.deriveKey({ name: 'PBKDF2', salt: sel, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /* Produit le contenu du fichier de clé privée (JSON), protégé par la phrase secrète */
  async function protegerClePrivee(clePrivee, publiqueB64, phrase) {
    const sel = hasard(16), iv = hasard(12);
    const brut = await sub.exportKey('pkcs8', clePrivee);
    const chiffre = await sub.encrypt({ name: 'AES-GCM', iv }, await cleDePhrase(phrase, sel), brut);
    return JSON.stringify({
      format: 'gestionnaire-synthesia-cle-privee', version: 1, creee_le: new Date().toISOString(),
      empreinte: await empreinte(publiqueB64), publique: publiqueB64,
      kdf: { nom: 'PBKDF2-SHA-256', iterations: ITERATIONS, sel: b64(sel) },
      chiffrement: { nom: 'AES-GCM', iv: b64(iv) }, cle: b64(chiffre)
    }, null, 2);
  }

  /* Ouvre le fichier de clé privée avec la phrase secrète ; renvoie une clé non exportable */
  async function ouvrirClePrivee(texteFichier, phrase) {
    verifierSupport();
    let f;
    try { f = JSON.parse(texteFichier); } catch (e) { throw new Error("Ce fichier n'est pas un fichier de clé valide."); }
    if (f.format !== 'gestionnaire-synthesia-cle-privee') throw new Error("Ce fichier n'est pas un fichier de clé du Gestionnaire Synthesia.");
    let brut;
    try {
      brut = await sub.decrypt({ name: 'AES-GCM', iv: deb64(f.chiffrement.iv) }, await cleDePhrase(phrase, deb64(f.kdf.sel)), deb64(f.cle));
    } catch (e) { throw new Error('Phrase secrète incorrecte.'); }
    const cle = await sub.importKey('pkcs8', brut, RSA, false, ['decrypt']);
    return { cle, empreinte: f.empreinte, publique: f.publique };
  }

  /* ---- chiffrement d'une donnée (formulaires, migration) ---- */

  const cachePubliques = {};
  async function importerPublique(publiqueB64) {
    if (!cachePubliques[publiqueB64]) cachePubliques[publiqueB64] = sub.importKey('spki', deb64(publiqueB64), RSA, false, ['encrypt']);
    return cachePubliques[publiqueB64];
  }

  /* objet → texte chiffré (base64 d'un petit JSON) */
  async function chiffrer(objet, publiqueB64) {
    verifierSupport();
    const aes = await sub.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const iv = hasard(12);
    const c = await sub.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(objet)));
    const k = await sub.encrypt(RSA, await importerPublique(publiqueB64), await sub.exportKey('raw', aes));
    return btoa(JSON.stringify({ v: 1, e: await empreinte(publiqueB64), k: b64(k), iv: b64(iv), c: b64(c) }));
  }

  /* texte chiffré → objet, avec la clé privée ouverte */
  async function dechiffrer(texte, clePrivee) {
    const p = JSON.parse(atob(texte));
    if (p.v !== 1) throw new Error('format de chiffrement inconnu');
    const brut = await sub.decrypt(RSA, clePrivee, deb64(p.k));
    const aes = await sub.importKey('raw', brut, { name: 'AES-GCM' }, false, ['decrypt']);
    return JSON.parse(dec.decode(await sub.decrypt({ name: 'AES-GCM', iv: deb64(p.iv) }, aes, deb64(p.c))));
  }

  /* ---- clé du script d'envoi des courriels (envois automatiques) ----
   * Chiffrement RSA-OAEP direct, sans AES, pour que le script Google puisse déchiffrer avec un code simple.
   * La clé privée est remise au script sous la forme { n, d } en hexadécimal (propriété CLE_ROBOT). */
  async function genererCleRobot() {
    verifierSupport();
    const paire = await sub.generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
    const publique = b64(await sub.exportKey('spki', paire.publicKey));
    const jwk = await sub.exportKey('jwk', paire.privateKey);
    const hex = (b64url) => Array.from(Uint8Array.from(atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)), (c) => c.charCodeAt(0)), (x) => x.toString(16).padStart(2, '0')).join('');
    return { publique, empreinte: await empreinte(publique), privee: JSON.stringify({ n: hex(jwk.n), d: hex(jwk.d) }) };
  }

  /* { email, nom } → texte chiffré pour le script ; le nom est raccourci si le tout dépasse la capacité de la clé */
  async function chiffrerRobot(contact, publiqueB64) {
    verifierSupport();
    const cle = await importerPublique(publiqueB64);
    let nom = String(contact.nom || '');
    let octets;
    do {
      octets = enc.encode(JSON.stringify({ email: contact.email, nom }));
      if (octets.length <= 300) break;
      nom = nom.slice(0, Math.max(0, nom.length - 20));
    } while (nom.length);
    if (octets.length > 318) throw new Error('adresse trop longue pour le chiffrement du script');
    const c = await sub.encrypt(RSA, cle, octets);
    return btoa(JSON.stringify({ v: 1, e: await empreinte(publiqueB64), c: b64(c) }));
  }

  global.Chiffrement = { genererPaire, protegerClePrivee, ouvrirClePrivee, chiffrer, dechiffrer, empreinte, genererCleRobot, chiffrerRobot };
})(typeof window !== 'undefined' ? window : globalThis);
