import { readFile, mkdir, writeFile, cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { escape as e, externalUrl, assetUrl, embedUrl, validateContent } from '../lib/content.mjs';

export async function buildSite({ directory=fileURLToPath(new URL('../', import.meta.url)) } = {}) {
const root = resolve(directory) + sep;
let noiseVideo = '';
try { await access(`${root}public/assets/vhs-noise.mp4`); noiseVideo = '/assets/vhs-noise.mp4'; }
catch { /* Use the still texture until a noise loop is supplied. */ }
const c = validateContent(JSON.parse(await readFile(`${root}content.json`, 'utf8')));
const missingArtwork = new Set();
for (const r of c.releases) if (r.artwork) {
  try { await access(`${root}public${r.artwork}`); }
  catch {
    if (r.artworkOptional) missingArtwork.add(r.artwork);
    else throw new Error(`Missing artwork for ${r.id}: add public${r.artwork} or leave artwork blank.`);
  }
}
if (c.artist.photo) {
  try { await access(`${root}public${c.artist.photo}`); }
  catch { throw new Error(`Missing artist photo: add public${c.artist.photo} or leave photo blank.`); }
}
let upcomingCover = '';
if (c.upcomingRelease?.cover) {
  try { await access(`${root}public${c.upcomingRelease.cover}`); upcomingCover = c.upcomingRelease.cover; }
  catch { /* Keep the cover placeholder until the artwork is supplied. */ }
}

let upcomingAudio = '';
if (c.upcomingRelease?.audio) {
  try { await access(`${root}public${c.upcomingRelease.audio}`); upcomingAudio = c.upcomingRelease.audio; }
  catch { /* Playback and download stay unavailable until the MP3 is supplied. */ }
}

const availableAudio = new Set();
for (const r of c.releases) if (r.audio?.src) {
  try { await access(`${root}public${r.audio.src}`); availableAudio.add(r.id); }
  catch { /* A local drop-in file can be supplied later. */ }
}
function tapePlayer(r) {
  const ready = availableAudio.has(r.id);
  return `<div class="tape-player" data-audio-player data-fade-in="${r.audio.fadeIn ?? 1}" data-fade-out="${r.audio.fadeOut ?? 1.5}">
    <div class="tape-main"><span class="audio-time" role="timer" aria-label="Elapsed time: 0:00"><span data-time-minutes aria-hidden="true">0</span><span class="audio-time-colon" aria-hidden="true">:</span><span data-time-seconds aria-hidden="true">00</span></span><button class="audio-toggle" aria-label="Play ${e(r.title)}" ${ready ? '' : 'disabled'}><span data-play-symbol aria-hidden="true">▶</span></button><label class="audio-volume-label"><span class="sr-only">Volume</span><input class="audio-volume" type="range" min="0" max="1" step="0.01" value="0.8" aria-label="Volume" ${ready ? '' : 'disabled'}></label>
      <svg class="tape-loop" viewBox="0 0 600 140" aria-hidden="true">
        <!-- The continuous tape outline expands into the outer reel edges.
             Only the inner halves are added, so no stroke is hidden or doubled. -->
        <g class="tape-thread">
          <path class="tape-ribbon" d="M80 26 H520 A44 44 0 0 1 520 114 H80 A44 44 0 0 1 80 26 Z"/>
          <path class="tape-travel" pathLength="1200" d="M80 26 H520 A44 44 0 0 1 520 114 H80 A44 44 0 0 1 80 26 Z"/>
        </g>
        <g class="tape-guides">
          <path class="tape-inner-rim tape-inner-rim-left" pathLength="1" d="M80 26 A44 44 0 0 1 80 114"/>
          <path class="tape-inner-rim tape-inner-rim-right" pathLength="1" d="M520 114 A44 44 0 0 1 520 26"/>
          <g class="tape-reel-reveal" style="--reel-x:80px;--reel-y:70px"><g class="tape-reel"><path d="M80 32 V50 M47.09 89 L62.68 80 M112.91 89 L97.32 80"/><circle class="tape-hub" cx="80" cy="70" r="5"/></g></g>
          <g class="tape-reel-reveal" style="--reel-x:520px;--reel-y:70px"><g class="tape-reel"><path d="M520 32 V50 M487.09 89 L502.68 80 M552.91 89 L537.32 80"/><circle class="tape-hub" cx="520" cy="70" r="5"/></g></g>
        </g>
      </svg>
    </div>
    <p class="audio-status sr-only" role="status">${ready ? 'Ready to play' : 'Audio file pending'}</p>
    <audio preload="none" ${ready ? `src="${e(r.audio.src)}"` : ''}></audio>
    <noscript><p>Enable JavaScript to use the audio player.</p></noscript>
  </div>`;
}
function spotifyUri(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'open.spotify.com') return '';
    const match = /^\/(album|track|playlist|episode|show|audiobook)\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
    return match ? `spotify:${match[1]}:${match[2]}` : '';
  } catch { return ''; }
}
function logoLink(item) {
  const logos = {Spotify:'spotify', 'Apple Music':'applemusic', 'Amazon Music':'amazonmusic', 'YouTube Music':'youtubemusic', Pandora:'pandora',Bandcamp:'bandcamp',TikTok:'tiktok',Tidal:'tidal',Instagram:'instagram',YouTube:'youtube'};
  const logo = logos[item.label];
  const url = externalUrl(item.url);
  const icon = logo ? `<img src="/assets/logos/${logo}.svg" alt="" width="32" height="32">` : `<span aria-hidden="true">↗</span>`;
  const save = item.label === 'Spotify' && url ? spotifyUri(url) : '';
  const saveAttr = save ? ` data-spotify-uri="${e(save)}"` : '';
  return url ? `<a class="platform-logo floating-link" href="${e(url)}"${saveAttr} aria-label="${e(item.label)} (opens in a new tab)" target="_blank" rel="noopener noreferrer">${icon}</a>` : `<span class="platform-logo unavailable" role="img" aria-label="${e(item.label)} — link pending" title="${e(item.label)} — link pending">${icon}</span>`;
}

function image(path, alt, label, className = '', eager = false) {
  const src = missingArtwork.has(path) ? '' : assetUrl(path);
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const loaded = eager ? ' onload="this.classList.add(\'is-loaded\')" onerror="this.classList.add(\'is-loaded\')"' : '';
  return src ? `<img class="artwork ${className}" src="${e(src)}" alt="${e(alt)}" width="800" height="800" ${loading} decoding="async"${loaded}>` : `<div class="artwork empty-art ${className}" role="img" aria-label="${e(label)}"><span>${e(label)}</span><span class="asset-note">Image placeholder</span></div>`;
}
function link(item, row = false) {
  const url = externalUrl(item.url);
  const text = `<span>${e(item.label)}${row && item.description ? `<small>${e(item.description)}</small>` : ''}</span>${row ? `<span class="link-state">${url ? '↗' : 'Link placeholder'}</span>` : ''}`;
  return url ? `<a class="${row ? 'link-row' : 'text-link'}" href="${e(url)}" target="_blank" rel="noopener noreferrer">${text}<span class="sr-only"> (opens in a new tab)</span></a>` : `<span class="${row ? 'link-row missing-link' : 'text-link missing-link'}" aria-label="${e(item.label)}: link placeholder">${text}${!row ? '<small>Link placeholder</small>' : ''}</span>`;
}
function player(release) {
  const src = embedUrl(release.embed?.provider, release.embed?.url);
  return src ? `<div class="player-slot"><button type="button" class="load-player" data-embed="${e(src)}" data-provider="${e(release.embed.provider)}" data-title="${e(release.title)}">Load ${e(release.embed.provider)} player</button><p class="muted">Loads an external player when you choose. Playback stays under your control.</p></div>` : '<div class="player-placeholder"><span>Music player</span><small>Embed placeholder · Spotify / SoundCloud / YouTube</small></div>';
}
function releaseBody(r) { return `${r.description ? `<p>${e(r.description)}</p>` : ''}<div class="release-links">${(r.links ?? []).map(x => link(x)).join('')}</div>${r.audio ? '' : player(r)}`; }
const streamingServices = ['Spotify', 'Apple Music', 'Pandora', 'Tidal', 'YouTube Music'];
function inlineServicesId(r) { return `services-inline-${c.releases.indexOf(r)}`; }
function serviceLogoLinks(r) {
  return streamingServices.map(label => {
    const item = (r.links ?? []).find(item => item.label === label) || {label, url:''};
    const action = item.kind === 'search' ? `Search for ${r.title} by ${c.artist.name} on ${label}` : `Listen to ${r.title} on ${label}`;
    return logoLink(item).replace(`aria-label="${e(label)} (opens in a new tab)"`, `aria-label="${e(action)} (opens in a new tab)" title="${e(action)}"`);
  }).join('');
}
function releaseCover(r, featuredCover = false) {
  const src = missingArtwork.has(r.artwork) ? '' : assetUrl(r.artwork);
  const cover = featuredCover ? image(r.artwork, '', 'Release artwork', '', true) : src ? `<img class="artwork" src="${e(src)}" alt="" width="800" height="800" loading="lazy" decoding="async">` : `<span class="artwork cover-pending" aria-hidden="true"></span>`;
  if (featuredCover) return `<span class="featured-cover">${cover}</span>`;
  const destination = (r.links ?? []).map(item => externalUrl(item.url)).find(Boolean);
  const id = inlineServicesId(r);
  return `<div class="release-tile" data-release-tile><a class="release-cover floating-link" href="${e(destination || `#${id}`)}" data-inline-services="${id}" aria-expanded="false" aria-controls="${id}" aria-label="Show streaming services for ${e(r.title)}">${cover}</a><div class="release-services" id="${id}" role="group" aria-label="Streaming services for ${e(r.title)}" hidden><button type="button" class="release-services-close" aria-label="Close streaming services for ${e(r.title)}">×</button><div class="release-services-grid">${serviceLogoLinks(r)}</div></div></div>`;
}
const featured = c.releases.find(r => r.id === c.featuredReleaseId);
const placeholder = c.artist.placeholder || c.releases.some(r => r.placeholder) || (c.listening?.enabled && c.listening?.demo);
const streamingLogos = c.links.filter(x => x.label !== 'TikTok' && x.label !== 'Instagram');
const socialLogos = c.links.filter(x => x.label === 'TikTok' || x.label === 'Instagram');
const showSignup = c.signup?.enabled === true;
const html = `<!doctype html>
<html lang="en" class="no-js">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(c.artist.name)} · Music & links</title>
  <meta name="description" content="${e(c.artist.aboutEnabled !== false ? c.artist.bio : `Music and releases by ${c.artist.name}.`)}">
  ${placeholder ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <meta name="theme-color" content="#ffffff">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <script src="/motion-setup.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <script type="module" src="/app.js"></script>
</head>
<body>
  ${noiseVideo ? `<video class="vhs-noise-source" data-noise-video data-src="${noiseVideo}" muted loop playsinline preload="none" disablepictureinpicture disableremoteplayback aria-hidden="true" tabindex="-1"></video><canvas class="vhs-noise" data-noise-canvas aria-hidden="true"></canvas>` : ''}
  <a class="skip-link" href="#main">Skip to content</a>
  ${placeholder ? `<div class="preview-note" aria-hidden="true">${noiseVideo ? '<canvas class="vhs-noise-bar" data-noise-bar></canvas>' : ''}</div>` : ''}
  <main id="main">
    <section id="music" class="featured" aria-labelledby="featured-heading">
      ${featured ? `<div class="cassette-label">${releaseCover(featured, true)}<div class="featured-copy"><p class="section-label">${e(featured.statusLabel || `Featured release${featured.placeholder ? ' · Placeholder' : ''}`)}</p><h1 id="featured-heading">${e(featured.title)}</h1>${featured.audio ? `${featured.description ? `<p>${e(featured.description)}</p>` : ''}` : releaseBody(featured)}</div></div>${featured.audio ? tapePlayer(featured) : ''}<div class="cassette-base" aria-hidden="true"><i></i><i></i><i></i><i></i></div>` : '<h1 id="featured-heading">Music</h1><p>No releases yet.</p>'}
    </section>
    <section id="links" class="links-section" aria-labelledby="links-heading"><h2 id="links-heading">Listen on:</h2><div class="platform-logos">${streamingLogos.map(logoLink).join('')}</div><p class="save-status muted" data-spotify-save-status role="status" hidden></p></section>
    ${showSignup ? `<section id="early-listen" class="early-listen" aria-label="Next release preview" data-release-teaser>
      <div class="early-listen-panel">
        <p class="early-listen-invitation">Sign up to unlock the next single.</p>
        <div class="early-listen-copy">
        <form class="early-listen-form" data-preview-signup novalidate>
          <div class="signup-entry">
          <div class="signup-method" role="group" aria-label="Choose email or text updates">
            <button type="button" data-signup-method="email" aria-label="Use email" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg></button>
            <button type="button" data-signup-method="phone" aria-label="Use text messages" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg></button>
          </div>
          <label class="sr-only" for="early-listen-contact" data-contact-label>Your email address</label>
          <div class="early-listen-controls">
            <span class="country-code" hidden><label class="sr-only" for="early-listen-country">Country calling code</label><select id="early-listen-country" name="countryCode" autocomplete="tel-country-code"><option value="1">US +1</option><option value="1">Canada +1</option><option value="61">Australia +61</option><option value="55">Brazil +55</option><option value="33">France +33</option><option value="49">Germany +49</option><option value="91">India +91</option><option value="81">Japan +81</option><option value="52">Mexico +52</option><option value="64">New Zealand +64</option><option value="63">Philippines +63</option><option value="34">Spain +34</option><option value="44">United Kingdom +44</option></select></span>
            <input id="early-listen-contact" name="email" type="email" inputmode="email" autocomplete="email" placeholder="Your email" maxlength="254" required aria-describedby="early-listen-error">
            <button type="submit" aria-label="Subscribe to email updates"><span aria-hidden="true">→</span></button>
          </div>
          </div>
          <label class="signup-consent"><input name="consent" type="checkbox" required><span data-consent-copy>Send me occasional email updates about c4milo releases and shows. Unsubscribe anytime.</span></label>
          <div class="signup-honeypot" aria-hidden="true"><label for="signup-website">Leave this field empty</label><input id="signup-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
          <p id="early-listen-error" class="signup-error" role="alert" hidden></p>
          <p id="early-listen-note" class="signup-note" role="status" aria-live="polite" hidden></p>
        </form>
        <p class="signup-note signup-confirmed" data-signup-confirmed role="status" aria-live="polite" hidden></p>
        <noscript><p class="signup-note">Enable JavaScript to join the updates list.</p></noscript>
        </div>
        <div class="upcoming-preview">
          <div class="upcoming-cover" ${upcomingCover ? '' : 'role="img" aria-label="Cover art placeholder for the next release"'}>${upcomingCover ? `<img src="${e(upcomingCover)}" alt="How deep is your love? cover" width="800" height="800" loading="lazy">` : ''}</div>
          <div class="upcoming-identity" data-release-identity aria-hidden="true" inert>
            <h2 class="upcoming-title" id="upcoming-heading" tabindex="-1">How deep is your love? (Cover)</h2>
            <p class="upcoming-credit">by c4milo</p>
          </div>
        </div>
        <div class="upcoming-player" data-upcoming-player hidden>
          <audio preload="none" aria-labelledby="upcoming-heading" ${upcomingAudio ? `data-src="${e(upcomingAudio)}"` : ''}></audio>
          <div class="secret-transport">
            <button class="secret-toggle" type="button" aria-label="Play How deep is your love? (Cover)" aria-pressed="false" ${upcomingAudio ? '' : 'disabled'}><svg viewBox="0 0 24 24" aria-hidden="true"><path class="secret-play-icon" d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/><path class="secret-pause-icon" d="M9 5v14M16 5v14"/></svg></button>
            <div class="secret-progress"><input class="secret-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Seek in How deep is your love?" disabled></div>
            ${upcomingAudio ? `<a class="upcoming-download" href="${e(upcomingAudio)}" download="how-deep-is-your-love.mp3" aria-label="Download MP3" title="Download MP3">` : '<button class="upcoming-download" type="button" aria-label="Download MP3 (unavailable)" title="MP3 not available yet" disabled>'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/></svg>${upcomingAudio ? '</a>' : '</button>'}
          </div>
          <p class="sr-only" data-upcoming-audio-status role="status"></p>
        </div>
      </div>
    </section>` : ''}
    ${c.releases.some(r => r.id !== c.featuredReleaseId) ? `<section id="releases" aria-labelledby="releases-heading"><h2 id="releases-heading" class="sr-only">Other releases</h2><div class="release-covers">${c.releases.filter(r => r.id !== c.featuredReleaseId).map(r => releaseCover(r)).join('')}</div></section>` : ''}
    ${socialLogos.length ? `<section id="socials" class="socials-section" aria-label="Social media"><div class="social-logos">${socialLogos.map(logoLink).join('')}</div></section>` : ''}
    ${c.listening?.enabled ? `<section id="listening" aria-labelledby="listening-heading"><div class="section-heading"><h2 id="listening-heading">On my stereo</h2><span id="listening-source" class="muted">${c.listening.demo ? 'Placeholder data' : 'Last.fm'}</span></div><p id="listening-status" class="muted" role="status">${c.listening.demo ? 'Listening layout preview. No account connected.' : 'Loading listening activity…'}</p><div class="listening-tabs" role="tablist" aria-label="Listening activity"><button type="button" id="tab-recent" role="tab" aria-selected="true" aria-controls="panel-recent" data-tab="recent">Recent tracks</button><button type="button" id="tab-top" role="tab" aria-selected="false" aria-controls="panel-top" tabindex="-1" data-tab="top">Top artists</button></div><div id="panel-recent" role="tabpanel" aria-labelledby="tab-recent" tabindex="0"><ol id="recent-list" class="listening-list">${(c.listening.demo ? c.listening.recent : []).map(r=>`<li><div><strong>${e(r.title)}</strong><small>${e(r.artist)}</small></div><span class="muted">${e(r.note)}</span></li>`).join('')}</ol></div><div id="panel-top" role="tabpanel" aria-labelledby="tab-top" tabindex="0" hidden><p class="period muted">${c.listening.demo ? 'Time period placeholder' : `Period: ${e(c.listening.period)}`}</p><ol id="top-list" class="listening-list">${(c.listening.demo ? c.listening.top : []).map(r=>`<li><strong>${e(r.name)}</strong><span class="muted">${e(r.note)}</span></li>`).join('')}</ol></div><noscript><p>Listening tab switching and live updates need JavaScript. Artist music and links remain available.</p></noscript></section>` : ''}
    ${c.artist.aboutEnabled !== false ? `<section id="about" class="about-section" aria-labelledby="about-heading">${image(c.artist.photo, c.artist.photoAlt, 'Artist portrait', 'portrait')}<div><h2 id="about-heading">About ${e(c.artist.name)}</h2><p>${e(c.artist.bio)}</p>${/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(c.artist.email) ? `<a class="text-link" href="mailto:${e(c.artist.email)}">Contact ${e(c.artist.name)}</a>` : '<span class="muted">Contact email placeholder</span>'}</div></section>` : ''}
  </main>
  <footer><span>${e(c.artist.name)}</span><a href="#main" aria-label="Back to top" title="Back to top"><span aria-hidden="true">↑</span></a></footer>
</body></html>`;
await mkdir(`${root}dist`, { recursive: true });
await cp(`${root}public`, `${root}dist`, { recursive: true });
await writeFile(`${root}dist/index.html`, html.replace(/^ +$/gm, ''));
await writeFile(`${root}dist/listening-config.json`, JSON.stringify({demo:!!c.listening?.demo,period:c.listening?.period ?? '1month'}));
await writeFile(`${root}dist/spotify-config.json`, JSON.stringify({clientId:(process.env.SPOTIFY_CLIENT_ID ?? '').trim()}));
return { placeholder:!!placeholder, outputDirectory:`${root}dist` };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
await buildSite();
console.log('Built dist/ from content.json.');
}
