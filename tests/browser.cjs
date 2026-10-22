// Run a static server on 127.0.0.1:8000; make playwright available through NODE_PATH.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.PV_TEST_URL||'http://127.0.0.1:8000';
const artifacts=process.env.PV_ARTIFACTS||path.join(require('node:os').tmpdir(),'parrfums-preview');
fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const failed=[];page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failed.push(`${r.status()} ${r.url()}`);});
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>catalogueReady===true);
 assert.equal(await page.locator('.landing').count(),1);
 assert.match(await page.locator('.landing h1').textContent(),/Parrfums Vault/);
 assert.equal(await page.locator('.site-header').isVisible(),false,'Landing keeps the original immersive entrance');
 assert.equal(await page.locator('.main-nav a[href="#offers"]').count(),0,'No duplicate Offers navigation');
 assert.equal(await page.locator('.site-header a[href="#combos"]').count(),1);
 assert.equal(await page.locator('.combo-slide').count(),5);
 await page.locator('.combo-carousel').scrollIntoViewIfNeeded();
 await page.locator('[data-carousel-next]').click();
 assert.equal(await page.locator('[data-slide="1"]').getAttribute('aria-pressed'),'true');
 await page.locator('.combo-carousel').focus();await page.keyboard.press('ArrowLeft');
 assert.equal(await page.locator('[data-slide="0"]').getAttribute('aria-pressed'),'true');
 for(let i=0;i<5;i++){
   await page.locator(`[data-slide="${i}"]`).click();
   await page.locator('.combo-slide:not([hidden]):not(.combo-outgoing) img').evaluate(i=>i.decode());
 }
 await page.locator('[data-carousel-pause]').click();
 assert.equal(await page.locator('[data-carousel-pause]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-slide="0"]').click();
 await page.waitForFunction(()=>!document.querySelector('.combo-outgoing'));
 async function loadAllImages(){
   await page.evaluate(async()=>{
     const imgs=[...document.querySelectorAll('img')].filter(i=>!i.closest('[hidden]'));
     for(const img of imgs){img.loading='eager';}
     await Promise.all(imgs.map(i=>i.decode()));
   });
 }
 await loadAllImages();await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});await new Promise(requestAnimationFrame);});await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
 // Each variant must add the price actually shown; stored carts are repriced.
 await page.goto(base+'/#product/angel-share',{waitUntil:'networkidle'});
 for(const [size,price] of [[30,400],[50,750],[100,1250]]){
   await page.locator(`[data-size="${size}"]`).click();
   assert.match(await page.locator('#detail-price').textContent(),new RegExp(price.toLocaleString('en-IN')));
   await page.locator('.detail [data-add]').click();
 }
 await page.goto(base+'/#cart',{waitUntil:'networkidle'});
 await page.locator('#delivery-zone').selectOption('mumbai');
 assert.match(await page.locator('.summary .sum-line.total').textContent(),/2,500/);
 await page.locator('#delivery-zone').selectOption('outside');
 assert.match(await page.locator('.summary .sum-line.total').textContent(),/2,520/);
 assert.ok(!/complimentary/i.test(await page.locator('#app').textContent()));
 let whatsapp=await page.locator('.summary a.wa-btn').getAttribute('href');
 assert.match(decodeURIComponent(whatsapp),/Shipping: ₹120/);
 assert.match(decodeURIComponent(whatsapp),/Total: ₹2,520/);
 await page.goto(base+'/#checkout',{waitUntil:'networkidle'});
 assert.match(await page.locator('h1').textContent(),/WhatsApp/);
 // Inspect the signed-in checkout presentation without creating a real customer/order.
 await page.evaluate(()=>{authUser={id:'00000000-0000-4000-8000-000000000001',email:'test@example.invalid',user_metadata:{}};render('checkout');});
 await page.locator('#city').fill(' Mumbai ');
 assert.equal(await page.locator('[data-checkout-shipping]').textContent(),'₹100');
 assert.equal(await page.locator('[data-checkout-total]').textContent(),'₹2,500');
 await page.locator('#city').fill('Navi Mumbai');
 assert.equal(await page.locator('[data-checkout-shipping]').textContent(),'₹120');
 await page.locator('#city').fill('');
 assert.equal(await page.locator('[data-checkout-shipping]').textContent(),'Enter your city');
 await page.reload({waitUntil:'networkidle'});
 // Reprice an old persisted cart on startup.
 await page.evaluate(()=>localStorage.setItem('am-cart',JSON.stringify([{id:'angel-share',size:50,qty:1,price:1,name:'Old name',img:'bad.jpg'}])));
 await page.goto(base+'/#cart',{waitUntil:'networkidle'});
 await page.reload({waitUntil:'networkidle'});
 assert.match(await page.locator('.cart-item').textContent(),/750/);
 assert.equal(await page.locator('.cart-item img').getAttribute('alt'),'Angel Share');
 // Verify supported routes at narrow phone, tablet and desktop widths.
 for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:900});
   for(const route of ['landing','home','combos','shop','product/angel-share','product/festive-four','cart','about','finder','account','privacy','collections','offers']){
     await page.goto(`${base}/#${route}`,{waitUntil:'domcontentloaded'});
     const sizing=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));
     assert.ok(sizing.content<=sizing.viewport+1,`${route} overflows at ${width}px: ${sizing.content}`);
   }
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(base,{waitUntil:'networkidle'});await loadAllImages();
 await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
 await page.locator('.landing-enter').click();
 await page.waitForFunction(()=>location.hash==='#home' && !document.body.classList.contains('is-landing'));
 await page.locator('.menu-toggle').click();
 await page.locator('.main-nav a[href="#combos"]').click();
 await page.waitForFunction(()=>document.querySelector('.main-nav a[href="#combos"]').getAttribute('aria-current')==='page');
 assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('.main-nav a[href="#combos"]').getAttribute('aria-current'),'page');
 await loadAllImages();
 await page.screenshot({path:path.join(artifacts,'combos-mobile.png'),fullPage:true});
 await page.goto(base+'/#about',{waitUntil:'networkidle'});await loadAllImages();
 assert.equal(await page.locator('.story-grid img').count(),7);
 // Reduced-motion visitors get a static initial carousel; offline catalogue remains usable.
 const reduced=await browser.newPage({reducedMotion:'reduce',viewport:{width:390,height:844}});
 await reduced.route('https://*.supabase.co/**',r=>r.abort());
 await reduced.goto(base,{waitUntil:'networkidle'});
 assert.equal(await reduced.locator('[data-carousel-pause]').getAttribute('aria-pressed'),'true');
 await reduced.goto(base+'/#shop',{waitUntil:'domcontentloaded'});
 assert.equal(await reduced.locator('.product-card').count(),6);
 assert.match(await reduced.locator('.product-card').first().textContent(),/750/);
 // The theme follows the OS until a visitor chooses, then persists across pages and reloads.
 const themed = await browser.newPage({colorScheme:'dark',viewport:{width:390,height:844}});
 await themed.goto(base,{waitUntil:'networkidle'});
 assert.equal(await themed.locator('html').getAttribute('data-theme'),'dark');
 await themed.locator('.landing-top [data-theme-toggle]').click();
 assert.equal(await themed.locator('html').getAttribute('data-theme'),'light');
 await themed.reload({waitUntil:'networkidle'});
 assert.equal(await themed.locator('html').getAttribute('data-theme'),'light');
 await themed.locator('.landing-enter').click();
 await themed.waitForFunction(()=>location.hash==='#home' && !document.body.classList.contains('is-landing'));
 await themed.locator('.site-header [data-theme-toggle]').click();
 assert.equal(await themed.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await themed.locator('.site-header [data-theme-toggle]').getAttribute('aria-label'),'Switch to light mode');
 for(const width of [320,390,768,1440]){
   await themed.setViewportSize({width,height:900});
   for(const route of ['home','combos','shop','product/angel-share','cart','account','finder','about','privacy']){
     await themed.goto(`${base}/#${route}`,{waitUntil:'domcontentloaded'});
     assert.equal(await themed.locator('html').getAttribute('data-theme'),'dark');
     assert.ok(await themed.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Dark ${route} overflows at ${width}px`);
   }
 }
 await themed.setViewportSize({width:1440,height:1000});
 await themed.goto(`${base}/#home`,{waitUntil:'networkidle'});
 await themed.evaluate(async()=>{for(const i of document.images)if(!i.closest('[hidden]'))i.loading='eager';await Promise.all([...document.images].filter(i=>!i.closest('[hidden]')).map(i=>i.decode()));window.scrollTo({top:0,behavior:'instant'});});
 await themed.screenshot({path:path.join(artifacts,'dark-home.png'),fullPage:true,animations:'disabled'});
 const contrast = await themed.evaluate(() => {
   const rgb = value => (value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
   const luminance = values => values.map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const selectors=['.intro-description','.footer-col h4','.footer-col .footer-links a','.footer-brand p','.contact-item strong'];
   return selectors.map(selector=>{
     const element=document.querySelector(selector);
     const foreground=rgb(getComputedStyle(element).color);
     let parent=element,background;
     while(parent){const c=getComputedStyle(parent).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){background=rgb(c);break;}parent=parent.parentElement;}
     const a=luminance(foreground),b=luminance(background||[24,21,18]);
     return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
   });
 });
 for(const result of contrast)assert.ok(result.ratio>=4.5,`Dark-mode text contrast is too low: ${JSON.stringify(result)}`);
 const auto=await browser.newPage({viewport:{width:1440,height:1000}});
 await auto.goto(base,{waitUntil:'networkidle'});
 await auto.locator('.combo-carousel').scrollIntoViewIfNeeded();
 await auto.mouse.move(0,0);
 await auto.waitForFunction(()=>document.querySelector('[data-slide="1"]').getAttribute('aria-pressed')==='true',{},{timeout:5000});
 assert.equal(await auto.locator('[data-slide="1"]').getAttribute('aria-pressed'),'true','Slideshow advances automatically when visible');
 assert.deepEqual(errors,[],'No JavaScript errors');assert.deepEqual(failed,[],'No broken local assets');
 await browser.close();
 console.log('PASS: restored landing and store entry, persistent/system dark mode, unique Combos navigation, live catalogue, fading carousel with 4-second autoplay, variant/cart pricing, shipping, WhatsApp totals, checkout, stale carts, responsive routes in both themes, mobile navigation, supplied artwork, reduced motion and offline fallback.');
 console.log('Screenshots:',artifacts);
})().catch(e=>{console.error(e);process.exit(1);});
