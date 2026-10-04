import { readdir } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

// Directory entries, rather than access(), enforce case-sensitive matching on macOS too.
export async function matchCoverPreviews(releases, publicDirectory, featuredId) {
  const previews = new Map(), warnings = [];
  for (const release of releases) {
    if (release.id === featuredId || release.type !== 'Single' || !release.artwork) continue;
    const stem = basename(release.artwork).replace(/\.[^.]+$/, '');
    const directory = dirname(release.artwork);
    let files = [];
    try { files = await readdir(join(publicDirectory, directory)); } catch { /* Report below. */ }
    const required = [`${stem}.png`, `${stem}.mp3`];
    const missing = required.filter(file => !files.includes(file));
    if (missing.length) {
      warnings.push(`${release.title}: preview unavailable; missing exact filename ${missing.join(', ')} in ${directory}.`);
      continue;
    }
    previews.set(release.id, `${directory}/${stem}.mp3`);
  }
  return { previews, warnings };
}
