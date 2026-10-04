export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function externalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function assetUrl(value) {
  // Assets are relative to the public assets folder, never arbitrary file paths.
  return typeof value === 'string' && /^\/assets\/[\w/.-]+$/.test(value) && !value.split('/').includes('..') ? value : '';
}

export function embedUrl(provider, value) {
  const valid = externalUrl(value);
  if (!valid) return '';
  const url = new URL(valid);
  if (provider === 'spotify' && url.hostname === 'open.spotify.com' && /^\/embed\/(album|track|playlist|artist)\/[A-Za-z0-9]+\/?$/.test(url.pathname)) {
    url.searchParams.delete('autoplay');
    return url.href;
  }
  if (provider === 'soundcloud' && url.hostname === 'w.soundcloud.com' && url.pathname === '/player/') {
    const target = externalUrl(url.searchParams.get('url'));
    if (!target || !['soundcloud.com', 'api.soundcloud.com'].includes(new URL(target).hostname)) return '';
    url.searchParams.set('auto_play', 'false');
    return url.href;
  }
  if (provider === 'youtube' && ['www.youtube-nocookie.com', 'www.youtube.com'].includes(url.hostname) && /^\/embed\/[\w-]{11}$/.test(url.pathname)) {
    url.hostname = 'www.youtube-nocookie.com';
    url.searchParams.delete('autoplay');
    return url.href;
  }
  return '';
}

export function validateContent(content) {
  if (!content || typeof content !== 'object' || typeof content.artist?.name !== 'string' || !content.artist.name.trim() || !Array.isArray(content.releases) || !Array.isArray(content.links)) throw new Error('Content needs artist.name, releases and links.');
  function checkAsset(path, label) {
    if (path && !assetUrl(path)) throw new Error(`${label} must be a /assets/ file path without spaces or parent-directory segments.`);
  }
  function checkLinks(links, label) {
    if (!Array.isArray(links)) throw new Error(`${label} must be an array of links.`);
    for (const link of links) {
      if (!link || typeof link.label !== 'string' || !link.label.trim()) throw new Error(`${label}: every link needs a label.`);
      if (link.kind !== undefined && !['release', 'search'].includes(link.kind)) throw new Error(`${label}: ${link.label} kind must be release or search.`);
      if (link.url && !externalUrl(link.url)) throw new Error(`${label}: ${link.label} needs a full https:// URL, or an empty URL for a placeholder.`);
    }
  }
  checkAsset(content.artist.photo, 'artist.photo');
  checkAsset(content.upcomingRelease?.cover, 'upcomingRelease.cover');
  checkAsset(content.upcomingRelease?.audio, 'upcomingRelease.audio');
  if (content.upcomingRelease?.audio && !/\.mp3$/i.test(content.upcomingRelease.audio)) throw new Error('upcomingRelease.audio needs a local MP3 file.');
  if (content.upcomingRelease?.downloadUrl && !externalUrl(content.upcomingRelease.downloadUrl)) throw new Error('upcomingRelease.downloadUrl needs a full https:// URL.');
  checkLinks(content.links, 'links');
  const ids = new Set();
  for (const release of content.releases) {
    if (!release || typeof release.id !== 'string' || !release.id.trim() || typeof release.title !== 'string' || !release.title.trim() || ids.has(release.id)) throw new Error('Every release needs a unique id and title.');
    checkAsset(release.artwork, `releases.${release.id}.artwork`);
    if (release.audio) {
      checkAsset(release.audio.src, `releases.${release.id}.audio.src`);
      if (!/\.(mp3|wav|m4a|ogg)$/i.test(release.audio.src ?? '')) throw new Error(`releases.${release.id}.audio.src needs a local MP3, WAV, M4A or OGG file.`);
      for (const key of ['fadeIn','fadeOut']) if (release.audio[key] !== undefined && (!Number.isFinite(release.audio[key]) || release.audio[key] < 0 || release.audio[key] > 5)) throw new Error(`audio.${key} must be between 0 and 5 seconds.`);
    }
    if (release.artworkOptional !== undefined && typeof release.artworkOptional !== 'boolean') throw new Error(`releases.${release.id}.artworkOptional must be true or false.`);
    if (release.date && (!/^\d{4}-\d{2}-\d{2}$/.test(release.date) || Number.isNaN(Date.parse(`${release.date}T00:00:00Z`)))) throw new Error(`releases.${release.id}.date must be YYYY-MM-DD.`);
    checkLinks(release.links ?? [], `releases.${release.id}.links`);
    if (release.embed?.url && !embedUrl(release.embed.provider, release.embed.url)) throw new Error(`Unsupported embed URL for ${release.id}. Use the provider's iframe src URL.`);
    ids.add(release.id);
  }
  if (content.releases.length && !ids.has(content.featuredReleaseId)) throw new Error('featuredReleaseId must match a release id.');
  if (content.portfolio !== undefined) {
    if (!Array.isArray(content.portfolio.projects) || content.portfolio.projects.length !== 15) throw new Error('portfolio.projects must contain exactly 15 projects.');
    const projectIds = new Set();
    for (const project of content.portfolio.projects) {
      if (!project || typeof project.id !== 'string' || !project.id.trim() || projectIds.has(project.id) || typeof project.title !== 'string' || !project.title.trim()) throw new Error('Every portfolio project needs a unique id and title.');
      for (const field of ['artist', 'contribution']) if (typeof project[field] !== 'string' || !project[field].trim()) throw new Error(`portfolio.${project.id}.${field} must be a non-empty string.`);
      checkAsset(project.artwork, `portfolio.${project.id}.artwork`);
      checkAsset(project.audio?.before, `portfolio.${project.id}.audio.before`);
      checkAsset(project.audio?.after, `portfolio.${project.id}.audio.after`);
      for (const field of ['before', 'after']) if (project.audio?.[field] && !/\.mp3$/i.test(project.audio[field])) throw new Error(`portfolio.${project.id}.audio.${field} needs a local MP3 file.`);
      projectIds.add(project.id);
    }
  }
  if (content.signup !== undefined) {
    if (typeof content.signup.enabled !== 'boolean') throw new Error('signup.enabled must be true or false, without quotes.');
  }
  if (content.listening && !['overall','7day','1month','3month','6month','12month'].includes(content.listening.period)) throw new Error('Unsupported Last.fm period.');
  if (content.listening) {
    for (const key of ['enabled','demo']) if (typeof content.listening[key] !== 'boolean') throw new Error(`listening.${key} must be true or false, without quotes.`);
    for (const key of ['recent','top']) if ((content.listening[key] !== undefined || (content.listening.enabled && content.listening.demo)) && !Array.isArray(content.listening[key])) throw new Error(`listening.${key} must be an array.`);
  }
  return content;
}
