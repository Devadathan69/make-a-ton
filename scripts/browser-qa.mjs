import { mkdir, writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH??'playwright');
const base=new URL(process.env.QA_BASE_URL??'http://localhost:3000');
if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Browser QA requires the local fictitious demo');
if(!process.env.DEMO_PASSWORD)throw new Error('Supply the local demo password privately');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
await mkdir('output/browser',{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const measurements=[];
async function login(email){await page.goto(new URL('/login',base).href);await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();}
try {
  await page.goto(new URL('/dashboard',base).href);await page.waitForURL('**/login');
  await page.screenshot({path:'output/browser/login-desktop.png',fullPage:true});
  await login('admin@example.test');await page.waitForURL('**/dashboard');await page.getByText('Active subscriptions',{exact:true}).waitFor();
  await page.goto(new URL('/settings/staff',base).href);await page.getByRole('heading',{name:'Staff accounts',exact:true}).waitFor();
  const staffEmail=`qa-staff-${Date.now()}@example.test`;await page.getByLabel('Name',{exact:true}).fill('Local QA Staff');await page.getByLabel('Email',{exact:true}).fill(staffEmail);await page.getByLabel('Initial password',{exact:true}).fill(process.env.DEMO_PASSWORD);await page.getByRole('button',{name:'Create staff',exact:true}).click();await page.getByText(staffEmail,{exact:false}).waitFor();
  await page.screenshot({path:'output/browser/staff-desktop.png',fullPage:true});
  await page.goto(new URL('/operations',base).href);await page.getByRole('button',{name:'Run due billing',exact:true}).waitFor();
  await page.screenshot({path:'output/browser/operations-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Run due billing',exact:true}).click();await page.getByRole('status').filter({hasText:'generated'}).waitFor();
  const min=await page.getByLabel('Advance simulated date',{exact:true}).getAttribute('min');if(min){const nextDate=new Date(`${min}T00:00:00Z`);nextDate.setUTCDate(nextDate.getUTCDate()+1);const next=nextDate.toISOString().slice(0,10);await page.getByLabel('Advance simulated date',{exact:true}).fill(next);await page.getByRole('button',{name:'Advance demo clock and bill',exact:true}).click();await page.getByRole('status').filter({hasText:`As of ${next}`}).waitFor();await page.waitForFunction(expected=>document.querySelector('.mock-banner')?.textContent?.includes(expected),next);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/browser/operations-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);await page.setViewportSize({width:1440,height:1000});
  // Measure complete navigation through the connected table/stat render, not fixtures.
  for(const path of ['/dashboard','/subscriptions','/invoices']) {
    const samples=[];
    for(let i=0;i<21;i++) {
      const start=performance.now();await page.goto(new URL(path,base).href);
      if(path==='/dashboard')await page.getByText('Active subscriptions',{exact:true}).waitFor();else await page.locator('tbody tr').first().waitFor();
      await page.waitForLoadState('networkidle');if(i>0)samples.push(performance.now()-start);
    }
    samples.sort((a,b)=>a-b);measurements.push({path,samples:20,p95Ms:Math.round(samples[18]),maxMs:Math.round(samples[19])});
  }
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login');
  await login(staffEmail);await page.waitForURL('**/dashboard');await page.getByText('Active subscriptions',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Staff accounts',exact:true}).count(),0);await page.goto(new URL('/settings/staff',base).href);await page.waitForURL('**/dashboard');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login');
  await login('ananya@example.test');await page.waitForURL('**/portal');await page.getByRole('heading',{name:'My invoices'}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Main navigation'}).count(),0);
  await page.goto(new URL('/catalog/products',base).href);await page.waitForURL('**/portal');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/browser/portal-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'mobile page must not overflow');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login');
  await page.goto(new URL('/register',base).href);await page.getByLabel('Name',{exact:true}).fill('Local QA Customer');
  await page.getByLabel('Email',{exact:true}).fill(`qa-${Date.now()}@example.test`);await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_PASSWORD);
  await page.getByRole('button',{name:'Create customer account',exact:true}).click();await page.waitForURL('**/portal');
  assert.deepEqual(errors,[],'no browser runtime errors');
  const evidence={environment:'local Chromium against HTTP production build; not deployed p95',viewport:'1440x1000 desktop; 390x844 mobile',checks:['anonymous redirect','admin login','admin staff provisioning','admin billing control','demo clock refresh','staff role denial','connected page render','logout','customer portal navigation isolation','internal-route denial','mobile overflow','customer registration'],measurements};
  await writeFile('output/browser/evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
} finally {await context.close();await browser.close();}
