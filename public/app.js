import { mountReleaseTeaser } from './release-teaser.js';
import { mountPlayer } from './audio-player.js';
import { mountSpotifySave } from './spotify-save.js';
document.documentElement.classList.remove('no-js');
function syncBackgroundMotion() {
  document.body.classList.toggle('background-paused', document.hidden);
}
document.addEventListener('visibilitychange', syncBackgroundMotion);
syncBackgroundMotion();
const pageReveal = document.documentElement.classList.contains('page-reveal-preparing')
  && window.IntersectionObserver
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (pageReveal) {
  const revealableSections = [...document.querySelectorAll('main > section, body > footer')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const observer = new IntersectionObserver(entries => {
    const entering = entries.filter(entry => entry.isIntersecting)
      .sort((a, b) => revealableSections.indexOf(a.target) - revealableSections.indexOf(b.target));
    for (const [index, entry] of entering.entries()) {
      entry.target.style.setProperty('--reveal-delay', `${Math.min(index * 110, 330)}ms`);
      entry.target.classList.add('is-page-revealed');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -32px 0px', threshold: 0 });
  for (const section of revealableSections) observer.observe(section);
  document.documentElement.classList.replace('page-reveal-preparing', 'page-reveal-running');
  document.addEventListener('focusin', event => {
    const section = revealableSections.find(section => section.contains(event.target));
    if (!section) return;
    // Keep it visible after focus leaves, without restarting the entrance.
    section.style.animation = 'none';
    section.classList.add('is-page-revealed');
    observer.unobserve(section);
  });
  function stopRevealForReducedMotion(event) {
    if (!event.matches) return;
    document.documentElement.classList.remove('page-reveal-preparing', 'page-reveal-running');
    observer.disconnect();
  }
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', stopRevealForReducedMotion);
  else reducedMotion.addListener(stopRevealForReducedMotion);
}
const tabs = [...document.querySelectorAll('[role=tab]')];
function selectTab(tab, focus = false) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    let index = tabs.indexOf(tab);
    index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(tabs[index], true);
  });
}

for (const button of document.querySelectorAll('[data-embed]')) button.addEventListener('click', () => {
  const iframe = document.createElement('iframe');
  iframe.src = button.dataset.embed;
  iframe.title = `${button.dataset.title} · ${button.dataset.provider} player`;
  iframe.height = button.dataset.provider === 'spotify' ? '352' : button.dataset.provider === 'youtube' ? '315' : '166';
  iframe.dataset.provider = button.dataset.provider;
  iframe.allow = 'encrypted-media; fullscreen; picture-in-picture';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  button.replaceWith(iframe);
});

const status = document.getElementById('listening-status');
function row(primary, secondary, note, url) {
  const li = document.createElement('li');
  const div = document.createElement('div');
  const strong = document.createElement('strong');
  const anchor = document.createElement('a');
  strong.textContent = primary;
  try {
    const safe = new URL(url);
    if (safe.protocol === 'https:' && safe.hostname === 'www.last.fm') { anchor.href = safe.href; anchor.append(strong); div.append(anchor); }
    else div.append(strong);
  } catch { div.append(strong); }
  if (secondary) { const small = document.createElement('small'); small.textContent = secondary; div.append(small); }
  const meta = document.createElement('span'); meta.className = 'muted'; meta.textContent = note;
  li.append(div, meta);
  return li;
}
async function updateListening() {
  if (!status) return;
  try {
    const configResponse = await fetch('/listening-config.json');
    if (!configResponse.ok) throw new Error('Configuration unavailable');
    const config = await configResponse.json();
    if (config.demo) return;
    const response = await fetch('/api/listening');
    if (!response.ok) throw new Error('Listening unavailable');
    const data = await response.json();
    if (data.status === 'unconfigured') { status.textContent = 'Listening activity is not connected yet.'; return; }
    const recent = document.getElementById('recent-list'), top = document.getElementById('top-list');
    recent.replaceChildren(...data.recent.map(track => row(track.title, track.artist, track.nowPlaying ? (data.status === 'stale' ? 'Playing at last update' : 'Now playing') : track.timestamp ? new Date(track.timestamp * 1000).toLocaleString(undefined, {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '', track.url)));
    top.replaceChildren(...data.top.map(artist => row(artist.name, '', `${artist.plays} plays`, artist.url)));
    status.textContent = data.status === 'stale' ? 'Last.fm is unavailable. Showing the last saved update.' : !data.recent.length && !data.top.length ? 'No listening activity yet.' : `Updated ${new Date(data.updatedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}. Top artists: ${data.periodLabel}.`;
    if (!data.recent.length) recent.append(row('No recent tracks', '', '', ''));
    if (!data.top.length) top.append(row('No top artists for this period', '', '', ''));
  } catch { status.textContent = 'Listening activity is temporarily unavailable. Please try again later.'; }
}
updateListening();

for (const root of document.querySelectorAll('[data-audio-player]')) mountPlayer(root);

const releaseTiles = [...document.querySelectorAll('[data-release-tile]')];
const releaseClosures = new WeakMap();
function closeReleaseTile(tile, restoreFocus = false) {
  const panel = tile.querySelector('.release-services');
  if (panel.hidden || !tile.classList.contains('is-open')) return;
  const closing = {};
  releaseClosures.set(tile, closing);
  const focusInside = panel.contains(document.activeElement);
  panel.inert = true;
  tile.classList.remove('is-open');
  const trigger = tile.querySelector('[data-inline-services]');
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus || focusInside) trigger.focus({preventScroll:true});
  // Keep the panel painted through its exit; reopening invalidates this completion.
  Promise.allSettled(panel.getAnimations({subtree:true}).map(animation => animation.finished)).then(() => {
    if (releaseClosures.get(tile) === closing) panel.hidden = true;
  });
}
for (const tile of releaseTiles) {
  const trigger = tile.querySelector('[data-inline-services]');
  const panel = tile.querySelector('.release-services');
  trigger.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (tile.classList.contains('is-open')) { closeReleaseTile(tile, true); return; }
    for (const other of releaseTiles) if (other !== tile) closeReleaseTile(other);
    releaseClosures.delete(tile);
    panel.hidden = false;
    panel.inert = false;
    // Resolve the starting opacity before transitioning out of display:none.
    getComputedStyle(panel).opacity;
    tile.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    if (event.detail === 0) panel.querySelector('a')?.focus({preventScroll:true});
  });
  panel.querySelector('.release-services-close').addEventListener('click', () => closeReleaseTile(tile, true));
  panel.addEventListener('click', event => {
    if (!event.target.closest('a,button')) closeReleaseTile(tile, true);
  });
}
document.addEventListener('pointerdown', event => {
  for (const tile of releaseTiles) if (!tile.contains(event.target)) closeReleaseTile(tile);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  for (const tile of releaseTiles) if (!tile.querySelector('.release-services').hidden) {
    closeReleaseTile(tile, true);
    event.preventDefault();
  }
});

for (const teaser of document.querySelectorAll('[data-release-teaser]')) mountReleaseTeaser(teaser);
mountSpotifySave();
