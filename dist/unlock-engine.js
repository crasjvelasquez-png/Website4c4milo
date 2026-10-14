export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

// Exact matches consume letters first; yellows cannot reuse those letters.
export function scoreGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill('absent');
  const remaining = {};
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) result[i] = 'correct';
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct' || !remaining[guess[i]]) continue;
    result[i] = 'present';
    remaining[guess[i]]--;
  }
  return result;
}
