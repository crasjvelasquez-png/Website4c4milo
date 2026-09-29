import { mountReleaseTeaser } from './release-teaser.js';
import { mountPlayer } from './audio-player.js';
document.documentElement.classList.remove('no-js');
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

// A nonmodal dialogue stays anchored to its cover while the page can scroll.
const mobilePicker = window.matchMedia('(max-width:760px)');
let activePicker = null;
function positionPicker() {
  if (!activePicker) return;
  const {trigger, picker} = activePicker;
  const rect = trigger.getBoundingClientRect();
  const width = picker.offsetWidth, height = picker.offsetHeight;
  const center = rect.left + rect.width / 2;
  const left = Math.max(16, Math.min(center - width / 2, window.innerWidth - width - 16));
  const top = mobilePicker.matches ? rect.bottom + 16 : rect.top - height - 16;
  picker.style.left = `${left + window.scrollX}px`;
  picker.style.top = `${Math.max(16, top + window.scrollY)}px`;
  picker.style.setProperty('--pointer-left', `${Math.max(20, Math.min(center - left, width - 20))}px`);
}
window.addEventListener('resize', positionPicker);
mobilePicker.addEventListener('change', positionPicker);
for (const trigger of document.querySelectorAll('[data-service-picker]')) {
  const picker = document.getElementById(trigger.dataset.servicePicker);
  if (!picker || typeof picker.showPopover !== 'function') continue;
  let openAtPointerDown = false;
  trigger.addEventListener('pointerdown', () => { openAtPointerDown = picker.matches(':popover-open'); });
  trigger.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const shouldClose = openAtPointerDown || picker.matches(':popover-open');
    openAtPointerDown = false;
    if (shouldClose) { if (picker.matches(':popover-open')) picker.hidePopover(); return; }
    picker.showPopover();
    activePicker = {trigger, picker};
    trigger.setAttribute('aria-expanded', 'true');
    positionPicker();
    picker.querySelector('a')?.focus({preventScroll:true});
    // Make room in the viewport without changing the above/below placement.
    const top = parseFloat(picker.style.top) - window.scrollY;
    const bottom = top + picker.offsetHeight;
    if (top < 16) window.scrollBy({top:top - 16,behavior:'instant'});
    else if (bottom > window.innerHeight - 16) window.scrollBy({top:bottom - window.innerHeight + 16,behavior:'instant'});
  });
  picker.querySelector('[data-close-picker]').addEventListener('click', () => picker.hidePopover());
  picker.addEventListener('toggle', event => {
    if (event.newState !== 'closed') return;
    trigger.setAttribute('aria-expanded', 'false');
    if (activePicker?.picker === picker) activePicker = null;
    if (picker.contains(document.activeElement) || document.activeElement === document.body) trigger.focus({preventScroll:true});
  });
}

const releaseTiles = [...document.querySelectorAll('[data-release-tile]')];
function closeReleaseTile(tile, restoreFocus = false) {
  const panel = tile.querySelector('.release-services');
  if (panel.hidden) return;
  panel.hidden = true;
  tile.classList.remove('is-open');
  const trigger = tile.querySelector('[data-inline-services]');
  trigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger.focus({preventScroll:true});
}
for (const tile of releaseTiles) {
  const trigger = tile.querySelector('[data-inline-services]');
  const panel = tile.querySelector('.release-services');
  trigger.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!panel.hidden) { closeReleaseTile(tile, true); return; }
    for (const other of releaseTiles) if (other !== tile) closeReleaseTile(other);
    panel.hidden = false;
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
