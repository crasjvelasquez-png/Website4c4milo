// Optional browser regression: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
// CHROME_EXECUTABLE=/path/to/chrome node scripts/verify-cover-previews.mjs
// Real audio is copied into a temporary fixture only, never into site assets.
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSite } from './build.mjs';
import { createApp } from '../server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const directory = await mkdtemp(join(tmpdir(), 'cover-browser-'));
let browser, server;
const root = resolve(new URL('..', import.meta.url).pathname);
try {
  await cp(join(root, 'public'), join(directory, 'public'), {recursive:true});
  await cp(join(root, 'content.json'), join(directory, 'content.json'));
  for (const stem of ['crush','circles','nmf']) await cp(join(root, 'public/assets/querida.mp3'), join(directory, `public/assets/${stem}.mp3`));
  await buildSite({directory});
  const html = await readFile(join(directory, 'dist/index.html'), 'utf8');
  assert.equal((html.match(/data-preview-src=/g) || []).length, 3);
  server = createApp({directory:join(directory,'dist')});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_EXECUTABLE, args:['--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage({viewport:{width:1440,height:1000}, reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.previewGains = [];
    const original = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function() { const gain = original.call(this); window.previewGains.push(gain); return gain; };
  });
  await page.goto(url);
  const tiles = page.locator('[data-preview-src]');
  const audio = i => tiles.nth(i).locator('audio');
  const playing = i => page.waitForFunction(i => !document.querySelectorAll('[data-cover-audio]')[i].paused, i);
  const paused = i => page.waitForFunction(i => document.querySelectorAll('[data-cover-audio]')[i].paused, i);
  await tiles.nth(0).hover(); await playing(0);
  await page.waitForTimeout(250);
  const gain = await page.evaluate(() => window.previewGains.at(-1).gain.value);
  assert.ok(gain > 0 && gain < 0.85, `fade at 250ms: ${gain}`);
  await page.waitForTimeout(850);
  assert.ok(await page.evaluate(() => window.previewGains.at(-1).gain.value > 0.99));
  await page.mouse.move(2,2); await paused(0);
  const position = await audio(0).evaluate(a => a.currentTime);
  assert.ok(position > 0.8);
  await tiles.nth(0).hover(); await playing(0);
  assert.ok(await audio(0).evaluate(a => a.currentTime) >= position);
  assert.ok(await page.evaluate(() => window.previewGains.at(-1).gain.value < 0.5));
  await tiles.nth(1).hover(); await playing(1); await paused(0);
  await page.mouse.move(2,2); await paused(1);
  await tiles.nth(0).locator('.release-cover').focus();
  await page.keyboard.press('Space'); await playing(0);
  await page.keyboard.press('Space'); await paused(0);
  await page.keyboard.press('Enter'); await playing(0);
  assert.equal(await tiles.nth(0).locator('.release-cover').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape'); await paused(0);
  await tiles.nth(1).hover(); await playing(1);
  await page.locator('.audio-toggle').click(); await paused(1);
  await page.waitForFunction(() => !document.querySelector('[data-audio-player] audio').paused);
  await tiles.nth(2).hover(); await playing(2);
  assert.ok(await page.locator('[data-audio-player] audio').evaluate(a => a.paused));
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await paused(2);
  await page.mouse.move(2,2);
  await tiles.nth(2).hover(); await playing(2);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide'))); await paused(2);
  await page.mouse.move(2,2);
  await tiles.nth(0).hover(); await playing(0);
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await paused(0);
  await page.evaluate(() => { delete document.hidden; });
  await page.mouse.move(2,2);
  await tiles.nth(0).hover(); await playing(0);
  await tiles.nth(0).locator('.release-cover').click();
  const streaming = tiles.nth(0).locator('.release-services a').first();
  const href = await streaming.getAttribute('href');
  await page.context().route('https://**/*', route => route.fulfill({body:'Streaming destination fixture'}));
  const popupPromise = page.waitForEvent('popup');
  await streaming.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.equal(popup.url(), href);
  await paused(0); await popup.close();
  // Pause and immediate re-entry can queue an old pause event after a new play.
  await page.keyboard.press('Escape');
  await page.mouse.move(2,2);
  await tiles.nth(1).hover(); await playing(1);
  await tiles.nth(1).evaluate(tile => {
    tile.dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}));
    tile.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));
  });
  await page.waitForTimeout(150); await playing(1);
  await page.mouse.move(2,2); await paused(1);
  await tiles.nth(0).locator('.release-cover').focus();
  await page.keyboard.press('Space'); await playing(0);
  await tiles.nth(2).locator('.release-cover').focus(); await paused(0);
  console.log('PASS rapid re-entry and keyboard focus departure');
  console.log('PASS desktop hover, 1s fade, leave, resume, switching, Space/Enter/Escape, cassette coordination, blur/pagehide/visibility and streaming navigation');
  await page.screenshot({path:join(directory,'desktop.png'),fullPage:true});
  await tiles.nth(1).hover(); await playing(1);
  await page.evaluate(() => window.addEventListener('pagehide', () => sessionStorage.setItem('preview-test-exit', String([...document.querySelectorAll('audio')].every(a => a.paused)))));
  await page.goto(`${url}/shop`);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('preview-test-exit')), 'true');
  console.log('PASS actual page navigation pauses all audio');

  const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await mobile.goto(url);
  const mt = mobile.locator('[data-preview-src]');
  const mState = (i, paused) => mobile.waitForFunction(({i,paused}) => document.querySelectorAll('[data-cover-audio]')[i].paused === paused, {i,paused});
  await mt.nth(0).locator('.release-cover').tap(); await mState(0,false);
  await mobile.waitForTimeout(400);
  await mobile.touchscreen.tap(2,2); await mState(0,true);
  const mp = await mt.nth(0).locator('audio').evaluate(a => a.currentTime);
  await mt.nth(0).locator('.release-cover').tap(); await mState(0,false);
  assert.ok(await mt.nth(0).locator('audio').evaluate(a => a.currentTime) >= mp);
  await mt.nth(1).locator('.release-cover').tap(); await mState(1,false); await mState(0,true);
  await mobile.touchscreen.tap(2,2); await mState(1,true);
  await mobile.screenshot({path:join(directory,'mobile.png'),fullPage:true});
  console.log('PASS touch start, outside pause, resume and switching at 390px');

  const blockedBrowser = await chromium.launch({headless:true, executablePath:process.env.CHROME_EXECUTABLE, args:['--autoplay-policy=document-user-activation-required']});
  try {
    const blocked = await blockedBrowser.newPage({reducedMotion:'reduce'});
    await blocked.goto(url);
    // Playwright locator evaluation may grant user activation. Use the browser
    // protocol with userGesture:false to exercise genuine pre-activation hover.
    const cdp = await blocked.context().newCDPSession(blocked);
    const box = await cdp.send('Runtime.evaluate', {expression:`(() => {
      const tile = document.querySelector('[data-preview-src]');
      tile.scrollIntoView(); const r = tile.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`, returnByValue:true, userGesture:false});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...box.result.value});
    await blocked.waitForTimeout(600);
    const state = await cdp.send('Runtime.evaluate', {expression:`({hint:document.querySelector('[data-preview-status]').textContent, paused:document.querySelector('[data-cover-audio]').paused, activated:navigator.userActivation.hasBeenActive})`,returnByValue:true,userGesture:false});
    assert.equal(state.result.value.activated,false);
    assert.equal(state.result.value.hint,'');
    assert.equal(state.result.value.paused,true);
    const first = blocked.locator('[data-preview-src]').first();
    await first.locator('.release-cover').click();
    await blocked.waitForFunction(() => !document.querySelector('[data-cover-audio]').paused);
    await blocked.mouse.move(2,2);
    await blocked.waitForFunction(() => document.querySelector('[data-cover-audio]').paused);
    console.log('PASS blocked autoplay stays silent without a prompt; direct interaction still works');
  } finally { await blockedBrowser.close(); }
  assert.deepEqual(errors, []);
  if (process.env.PREVIEW_SCREENSHOT_DIR) {
    await cp(join(directory,'desktop.png'),join(process.env.PREVIEW_SCREENSHOT_DIR,'desktop.png'));
    await cp(join(directory,'mobile.png'),join(process.env.PREVIEW_SCREENSHOT_DIR,'mobile.png'));
  }
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory,{recursive:true,force:true});
}
