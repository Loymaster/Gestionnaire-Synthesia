/*
 * Gestionnaire Synthesia v2 — configuration publique du site.
 * Rien ici n'est secret : adresse et clé publique de Supabase, clé publique de chiffrement.
 * La clé privée correspondante n'existe que dans le fichier de l'administrateur.
 */
window.CONFIG_V2 = Object.freeze({
  supabaseUrl: 'https://ybrivfxiepaabpjdnido.supabase.co',
  supabaseCle: 'sb_publishable_UIQicfFS1ZEczJy2K4rm5A_AuYoN-sP',
  courrielsUrl: '', // adresse /exec du script d'envoi des courriels, à renseigner après son déploiement
  clePublique: 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA+9P/8sYJyr9NHmDxkpOCl07ptRdCYehOVN51AQZgcut4zQpaOo+HhRxpgaezSXTZJaal2vqwdto6TRtlD0Huv442iLqw6m+Sgs3iqzSm0vaGSQC+2ugHx7AHl0p6//fMRkPPakXRSXJt8eU9OZVOCXWo+Rxd1j+q9uww1TLXXcztzG3LTpz/3cEQ4IFQx+wlhuGjFwZSZ5LyvsT/iHFDa1tFq3XOcWvcTb9fylYe3c2g4CyQFYjvnLXiglOYODBTWAmgeiC6O+RACs5uLV6vsV4056TD2n+mUelfWjQmh9EZWOtUbDRJR3IpyViEyntiCYKop/YYYhRzCjpyqndZmGgR8sS67rn0LaGzWJDyPVpYmMSxT8cxTfgSk4Hhg4DgbwotefSfvyIDV0n/mEGzGsYGnSjaJjk9M6Yn01rWfaXSdhKLSHDIDhUBd7Xnldx5HgcLU8FBjIEY38PHJNGb4CXcUK/L7abI+zRBDVuVrrcFC/W9JJVlgP6qgV5qNanVAgMBAAE=',
  empreinte: '8BED-0074-E7A6-046D' // vérifiée au chargement : le site refuse de chiffrer si elle ne correspond pas
});
