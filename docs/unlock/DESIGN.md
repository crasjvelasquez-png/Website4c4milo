---
name: c4milo Unlock
description: A familiar five-letter puzzle for an early listen.
colors:
  bg: "#183d00"
  ink: "#e9e9e8"
  line: "#8da27d"
  key: "#34531f"
  correct: "#e9e9e8"
  present: "#c9b458"
  absent: "#34531f"
  key-absent: "#142e03"
  focus: "#e9e9e8"
  muted: "#c6cfbe"
  hover: "#24470e"
  action-hover: "#fff"
typography:
  headline: {fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "36px", fontWeight: 900, lineHeight: 1, letterSpacing: "-.03em"}
  body: {fontFamily: "Arial, Helvetica, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: 1.45}
  label: {fontFamily: "Arial, Helvetica, sans-serif", fontSize: "14px", fontWeight: 700}
  tile: {fontFamily: "Arial, Helvetica, sans-serif", fontSize: "32px", fontWeight: 700, lineHeight: 1}
rounded:
  square: "0"
  control: "4px"
  dialog: "8px"
spacing:
  tile-gap: "5px"
  key-gap: "6px"
  row-gap: "8px"
  page-top: "0"
  board-bottom: "24px"
components:
  tile: {textColor: "{colors.ink}", typography: "{typography.tile}", rounded: "{rounded.square}"}
  tile-correct: {backgroundColor: "{colors.correct}", textColor: "{colors.bg}"}
  tile-present: {backgroundColor: "{colors.present}", textColor: "{colors.bg}"}
  tile-absent: {backgroundColor: "{colors.absent}", textColor: "{colors.ink}"}
  key: {backgroundColor: "{colors.key}", textColor: "{colors.ink}", typography: "{typography.label}", rounded: "{rounded.control}", height: "58px"}
  key-correct: {backgroundColor: "{colors.correct}", textColor: "{colors.bg}"}
  key-present: {backgroundColor: "{colors.present}", textColor: "{colors.bg}"}
  key-absent: {backgroundColor: "{colors.key-absent}", textColor: "{colors.muted}"}
  release-link: {backgroundColor: "{colors.ink}", textColor: "{colors.bg}", rounded: "{rounded.control}", padding: "12px 18px"}
  icon-button: {rounded: "{rounded.control}", width: "44px", height: "44px"}
  help-dialog: {backgroundColor: "{colors.hover}", textColor: "{colors.ink}", rounded: "{rounded.dialog}", padding: "32px 24px 24px"}
---

# Design System: c4milo Unlock

## Overview
**Creative North Star: "The Familiar Word Board"**
This local system records the user-specified Wordle geometry in the CRUSH release palette, sampled from `public/assets/crush.webp`: deep-green canvas, off-white letters, serif masthead, square letter board, and full keyboard. Play is immediate and low pressure; scoring changes instantly without decorative animation.
**Key Characteristics:** familiar geometry; compact controls; semantic letter states; unlimited retries.
Scope is `/unlock` only. `public/unlock.css` is the implementation authority; refresh these extracted tokens after CSS changes, including any contrast review. This document does not replace the artist site's global design system.

## Colors
### Primary
The release's deep green and off-white form the primary pair. Correct cells and keys use off-white with deep-green letters; present cells and keys use mustard with deep-green letters. Help labels say Off-white, Yellow, and Dark green. State descriptions announce results, and board tiles expose persistent letter-state labels with image semantics.
### Neutral
Bg supplies the canvas; ink supplies letters, entered-tile outlines, and the release/reload action. Line supplies green-tinted header and empty-tile borders; key supplies neutral keyboard surfaces. Absent tiles use the neutral key fill; absent keyboard keys use the deeper key-absent fill with muted letters. Muted supplies practice notes.
Focus supplies visible outlines. Hover and action-hover provide the existing navigation and release-link pointer feedback.

## Typography
The Georgia masthead anchors the reference layout; Arial/Helvetica handles instructions and controls. Instructions and result text use (14px); practice notes use (12px). Serif help and win headings use (28px), bold weight, and tight leading. Tiles use uppercase letters; key labels use bold uppercase letters, with smaller Enter labels.

## Layout
A centered game column caps at (500px), below a (66px) header. The board caps at (330px), with four rows of five square tiles. The keyboard has three rows, a (5%) middle-row inset, and wider Enter/Delete keys (1.5 flex shares). The board region expands above the keyboard; bottom padding respects the safe-area inset.
At widths up to (360px), the board caps at (290px), key gaps shrink to (4px), and labels shrink. At heights up to (650px), the board caps at (270px) and stops expanding. Landscape up to (500px) high uses a (52px) header and (210px) board; scrolling preserves key sizes. Below (260px), the masthead reduces to (24px), header padding to (4px), and key labels/gaps shrink so an unusually narrow in-app preview does not overflow. Below (260px), header padding and type reduce to keep the unusually narrow preview inside its viewport. These are local breakpoints, independent of the artist site's layout.

## Elevation & Depth
The game stays flat. Only the native help dialog is elevated, with a soft shadow and dim backdrop recorded in the sidecar.

## Shapes
Tiles are square with (2px) borders. Keys, icon controls, and release/reload actions have gently rounded corners. The help dialog has the larger dialog radius. Icons use inline strokes (1.8px) with round caps and joins.

## Components
**Board:** entered letters brighten borders; submitted guesses immediately receive semantic fills. Keyboard state retains the strongest known result for each letter. Four unsuccessful guesses disable input for (1200ms), then clear the round without exposing the answer.
**Keyboard:** pointer hover/press darkens keys through brightness filters; no transition or scoring animation. Loading, reset pause, and solved rounds disable keys. Touch and physical keyboard input both operate the game.
**Status and recovery:** validation/loading/result messages float (12px) below the header without consuming layout space. Routine remaining-guess counts and the rule summary are screen-reader text; rules remain in Help. Reload puzzle appears after failed loading; retries do not consume guesses. Practice is explicitly labeled when no release answer is configured.
**Win panel:** solving reveals the passcode, focuses the heading, and offers Play again. The release action appears only with a real configured destination outside practice. No destination means an honest coming-soon note.
**Help and navigation:** native modal instructions use letter examples plus written meanings; closing returns focus to help. Home/help hit areas are (44px). Focus outlines are (3px) with (3px) offset. A skip link and JavaScript-disabled fallback remain available.

## Do's and Don'ts
### Do:
- **Do** preserve the four-by-five board, full keyboard, immediate scoring, and unlimited retries.
- **Do** keep scoring meaning in text and accessibility labels as well as color.
- **Do** update these local snapshots when source CSS changes.
### Don't:
- **Don't** add decorative scoring motion, daily lockouts, or leaderboard pressure.
- **Don't** apply this standalone palette or typography to the global artist site.
