// Visionneuse plein écran : clavier (PC), balayage (mobile), boutons partout.
const dlg = document.getElementById('lightbox');
const img = document.getElementById('lb-img');
const cap = document.getElementById('lb-cap');
let liste = [];
let i = 0;

function afficher() {
  const p = liste[i];
  img.src = p.src;
  img.alt = p.legende || '';
  cap.textContent = p.legende || '';
  const plusieurs = liste.length > 1;
  dlg.querySelectorAll('.lb-nav').forEach((b) => (b.hidden = !plusieurs));
}

export function ouvrirGalerie(photos, depart = 0) {
  if (!photos.length) return;
  liste = photos;
  i = depart;
  afficher();
  if (!dlg.open) dlg.showModal();
}

function aller(pas) {
  i = (i + pas + liste.length) % liste.length;
  afficher();
}

dlg.addEventListener('click', (e) => {
  const action = e.target.closest('[data-lb]')?.dataset.lb;
  if (action === 'close') dlg.close();
  else if (action === 'prev') aller(-1);
  else if (action === 'next') aller(1);
  else if (e.target === dlg || e.target.tagName === 'FIGURE') dlg.close();
});

dlg.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') aller(-1);
  if (e.key === 'ArrowRight') aller(1);
});

let x0 = null;
dlg.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
dlg.addEventListener('touchend', (e) => {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0;
  if (Math.abs(dx) > 50) aller(dx < 0 ? 1 : -1);
  x0 = null;
});
