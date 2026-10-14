import { MAX_GUESSES, WORD_LENGTH } from '../public/unlock-engine.js';
import { escape as e, externalUrl } from './content.mjs';

export function validateUnlockConfig(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('unlock must be an object.');
  const { answer = '', releaseUrl = '', dictionary = 'english' } = value;
  if (typeof answer !== 'string' || (answer && !/^[a-z]{5}$/i.test(answer))) throw new Error('unlock.answer must be blank or exactly five A–Z letters.');
  if (typeof releaseUrl !== 'string' || (releaseUrl && !externalUrl(releaseUrl))) throw new Error('unlock.releaseUrl must be blank or a full https URL without credentials.');
  if (!['english','letters'].includes(dictionary)) throw new Error('unlock.dictionary must be english or letters.');
  return { answer: answer.toUpperCase(), releaseUrl, dictionary };
}

const backspace = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4-7 8 7 8h12V4Z"/><path d="m12 9 6 6m0-6-6 6"/></svg>';
const keyboard = ['QWERTYUIOP','ASDFGHJKL','↵ZXCVBNM⌫'].map((row,index) => `<div class="keyboard-row${index === 1 ? ' middle-row' : ''}">${[...row].map(letter => {
  const key = letter === '↵' ? 'Enter' : letter === '⌫' ? 'Backspace' : letter;
  return `<button type="button" class="key${key.length > 1 ? ' wide-key' : ''}" data-key="${key}" aria-label="${key === 'Backspace' ? 'Delete letter' : key}" disabled>${key === 'Backspace' ? backspace : key === 'Enter' ? 'ENTER' : letter}</button>`;
}).join('')}</div>`).join('');

export function unlockPage(artist) {
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Unlock · ${e(artist)}</title>
  <meta name="description" content="Five letters. Six guesses. Unlock an early listen to the next c4milo release.">
  <meta name="theme-color" content="#183d00"><meta name="robots" content="noindex, nofollow">
  <meta property="og:title" content="Unlock · ${e(artist)}"><meta property="og:description" content="Five letters. Six guesses. An early listen."><meta property="og:type" content="website">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/unlock.css"><script type="module" src="/unlock.js"></script>
</head><body>
  <a class="skip-link" href="#game">Skip to game</a>
  <header class="game-header">
    <a class="home-link" href="/" aria-label="Back to ${e(artist)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></a>
    <span aria-hidden="true"></span>
    <button type="button" class="icon-button" data-help aria-label="How to play"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2"/><path d="M12 16h.01"/></svg></button>
  </header>
  <main id="game" tabindex="-1" class="game">
    <div class="game-intro"><p class="sr-only">Guess the passcode. Get an early listen.</p><p class="practice-note" data-mode hidden></p></div>
    <p class="game-status" data-status role="status" aria-live="polite" aria-atomic="true">If the puzzle doesn’t load, reload this page.</p>
    <p class="sr-only" data-announcement role="status" aria-live="polite" aria-atomic="true"></p>
    <button type="button" class="retry-button" data-retry hidden>Reload puzzle</button>
    <div class="board-wrap"><div class="board" role="group" aria-label="Six guesses, five letters each" aria-describedby="instructions" data-board>
      ${Array.from({length:MAX_GUESSES},(_,row) => `<div class="board-row" role="group" aria-label="Guess ${row+1}">${Array.from({length:WORD_LENGTH},(_,col) => `<span class="tile" role="img" aria-label="Letter ${col+1}, empty" data-tile></span>`).join('')}</div>`).join('')}
    </div></div>
    <section class="win-panel" data-win hidden>
      <a class="release-link" data-release hidden>Open Early Access <span aria-hidden="true">↗</span></a>
    </section>
    <div class="keyboard" role="group" aria-label="Letter keyboard" data-keyboard>${keyboard}</div>
    <p class="sr-only" id="instructions">5 letters · 6 guesses · unlimited retries</p>
    <noscript><p class="fallback">Enable JavaScript to play this puzzle. <a href="/">Back to ${e(artist)}</a>.</p></noscript>
  </main>
  <dialog class="help-dialog" aria-labelledby="help-title" data-help-dialog>
    <button type="button" class="icon-button close-help" data-close-help aria-label="Close instructions"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <h2 id="help-title">How to play</h2><p>Find the five-letter passcode in six guesses.</p>
    <p data-dictionary-note>Each guess must be a five-letter word. Press Enter to submit.</p>
    <div class="help-example"><span class="tile correct">W</span><span class="tile">E</span><span class="tile">A</span><span class="tile">R</span><span class="tile">Y</span></div><p><strong>Off-white:</strong> right letter, right place.</p>
    <div class="help-example"><span class="tile">P</span><span class="tile present">I</span><span class="tile">L</span><span class="tile">L</span><span class="tile">S</span></div><p><strong>Yellow:</strong> right letter, wrong place.</p>
    <div class="help-example"><span class="tile">V</span><span class="tile">A</span><span class="tile">G</span><span class="tile absent">U</span><span class="tile">E</span></div><p><strong>Dark green:</strong> no remaining match for that letter.</p>
    <p>Solve it to reveal the passcode and early-access link.</p>
  </dialog>
</body></html>`;
}
