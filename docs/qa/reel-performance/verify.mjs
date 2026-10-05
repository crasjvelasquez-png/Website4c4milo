const {chromium, webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd();
const out=root+'/docs/qa/reel-performance';
await mkdir(out,{recursive:true});
const url='http://127.0.0.1:3001';
const results={conditions:'Local macOS browser emulation, real MP3 playback state, no subjective listening or physical-device claims',browsers:[],benchmarks:[]};
const viewportList=[[320,568],[390,844],[430,932],[844,390],[760,900],[761,900]];
function instrumentation(){
  window.motionQA={paints:0,pixels:0,decodes:0,frames:[],longTasks:[]};
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(...args){if(this.canvas.matches('[data-noise-canvas]')){window.motionQA.paints++;window.motionQA.pixels+=this.canvas.width*this.canvas.height;} return fill.apply(this,args);};
  const Context=window.AudioContext||window.webkitAudioContext;
  if(Context){const decode=Context.prototype.decodeAudioData;Context.prototype.decodeAudioData=function(...args){window.motionQA.decodes++;return decode.apply(this,args);};}
  try{new PerformanceObserver(list=>window.motionQA.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});}catch{}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  const record={name,version:browser.version(),viewports:[],errors:[]};results.browsers.push(record);
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const page=await context.newPage();page.on('pageerror',e=>record.errors.push(e.message));
    await page.addInitScript(instrumentation);
    await page.route('**/api/subscribe',route=>route.fulfill({status:500,body:'{"ok":false}'}));
    for(const [width,height] of viewportList){
      await page.setViewportSize({width,height});await page.goto(url);await page.waitForTimeout(1100);
      const before=await page.evaluate(()=>window.motionQA.paints);
      await page.waitForTimeout(1000);
      const state=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height],zoom:getComputedStyle(document.body).zoom,paints:window.motionQA.paints,fade:getComputedStyle(document.querySelector('.featured')).animationDuration}));
      state.grainFPS=state.paints-before;delete state.paints;
      assert.ok(state.overflow<=1,`${name} ${width} overflow ${state.overflow}`);
      assert.equal(state.canvas[0],width);assert.equal(state.canvas[1],height);
      assert.ok(state.grainFPS>=8 && state.grainFPS<=17,`${name} grain FPS ${state.grainFPS}`);
      assert.equal(state.fade,width<=760?'0.42s':'0.7s');
      await page.getByRole('button',{name:'Play Querida',exact:true}).tap();
      await page.waitForFunction(()=>!document.querySelector('[data-audio-player] audio').paused && document.querySelector('[data-audio-player] audio').currentTime>3.1);
      await page.waitForTimeout(550);
      state.playing=await page.evaluate(()=>({time:document.querySelector('[data-audio-player] audio').currentTime,decodes:window.motionQA.decodes,handleHidden:getComputedStyle(document.querySelector('.tape-head-handle')).display==='none',volumeInert:document.querySelector('.audio-volume-label').inert}));
      assert.equal(state.playing.volumeInert,false);
      if(width<=760)assert.equal(state.playing.decodes,0,'Mobile playback decoded scratch audio');
      const range=page.getByRole('slider',{name:'Volume',exact:true});
      const box=await range.boundingBox();await page.touchscreen.tap(box.x+box.width*.3,box.y+box.height/2);
      assert.ok(Number(await range.inputValue())<.6);
      if(width===390)await page.screenshot({path:`${out}/${name}-390-playing.png`,fullPage:true});
      await page.getByRole('button',{name:'Pause Querida',exact:true}).tap();
      await page.waitForFunction(()=>document.querySelector('[data-audio-player] audio').paused);
      const paused=await page.locator('[data-audio-player] audio').evaluate(a=>a.currentTime);
      await page.getByRole('button',{name:'Play Querida',exact:true}).tap();
      await page.waitForFunction(t=>document.querySelector('[data-audio-player] audio').currentTime>t,paused);
      await page.getByRole('button',{name:'Pause Querida',exact:true}).tap();
      await page.waitForTimeout(550);
      const tiles=page.locator('[data-release-tile]');
      await tiles.nth(0).locator('.release-cover').tap();
      assert.equal(await tiles.nth(0).locator('.release-cover').getAttribute('aria-expanded'),'true');
      await tiles.nth(1).locator('.release-cover').tap();
      assert.equal(await tiles.nth(0).locator('.release-cover').getAttribute('aria-expanded'),'false');
      assert.equal(await tiles.nth(1).locator('.release-cover').getAttribute('aria-expanded'),'true');
      await page.getByRole('heading',{name:'Past releases:',exact:true}).tap();
      await page.waitForTimeout(500);
      assert.equal(await tiles.nth(1).locator('.release-services').isVisible(),false);
      await page.screenshot({path:`${out}/${name}-${width}x${height}.png`,fullPage:true});
      record.viewports.push(state);console.log(name,width,'passed');
    }
    // Rotate while playing, repeated taps, and keyboard-sized viewport.
    await page.setViewportSize({width:390,height:844});await page.goto(url);
    await page.getByRole('button',{name:'Play Querida',exact:true}).tap();
    await page.waitForFunction(()=>!document.querySelector('[data-audio-player] audio').paused);
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-audio-player] audio').evaluate(a=>a.paused),false);
    await page.setViewportSize({width:390,height:400});await page.waitForTimeout(250);
    assert.equal(await page.locator('canvas').first().getAttribute('height'),'400');
    await page.setViewportSize({width:390,height:844});
    for(let i=0;i<6;i++)await page.locator('.audio-toggle').tap();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.audio-toggle').getAttribute('aria-pressed'),String(await page.locator('[data-audio-player] audio').evaluate(a=>!a.paused)));
    // Reduced motion must skip downloading decorative video and leave sections visible.
    await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);await page.waitForTimeout(250);
    assert.equal(await page.locator('[data-noise-video]').getAttribute('src'),null);
    assert.equal(await page.locator('.featured').evaluate(e=>getComputedStyle(e).opacity),'1');
    await page.getByRole('button',{name:'Play Querida',exact:true}).tap();await page.waitForTimeout(400);
    const rotation=await page.locator('.tape-reel').first().getAttribute('style');await page.waitForTimeout(250);
    assert.equal(await page.locator('.tape-reel').first().getAttribute('style'),rotation);
    await page.getByRole('button',{name:'Pause Querida',exact:true}).tap();
    await page.locator('.audio-toggle').focus();await page.keyboard.press('Tab');
    record.focus=await page.evaluate(()=>({element:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle}));
    // Failed media retains fallback; delayed artwork still fades into accessible content.
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.route('**/vhs-noise.mp4',r=>r.abort());await page.goto(url);await page.waitForTimeout(600);
    assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('video-noise-playing')),false);
    assert.match(await page.locator('body').evaluate(b=>getComputedStyle(b).backgroundImage),/film-grain/);
    await page.unroute('**/vhs-noise.mp4');
    await page.route('**/app.js',async r=>{await sleep(3000);await r.abort();});
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(2700);
    assert.equal(await page.locator('.featured').evaluate(e=>getComputedStyle(e).opacity),'1');
    await page.unroute('**/app.js');
    const nojs=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false,isMobile:true,hasTouch:true});
    const plain=await nojs.newPage();await plain.goto(url);
    assert.equal(await plain.locator('.featured').evaluate(e=>getComputedStyle(e).opacity),'1');
    await plain.screenshot({path:`${out}/${name}-no-js.png`,fullPage:true});await nojs.close();
    record.checks=['touch play/pause/resume and volume','release switching and dismissal','orientation and shortened viewport','rapid taps','reduced motion and live preference changes','failed decorative media','stalled app content restoration','JavaScript disabled'];
    assert.deepEqual(record.errors,[]);
    await context.close();
    if(name==='chromium'){
      for(const variant of ['before','after']){
        const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
        const p=await ctx.newPage();await p.addInitScript(instrumentation);
        if(variant==='before')for(const file of ['noise-video.js','audio-player.js','styles.css']){const body=execFileSync('git',['show',`HEAD:public/${file}`],{cwd:root,encoding:'utf8'});await p.route(`**/${file}`,r=>r.fulfill({body,contentType:file.endsWith('.css')?'text/css':'text/javascript'}));}
        const cdp=await ctx.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await p.goto(url);await p.waitForTimeout(1200);
        await p.evaluate(()=>{window.motionQA.paints=0;window.motionQA.pixels=0;window.motionQA.longTasks=[];window.motionQA.started=performance.now();let last;function tick(t){if(last)window.motionQA.frames.push(t-last);last=t;if(performance.now()-window.motionQA.started<5000)requestAnimationFrame(tick);}requestAnimationFrame(tick);});
        await p.getByRole('button',{name:'Play Querida',exact:true}).click();await p.waitForTimeout(5200);
        const bench=await p.evaluate(()=>{const q=window.motionQA,frames=q.frames.sort((a,b)=>a-b);return{paints:q.paints,pixels:q.pixels,decodes:q.decodes,frames:frames.length,frameP95:frames[Math.floor(frames.length*.95)],longTasks:q.longTasks,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]};});
        results.benchmarks.push({variant,cpuThrottle:4,...bench});console.log('benchmark',variant,JSON.stringify(bench));await ctx.close();
      }
    }
  }finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');}
}
console.log('Complete');
