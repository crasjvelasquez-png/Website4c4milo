// Spotify one-click save via Authorization Code + PKCE (no client secret needed).
// Clicking a Spotify logo saves that album/track to the listener's library,
// then opens Spotify as before. Other services expose no public web save API,
// so their links keep opening normally.
const TOKEN_KEY = 'c4milo_spotify_token';
const VERIFIER_KEY = 'c4milo_spotify_verifier';
const STATE_KEY = 'c4milo_spotify_state';
const PENDING_KEY = 'c4milo_spotify_pending';
const SCOPES = 'user-library-modify';

function statusEl() { return document.querySelector('[data-spotify-save-status]'); }

function say(message, href) {
  const el = statusEl();
  if (!el) return;
  el.replaceChildren();
  if (!message) { el.hidden = true; return; }
  el.hidden = false;
  el.append(message);
  if (href) {
    el.append(' ');
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open Spotify';
    el.append(link);
  }
}

function loadToken() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null'); }
  catch { return null; }
}

function storeToken(data) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? loadToken()?.refresh_token ?? null,
    expires_at: Date.now() + Math.max(0, (data.expires_in ?? 3600) - 60) * 1000,
  }));
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(b => chars[b % chars.length]).join('');
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function redirectUri() { return `${location.origin}${location.pathname}`; }

async function startAuth(clientId) {
  const verifier = randomString(64);
  const state = `spotify-save:${randomString(16)}`;
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    redirect_uri: redirectUri(),
    state,
  });
  location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchange(clientId, body) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...body }),
  });
  if (!response.ok) throw new Error(`token exchange failed: ${response.status}`);
  return response.json();
}

async function ensureToken(clientId) {
  const token = loadToken();
  if (token?.access_token && token.expires_at > Date.now()) return token.access_token;
  if (token?.refresh_token) {
    try {
      const data = await exchange(clientId, { grant_type: 'refresh_token', refresh_token: token.refresh_token });
      storeToken(data);
      return data.access_token;
    } catch { localStorage.removeItem(TOKEN_KEY); }
  }
  return null;
}

async function putLibrary(accessToken, uri) {
  return fetch(`https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(uri)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function saveUri(clientId, uri) {
  let accessToken = await ensureToken(clientId);
  if (!accessToken) return 'auth';
  let response;
  try { response = await putLibrary(accessToken, uri); }
  catch { return 'network'; }
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    accessToken = await ensureToken(clientId);
    if (!accessToken) return 'auth';
    try { response = await putLibrary(accessToken, uri); }
    catch { return 'network'; }
  }
  if (response.ok) return 'saved';
  if (response.status === 401 || response.status === 403) return 'denied';
  return 'network';
}

async function handleCallback(clientId) {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (!code && !error) return;
  if (!state?.startsWith('spotify-save:')) return;
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  history.replaceState(null, '', url);
  if (error) { say('Spotify connection cancelled — links still open normally.'); return; }
  if (sessionStorage.getItem(STATE_KEY) !== state) return;
  sessionStorage.removeItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier) return;
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null'); }
  catch { pending = null; }
  sessionStorage.removeItem(PENDING_KEY);
  try {
    storeToken(await exchange(clientId, {
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: verifier,
    }));
  } catch { say('Spotify connection failed — links still open normally.', pending?.href); return; }
  if (!pending?.uri) { say('Spotify connected ✓ Next Spotify tap saves automatically.'); return; }
  const result = await saveUri(clientId, pending.uri);
  if (result === 'saved') say('Saved to your Spotify library ✓', pending.href);
  else say('Spotify connected, but auto-save was blocked — open Spotify and tap ♥.', pending.href);
}

export async function mountSpotifySave() {
  let clientId = '';
  try {
    const response = await fetch('/spotify-config.json');
    if (response.ok) clientId = (await response.json()).clientId ?? '';
  } catch { clientId = ''; }
  if (!clientId) return;
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  await handleCallback(clientId);
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[data-spotify-uri]');
    if (!anchor) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    // Never block navigation: the browser opens the Spotify album/app tab first.
    // The save runs in the background; OAuth consent (if needed) happens in this
    // tab only after the album tab is already open.
    const uri = anchor.dataset.spotifyUri;
    const href = anchor.href;
    void (async () => {
      say('Saving to your Spotify library…');
      const result = await saveUri(clientId, uri);
      if (result === 'saved') { say('Saved to your Spotify library ✓'); return; }
      if (result === 'auth') {
        try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ uri, href })); }
        catch { say('Spotify needs permission — opened the album, tap ♥ to save.'); return; }
        say('Spotify needs permission — approving it saves the release automatically…');
        await startAuth(clientId);
        return;
      }
      say(result === 'denied'
        ? 'Spotify blocked the auto-save — tap ♥ in Spotify to save.'
        : 'Auto-save unavailable — tap ♥ in Spotify to save.');
    })();
  });
}
