// Espace de gestion Façon Degremont : back-office sur mesure, sans base de données.
// Les contenus restent des fichiers du dépôt GitHub (content/*.json, content/blog/*.md, assets/uploads/).
// Connexion : identifiant + mot de passe, qui déchiffrent dans le navigateur une clé GitHub stockée chiffrée dans admin/acces.json.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const app = $('#app');
const enc = new TextEncoder();
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const METIERS = ['placo', 'carrelage', 'electricite', 'plomberie', 'climatisation'];

const ETAT = {
  backend: null,   // GitHub ou Local
  data: null,      // contenus en cours de modification
  saved: null,     // derniers contenus publiés (pour savoir ce qui a changé)
  images: new Map(), // chemin → { blob, url, envoye } : photos ajoutées dans cette session
  appareil: innerWidth < 1000 ? 'tel' : 'ordi',
};

/* ================= Petits outils ================= */

function slug(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
}
function dateFr(iso) {
  const [a, m, j] = String(iso || '').split('-').map(Number);
  return a && m && j ? `${j}${j === 1 ? 'er' : ''} ${MOIS[m - 1]} ${a}` : '';
}
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Adresse d'une image pour l'afficher ici (photo ajoutée pas encore en ligne → copie locale).
function img(p, mini = false) {
  if (!p) return '';
  const local = ETAT.images.get(p);
  if (local) return local.url;
  if (/^https?:/.test(p)) return p;
  const c = '..' + (p.startsWith('/') ? p : '/' + p);
  return mini && /^\.\.\/assets\/photos\/.+\.webp$/.test(c) ? c.replace(/\.webp$/, '-mini.webp') : c;
}

function toast(msg, type = 'ok', duree = 4200) {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.classList.add('part'), duree);
  setTimeout(() => t.remove(), duree + 400);
}

function demander(texte, ok = 'Supprimer') {
  const d = $('#dialogue');
  $('#dialogue-texte').textContent = texte;
  $('#dialogue-ok').textContent = ok;
  d.showModal();
  return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'oui'), { once: true }));
}

function choisirFichiers(multiple = false) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.multiple = multiple;
    i.addEventListener('change', () => res([...i.files]));
    i.click();
  });
}

// Photo réduite à 1600 px et convertie en WebP (site rapide sur téléphone).
async function preparerImage(file, nom) {
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n\'est pas une photo.');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82));
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    ext = 'jpg';
  }
  const chemin = `/assets/uploads/${slug(nom) || 'photo'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${ext}`;
  ETAT.images.set(chemin, { blob, url: URL.createObjectURL(blob), envoye: false });
  return chemin;
}

async function photos(files, nom) {
  const out = [];
  for (const f of files) {
    try { out.push(await preparerImage(f, nom)); } catch (e) { toast(e.message || 'Photo illisible.', 'err'); }
  }
  return out;
}

/* ================= Chiffrement de la clé GitHub ================= */

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ITERATIONS = 600000;

async function cleMdp(mdp, sel, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(mdp), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function chiffrer(jeton, mdp) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cle = await cleMdp(mdp, sel, ITERATIONS);
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, enc.encode(jeton)));
  return { sel: b64(sel), iv: b64(iv), jeton: b64(c), iterations: ITERATIONS };
}
async function dechiffrer(compte, mdp) {
  const cle = await cleMdp(mdp, deb64(compte.sel), compte.iterations || ITERATIONS);
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(compte.iv) }, cle, deb64(compte.jeton));
  return new TextDecoder().decode(p);
}

/* ================= Où sont les fichiers : GitHub ou cet ordinateur ================= */

class GitHub {
  constructor({ owner, repo, branch = 'main', token }) {
    Object.assign(this, { owner, repo, branch, token, mode: 'github' });
  }
  async api(chemin, { method = 'GET', body, raw = false, nul = false } = {}) {
    const r = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}${chemin}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (nul && r.status === 404) return null;
    if (!r.ok) {
      const e = new Error(`GitHub ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return raw ? r.text() : r.json();
  }
  verifier() { return this.api(''); }
  read(p) { return this.api(`/contents/${encodeURI(p)}?ref=${this.branch}`, { raw: true, nul: true }); }
  async list(d) {
    const l = await this.api(`/contents/${encodeURI(d)}?ref=${this.branch}`, { nul: true });
    return Array.isArray(l) ? l.filter((x) => x.type === 'file').map((x) => x.name) : [];
  }
  // Toutes les modifications partent en une seule fois (un seul « commit »).
  async commit(changes, message) {
    const ref = await this.api(`/git/ref/heads/${this.branch}`);
    const parent = await this.api(`/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const c of changes) {
      if (c.content === null) { tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const u8 = c.content instanceof Blob ? new Uint8Array(await c.content.arrayBuffer()) : enc.encode(c.content);
      const blob = await this.api('/git/blobs', { method: 'POST', body: { content: b64(u8), encoding: 'base64' } });
      tree.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const t = await this.api('/git/trees', { method: 'POST', body: { base_tree: parent.tree.sha, tree } });
    const commit = await this.api('/git/commits', { method: 'POST', body: { message, tree: t.sha, parents: [ref.object.sha] } });
    await this.api(`/git/refs/heads/${this.branch}`, { method: 'PATCH', body: { sha: commit.sha } });
  }
}

class Local {
  constructor(dir) { this.dir = dir; this.mode = 'local'; }
  async dossier(parts, create = false) {
    let d = this.dir;
    for (const p of parts) d = await d.getDirectoryHandle(p, { create });
    return d;
  }
  async read(p) {
    try {
      const parts = p.split('/');
      const d = await this.dossier(parts.slice(0, -1));
      return await (await (await d.getFileHandle(parts.at(-1))).getFile()).text();
    } catch { return null; }
  }
  async list(p) {
    try {
      const d = await this.dossier(p.split('/'));
      const out = [];
      for await (const [n, hd] of d.entries()) if (hd.kind === 'file') out.push(n);
      return out.sort();
    } catch { return []; }
  }
  async commit(changes) {
    for (const c of changes) {
      const parts = c.path.split('/');
      const d = await this.dossier(parts.slice(0, -1), c.content !== null);
      if (c.content === null) { try { await d.removeEntry(parts.at(-1)); } catch { /* déjà absent */ } continue; }
      const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
      await w.write(c.content);
      await w.close();
    }
  }
}

/* ================= Articles (fichiers .md) ================= */

function lireArticle(slugA, texte) {
  const m = String(texte || '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const meta = {};
  if (m) {
    for (const l of m[1].split('\n')) {
      const k = l.match(/^([a-z_]+):\s*(.*)$/);
      if (!k) continue;
      let v = k[2].trim();
      if (v.startsWith('"')) { try { v = JSON.parse(v); } catch { v = v.slice(1, -1); } }
      else if (v.startsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
      else if (v === 'true' || v === 'false') v = v === 'true';
      meta[k[1]] = v;
    }
  }
  return {
    slug: slugA,
    titre: meta.titre || '',
    date: String(meta.date || aujourdhui()).slice(0, 10),
    description: meta.description || '',
    image: meta.image || '',
    publie: meta.publie !== false,
    corps: (m ? m[2] : String(texte || '')).trim(),
    neuf: false,
  };
}

function ecrireArticle(a) {
  return `---\ntitre: ${JSON.stringify(a.titre)}\ndate: ${a.date}\ndescription: ${JSON.stringify(a.description)}\nimage: ${JSON.stringify(a.image || '')}\npublie: ${a.publie !== false}\n---\n\n${a.corps.trim()}\n`;
}

// Mise en forme simple (intertitres, gras, listes, liens, photos) pour l'aperçu.
function markdown(md) {
  const inline = (t) => h(t)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, s) => `<img src="${h(img(s))}" alt="${a}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return String(md || '').split(/\n\s*\n/).map((b) => {
    const t = b.trim();
    if (!t) return '';
    if (t.startsWith('### ')) return `<h3>${inline(t.slice(4))}</h3>`;
    if (t.startsWith('## ')) return `<h2>${inline(t.slice(3))}</h2>`;
    const lignes = t.split('\n');
    if (lignes.every((l) => /^[-*] /.test(l))) return `<ul>${lignes.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    if (lignes.every((l) => /^\d+\. /.test(l))) return `<ol>${lignes.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(t)) return inline(t);
    return `<p>${inline(lignes.join(' '))}</p>`;
  }).join('\n');
}

/* ================= Chargement et publication ================= */

async function chargerTout(b) {
  const json = async (n) => { try { return JSON.parse((await b.read(`content/${n}.json`)) || 'null'); } catch { return null; } };
  const [site, metiers, realisations, avis] = await Promise.all(['site', 'metiers', 'realisations', 'avis'].map(json));
  if (!site) throw new Error('Fichiers du site introuvables.');
  const noms = (await b.list('content/blog')).filter((n) => n.endsWith('.md'));
  const articles = await Promise.all(noms.map(async (n) => lireArticle(n.slice(0, -3), await b.read(`content/blog/${n}`))));
  articles.sort((a, z) => z.date.localeCompare(a.date));
  realisations.items ||= [];
  avis.items ||= [];
  return { site, metiers: metiers || {}, realisations, avis, articles };
}

function fichiers(d) {
  const f = {
    'content/site.json': JSON.stringify(d.site, null, 2) + '\n',
    'content/metiers.json': JSON.stringify(d.metiers, null, 2) + '\n',
    // Les fiches restées vides (chantier ou avis ajouté puis abandonné) ne sont jamais publiées.
    'content/realisations.json': JSON.stringify({ ...d.realisations, items: d.realisations.items.filter((r) => r.titre?.trim() || r.avant || r.apres) }, null, 2) + '\n',
    'content/avis.json': JSON.stringify({ ...d.avis, items: d.avis.items.filter((x) => x.texte?.trim()) }, null, 2) + '\n',
  };
  for (const a of d.articles.filter((x) => !x.neuf || x.titre?.trim() || x.corps?.trim())) f[`content/blog/${a.slug}.md`] = ecrireArticle(a);
  return f;
}

function modifications() {
  const avant = fichiers(ETAT.saved);
  const apres = fichiers(ETAT.data);
  const changes = [];
  for (const [p, t] of Object.entries(apres)) if (avant[p] !== t) changes.push({ path: p, content: t });
  for (const p of Object.keys(avant)) if (!(p in apres)) changes.push({ path: p, content: null });
  if (changes.length) {
    const texte = JSON.stringify(ETAT.data);
    for (const [p, i] of ETAT.images) if (!i.envoye && texte.includes(p)) changes.push({ path: p.slice(1), content: i.blob });
  }
  return changes;
}

function majBarre() {
  const n = modifications().length;
  const barre = $('#barre');
  if (!barre) return;
  barre.classList.toggle('visible', n > 0);
  document.body.classList.toggle('a-publier', n > 0);
}

let minuterieApercu = 0;
function modifie({ apercu = true } = {}) {
  majBarre();
  if (apercu) { clearTimeout(minuterieApercu); minuterieApercu = setTimeout(rafraichirApercu, 700); }
}

async function publier() {
  const changes = modifications();
  if (!changes.length) return;
  const bouton = $('#publier');
  bouton.disabled = true;
  bouton.textContent = 'Publication…';
  try {
    await ETAT.backend.commit(changes, `Mise à jour depuis l'espace de gestion (${changes.length} fichier${changes.length > 1 ? 's' : ''})`);
    for (const c of changes) { const i = ETAT.images.get('/' + c.path); if (i) i.envoye = true; }
    ETAT.data.articles.forEach((a) => { a.neuf = false; });
    ETAT.saved = clone(ETAT.data);
    majBarre();
    toast(ETAT.backend.mode === 'local'
      ? 'Enregistré dans les fichiers de cet ordinateur.'
      : 'Publié ! Vos changements seront visibles sur le site dans 1 à 2 minutes.', 'ok', 6000);
    route();
  } catch (e) {
    toast(e.status === 401 || e.status === 403
      ? 'Accès refusé par GitHub : la clé a peut-être expiré. Reconnectez-vous ou demandez à la renouveler.'
      : 'La publication n\'a pas abouti. Vérifiez votre connexion internet et réessayez.', 'err', 8000);
  } finally {
    bouton.disabled = false;
    bouton.textContent = 'Publier sur le site';
  }
}

async function annuler() {
  if (!(await demander('Effacer toutes les modifications pas encore publiées ?', 'Tout effacer'))) return;
  ETAT.data = clone(ETAT.saved);
  majBarre();
  route();
  toast('Modifications effacées.');
}

/* ================= Aperçu du site ================= */

let cibleApercu = null; // { hash, metier } ou { article }

function brouillon() {
  let t = JSON.stringify({ site: ETAT.data.site, metiers: ETAT.data.metiers, realisations: ETAT.data.realisations, avis: ETAT.data.avis });
  for (const [p, i] of ETAT.images) t = t.split(JSON.stringify(p)).join(JSON.stringify(i.url));
  return JSON.parse(t);
}

function blocApercu() {
  return `<aside class="apercu" id="apercu" aria-label="Aperçu du site">
    <div class="apercu-barre">
      <strong>Aperçu</strong>
      <div class="segment" role="group" aria-label="Taille d'écran">
        <button type="button" data-appareil="ordi" aria-pressed="${ETAT.appareil === 'ordi'}">Ordinateur</button>
        <button type="button" data-appareil="tel" aria-pressed="${ETAT.appareil === 'tel'}">Téléphone</button>
      </div>
      <button type="button" class="apercu-fermer" aria-label="Fermer l'aperçu">✕</button>
    </div>
    <div class="apercu-cadre"><iframe title="Aperçu du site" id="apercu-frame"></iframe></div>
    <p class="apercu-note">Ce que verront vos visiteurs, avant même de publier.</p>
  </aside>
  <button type="button" class="bouton apercu-ouvrir" id="apercu-ouvrir">Voir l'aperçu</button>`;
}

function rafraichirApercu() {
  const f = $('#apercu-frame');
  if (!f || !cibleApercu || !f.offsetParent) return; // aperçu caché (téléphone) : rien à charger
  if (cibleApercu.article) {
    const a = cibleApercu.article;
    const base = new URL('../', location.href).href;
    const corps = markdown(a.corps);
    f.removeAttribute('src');
    f.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${h(base)}"><link rel="stylesheet" href="css/style.css"></head>
<body class="page-blog"><main><article class="post">
<p class="post-back"><a>← Tous les articles</a></p><p class="post-date">${h(dateFr(a.date))}</p>
<h1>${h(a.titre || 'Titre de votre conseil')}</h1>
${a.image ? `<img class="post-img" src="${h(img(a.image))}" alt="">` : ''}
<div class="post-body">${corps || '<p style="color:#999">Votre texte apparaîtra ici.</p>'}</div>
<aside class="post-cta"><strong>Un projet de rénovation ?</strong><span>Décrivez-le en quelques mots : on vient le voir chez vous, sans engagement.</span><a class="btn">Demander mon devis gratuit</a></aside>
</article></main></body></html>`;
  } else {
    window.__fdBrouillon = brouillon();
    f.removeAttribute('srcdoc');
    const q = new URLSearchParams({ brouillon: '', t: Date.now() });
    if (cibleApercu.metier) q.set('metier', cibleApercu.metier);
    f.src = `../index.html?${q.toString()}${cibleApercu.hash ? '#' + cibleApercu.hash : ''}`;
  }
  caler();
}

function caler() {
  const cadre = $('.apercu-cadre');
  const f = $('#apercu-frame');
  if (!cadre || !f) return;
  const largeur = ETAT.appareil === 'ordi' ? 1280 : 390;
  const s = Math.min(1, cadre.clientWidth / largeur);
  f.style.width = `${largeur}px`;
  f.style.height = `${cadre.clientHeight / s}px`;
  f.style.transform = `scale(${s})`;
  f.style.left = `${Math.max(0, (cadre.clientWidth - largeur * s) / 2)}px`;
}
new ResizeObserver(() => caler()).observe(document.documentElement);

function brancherApercu(cible) {
  cibleApercu = cible;
  const ap = $('#apercu');
  if (!ap) return;
  ap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-appareil]');
    if (b) {
      ETAT.appareil = b.dataset.appareil;
      $$('[data-appareil]', ap).forEach((x) => x.setAttribute('aria-pressed', x === b));
      caler();
    }
    if (e.target.closest('.apercu-fermer')) ap.classList.remove('ouvert');
  });
  // Sur téléphone, l'aperçu est caché : on le recharge à l'ouverture pour qu'il se place sur la bonne partie.
  $('#apercu-ouvrir').addEventListener('click', () => { ap.classList.add('ouvert'); rafraichirApercu(); });
  rafraichirApercu();
}

/* ================= Morceaux d'interface ================= */

const ICONES = {
  chantier: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>',
  metier: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  conseil: '<path d="M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5"/>',
  avis: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  coordonnees: '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2c1.1.4 2.3.6 3.6.6a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.6 3.6a1 1 0 0 1-.2 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  photo: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
};
const icone = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;

function zonePhoto(id, chemin, { titre = 'Ajouter une photo', aide = 'Touchez ou glissez une photo ici', grande = false } = {}) {
  return `<div class="zone-photo ${chemin ? 'pleine' : ''} ${grande ? 'grande' : ''}" data-photo="${id}" role="button" tabindex="0" aria-label="${h(titre)}">
    ${chemin
      ? `<img src="${h(img(chemin))}" alt=""><span class="zone-actions"><span class="mini-bouton">Changer</span><button type="button" class="mini-bouton danger" data-retirer="${id}">Retirer</button></span>`
      : `${icone('photo')}<strong>${h(titre)}</strong><span>${h(aide)}</span>`}
  </div>`;
}

// Branche toutes les zones photo d'une vue : clic, clavier, glisser-déposer.
function brancherPhotos(root, setters, nom = (id) => id) {
  const prendre = async (id, files) => {
    if (!files.length) return;
    const chemins = await photos(files.slice(0, 1), nom(id));
    if (chemins[0]) { setters[id](chemins[0]); modifie(); route(); }
  };
  root.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-retirer]');
    if (r) { e.stopPropagation(); setters[r.dataset.retirer](''); modifie(); route(); return; }
    const z = e.target.closest('[data-photo]');
    if (z) prendre(z.dataset.photo, await choisirFichiers());
  });
  root.addEventListener('keydown', async (e) => {
    const z = e.target.closest('[data-photo]');
    if (z && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); prendre(z.dataset.photo, await choisirFichiers()); }
  });
  root.addEventListener('dragover', (e) => { const z = e.target.closest('[data-photo]'); if (z) { e.preventDefault(); z.classList.add('survol'); } });
  root.addEventListener('dragleave', (e) => e.target.closest('[data-photo]')?.classList.remove('survol'));
  root.addEventListener('drop', (e) => {
    const z = e.target.closest('[data-photo]');
    if (!z) return;
    e.preventDefault();
    prendre(z.dataset.photo, [...e.dataTransfer.files]);
  });
}

// Lie les champs [data-k] à un objet : chaque frappe met à jour le contenu.
function lier(root, obj, apres) {
  $$('[data-k]', root).forEach((el) => {
    const k = el.dataset.k;
    if (el.type === 'checkbox') el.checked = obj[k] !== false;
    else el.value = obj[k] ?? '';
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      obj[k] = el.type === 'checkbox' ? el.checked : el.value;
      apres?.(k, el);
      modifie();
    });
  });
}

function champ(k, label, { aide = '', type = 'text', placeholder = '', lignes = 0, max = 0 } = {}) {
  const id = `c-${k}`;
  const ctrl = lignes
    ? `<textarea id="${id}" data-k="${k}" rows="${lignes}" placeholder="${h(placeholder)}" ${max ? `maxlength="${max}"` : ''}></textarea>`
    : `<input id="${id}" data-k="${k}" type="${type}" placeholder="${h(placeholder)}" ${max ? `maxlength="${max}"` : ''}>`;
  return `<div class="champ"><label for="${id}">${h(label)}</label>${ctrl}${aide ? `<p class="aide">${aide}</p>` : ''}</div>`;
}

function interrupteur(k, label, aide = '') {
  return `<label class="interrupteur"><input type="checkbox" data-k="${k}"><span class="piste" aria-hidden="true"></span><span><strong>${h(label)}</strong>${aide ? `<small>${h(aide)}</small>` : ''}</span></label>`;
}

let derniereAdresse = '';
function page({ titre, ico = '', sousTitre = '', retour = '', contenu, apercu = false }) {
  const nonPublie = modifications().length > 0;
  const memePage = derniereAdresse === location.hash;
  const y = scrollY;
  derniereAdresse = location.hash;
  app.innerHTML = `
  <header class="entete">
    <a class="marque" href="#/"><img src="../assets/logo/logo-mark.png" alt="" width="36" height="36"><span>Espace de gestion</span></a>
    <nav class="entete-liens">
      <a href="../" target="_blank" rel="noopener">Voir le site ↗</a>
      ${ETAT.backend.mode === 'github' ? '<a href="#/acces">Mon accès</a>' : '<span class="badge">Mode test (cet ordinateur)</span>'}
      <button type="button" class="lien" id="deconnexion">Se déconnecter</button>
    </nav>
  </header>
  <main class="contenu ${apercu ? 'avec-apercu' : ''}">
    <div class="colonne">
      ${retour ? `<a class="retour" href="${retour}">← Retour</a>` : ''}
      <h1>${ico ? `<span class="titre-ico">${icone(ico)}</span>` : ''}${h(titre)}</h1>
      ${sousTitre ? `<p class="sous-titre">${sousTitre}</p>` : ''}
      <div id="vue">${contenu}</div>
    </div>
    ${apercu ? blocApercu() : ''}
  </main>
  <div class="barre ${nonPublie ? 'visible' : ''}" id="barre" role="region" aria-label="Publication">
    <p><strong>Modifications pas encore publiées.</strong> <span>Elles sont gardées ici tant que vous ne fermez pas la page.</span></p>
    <div><button type="button" class="bouton bouton-clair" id="annuler">Annuler</button><button type="button" class="bouton" id="publier">Publier sur le site</button></div>
  </div>`;
  document.body.classList.toggle('a-publier', nonPublie);
  $('#publier').addEventListener('click', publier);
  $('#annuler').addEventListener('click', annuler);
  $('#deconnexion').addEventListener('click', deconnexion);
  window.scrollTo(0, memePage ? y : 0); // après l'ajout d'une photo, on reste au même endroit
  return $('#vue');
}

/* ================= Vues ================= */

function vueAccueil() {
  const d = ETAT.data;
  const real = d.realisations.items;
  const nbPhotos = METIERS.reduce((n, k) => n + (d.metiers[k]?.photos || []).length, 0);
  const tuiles = [
    { href: '#/chantiers', ic: 'chantier', titre: 'Mes chantiers', texte: 'Les photos avant / après de vos réalisations', compte: `${real.length} chantier${real.length > 1 ? 's' : ''}`, photo: real.find((r) => r.apres)?.apres },
    { href: '#/metiers', ic: 'metier', titre: 'Mes métiers', texte: 'Les photos qui s\'ouvrent quand on touche la maison', compte: `${nbPhotos} photos`, photo: d.metiers.carrelage?.photos?.[0]?.image },
    { href: '#/conseils', ic: 'conseil', titre: 'Nos conseils', texte: 'Vos articles, pour être trouvé sur Google', compte: `${d.articles.length} article${d.articles.length > 1 ? 's' : ''}`, photo: d.articles.find((a) => a.image)?.image },
    { href: '#/avis', ic: 'avis', titre: 'Avis clients', texte: 'Ce que vos clients disent de vous', compte: `${d.avis.items.filter((a) => a.visible !== false).length} affiché(s) sur ${d.avis.items.length}` },
    { href: '#/coordonnees', ic: 'coordonnees', titre: 'Coordonnées et textes', texte: 'Téléphone, e-mail, phrases de l\'accueil', compte: h(d.site.telephone || '') },
  ];
  page({
    titre: 'Bonjour',
    ico: 'chantier',
    sousTitre: 'Que voulez-vous modifier sur votre site ?',
    contenu: `
    <div class="tuiles">
      ${tuiles.map((t) => `<a class="tuile" href="${t.href}">
        <span class="tuile-visuel">${t.photo ? `<img src="${h(img(t.photo, true))}" alt="" loading="lazy">` : icone(t.ic)}</span>
        <span class="tuile-texte"><strong>${t.titre}</strong><span>${t.texte}</span><em>${t.compte}</em></span>
      </a>`).join('')}
    </div>`,
  });
}

/* ----- Chantiers ----- */

function vueChantiers() {
  const items = ETAT.data.realisations.items;
  const vue = page({
    titre: 'Mes chantiers',
    sousTitre: 'Les 3 premiers apparaissent sur l\'accueil, les autres derrière « Voir tous les chantiers ». Utilisez les flèches pour changer l\'ordre.',
    retour: '#/',
    contenu: `<p class="ajout-haut"><a class="bouton" href="#/chantiers/nouveau">${icone('plus')} Ajouter un chantier</a></p>
    <div class="grille">
      ${items.map((r, i) => `<div class="carte">
        <a class="carte-lien" href="#/chantiers/${i}">
          <span class="carte-img duo">${r.avant ? `<img src="${h(img(r.avant, true))}" alt="">` : '<span class="vide">Avant ?</span>'}${r.apres ? `<img src="${h(img(r.apres, true))}" alt="">` : '<span class="vide">Après ?</span>'}</span>
          <span class="carte-corps"><strong>${h(r.titre || 'Chantier sans titre')}</strong><span>${h([r.type, r.lieu].filter(Boolean).join(' · '))}</span>
          ${r.visible === false ? '<span class="badge badge-gris">Masqué</span>' : ''}</span>
        </a>
        <div class="ordre"><button type="button" data-monter="${i}" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-descendre="${i}" aria-label="Descendre" ${i === items.length - 1 ? 'disabled' : ''}>↓</button></div>
      </div>`).join('')}
    </div>`,
  });
  brancherOrdre(vue, items);
}

function brancherOrdre(vue, liste) {
  vue.addEventListener('click', (e) => {
    const m = e.target.closest('[data-monter]');
    const d = e.target.closest('[data-descendre]');
    const i = m ? +m.dataset.monter : d ? +d.dataset.descendre : -1;
    if (i < 0) return;
    const j = m ? i - 1 : i + 1;
    [liste[i], liste[j]] = [liste[j], liste[i]];
    modifie({ apercu: false });
    route();
  });
}

function vueChantier(i) {
  const items = ETAT.data.realisations.items;
  if (i === 'nouveau') {
    items.unshift({ titre: '', type: '', lieu: '', avant: '', apres: '', photos: [], visible: false });
    ETAT.garder = items[0];
    modifie({ apercu: false });
    location.replace('#/chantiers/0');
    return;
  }
  const r = items[+i];
  if (!r) return location.replace('#/chantiers');
  ETAT.garder = r;
  r.photos ||= [];
  const vue = page({
    titre: r.titre || 'Nouveau chantier',
    retour: '#/chantiers',
    apercu: true,
    contenu: `
    <section class="bloc">
      <h2><span class="num">1</span> Les photos avant / après</h2>
      <div class="duo-photos">
        <div><p class="etiquette etiquette-avant">AVANT les travaux</p>${zonePhoto('avant', r.avant, { titre: 'Photo AVANT', grande: true })}</div>
        <div><p class="etiquette etiquette-apres">APRÈS les travaux</p>${zonePhoto('apres', r.apres, { titre: 'Photo APRÈS', grande: true })}</div>
      </div>
      ${r.avant && r.apres ? `<div class="essai">
        <p class="aide"><strong>Essayez :</strong> faites glisser le rond, comme vos visiteurs.</p>
        <div class="ba" style="--x:50%"><img src="${h(img(r.avant))}" alt=""><img class="ba-apres" src="${h(img(r.apres))}" alt="">
          <input type="range" min="0" max="100" value="50" aria-label="Comparer avant et après"><span class="ba-poignee" aria-hidden="true"></span><span class="ba-tag ba-tag-apres">Après</span><span class="ba-tag ba-tag-avant">Avant</span></div>
      </div>` : '<p class="astuce">💡 Prenez les deux photos <strong>du même endroit, avec le même cadrage</strong> : l\'effet est bien plus fort.</p>'}
    </section>
    <section class="bloc">
      <h2><span class="num">2</span> Le chantier</h2>
      ${champ('titre', 'Titre', { placeholder: 'Ex. : Salle d\'eau entièrement refaite' })}
      ${champ('type', 'Type de travaux', { placeholder: 'Ex. : Rénovation salle de bain — appartement' })}
      ${champ('lieu', 'Lieu', { placeholder: 'Ex. : Toulouse', aide: 'La ville suffit. Jamais l\'adresse du client.' })}
    </section>
    <section class="bloc">
      <h2><span class="num">3</span> Photos en plus <small>(facultatif)</small></h2>
      <p class="aide">Elles s'ouvrent quand le visiteur agrandit le chantier.</p>
      ${galerie(r.photos, false)}
    </section>
    <section class="bloc">
      ${interrupteur('visible', 'Afficher sur le site', 'Désactivé = brouillon : gardé ici, pas visible sur le site. Activez quand c\'est prêt.')}
      <button type="button" class="bouton bouton-danger" id="supprimer">Supprimer ce chantier</button>
    </section>`,
  });
  lier(vue, r, (k) => { if (k === 'titre') $('h1').textContent = r.titre || 'Nouveau chantier'; });
  brancherPhotos(vue, { avant: (p) => { r.avant = p; }, apres: (p) => { r.apres = p; } }, (id) => `${r.titre || 'chantier'}-${id}`);
  brancherGalerie(vue, r.photos, r.titre || 'chantier', false);
  const ba = $('.ba', vue);
  ba?.querySelector('input').addEventListener('input', (e) => ba.style.setProperty('--x', `${e.target.value}%`));
  $('#supprimer').addEventListener('click', async () => {
    if (!(await demander(`Supprimer le chantier « ${r.titre || 'sans titre'} » ?`))) return;
    items.splice(+i, 1);
    modifie();
    location.hash = '#/chantiers';
  });
  brancherApercu({ hash: 'realisations' });
}

// Liste de photos avec légende facultative, ordre et suppression.
function galerie(liste, legende) {
  return `<div class="galerie">
    ${liste.map((p, n) => `<figure class="vignette">
      <img src="${h(img(p.image, true))}" alt="">
      ${legende ? `<textarea rows="2" data-legende="${n}" placeholder="Légende courte" aria-label="Légende de la photo ${n + 1}">${h(p.legende || '')}</textarea>` : ''}
      <div class="vignette-actions">
        <button type="button" data-g-monter="${n}" aria-label="Avancer" ${n === 0 ? 'disabled' : ''}>←</button>
        <button type="button" data-g-descendre="${n}" aria-label="Reculer" ${n === liste.length - 1 ? 'disabled' : ''}>→</button>
        <button type="button" class="danger" data-g-retirer="${n}" aria-label="Retirer la photo">✕</button>
      </div>
    </figure>`).join('')}
    <button type="button" class="vignette vignette-ajout" data-g-ajout>${icone('plus')}<span>Ajouter des photos</span><small>plusieurs d'un coup</small></button>
  </div>`;
}

function brancherGalerie(vue, liste, nom, legende) {
  vue.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-g-ajout],[data-g-monter],[data-g-descendre],[data-g-retirer]');
    if (!t) return;
    if (t.hasAttribute('data-g-ajout')) {
      const chemins = await photos(await choisirFichiers(true), nom);
      chemins.forEach((c) => liste.push(legende ? { image: c, legende: '' } : { image: c }));
      if (!chemins.length) return;
    } else if (t.dataset.gRetirer) {
      if (!(await demander('Retirer cette photo ?', 'Retirer'))) return;
      liste.splice(+t.dataset.gRetirer, 1);
    } else {
      const i = +(t.dataset.gMonter ?? t.dataset.gDescendre);
      const j = t.dataset.gMonter !== undefined ? i - 1 : i + 1;
      [liste[i], liste[j]] = [liste[j], liste[i]];
    }
    modifie();
    route();
  });
  vue.addEventListener('input', (e) => {
    const l = e.target.closest('[data-legende]');
    if (l) { liste[+l.dataset.legende].legende = l.value; modifie(); }
  });
}

/* ----- Métiers ----- */

function vueMetiers() {
  const m = ETAT.data.metiers;
  page({
    titre: 'Mes métiers',
    sousTitre: 'Ce sont les photos qui s\'ouvrent quand un visiteur touche une partie de la maison 3D.',
    retour: '#/',
    contenu: `<div class="grille">${METIERS.filter((k) => m[k]).map((k) => {
      const ph = m[k].photos || [];
      return `<a class="carte carte-lien" href="#/metiers/${k}">
        <span class="carte-img mosaique">${ph.slice(0, 3).map((p) => `<img src="${h(img(p.image, true))}" alt="">`).join('') || '<span class="vide">Pas encore de photo</span>'}</span>
        <span class="carte-corps"><strong>${h(m[k].nom)}</strong><span>${ph.length} photo${ph.length > 1 ? 's' : ''}</span></span>
      </a>`;
    }).join('')}</div>`,
  });
}

function vueMetier(k) {
  const m = ETAT.data.metiers[k];
  if (!m) return location.replace('#/metiers');
  m.photos ||= [];
  const vue = page({
    titre: m.nom,
    retour: '#/metiers',
    apercu: true,
    contenu: `
    <section class="bloc">
      <h2><span class="num">1</span> La phrase</h2>
      ${champ('promesse', 'Ce que ce métier apporte à votre client', { lignes: 3, aide: 'Parlez du résultat pour lui, pas de technique. Ex. : « Des joints droits et des carreaux qui ne bougent pas, même dix ans après. »' })}
    </section>
    <section class="bloc">
      <h2><span class="num">2</span> Les photos</h2>
      <p class="aide">La première photo est la plus visible. Une légende courte aide le visiteur : « Douche à l'italienne en mosaïque ».</p>
      ${galerie(m.photos, true)}
    </section>`,
  });
  lier(vue, m);
  brancherGalerie(vue, m.photos, m.nom, true);
  brancherApercu({ hash: 'metiers', metier: k });
}

/* ----- Conseils (blog) ----- */

function vueConseils() {
  const a = ETAT.data.articles;
  page({
    titre: 'Nos conseils',
    sousTitre: 'Chaque article répond à une question que se posent vos clients. Google les adore.',
    retour: '#/',
    contenu: `<p class="ajout-haut"><a class="bouton" href="#/conseils/nouveau">${icone('plus')} Écrire un conseil</a></p>
    <div class="grille">
      ${a.map((x) => `<a class="carte carte-lien" href="#/conseils/${h(x.slug)}">
        <span class="carte-img">${x.image ? `<img src="${h(img(x.image))}" alt="">` : '<span class="vide">Pas de photo</span>'}</span>
        <span class="carte-corps"><strong>${h(x.titre || 'Sans titre')}</strong><span>${h(dateFr(x.date))}</span>
        ${x.publie === false ? '<span class="badge badge-gris">Brouillon</span>' : ''}${x.neuf ? '<span class="badge">Pas encore publié</span>' : ''}</span>
      </a>`).join('')}
    </div>`,
  });
}

function vueConseil(s) {
  const liste = ETAT.data.articles;
  if (s === 'nouveau') {
    let n = 1;
    while (liste.some((x) => x.slug === `nouveau-conseil-${n}`)) n++;
    liste.unshift({ slug: `nouveau-conseil-${n}`, titre: '', date: aujourdhui(), description: '', image: '', publie: false, corps: '', neuf: true });
    ETAT.garder = liste[0];
    modifie({ apercu: false });
    location.replace(`#/conseils/nouveau-conseil-${n}`);
    return;
  }
  const a = liste.find((x) => x.slug === s);
  if (!a) return location.replace('#/conseils');
  ETAT.garder = a;
  const vue = page({
    titre: a.titre || 'Nouveau conseil',
    retour: '#/conseils',
    apercu: true,
    contenu: `
    <section class="bloc">
      <h2><span class="num">1</span> Le titre et le résumé</h2>
      ${champ('titre', 'Titre', { placeholder: 'Ex. : Combien de temps dure une rénovation de salle de bain ?', aide: 'Le meilleur titre est une <strong>question que se pose un client</strong>.' })}
      ${champ('description', 'Résumé (affiché par Google)', { lignes: 2, max: 220, aide: '<span id="compteur"></span> · Une ou deux phrases qui donnent envie de lire.' })}
    </section>
    <section class="bloc">
      <h2><span class="num">2</span> La photo de couverture</h2>
      ${zonePhoto('image', a.image, { titre: 'Photo de couverture', grande: true })}
      <p class="aide">Pour un conseil général, prenez une photo <strong>libre de droits</strong> : <a href="https://pixabay.com/fr/" target="_blank" rel="noopener">pixabay.com ↗</a> (gratuit, usage commercial autorisé). Gardez vos photos de chantier pour « Mes chantiers ».</p>
    </section>
    <section class="bloc">
      <h2><span class="num">3</span> Le texte</h2>
      <div class="outils" role="toolbar" aria-label="Mise en forme">
        <button type="button" data-outil="titre"><b>T</b> Intertitre</button>
        <button type="button" data-outil="gras"><b>G</b> Gras</button>
        <button type="button" data-outil="liste">• Liste</button>
        <button type="button" data-outil="lien">🔗 Lien</button>
        <button type="button" data-outil="photo">${icone('photo')} Photo</button>
      </div>
      <textarea id="c-corps" data-k="corps" rows="18" class="texte-article" placeholder="Écrivez votre conseil ici. Laissez une ligne vide entre deux paragraphes."></textarea>
      <p class="aide">Astuce : un intertitre toutes les 3 ou 4 phrases rend l'article facile à lire sur téléphone. Le bouton « Demander mon devis » s'ajoute tout seul à la fin.</p>
    </section>
    <section class="bloc">
      ${champ('date', 'Date de l\'article', { type: 'date' })}
      ${interrupteur('publie', 'Visible sur le site', 'Désactivé = brouillon : gardé ici, pas visible sur le site. Activez quand c\'est prêt.')}
      <button type="button" class="bouton bouton-danger" id="supprimer">Supprimer cet article</button>
    </section>`,
  });
  const compteur = () => { const n = a.description.length; $('#compteur').textContent = `${n} caractères${n > 160 ? ' (un peu long : Google coupe vers 160)' : ''}`; };
  lier(vue, a, (k) => {
    if (k === 'titre') {
      $('h1').textContent = a.titre || 'Nouveau conseil';
      if (a.neuf) {
        let base = slug(a.titre) || 'conseil';
        let c = base;
        let n = 2;
        while (liste.some((x) => x !== a && x.slug === c)) c = `${base}-${n++}`;
        a.slug = c;
        history.replaceState(null, '', `#/conseils/${c}`);
      }
    }
    if (k === 'description') compteur();
  });
  compteur();
  brancherPhotos(vue, { image: (p) => { a.image = p; } }, () => a.titre || 'conseil');
  const ta = $('#c-corps');
  const inserer = (avant, apres = '', defaut = '') => {
    const { selectionStart: d, selectionEnd: f, value: v } = ta;
    const sel = v.slice(d, f) || defaut;
    ta.value = v.slice(0, d) + avant + sel + apres + v.slice(f);
    ta.focus();
    ta.setSelectionRange(d + avant.length, d + avant.length + sel.length);
    a.corps = ta.value;
    modifie();
  };
  $('.outils', vue).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-outil]');
    if (!b) return;
    const o = b.dataset.outil;
    if (o === 'titre') inserer('\n\n## ', '\n\n', 'Votre intertitre');
    if (o === 'gras') inserer('**', '**', 'texte en gras');
    if (o === 'liste') inserer('\n\n- ', '\n- deuxième point\n\n', 'premier point');
    if (o === 'lien') {
      const url = prompt('Adresse du lien (commence par https://) :', 'https://');
      if (url && url !== 'https://') inserer('[', `](${url})`, 'texte du lien');
    }
    if (o === 'photo') {
      const [c] = await photos(await choisirFichiers(), a.titre || 'conseil');
      if (c) inserer(`\n\n![](${c})\n\n`);
    }
  });
  $('#supprimer').addEventListener('click', async () => {
    if (!(await demander(`Supprimer l'article « ${a.titre || 'sans titre'} » ?`))) return;
    liste.splice(liste.indexOf(a), 1);
    modifie({ apercu: false });
    location.hash = '#/conseils';
  });
  brancherApercu({ article: a });
}

/* ----- Avis ----- */

function vueAvis() {
  const items = ETAT.data.avis.items;
  const vue = page({
    titre: 'Avis clients',
    sousTitre: 'Uniquement des avis réels, avec l\'accord de la personne. 5 avis maximum sont affichés.',
    retour: '#/',
    contenu: `<p class="ajout-haut"><a class="bouton" href="#/avis/nouveau">${icone('plus')} Ajouter un avis</a></p>
    <div class="grille grille-avis">
      ${items.map((x, i) => `<div class="carte">
        <a class="carte-lien carte-avis" href="#/avis/${i}">
          <blockquote>« ${h((x.texte || '').slice(0, 160))}${(x.texte || '').length > 160 ? '…' : ''} »</blockquote>
          <span class="carte-corps"><strong>${h(x.prenom || '—')}</strong><span>${h(x.lieu || '')}</span>
          ${x.visible === false ? '<span class="badge badge-gris">Masqué</span>' : '<span class="badge badge-vert">Affiché</span>'}</span>
        </a>
        <div class="ordre"><button type="button" data-monter="${i}" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-descendre="${i}" aria-label="Descendre" ${i === items.length - 1 ? 'disabled' : ''}>↓</button></div>
      </div>`).join('')}
    </div>`,
  });
  brancherOrdre(vue, items);
}

function vueUnAvis(i) {
  const items = ETAT.data.avis.items;
  if (i === 'nouveau') {
    items.unshift({ prenom: '', lieu: '', texte: '', visible: false });
    ETAT.garder = items[0];
    modifie({ apercu: false });
    location.replace('#/avis/0');
    return;
  }
  const a = items[+i];
  if (!a) return location.replace('#/avis');
  ETAT.garder = a;
  const vue = page({
    titre: a.prenom ? `Avis de ${a.prenom}` : 'Nouvel avis',
    retour: '#/avis',
    apercu: true,
    contenu: `
    <section class="bloc">
      ${champ('prenom', 'Prénom du client', { placeholder: 'Ex. : Sophie' })}
      ${champ('lieu', 'Ville (facultatif)', { placeholder: 'Ex. : Colomiers' })}
      ${champ('texte', 'Son avis, avec ses mots', { lignes: 5, aide: 'Les guillemets s\'ajoutent tout seuls.' })}
      ${interrupteur('visible', 'Afficher sur le site', 'Désactivé = brouillon : gardé ici, pas visible sur le site. Activez quand c\'est prêt.')}
      <button type="button" class="bouton bouton-danger" id="supprimer">Supprimer cet avis</button>
    </section>
    <p class="astuce">💡 La section « avis » apparaît sur le site dès qu'au moins un avis est affiché.</p>`,
  });
  lier(vue, a, (k) => { if (k === 'prenom') $('h1').textContent = a.prenom ? `Avis de ${a.prenom}` : 'Nouvel avis'; });
  $('#supprimer').addEventListener('click', async () => {
    if (!(await demander(`Supprimer l'avis de ${a.prenom || 'ce client'} ?`))) return;
    items.splice(+i, 1);
    modifie();
    location.hash = '#/avis';
  });
  brancherApercu({ hash: 'avis' });
}

/* ----- Coordonnées ----- */

function vueCoordonnees() {
  const s = ETAT.data.site;
  const vue = page({
    titre: 'Coordonnées et textes',
    retour: '#/',
    apercu: true,
    contenu: `
    <section class="bloc" data-cible="metiers">
      <h2><span class="num">1</span> Le haut de la page d'accueil</h2>
      ${champ('titre', 'Grand titre', { aide: 'Court et clair : c\'est la première chose lue.' })}
      ${champ('sous_titre', 'Phrase sous le titre', { lignes: 3 })}
    </section>
    <section class="bloc" data-cible="pourquoi">
      <h2><span class="num">2</span> Vous, l'interlocuteur</h2>
      ${champ('interlocuteur_prenom', 'Votre prénom', { aide: 'S\'affiche dans : « C\'est [prénom] que vous appelez ».' })}
      <div class="champ"><label>Votre photo (de face ou sur un chantier)</label>${zonePhoto('interlocuteur_photo', s.interlocuteur_photo, { titre: 'Votre photo' })}<p class="aide">Une vraie photo rassure. Sans photo, le bloc reste en texte seul.</p></div>
      ${champ('interlocuteur_phrase', 'Votre phrase, avec vos mots', { lignes: 3, placeholder: 'Ex. : Je suis sur chaque chantier, du premier rendez-vous à la fin.' })}
    </section>
    <section class="bloc" data-cible="contact">
      <h2><span class="num">3</span> Pour vous joindre</h2>
      ${champ('telephone', 'Téléphone', { type: 'tel', placeholder: '06 12 34 56 78' })}
      ${champ('email', 'E-mail', { type: 'email' })}
      ${champ('zone', 'Zone d\'intervention')}
      ${champ('horaires', 'Horaires')}
    </section>
    <section class="bloc" data-cible="instagram">
      <h2><span class="num">4</span> Instagram</h2>
      ${champ('instagram_url', 'Lien de votre compte Instagram', { type: 'url', placeholder: 'https://www.instagram.com/…' })}
      ${champ('behold_feed_id', 'Identifiant du flux Behold', { aide: 'Pour afficher vos dernières publications (behold.so, gratuit). Vide = section cachée.' })}
    </section>
    <details class="bloc">
      <summary>Réglages techniques (à toucher rarement)</summary>
      ${champ('formulaire_url', 'Adresse du script d\'envoi des devis', { type: 'url', aide: 'Adresse en /exec du script Google (voir le guide). Vide = le formulaire ouvre la messagerie du visiteur.' })}
      ${champ('site_url', 'Adresse du site', { type: 'url', placeholder: 'https://www.facon-degremont.fr', aide: 'Sert à Google (plan du site).' })}
    </details>`,
  });
  lier(vue, s);
  brancherPhotos(vue, { interlocuteur_photo: (p) => { s.interlocuteur_photo = p; } }, () => s.interlocuteur_prenom || 'interlocuteur');
  vue.addEventListener('focusin', (e) => {
    const c = e.target.closest('[data-cible]')?.dataset.cible;
    if (c && cibleApercu?.hash !== c) { cibleApercu = { hash: c }; rafraichirApercu(); }
  });
  brancherApercu({ hash: 'metiers' });
}

/* ----- Mon accès (changer le mot de passe) ----- */

function vueAcces() {
  const vue = page({
    titre: 'Mon accès',
    retour: '#/',
    contenu: `<form class="bloc" id="form-acces">
      <h2>Changer de mot de passe</h2>
      ${champ('identifiant', 'Identifiant')}
      ${champ('mdp', 'Nouveau mot de passe', { type: 'password', aide: '12 caractères minimum. Une phrase facile à retenir marche très bien : « carrelage-bleu-sous-la-pluie ».' })}
      ${champ('mdp2', 'Le même, une deuxième fois', { type: 'password' })}
      <button class="bouton" type="submit">Enregistrer le nouveau mot de passe</button>
    </form>`,
  });
  const v = { identifiant: sessionLue()?.identifiant || '', mdp: '', mdp2: '' };
  lier(vue, v);
  majBarre();
  $('#form-acces').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (v.mdp.length < 12) return toast('Mot de passe trop court : 12 caractères minimum.', 'err');
    if (v.mdp !== v.mdp2) return toast('Les deux mots de passe ne sont pas identiques.', 'err');
    try {
      await enregistrerAcces(ETAT.backend, v.identifiant.trim(), v.mdp);
      toast('Mot de passe changé. Il marchera partout dans 1 à 2 minutes.');
      location.hash = '#/';
    } catch {
      toast('Échec de l\'enregistrement. Réessayez.', 'err');
    }
  });
}

/* ================= Navigation ================= */

// Une fiche ajoutée puis abandonnée sans rien écrire disparaît toute seule : pas de brouillon vide à trier.
function nettoyerVides() {
  const d = ETAT.data;
  const garde = ETAT.garder;
  d.realisations.items = d.realisations.items.filter((r) => r === garde || r.titre?.trim() || r.type?.trim() || r.lieu?.trim() || r.avant || r.apres || r.photos?.length);
  d.avis.items = d.avis.items.filter((x) => x === garde || x.prenom?.trim() || x.lieu?.trim() || x.texte?.trim());
  d.articles = d.articles.filter((x) => x === garde || !x.neuf || x.titre?.trim() || x.description?.trim() || x.image || x.corps?.trim());
}

function route() {
  if (!ETAT.data) return;
  const [, section = '', id] = location.hash.replace(/^#/, '').split('/');
  if (!(id !== undefined && ['chantiers', 'conseils', 'avis'].includes(section))) ETAT.garder = null;
  nettoyerVides();
  majBarre();
  cibleApercu = null;
  ({
    '': vueAccueil,
    chantiers: () => (id ? vueChantier(id) : vueChantiers()),
    metiers: () => (id ? vueMetier(id) : vueMetiers()),
    conseils: () => (id ? vueConseil(decodeURIComponent(id)) : vueConseils()),
    avis: () => (id ? vueUnAvis(id) : vueAvis()),
    coordonnees: vueCoordonnees,
    acces: vueAcces,
  }[section] || vueAccueil)();
}
addEventListener('hashchange', route);
addEventListener('beforeunload', (e) => { if (ETAT.data && modifications().length) { e.preventDefault(); e.returnValue = ''; } });

/* ================= Connexion ================= */

const CLE_SESSION = 'fd-admin-session';
function sessionLue() {
  try { return JSON.parse(sessionStorage.getItem(CLE_SESSION) || localStorage.getItem(CLE_SESSION) || 'null'); } catch { return null; }
}
function sessionEcrite(s, garder) {
  try { (garder ? localStorage : sessionStorage).setItem(CLE_SESSION, JSON.stringify(s)); } catch { /* navigation privée */ }
}
function deconnexion() {
  if (ETAT.data && modifications().length && !confirm('Des modifications ne sont pas publiées. Se déconnecter quand même ?')) return;
  try { sessionStorage.removeItem(CLE_SESSION); localStorage.removeItem(CLE_SESSION); } catch { /* rien */ }
  ETAT.data = null;
  ETAT.backend = null;
  location.hash = '';
  ecranConnexion();
}

async function lireAcces() {
  try {
    const r = await fetch('acces.json', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function enregistrerAcces(backend, identifiant, mdp) {
  const acces = (await lireAcces()) || {};
  const compte = { identifiant, ...(await chiffrer(backend.token, mdp)) };
  const comptes = (acces.comptes || []).filter((c) => c.identifiant.toLowerCase() !== identifiant.toLowerCase());
  const nouveau = { owner: backend.owner, repo: backend.repo, branch: backend.branch, comptes: [...comptes, compte] };
  await backend.commit([{ path: 'admin/acces.json', content: JSON.stringify(nouveau, null, 2) + '\n' }], `Accès à l'espace de gestion : ${identifiant}`);
}

async function ouvrir(backend) {
  app.innerHTML = '<p class="chargement">Chargement de votre site…</p>';
  ETAT.backend = backend;
  ETAT.data = await chargerTout(backend);
  ETAT.saved = clone(ETAT.data);
  route();
}

function ecranSimple(contenu) {
  app.innerHTML = `<main class="ecran-connexion"><div class="carte-connexion">
    <img class="logo" src="../assets/logo/facon_degremont_logo.png" alt="Façon Degremont" width="170" height="170">
    ${contenu}
  </div></main>`;
}

async function ecranConnexion() {
  const acces = await lireAcces();
  const pret = acces?.comptes?.length;
  ecranSimple(`
    <h1>Espace de gestion</h1>
    ${pret ? `<form id="form-connexion" novalidate>
      <div class="champ"><label for="id">Identifiant</label><input id="id" autocomplete="username" autocapitalize="none" required></div>
      <div class="champ"><label for="mdp">Mot de passe</label>
        <div class="mdp"><input id="mdp" type="password" autocomplete="current-password" required><button type="button" id="voir" aria-label="Afficher le mot de passe">Voir</button></div></div>
      <label class="case"><input type="checkbox" id="garder"> Rester connecté sur cet appareil</label>
      <p class="erreur" id="erreur" role="alert"></p>
      <button class="bouton bouton-large" type="submit">Me connecter</button>
    </form>`
    : `<p class="sous-titre">L'accès n'est pas encore configuré.</p><a class="bouton bouton-large" href="#installer">Configurer l'accès</a>`}
    ${LOCAL ? '<button type="button" class="lien petit" id="local">Mode test : travailler sur les fichiers de cet ordinateur</button>' : ''}
    ${pret ? '<a class="lien petit" href="#installer">Installer ou ajouter un accès</a>' : ''}`);
  $('#voir')?.addEventListener('click', () => { const m = $('#mdp'); m.type = m.type === 'password' ? 'text' : 'password'; $('#voir').textContent = m.type === 'password' ? 'Voir' : 'Cacher'; });
  $('#local')?.addEventListener('click', modeLocal);
  $('#form-connexion')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#erreur');
    const bouton = e.target.querySelector('[type=submit]');
    const ident = $('#id').value.trim();
    const compte = acces.comptes.find((c) => c.identifiant.toLowerCase() === ident.toLowerCase());
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    err.textContent = '';
    try {
      if (!compte) throw new Error('mdp');
      let token;
      try { token = await dechiffrer(compte, $('#mdp').value); } catch { throw new Error('mdp'); }
      const s = { owner: acces.owner, repo: acces.repo, branch: acces.branch || 'main', token, identifiant: compte.identifiant };
      const b = new GitHub(s);
      await b.verifier();
      sessionEcrite(s, $('#garder').checked);
      await ouvrir(b);
    } catch (ex) {
      err.textContent = ex.message === 'mdp'
        ? 'Identifiant ou mot de passe incorrect.'
        : ex.status === 401 ? 'La clé GitHub a expiré : il faut la renouveler (« Installer ou ajouter un accès »).' : 'Connexion impossible. Vérifiez votre connexion internet.';
      bouton.disabled = false;
      bouton.textContent = 'Me connecter';
    }
  });
}

function ecranInstallation() {
  ecranSimple(`
    <h1>Installer l'accès</h1>
    <p class="sous-titre">Réservé à la personne qui met le site en ligne. À faire une fois, puis à chaque renouvellement de la clé GitHub.</p>
    <form id="form-install" class="install">
      <div class="champ"><label for="owner">Compte GitHub propriétaire du site</label><input id="owner" required placeholder="ex. facon-degremont"></div>
      <div class="champ"><label for="repo">Nom du dépôt</label><input id="repo" required placeholder="ex. site"></div>
      <div class="champ"><label for="branch">Branche</label><input id="branch" value="main" required></div>
      <div class="champ"><label for="jeton">Clé GitHub (« fine-grained token »)</label><input id="jeton" required autocomplete="off">
        <p class="aide">GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Dépôt : celui du site uniquement. Permission : <strong>Contents : Read and write</strong>. Durée : la plus longue proposée (noter la date).</p></div>
      <div class="champ"><label for="ident">Identifiant de connexion choisi</label><input id="ident" required placeholder="ex. patron" autocapitalize="none"></div>
      <div class="champ"><label for="mdp1">Mot de passe choisi</label><input id="mdp1" type="password" required autocomplete="new-password"><p class="aide">12 caractères minimum.</p></div>
      <div class="champ"><label for="mdp2">Le même, une deuxième fois</label><input id="mdp2" type="password" required autocomplete="new-password"></div>
      <p class="erreur" id="erreur" role="alert"></p>
      <button class="bouton bouton-large" type="submit">Vérifier et enregistrer</button>
    </form>
    <a class="lien petit" href="#">← Retour à la connexion</a>`);
  $('#form-install').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => $(`#${id}`).value.trim();
    const err = $('#erreur');
    if ($('#mdp1').value.length < 12) { err.textContent = 'Mot de passe trop court : 12 caractères minimum.'; return; }
    if ($('#mdp1').value !== $('#mdp2').value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
    const bouton = e.target.querySelector('[type=submit]');
    bouton.disabled = true;
    bouton.textContent = 'Vérification…';
    err.textContent = '';
    try {
      const s = { owner: v('owner'), repo: v('repo'), branch: v('branch') || 'main', token: v('jeton'), identifiant: v('ident') };
      const b = new GitHub(s);
      await b.verifier();
      await enregistrerAcces(b, s.identifiant, $('#mdp1').value);
      sessionEcrite(s, false);
      toast('Accès enregistré. L\'écran de connexion sera actif en ligne dans 1 à 2 minutes.', 'ok', 7000);
      history.replaceState(null, '', '#/');
      await ouvrir(b);
    } catch (ex) {
      err.textContent = ex.status === 404 ? 'Dépôt introuvable : vérifiez le compte, le nom du dépôt et les droits de la clé.'
        : ex.status === 401 ? 'Clé GitHub refusée : vérifiez-la.' : ex.status === 403 ? 'La clé n\'a pas le droit d\'écrire (Contents : Read and write).' : 'Échec. Vérifiez les informations et la connexion.';
      bouton.disabled = false;
      bouton.textContent = 'Vérifier et enregistrer';
    }
  });
}

async function modeLocal() {
  if (!window.showDirectoryPicker) { toast('Ce mode demande Chrome ou Edge sur ordinateur.', 'err'); return; }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    const b = new Local(dir);
    if (!(await b.read('content/site.json'))) { toast('Choisissez le dossier du site (celui qui contient « content »).', 'err', 6000); return; }
    await ouvrir(b);
    toast('Mode test : vos enregistrements modifient les fichiers de cet ordinateur.');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Dossier inaccessible.', 'err');
  }
}

async function demarrer() {
  if (location.hash === '#installer') return ecranInstallation();
  const s = sessionLue();
  if (s?.token) {
    try { await ouvrir(new GitHub(s)); return; } catch { /* clé expirée ou hors ligne */ }
  }
  ecranConnexion();
}
addEventListener('hashchange', () => {
  if (ETAT.data) return;
  if (location.hash === '#installer') ecranInstallation();
  else if (!location.hash || location.hash === '#') ecranConnexion();
});
if (LOCAL) window.__fdEtat = ETAT; // aide au test sur l'ordinateur
demarrer();
