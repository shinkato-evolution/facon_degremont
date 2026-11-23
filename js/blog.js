// Menu mobile des pages du blog (la page d'accueil a le sien dans main.js).
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');
burger?.addEventListener('click', () => {
  const ouvert = burger.getAttribute('aria-expanded') !== 'true';
  burger.setAttribute('aria-expanded', ouvert);
  burger.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
  nav.classList.toggle('open', ouvert);
});
