import { MAX_GUESSES, WORD_LENGTH, scoreGuess } from './unlock-engine.js';

const $ = selector => document.querySelector(selector);
const tiles = [...document.querySelectorAll('[data-tile]')];
const keys = [...document.querySelectorAll('[data-key]')];
const status = $('[data-status]');
const dialog = $('[data-help-dialog]');
let config, answer, practice, allowed, round, resetTimer, statusTimer;
let ready = false;
let resetting = false;
let revealing = false;
const rank = { absent: 1, present: 2, correct: 3 };
const labels = { absent: 'no remaining match', present: 'wrong place', correct: 'right place' };

$('[data-help]').addEventListener('click', () => dialog.showModal());
$('[data-close-help]').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => $('[data-help]').focus({ preventScroll: true }));
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
$('[data-retry]').addEventListener('click', load);
$('[data-keyboard]').addEventListener('click', event => {
  const key = event.target.closest('[data-key]');
  if (key) input(key.dataset.key);
});
document.addEventListener('keydown', event => {
  if (dialog.open || event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
      event.target.closest('a, [data-again], [data-help], [data-retry]')) return;
  if (/^[a-z]$/i.test(event.key) || ['Enter','Backspace'].includes(event.key)) {
    event.preventDefault();
    if (!event.repeat) input(event.key.length === 1 ? event.key.toUpperCase() : event.key);
  }
});

function render() {
  const states = {};
  for (let row = 0; row < MAX_GUESSES; row++) {
    const guess = round.guesses[row];
    const current = row === round.guesses.length ? round.current : '';
    const scores = guess && !(revealing && row === round.guesses.length - 1) ? scoreGuess(guess, answer) : [];
    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = tiles[row * WORD_LENGTH + col];
      const letter = (guess || current)[col] ?? '';
      const score = scores[col];
      tile.textContent = letter;
      tile.className = `tile${score ? ` ${score}` : letter ? ' filled' : ''}`;
      tile.setAttribute('aria-label', `Letter ${col + 1}, ${letter || 'empty'}${score ? `, ${labels[score]}` : ''}`);
      if (score && (!states[letter] || rank[score] > rank[states[letter]])) states[letter] = score;
    }
  }
  const won = !revealing && round.guesses.at(-1) === answer;
  $('[data-keyboard]').classList.toggle('is-revealing', revealing);
  $('.board').setAttribute('aria-busy', String(revealing));
  keys.forEach(key => {
    const score = states[key.dataset.key];
    key.className = `key${key.dataset.key.length > 1 ? ' wide-key' : ''}${score ? ` ${score}` : ''}`;
    key.disabled = !ready || resetting || revealing || won;
    key.setAttribute('aria-label', `${key.dataset.key === 'Backspace' ? 'Delete letter' : key.dataset.key}${score ? `, ${labels[score]}` : ''}`);
  });
  $('[data-win]').hidden = !won;
  if (won) {
    const link = $('[data-release]');
    link.hidden = practice || !config.releaseUrl;
    if (!link.hidden) link.href = config.releaseUrl;
    else link.removeAttribute('href');
  }
}

function reset() {
  clearTimeout(resetTimer);
  clearTimeout(statusTimer);
  resetting = false;
  round = { guesses: [], current: '' };
  render();
  status.textContent = 'Fresh board. Six guesses.';
  $('[data-announcement]').textContent = '';
}

async function revealGuess(guess) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !tiles[0].animate) return;
  revealing = true;
  render();
  const scores = scoreGuess(guess, answer);
  const start = (round.guesses.length - 1) * WORD_LENGTH;
  await Promise.all(scores.map(async (score, col) => {
    const tile = tiles[start + col];
    const close = tile.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }],
      { duration: 150, delay: col * 100, easing: 'ease-in', fill: 'forwards' });
    await close.finished;
    tile.className = `tile ${score}`;
    tile.setAttribute('aria-label', `Letter ${col + 1}, ${guess[col]}, ${labels[score]}`);
    const open = tile.animate([{ transform: 'rotateX(-90deg)' }, { transform: 'rotateX(0deg)' }],
      { duration: 150, easing: 'ease-out', fill: 'forwards' });
    close.cancel();
    await open.finished;
    open.cancel();
  }));
  revealing = false;
}

async function input(key) {
  if (!ready || resetting || revealing || round.guesses.at(-1) === answer) return;
  if (key === 'Backspace') {
    round.current = round.current.slice(0, -1);
    status.textContent = '';
  } else if (key === 'Enter') {
    if (round.current.length !== WORD_LENGTH) { status.textContent = 'Enter five letters.'; return; }
    if (allowed && !allowed.has(round.current)) { status.textContent = 'Not in the word list.'; return; }
    const guess = round.current;
    round.guesses.push(guess);
    round.current = '';
    status.textContent = '';
    await revealGuess(guess);
    const result = scoreGuess(guess, answer).map((score,i) => `${guess[i]} ${labels[score]}`).join(', ');
    if (guess === answer) {
      status.textContent = `${practice ? 'Practice solved' : 'Unlocked'} in ${round.guesses.length} ${round.guesses.length === 1 ? 'guess' : 'guesses'}.`;
      statusTimer = setTimeout(() => { status.textContent = ''; }, 1500);
    } else if (round.guesses.length === MAX_GUESSES) {
      resetting = true;
      status.textContent = 'Six guesses used. Resetting…';
      resetTimer = setTimeout(reset, 1200);
    } else {
      status.textContent = '';
    }
    $('[data-announcement]').textContent = `${result}. ${MAX_GUESSES - round.guesses.length} guesses left.`;
    render();
    if (guess === answer) {
      const link = $('[data-release]');
      (link.hidden ? $('#game') : link).focus({ preventScroll: true });
    }
    return;
  } else if (/^[A-Z]$/.test(key) && round.current.length < WORD_LENGTH) {
    round.current += key;
    status.textContent = '';
  }
  render();
}

async function load() {
  ready = false;
  clearTimeout(resetTimer);
  clearTimeout(statusTimer);
  resetting = false;
  keys.forEach(key => { key.disabled = true; });
  $('[data-retry]').hidden = true;
  status.textContent = 'Loading puzzle…';
  try {
    const response = await fetch('/unlock-config.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Config unavailable');
    config = await response.json();
    if (typeof config.answer !== 'string' || (config.answer && !/^[A-Z]{5}$/.test(config.answer)) ||
        typeof config.releaseUrl !== 'string' || !['english','letters'].includes(config.dictionary)) throw new Error('Invalid configuration');
    if (config.releaseUrl) {
      const url = new URL(config.releaseUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid release URL');
    }
    practice = !config.answer;
    answer = config.answer || 'AUDIO';
    allowed = null;
    if (config.dictionary === 'english') {
      const words = await fetch('/unlock-words.txt', { signal: AbortSignal.timeout(10000) });
      if (!words.ok) throw new Error('Word list unavailable');
      allowed = new Set((await words.text()).split(/\s+/).filter(word => /^[A-Z]{5}$/.test(word)));
      if (allowed.size < 100) throw new Error('Invalid word list');
      allowed.add(answer);
    }
    $('[data-mode]').hidden = !practice;
    $('[data-mode]').textContent = 'Practice round · release puzzle coming soon';
    $('[data-dictionary-note]').textContent = config.dictionary === 'english' ? 'Each guess must be a five-letter English word. Press Enter to submit.' : 'Enter any five A–Z letters. Press Enter to submit.';
    round = { guesses: [], current: '' };
    ready = true;
    render();
    status.textContent = round.guesses.at(-1) === answer ? (practice ? 'Practice solved.' : 'Unlocked.') : '';
  } catch {
    status.textContent = 'Puzzle couldn’t load. Tap Reload puzzle to try again.';
    $('[data-retry]').hidden = false;
  }
}

load();
