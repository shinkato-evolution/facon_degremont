// Façon Degremont — page d'accueil.
// Tous les contenus viennent de /content/*.json, modifiés depuis le back-office (/admin).
import { ouvrirGalerie } from './galerie.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// ?brouillon : la page est affichée dans l'aperçu du back-office, avec les contenus en cours de modification.
const brouillon = new URLSearchParams(location.search).has('brouillon');
const reduit = brouillon || matchMedia('(prefers-reduced-motion: reduce)').matches;

// Les chemins du back-office commencent par « / » : on les rend relatifs
// pour que le site marche aussi bien sur un domaine que dans un sous-dossier GitHub Pages.
const chemin = (p) => (p || '').replace(/^\/+/, '');
// Les photos d'origine ont une vignette « -mini » ; les photos envoyées depuis le back-office non.
const vignette = (p) => (/^assets\/photos\/.+\.webp$/.test(chemin(p)) ? chemin(p).replace(/\.webp$/, '-mini.webp') : chemin(p));
const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function charger(nom) {
  if (brouillon) {
    try { const b = parent.__fdBrouillon?.[nom]; if (b) return JSON.parse(JSON.stringify(b)); } catch { /* aperçu hors back-office */ }
  }
  try {
    const r = await fetch(`content/${nom}.json`, { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/* ---------- Menu mobile ---------- */
const burger = $('#burger');
const nav = $('#nav');
burger.addEventListener('click', () => {
  const ouvert = burger.getAttribute('aria-expanded') !== 'true';
  burger.setAttribute('aria-expanded', ouvert);
  burger.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
  nav.classList.toggle('open', ouvert);
});
// Le logo ramène tout en haut, en douceur, quel que soit le nombre de clics.
$('.brand').addEventListener('click', (e) => {
  e.preventDefault();
  nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false');
  scrollTo({ top: 0, behavior: reduit ? 'auto' : 'smooth' });
  history.replaceState(null, '', location.pathname + location.search);
});
$('.foot-logo')?.addEventListener('click', (e) => {
  e.preventDefault();
  scrollTo({ top: 0, behavior: reduit ? 'auto' : 'smooth' });
});
nav.addEventListener('click', (e) => {
  if (e.target.closest('a')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
});

/* ---------- Coordonnées et textes ---------- */
function appliquerSite(site) {
  if (!site) return;
  $$('[data-c]').forEach((el) => { if (site[el.dataset.c]) el.textContent = site[el.dataset.c]; });
  const tel = (site.telephone || '').replace(/[^\d+]/g, '');
  $$('[data-tel]').forEach((a) => (a.href = `tel:${tel}`));
  $$('[data-c-tel]').forEach((el) => (el.textContent = site.telephone));
  $$('[data-mail]').forEach((a) => (a.href = `mailto:${site.email}`));
  if (site.instagram_url) $('#insta-link').href = site.instagram_url;
  // L'interlocuteur : photo et phrase n'apparaissent que si elles sont renseignées.
  if (site.interlocuteur_photo) {
    $('#boss-photo').src = chemin(site.interlocuteur_photo);
    $('#boss-photo').alt = site.interlocuteur_prenom || '';
    $('#boss').hidden = false;
  }
  if (site.interlocuteur_phrase) {
    $('#why-quote').textContent = `« ${site.interlocuteur_phrase} »`;
    $('#why-quote').hidden = false;
  }
}

/* ---------- Maison 3D + panneau métier ---------- */
const stage = $('#stage');
const panel = $('#panel');
let metiers = {};
let maison = null;
let actif = null;

function remplirPanneau(id) {
  const m = metiers[id];
  if (!m) return;
  $('#panel-title').textContent = m.nom;
  $('#panel-text').textContent = m.promesse;
  const photos = (m.photos || []).filter((p) => p.image);
  $('#panel-photos').innerHTML = photos
    .map((p, n) => `<button class="ph" data-n="${n}" aria-label="Agrandir : ${echapper(p.legende)}"><img src="${vignette(p.image)}" alt="${echapper(p.legende)}" loading="lazy" width="600" height="800"><span>${echapper(p.legende)}</span></button>`)
    .join('');
  $('#panel-photos').onclick = (e) => {
    const b = e.target.closest('.ph');
    if (b) ouvrirGalerie(photos.map((p) => ({ src: chemin(p.image), legende: p.legende })), +b.dataset.n);
  };
}

// PC : le panneau recouvre la droite de la scène. La scène garde sa taille (pas de coupure),
// la caméra décale simplement la maison dans l'espace resté libre, en douceur.
function calerMaison() {
  if (!maison) return;
  const libre = actif && innerWidth >= 960 ? stage.clientWidth - panel.offsetLeft + 12 : 0;
  maison.setInset(Math.max(0, libre));
}
addEventListener('resize', calerMaison);

function choisir(id) {
  if (actif === id) return fermer();
  actif = id;
  $$('.chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.metier === id));
  remplirPanneau(id);
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add('show'));
  stage.classList.add('has-focus');
  calerMaison();
  maison?.focus(id);
  // Sur mobile, on garde la maison visible au-dessus du tiroir.
  if (innerWidth < 960) stage.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' });
}

function fermer() {
  actif = null;
  $$('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  panel.classList.remove('show');
  stage.classList.remove('has-focus');
  setTimeout(() => { if (!actif) panel.hidden = true; }, 450);
  calerMaison();
  maison?.reset();
}

$$('.chip').forEach((c) => c.addEventListener('click', () => choisir(c.dataset.metier)));
$('#panel-close').addEventListener('click', fermer);
$('#panel-devis').addEventListener('click', fermer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && actif && !$('#lightbox').open) fermer(); });

async function lancer3D() {
  try {
    const mod = await import('./maison3d.js');
    if (!mod.webglDisponible()) throw new Error('WebGL indisponible');
    maison = mod.initMaison($('#maison'), { reducedMotion: reduit, onSelect: choisir });
  } catch (err) {
    console.warn('Maison 3D désactivée :', err.message);
    document.documentElement.classList.add('no-3d');
    $('#stage-hint').textContent = 'Choisissez un métier pour voir nos chantiers';
  }
}

/* ---------- Réalisations (avant / après) ---------- */
function rendreRealisations(data) {
  const items = (data?.items || []).filter((r) => r.visible !== false);
  $('#works-grid').innerHTML = items
    .map((r, n) => {
      const ba = r.avant && r.apres;
      const visuel = ba
        ? `<div class="ba" style="--x:50%">
             <img src="${vignette(r.avant)}" alt="Avant : ${echapper(r.titre)}" loading="lazy" width="600" height="750">
             <img class="ba-after" src="${vignette(r.apres)}" alt="Après : ${echapper(r.titre)}" loading="lazy" width="600" height="750">
             <span class="ba-line"></span><span class="ba-tag l">Après</span><span class="ba-tag r">Avant</span>
             <input type="range" min="0" max="100" value="50" aria-label="Comparer avant et après : ${echapper(r.titre)}">
           </div>`
        : `<div class="ba"><img src="${vignette(r.apres || r.avant || r.photos?.[0]?.image)}" alt="${echapper(r.titre)}" loading="lazy"></div>`;
      return `<article class="work reveal">${visuel}
        <div class="work-body">
          <p class="work-type">${echapper(r.type)}</p>
          <h3>${echapper(r.titre)}</h3>
          <p class="work-lieu">${echapper(r.lieu)}</p>
          <button class="work-more" data-n="${n}">Voir les photos</button>
        </div></article>`;
    })
    .join('');

  // Trois chantiers d'abord, le reste sur demande (moins de défilement sur téléphone).
  const cartesReal = $$('#works-grid .work');
  if (cartesReal.length > 3) {
    cartesReal.slice(3).forEach((c) => (c.hidden = true));
    const btn = $('#works-all');
    btn.hidden = false;
    btn.onclick = () => { cartesReal.forEach((c) => { c.hidden = false; c.classList.add('on'); }); btn.hidden = true; };
  }

  $$('#works-grid .ba input').forEach((inp) => {
    const ba = inp.parentElement;
    inp.addEventListener('input', () => ba.style.setProperty('--x', `${inp.value}%`));
  });
  $('#works-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.work-more');
    if (!b) return;
    const r = items[+b.dataset.n];
    const photos = [
      r.avant && { src: chemin(r.avant), legende: `Avant — ${r.titre}` },
      r.apres && { src: chemin(r.apres), legende: `Après — ${r.titre}` },
      ...(r.photos || []).filter((p) => p.image).map((p) => ({ src: chemin(p.image), legende: p.legende || r.titre })),
    ].filter(Boolean);
    ouvrirGalerie(photos, r.apres ? 1 : 0);
  });

  // Petit indice de geste : le curseur bouge une fois à l'arrivée de la première carte.
  if (!reduit) {
    const premier = $('#works-grid .ba[style]');
    if (premier) {
      new IntersectionObserver((ent, obs) => {
        if (!ent[0].isIntersecting) return;
        obs.disconnect();
        const inp = $('input', premier);
        const t0 = performance.now();
        const anim = (t) => {
          const k = Math.min((t - t0) / 1600, 1);
          const v = 50 + Math.sin(k * Math.PI * 2) * 22 * (1 - k);
          inp.value = v;
          premier.style.setProperty('--x', `${v}%`);
          if (k < 1) requestAnimationFrame(anim);
        };
        requestAnimationFrame(anim);
      }, { threshold: 0.6 }).observe(premier);
    }
  }
}

/* ---------- Avis ---------- */
function rendreAvis(data) {
  // Aperçu du design avec les avis d'exemple : ajouter ?apercu à l'adresse du site.
  const apercu = new URLSearchParams(location.search).has('apercu');
  const items = (data?.items || []).filter((a) => (apercu || a.visible !== false) && a.texte).slice(0, 5);
  if (!items.length) return;
  const sec = $('#avis');
  sec.hidden = false;
  const track = $('#reviews-track');
  track.innerHTML = items
    .map((a) => `<figure class="review"><blockquote>${echapper(a.texte)}</blockquote><figcaption>${echapper(a.prenom)}${a.lieu ? ` <span>— ${echapper(a.lieu)}</span>` : ''}</figcaption></figure>`)
    .join('');
  const dots = $('#reviews-dots');
  dots.innerHTML = items.map((_, n) => `<button aria-label="Avis ${n + 1}"></button>`).join('');
  const cartes = $$('.review', track);
  const aller = (n) => track.scrollTo({ left: cartes[n].offsetLeft - track.offsetLeft - (track.clientWidth - cartes[n].clientWidth) / 2, behavior: reduit ? 'auto' : 'smooth' });
  let courant = 0;
  const majPoints = () => $$('button', dots).forEach((b, n) => b.setAttribute('aria-current', n === courant));
  dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { pause = true; aller($$('button', dots).indexOf(b)); } });
  track.addEventListener('scroll', () => {
    const milieu = track.scrollLeft + track.clientWidth / 2;
    courant = cartes.reduce((best, c, n) => (Math.abs(c.offsetLeft - track.offsetLeft + c.clientWidth / 2 - milieu) < Math.abs(cartes[best].offsetLeft - track.offsetLeft + cartes[best].clientWidth / 2 - milieu) ? n : best), 0);
    majPoints();
  }, { passive: true });
  majPoints();
  // Défilement automatique, arrêté dès que le visiteur touche aux avis.
  let pause = reduit;
  ['pointerdown', 'focusin', 'wheel'].forEach((ev) => track.addEventListener(ev, () => (pause = true), { passive: true }));
  setInterval(() => {
    if (pause || document.hidden || items.length < 2) return;
    const r = track.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    aller((courant + 1) % items.length);
  }, 6000);
}

/* ---------- Blog : les 3 derniers articles (liste générée à la mise en ligne) ---------- */
async function rendreBlog() {
  try {
    const r = await fetch('blog/articles.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const posts = (await r.json()).slice(0, 3);
    if (!posts.length) return;
    $('#blog-grid').innerHTML = posts
      .map((p) => `<a class="post-card reveal" href="blog/${encodeURIComponent(p.slug)}/">
          ${p.image ? `<img src="${echapper(chemin(p.image))}" alt="" loading="lazy" width="640" height="400">` : ''}
          <span class="pc-body"><span class="post-date">${echapper(p.date_fr)}</span><strong>${echapper(p.titre)}</strong><span>${echapper(p.description)}</span></span>
        </a>`)
      .join('');
    $('#blog').hidden = false;
    observerApparitions();
  } catch { /* pas de blog : la section reste masquée */ }
}

/* ---------- Instagram (flux Behold lu en JSON : aucun script tiers) ---------- */
async function rendreInstagram(site) {
  const box = $('#insta-feed');
  const vide = () => (box.innerHTML = `<p class="insta-empty">Retrouvez nos chantiers en cours sur <a href="${echapper(site?.instagram_url || 'https://www.instagram.com/')}" target="_blank" rel="noopener">Instagram</a>.</p>`);
  if (!site?.behold_feed_id) return; // section masquée tant qu'aucun flux n'est branché
  $('#instagram').hidden = false;
  try {
    const r = await fetch(`https://feeds.behold.so/${encodeURIComponent(site.behold_feed_id)}`);
    const json = await r.json();
    const posts = (Array.isArray(json) ? json : json.posts || []).slice(0, 6);
    if (!posts.length) return vide();
    box.innerHTML = posts
      .map((p) => {
        const src = p.sizes?.medium?.mediaUrl || p.thumbnailUrl || p.mediaUrl;
        const texte = (p.prunedCaption || p.caption || 'Publication Instagram').slice(0, 120);
        return `<a href="${echapper(p.permalink)}" target="_blank" rel="noopener"><img src="${echapper(src)}" alt="${echapper(texte)}" loading="lazy" width="300" height="300"></a>`;
      })
      .join('');
  } catch {
    vide();
  }
}

/* ---------- Formulaire de devis (script Google : envoi par e-mail) ---------- */
function brancherFormulaire(site) {
  const form = $('#form');
  const statut = $('#form-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    statut.className = 'form-status';
    let ok = true;
    $$('input[required]', form).forEach((inp) => {
      const vide = inp.type === 'checkbox' ? !inp.checked : !inp.value.trim();
      inp.setAttribute('aria-invalid', vide);
      if (vide) ok = false;
    });
    if (!ok) {
      statut.textContent = 'Merci de remplir votre nom, votre téléphone et de cocher la case d\'accord.';
      statut.classList.add('err');
      $('[aria-invalid="true"]', form)?.focus();
      return;
    }
    const donnees = new FormData(form);
    const travaux = donnees.getAll('travaux').join(', ');
    donnees.delete('travaux');
    donnees.set('travaux', travaux || 'Non précisé');

    if (!site?.formulaire_url) {
      // Pas encore de clé : on ouvre la messagerie du visiteur avec le message prérempli.
      const corps = [...donnees.entries()].filter(([k]) => !['subject', 'botcheck'].includes(k)).map(([k, v]) => `${k} : ${v}`).join('\n');
      location.href = `mailto:${site?.email || ''}?subject=${encodeURIComponent('Demande de devis')}&body=${encodeURIComponent(corps)}`;
      return;
    }
    statut.textContent = 'Envoi en cours…';
    try {
      // Script Google (Apps Script) : envoie un e-mail mis en forme à la boîte Gmail de l'entreprise.
      const r = await fetch(site.formulaire_url, { method: 'POST', body: new URLSearchParams(donnees) });
      const res = await r.json();
      if (!res.ok) throw new Error(res.erreur);
      form.reset();
      statut.textContent = 'Merci ! Votre demande est bien partie. On vous rappelle très vite.';
      statut.classList.add('ok');
    } catch {
      statut.textContent = `L'envoi n'a pas fonctionné. Appelez-nous directement au ${site.telephone}.`;
      statut.classList.add('err');
    }
  });
}

/* ---------- Apparitions au défilement ---------- */
function observerApparitions() {
  const io = new IntersectionObserver((ent) => ent.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } }), { threshold: 0.2 });
  $$('.reveal, #steps-list').forEach((el) => (reduit ? el.classList.add('on') : io.observe(el)));
}

/* ---------- Démarrage ---------- */
lancer3D();
const [site, met, real, avis] = await Promise.all(['site', 'metiers', 'realisations', 'avis'].map(charger));
appliquerSite(site);
metiers = met || {};
rendreRealisations(real);
rendreAvis(avis);
rendreBlog();
rendreInstagram(site);
brancherFormulaire(site);
observerApparitions();
if (brouillon) {
  // Aperçu du back-office : on se place directement sur la partie modifiée.
  const cible = location.hash && document.querySelector(location.hash);
  // scrollTo plutôt que scrollIntoView : ne fait pas défiler la page du back-office autour de l'aperçu.
  if (cible) requestAnimationFrame(() => scrollTo(0, cible.getBoundingClientRect().top + scrollY - 70));
  const metier = new URLSearchParams(location.search).get('metier');
  if (metier) setTimeout(() => choisir(metier), 400);
}
