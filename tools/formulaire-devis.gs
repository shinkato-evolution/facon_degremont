/**
 * Façon Degremont — réception des demandes de devis par e-mail (Google Apps Script).
 *
 * À coller dans un projet sur https://script.google.com (connecté avec le compte Gmail qui doit
 * recevoir les demandes), puis : Déployer > Nouveau déploiement > type « Application Web »,
 *   Exécuter en tant que : Moi      Qui a accès : Tout le monde
 * Copier l'URL obtenue (finit par /exec) dans le back-office : « Coordonnées et textes » > « Adresse du script d'envoi ».
 * Mode d'emploi pas à pas : voir GUIDE-PATRON.md.
 */

// Adresse qui reçoit les demandes. Vide = le compte Gmail qui a déployé le script.
const DESTINATAIRE = '';
const NOM_ENTREPRISE = 'Façon Degremont';
const MAX_PAR_HEURE = 30; // garde-fou contre le spam

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};

    // Champ piège : invisible pour un humain, rempli par les robots.
    if (p.botcheck) return reponse_({ ok: true });

    const nom = nettoyer_(p.nom, 120);
    const telephone = nettoyer_(p.telephone, 40);
    if (!nom || !telephone) return reponse_({ ok: false, erreur: 'Nom et téléphone obligatoires.' });

    // Limite simple : pas plus de MAX_PAR_HEURE demandes par heure.
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get('compteur') || 0);
    if (n >= MAX_PAR_HEURE) return reponse_({ ok: false, erreur: 'Trop de demandes, réessayez plus tard.' });
    cache.put('compteur', String(n + 1), 3600);

    const email = nettoyer_(p.email, 160);
    const ville = nettoyer_(p.ville, 120);
    const travaux = nettoyer_(p.travaux, 300) || 'Non précisé';
    const message = nettoyer_(p.message, 3000) || '—';
    const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const lignes = [
      ['Nom', nom],
      ['Téléphone', telephone],
      ['E-mail', email || '—'],
      ['Ville', ville || '—'],
      ['Travaux souhaités', travaux],
    ];
    const tableau = lignes.map(function (l) {
      return '<tr><td style="padding:10px 14px;background:#efefef;color:#555;font-weight:bold;width:170px;border-bottom:1px solid #fff">' +
        h_(l[0]) + '</td><td style="padding:10px 14px;border-bottom:1px solid #efefef;color:#333">' + h_(l[1]) + '</td></tr>';
    }).join('');

    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#333">' +
      '<div style="background:#70c8fa;padding:20px 24px;border-radius:10px 10px 0 0">' +
      '<div style="font-size:13px;color:#fff;opacity:.9">' + h_(NOM_ENTREPRISE) + ' · site internet</div>' +
      '<div style="font-size:22px;font-weight:bold;color:#fff;margin-top:4px">Nouvelle demande de devis</div></div>' +
      '<table style="width:100%;border-collapse:collapse;border:1px solid #efefef">' + tableau + '</table>' +
      '<div style="padding:16px 18px;border:1px solid #efefef;border-top:0">' +
      '<div style="font-weight:bold;color:#555;margin-bottom:6px">Message</div>' +
      '<div style="white-space:pre-wrap;line-height:1.5">' + h_(message) + '</div></div>' +
      '<div style="padding:18px 0;text-align:center">' +
      '<a href="tel:' + h_(telephone.replace(/[^\d+]/g, '')) + '" style="display:inline-block;background:#555;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Appeler ' + h_(nom) + '</a></div>' +
      '<div style="font-size:12px;color:#999;text-align:center">Envoyé depuis le formulaire du site. Répondre à ce message écrit directement au client' + (emailValide ? '' : ' (pas d\'e-mail fourni : appelez-le)') + '.</div></div>';

    const texte = lignes.map(function (l) { return l[0] + ' : ' + l[1]; }).join('\n') + '\n\nMessage :\n' + message;

    const options = { name: NOM_ENTREPRISE + ' — site internet', htmlBody: html };
    if (emailValide) options.replyTo = email;
    MailApp.sendEmail(
      DESTINATAIRE || Session.getEffectiveUser().getEmail(),
      'Demande de devis — ' + nom + (ville ? ' (' + ville + ')' : ''),
      texte,
      options
    );
    return reponse_({ ok: true });
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    return reponse_({ ok: false, erreur: 'Erreur interne : ' + String(err) });
  }
}

// Ouvrir l'adresse dans un navigateur : confirme que le script est bien en ligne.
function doGet() {
  return reponse_({ ok: true, message: 'Le formulaire est en ligne.' });
}

// Pour tester sans le site : choisir « test » dans la barre du haut puis ▶ Exécuter. Un e-mail d'essai arrive.
function test() {
  const r = doPost({ parameter: { nom: 'Essai Dupont', telephone: '06 00 00 00 00', email: '', ville: 'Toulouse', travaux: 'Carrelage, Plomberie', message: 'Ceci est un message d\'essai.' } });
  Logger.log(r.getContent());
}

function nettoyer_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function h_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
