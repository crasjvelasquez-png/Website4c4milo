// Run before the stylesheet so the first frame is ready to fade in.
// External script keeps this compatible with the site's script-src self policy.
document.documentElement.classList.add('player-reveal-ready');
window.addEventListener('load', () => {
  if (!document.querySelector('.progressive-player')) document.documentElement.classList.remove('player-reveal-ready');
});
if (window.IntersectionObserver && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('page-reveal-preparing');
  const restoreContent = () => document.documentElement.classList.remove('page-reveal-preparing');
  window.addEventListener('load', restoreContent, { once: true });
  // A failed or stalled application module must never leave content hidden.
  setTimeout(restoreContent, 2500);
}
