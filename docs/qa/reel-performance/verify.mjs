const {chromium, webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {writeFile, mkdir, stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=process.cwd();
const out=root+'/docs/qa/reel-performance';
await mkdir(out,{recursive:true});
const url='http://127.0.0.1:3001';
const results={conditions:'Local macOS browser emulation, real MP3/Web Audio signal measurement, no physical-device or subjective-listening claims',browsers:[],benchmarks:[],assets:[]};
for(const [before,after] of [['querida.webp','querida-440.webp'],['nmf.webp','nmf.webp'],['ocean-glow-a.png','ocean-glow-a.webp'],['ocean-glow-b.png','ocean-glow-b.webp'],['vhs-noise.mp4','vhs-noise.mp4']]){
  const original=Number(execFileSync('git',['cat-file','-s',`HEAD:public/assets/${before}`],{cwd:root,encoding:'utf8'}));
  const optimized=(await stat(`${root}/public/assets/${after}`)).size;
  results.assets.push({before,after,beforeBytes:original,afterBytes:optimized,savedBytes:original-optimized});
}
const viewportList=[[320,568],[390,844],[430,932],[844,390],[760,900],[761,900]];
function instrumentation(){
  window.motionQA={paints:0,pixels:0,decodes:0,frames:[],longTasks:[],cassetteRAFRequests:0,cassetteRAFCallbacks:0,analyzers:[]};
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>{
    const cassette=new Error().stack?.includes('audio-player.js')===true;
    if(cassette)window.motionQA.cassetteRAFRequests++;
    return raf(now=>{if(cassette)window.motionQA.cassetteRAFCallbacks++;callback(now);});
  };
  const fill=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(...args){if(this.canvas.matches('[data-noise-canvas]')){window.motionQA.paints++;window.motionQA.pixels+=this.canvas.width*this.canvas.height;} return fill.apply(this,args);};
  const Context=window.AudioContext||window.webkitAudioContext;
  if(Context){
    const decode=Context.prototype.decodeAudioData;
    Context.prototype.decodeAudioData=function(...args){window.motionQA.decodes++;return decode.apply(this,args);};
    const createGain=Context.prototype.createGain;
    Context.prototype.createGain=function(...args){
      const gain=createGain.apply(this,args),destination=this.destination,connect=gain.connect.bind(gain);
      gain.connect=target=>{
        if(target===destination){const analyser=this.createAnalyser();analyser.fftSize=2048;connect(analyser);analyser.connect(destination);window.motionQA.analyzers.push(analyser);return analyser;}
        return connect(target);
      };
      return gain;
    };
  }
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
    let signupStatus=500,signupRequests=0,delayFirstAudio=true;
    const signupPayloads=[];
    await page.route('**/api/subscribe',async route=>{signupRequests++;signupPayloads.push(route.request().postDataJSON());await sleep(250);return route.fulfill({status:signupStatus,body:JSON.stringify({ok:signupStatus===200})});});
    await page.route('**/_assets/assets/querida.*.mp3',async route=>{if(delayFirstAudio){delayFirstAudio=false;await sleep(250);}await route.continue();});
    for(const [width,height] of viewportList){
      await page.setViewportSize({width,height});await page.goto(url);await page.waitForTimeout(1100);
      const before=await page.evaluate(()=>window.motionQA.paints);
      await page.waitForTimeout(1000);
      const state=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height],zoom:getComputedStyle(document.body).zoom,paints:window.motionQA.paints,fade:getComputedStyle(document.body).animationDuration,statusVisible:document.querySelector('.audio-status').getBoundingClientRect().height>0}));
      if(record.viewports.length===0)state.coldNonAudioTransferBytes=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/_assets/')&&!/\.(mp3|m4a|wav)(\?|$)/i.test(e.name)).reduce((sum,e)=>sum+e.transferSize,0));
      state.grainFPS=state.paints-before;delete state.paints;
      assert.ok(state.overflow<=1,`${name} ${width} overflow ${state.overflow}`);
      assert.equal(state.canvas[0],width);assert.equal(state.canvas[1],height);
      assert.ok(state.grainFPS>=8 && state.grainFPS<=17,`${name} grain FPS ${state.grainFPS}`);
      assert.equal(state.fade,'0.18s');
      assert.equal(state.statusVisible,true);
      await page.getByRole('button',{name:'Play Querida',exact:true}).tap();
      if(delayFirstAudio===false&&state.width===320)assert.match(await page.locator('.audio-status').textContent(),/Loading audio|Buffering|Playing/);
      await page.waitForFunction(()=>!document.querySelector('[data-audio-player] audio').paused && document.querySelector('[data-audio-player] audio').currentTime>3.1);
      await page.waitForTimeout(550);
      state.playing=await page.evaluate(()=>{
        const audio=document.querySelector('[data-audio-player] audio'),q=window.motionQA;
        let energy=0,samples=0;
        for(const analyser of q.analyzers){const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);for(const value of data){energy+=value*value;samples++;}}
        return{time:audio.currentTime,decodes:q.decodes,signalRms:samples?Math.sqrt(energy/samples):0,handleHidden:getComputedStyle(document.querySelector('.tape-head-handle')).display==='none',volumeInert:document.querySelector('.audio-volume-label').inert};
      });
      assert.equal(state.playing.volumeInert,false);
      assert.ok(state.playing.signalRms>0.00001,`${name} audio graph emitted no measurable signal`);
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
      await page.waitForFunction(()=>{const audio=document.querySelectorAll('[data-cover-audio]')[0];return audio&& !audio.paused&&audio.currentTime>0;});
      await tiles.nth(1).locator('.release-cover').tap();
      assert.equal(await tiles.nth(0).locator('.release-cover').getAttribute('aria-expanded'),'false');
      assert.equal(await tiles.nth(1).locator('.release-cover').getAttribute('aria-expanded'),'true');
      await page.waitForFunction(()=>{const audios=[...document.querySelectorAll('[data-cover-audio]')];return audios.length>1&&audios[0].paused&&!audios[1].paused&&audios[1].currentTime>0;});
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
    await page.evaluate(()=>{window.motionQA.cassetteRAFRequests=0;window.motionQA.cassetteRAFCallbacks=0;});
    await page.getByRole('button',{name:'Play Querida',exact:true}).tap();await page.waitForTimeout(3000);
    const reducedPlayback=await page.evaluate(()=>({requests:window.motionQA.cassetteRAFRequests,callbacks:window.motionQA.cassetteRAFCallbacks,advancing:document.querySelector('[data-audio-player] audio').currentTime>3.5}));
    assert.equal(reducedPlayback.callbacks,0,'Cassette scheduled display-rate callbacks under reduced motion');
    assert.equal(reducedPlayback.advancing,true,'Reduced motion stopped audio playback');
    const rotation=await page.locator('.tape-reel').first().getAttribute('style');await page.waitForTimeout(250);
    assert.equal(await page.locator('.tape-reel').first().getAttribute('style'),rotation);
    await page.getByRole('button',{name:'Pause Querida',exact:true}).tap();
    await page.locator('.audio-toggle').focus();await page.keyboard.press('Tab');
    record.focus=await page.evaluate(()=>({element:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle}));
    // Failed media retains fallback; delayed artwork still fades into accessible content.
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.route('**/_assets/assets/vhs-noise.*.mp4',r=>r.abort());await page.goto(url);await page.waitForTimeout(600);
    assert.equal(await page.locator('body').evaluate(b=>b.classList.contains('video-noise-playing')),false);
    assert.match(await page.locator('body').evaluate(b=>getComputedStyle(b).backgroundImage),/film-grain/);
    await page.unroute('**/_assets/assets/vhs-noise.*.mp4');
    await page.route('**/_assets/assets/querida.*.mp3',r=>r.abort());
    await page.goto(url);await page.getByRole('button',{name:'Play Querida',exact:true}).tap();
    await page.waitForFunction(()=>document.querySelector('.audio-status').textContent.includes('could not play')||document.querySelector('.audio-status').textContent.includes('unavailable'));
    assert.equal(await page.locator('[data-audio-player] audio').evaluate(a=>a.paused),true);
    await page.unroute('**/_assets/assets/querida.*.mp3');
    // Signup endpoints are mocked locally; no real contact is created.
    await page.goto(url);
    const form=page.locator('[data-preview-signup]'),contact=form.locator('#early-listen-contact'),submit=form.locator('[type="submit"]');
    await contact.fill('invalid');await submit.click();
    assert.equal(await contact.getAttribute('aria-invalid'),'true');
    await contact.fill('listener@example.test');await form.locator('[name="consent"]').check();
    await submit.click();assert.equal(await form.getAttribute('aria-busy'),'true');
    await page.evaluate(()=>document.querySelector('[data-preview-signup]').requestSubmit());
    assert.equal(signupRequests,1,'Repeated submit escaped the in-flight guard');
    await page.getByText('We couldn’t add you right now.',{exact:false}).waitFor();
    signupStatus=200;await submit.click();await page.locator('[data-preview-signup]').waitFor({state:'hidden'});
    assert.equal(signupPayloads[0].channel,'email');
    await page.goto(url);
    const phoneForm=page.locator('[data-preview-signup]');
    await page.getByRole('button',{name:'Use text messages'}).click();
    assert.equal(await page.locator('#early-listen-contact').getAttribute('type'),'tel');
    await page.locator('#early-listen-contact').fill('123');await phoneForm.locator('[type="submit"]').click();
    assert.equal(await page.locator('#early-listen-contact').getAttribute('aria-invalid'),'true');
    await page.locator('#early-listen-contact').fill('6025550100');await phoneForm.locator('[name="consent"]').check();
    await phoneForm.locator('[type="submit"]').click();await phoneForm.waitFor({state:'hidden'});
    assert.equal(signupPayloads.at(-1).channel,'phone');
    // Main, portfolio and shop routes all render at desktop width.
    for(const route of ['/','/portafolio.html','/shop.html']){
      await page.setViewportSize({width:1280,height:900});await page.goto(`${url}${route}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} ${route} overflow`);
    }
    if(name==='chromium'){
      const desktop=await browser.newContext({viewport:{width:1280,height:900}}),desk=await desktop.newPage();
      await desk.addInitScript(instrumentation);await desk.goto(url);
      await desk.getByRole('button',{name:'Play Querida',exact:true}).click();
      await desk.waitForFunction(()=>!document.querySelector('[data-audio-player] audio').paused);
      const handle=desk.locator('.tape-head-handle');await handle.focus();await sleep(200);
      assert.equal(await desk.evaluate(()=>window.motionQA.decodes),0,'Handle focus prepared scratch audio');
      const box=await handle.boundingBox();await desk.mouse.move(box.x+box.width/2,box.y+box.height/2);await desk.mouse.down();
      await desk.waitForFunction(()=>document.querySelector('.audio-status').textContent==='Scratching');
      await desk.mouse.move(box.x+box.width/2+55,box.y+box.height/2,{steps:8});await desk.mouse.up();
      await desk.waitForFunction(()=>!document.querySelector('[data-audio-player] audio').paused);
      assert.equal(await desk.evaluate(()=>window.motionQA.decodes),1,'Deliberate scratch did not decode exactly once');
      await handle.focus();await desk.keyboard.press('ArrowRight');
      await desk.waitForFunction(()=>document.querySelector('.audio-status').textContent==='Scratching');
      await desk.waitForTimeout(300);await desk.keyboard.press('Escape');
      await desk.waitForFunction(()=>!document.querySelector('[data-audio-player] audio').paused);
      record.desktopScratch='pointer and keyboard scratching preserve playback; PCM decode starts on deliberate input';
      await desktop.close();
    }
    await page.route('**/app.js',async r=>{await sleep(3000);await r.abort();});
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForTimeout(2700);
    assert.equal(await page.locator('.featured').evaluate(e=>getComputedStyle(e).opacity),'1');
    await page.unroute('**/app.js');
    const nojs=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false,isMobile:true,hasTouch:true});
    const plain=await nojs.newPage();await plain.goto(url);
    assert.equal(await plain.locator('.featured').evaluate(e=>getComputedStyle(e).opacity),'1');
    await plain.screenshot({path:`${out}/${name}-no-js.png`,fullPage:true});await nojs.close();
    record.checks=['touch play/pause/resume and volume','release switching and dismissal','orientation and shortened viewport','rapid taps','reduced motion with zero cassette loop callbacks','visible loading feedback','audio failure and background fallback','mocked email/SMS validation, pending, failure, retry, repeated submission','desktop pointer and keyboard scratch','homepage/shop/portfolio layout','stalled app content restoration','JavaScript disabled'];
    assert.deepEqual(record.errors,[]);
    await context.close();
    if(name==='chromium'){
      for(const variant of ['before','after']){
        const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
        const p=await ctx.newPage();await p.addInitScript(instrumentation);
        if(variant==='before')for(const file of ['motion-setup.js','app.js','noise-video.js','audio-player.js','styles.css']){const body=execFileSync('git',['show',`HEAD:public/${file}`],{cwd:root,encoding:'utf8'});await p.route(`**/${file}`,r=>r.fulfill({body,contentType:file.endsWith('.css')?'text/css':'text/javascript'}));}
        const cdp=await ctx.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
        await p.goto(url);await p.waitForTimeout(1200);
        await cdp.send('Performance.enable');
        const layoutBefore=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='LayoutCount').value;
        await p.evaluate(()=>{window.motionQA.paints=0;window.motionQA.pixels=0;window.motionQA.longTasks=[];window.motionQA.started=performance.now();let last;function tick(t){if(last)window.motionQA.frames.push(t-last);last=t;if(performance.now()-window.motionQA.started<5000)requestAnimationFrame(tick);}requestAnimationFrame(tick);});
        await p.getByRole('button',{name:'Play Querida',exact:true}).click();await p.waitForTimeout(5200);
        const bench=await p.evaluate(()=>{const q=window.motionQA,frames=q.frames.sort((a,b)=>a-b);return{paints:q.paints,pixels:q.pixels,decodes:q.decodes,frames:frames.length,frameP95:frames[Math.floor(frames.length*.95)],framesAbove33:frames.filter(x=>x>33.3).length,longTasks:q.longTasks,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]};});
        bench.layouts=(await cdp.send('Performance.getMetrics')).metrics.find(m=>m.name==='LayoutCount').value-layoutBefore;
        results.benchmarks.push({variant,cpuThrottle:4,...bench});console.log('benchmark',variant,JSON.stringify(bench));await ctx.close();
      }
    }
  }finally{await browser.close();await writeFile(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');}
}
console.log('Complete');
