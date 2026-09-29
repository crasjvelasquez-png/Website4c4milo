const periods = { overall:'All time', '7day':'Last 7 days', '1month':'Last month', '3month':'Last 3 months', '6month':'Last 6 months', '12month':'Last year' };
const list = value => Array.isArray(value) ? value : value ? [value] : [];
const safeUrl = value => {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'www.last.fm' ? u.href : ''; } catch { return ''; }
};

export function createListeningService({ username='', apiKey='', period='1month', fetcher=fetch, now=Date.now, ttl=300000, retry=60000 } = {}) {
  let cache, expires=0, inFlight;
  async function call(method) {
    const url = new URL('https://ws.audioscrobbler.com/2.0/');
    url.search = new URLSearchParams({ method, user:username, api_key:apiKey, format:'json', limit:'6', period });
    const response = await fetcher(url, { signal:AbortSignal.timeout(8000), redirect:'error' });
    if (!response.ok) throw new Error('Last.fm request failed');
    const data = await response.json();
    if (data.error) throw new Error('Last.fm returned an error');
    return data;
  }
  return async function listening() {
    if (!username || !apiKey) return {status:'unconfigured', recent:[], top:[]};
    if (cache && now() < expires) return cache;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const [recent, top] = await Promise.all([call('user.getRecentTracks'),call('user.getTopArtists')]);
        if (!recent.recenttracks || !top.topartists) throw new Error('Invalid Last.fm response');
        cache = {
          status:'live', updatedAt:now(), periodLabel:periods[period] ?? periods['1month'],
          recent:list(recent.recenttracks.track).slice(0,6).map(t=>({ title:String(t.name ?? ''), artist:String(t.artist?.['#text'] ?? t.artist?.name ?? ''), nowPlaying:t['@attr']?.nowplaying === 'true', timestamp:Number(t.date?.uts) || null, url:safeUrl(t.url) })),
          top:list(top.topartists.artist).slice(0,6).map(a=>({ name:String(a.name ?? ''), plays:Math.max(0,Number(a.playcount)||0), url:safeUrl(a.url) }))
        };
        expires = now() + ttl;
        return cache;
      } catch {
        if (cache && cache.updatedAt !== undefined) { cache = {...cache,status:'stale'}; expires = now() + retry; return cache; }
        cache = {status:'unavailable',recent:[],top:[]}; expires = now() + retry;
        return cache;
      } finally { inFlight = null; }
    })();
    return inFlight;
  };
}
