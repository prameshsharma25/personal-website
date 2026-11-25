import { test, expect } from '@playwright/test';
test('homepage leads to a working free download and optional signup',async({page})=>{
  await page.goto('/');await expect(page.getByRole('heading',{level:1})).toContainText('Find your own');
  await page.getByRole('link',{name:'Get the free lab-search tracker'}).click();
  await expect(page).toHaveURL(/resources\/lab-search-tracker/);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download the Excel tracker'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('lab-search-tracker.xlsx');expect(await download.failure()).toBeNull();
  await expect(page.getByRole('link',{name:'Subscribe on Substack'})).toHaveAttribute('href','https://prameshsharma.substack.com/subscribe');
  await expect(page.locator('iframe')).toHaveCount(0);await page.getByRole('button',{name:'Open signup form'}).click();await expect(page.getByTitle('Subscribe to Pramesh Sharma on Substack')).toHaveAttribute('src','https://prameshsharma.substack.com/embed');
});
test('NIH and cold-email articles have tracker invitations and usable contents links',async({page})=>{
  for(const url of ['/posts/how-i-found-an-nih-postbac-lab','/mentorship/cold-emailing']){
    await page.goto(url);await expect(page.getByRole('link',{name:'Get the lab-search tracker'})).toBeVisible();
    await page.getByText('On this page',{exact:true}).click();const first=page.getByRole('navigation',{name:'Article contents'}).getByRole('link').first();const href=await first.getAttribute('href');await first.click();expect(await page.locator(href!).count()).toBe(1);
    await expect(page.locator('h1')).toHaveCount(1);await expect(page.locator('script[src*="adsbygoogle"]')).toHaveCount(0);
  }
});
test('product page is honest about unconfigured checkout and does not expose paid files',async({page,request})=>{
  await page.goto('/resources/phd-essay-bundle');await expect(page.getByText('Checkout is not open yet.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:/Buy the essay bundle/})).toHaveCount(0);
  await expect(page.getByText('My PhD Application Essays',{exact:true})).toBeVisible();await expect(page.locator('a[href*="Pramesh_Sharma_PhD_Essays"]')).toHaveCount(0);
  const unavailable=await request.post('/api/checkout',{headers:{Origin:'http://127.0.0.1:3817'}});expect(unavailable.status()).toBe(503);
  const direct=await request.get('/private-products/Pramesh_Sharma_PhD_Essays.zip');expect(direct.status()).toBe(404);
  const download=await request.post('/api/essay-download',{data:{sessionId:'not-paid'}});expect(download.status()).toBe(503);expect(download.headers()['cache-control']).toContain('no-store');
});
test('purchase reference stays out of server URLs and analytics',async({page})=>{
  const analytics:string[]=[];page.on('request',r=>{if(r.url().includes('/_vercel/insights'))analytics.push(r.url());});
  await page.goto('/resources/phd-essay-bundle/thanks#session_id=cs_test_1234567890abcdef1234567890abcdef');
  await expect(page).toHaveURL(/\/thanks$/);await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex, nofollow');await expect(page.getByRole('button',{name:'Download my essay bundle'})).toBeVisible();expect(analytics).toHaveLength(0);
});
test('indexed pages fit a small mobile viewport and expose descriptive metadata',async({page,request})=>{
  await page.setViewportSize({width:390,height:844});
  const xml=await (await request.get('/sitemap.xml')).text();
  const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>new URL(m[1]).pathname);
  for(const url of urls){
    await page.goto(url);await expect(page.locator('h1')).toHaveCount(1);
    const dimensions=await page.evaluate(()=>({width:window.innerWidth,body:document.documentElement.scrollWidth}));expect(dimensions.body,url).toBeLessThanOrEqual(dimensions.width+1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',`https://prameshsharma.com${url}`);
    const image=await page.locator('meta[property="og:image"]').getAttribute('content');expect(image).toContain('/images/social/');
  }
  await page.goto('/');await page.screenshot({path:'.local/home-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.local/home-desktop.png',fullPage:true});
});
test('sitemap, feed, ad authorization and rendered book content are served',async({page,request})=>{
  const sitemap=await request.get('/sitemap.xml');expect(sitemap.status()).toBe(200);const xml=await sitemap.text();expect(xml).toContain('/resources/lab-search-tracker');expect(xml).not.toContain('/thanks');
  const feed=await request.get('/feed.xml');expect(feed.status()).toBe(200);expect(await feed.text()).toContain('<rss version="2.0"');
  const ads=await request.get('/ads.txt');expect(ads.status()).toBe(200);expect(await ads.text()).toContain('pub-2651199811728382');
  const books=await request.get('/books');expect(await books.text()).toContain('Snow Crash');
  await page.goto('/posts');await page.getByRole('button',{name:'Research careers',exact:true}).click();await expect(page.getByRole('heading',{name:/How I Found an NIH/})).toBeVisible();await expect(page.getByRole('heading',{name:/doppelg/})).toHaveCount(0);
});
