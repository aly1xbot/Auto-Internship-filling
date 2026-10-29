import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {fillForm} from '../form-filler.mjs';
test('autofill handles forms, preserves answers, and never submits',async()=>{
 const browser=await chromium.launch();
 try {
  const page=await browser.newPage();
  await page.setContent(`<form onsubmit="window.submitted=true;return false"><label>First name<input></label><label>Last name<input value="Keep me"></label><label>Start date<input type="date"></label><label>Are you legally authorized to work in the United States?<select><option value="">Choose</option><option value="y">Yes</option><option value="n">No</option></select></label><label>Will you require sponsorship?<select><option value="">Choose</option><option>Yes</option><option>No</option></select></label><fieldset><legend>Veteran status</legend><label><input type="radio" name="v">I am a protected veteran</label><label><input type="radio" name="v">I am not a protected veteran</label></fieldset><label>Disability<select><option value="">Choose</option><option>No, I do not have a disability</option><option>I do not want to answer</option></select></label><label>GPA<input required></label><button>Submit</button></form>`);
  const result=await fillForm(page,{firstName:'Test',lastName:'Overwrite',preferredStart:'2027-05-15',authorizedUS:'Yes',sponsorship:'No',veteran:'No',disability:'No'});
  assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Test');
  assert.equal(await page.getByLabel('Last name',{exact:true}).inputValue(),'Keep me');
  assert.equal(await page.getByLabel('Start date',{exact:true}).inputValue(),'2027-05-15');
  assert.equal(await page.getByRole('combobox').nth(0).inputValue(),'y');
  assert.equal(await page.getByRole('combobox').nth(1).inputValue(),'No');
  assert.equal(await page.getByLabel('I am not a protected veteran',{exact:true}).isChecked(),true);
  assert.equal(await page.getByRole('combobox').nth(2).inputValue(),'No, I do not have a disability');
  assert.ok(result.unresolved.includes('GPA'));
  assert.equal(await page.evaluate(()=>window.submitted),undefined);
 }finally{await browser.close();}
});
test('UI discovery, selection, apply and retry use the saved profile',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const job={id:'test:1',title:'Computer Engineering Intern Summer 2027',company:'Fixture Company',url:'https://example.com/jobs/1',description:'Freshmen welcome',location:'Atlanta, GA'};
  let apps=[],sent;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/')){
    let data={};
    if(url.pathname==='/api/state')data={token:'test',catalog:{jobs:[],coverage:[]},applications:[],resumeAvailable:false};
    if(url.pathname==='/api/discover')data={jobs:[job],coverage:[{name:'Fixture',status:'ok',count:1}],updatedAt:'Test fixture'};
    if(url.pathname==='/api/apply'){sent=route.request().postDataJSON();apps=[{jobId:job.id,...job,status:'Needs your review',active:false}];data=apps[0];}
    if(url.pathname==='/api/results')data=apps;
    return route.fulfill({json:data});
   }
   const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(!['index.html','app.js','matching.mjs','answer-bank.mjs','styles.css'].includes(name))return route.abort();
   const body=await fs.readFile(new URL('../'+name,import.meta.url));
   return route.fulfill({body,contentType:name.endsWith('html')?'text/html':name.endsWith('css')?'text/css':'text/javascript'});
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Apply & autofill selected (1)'}).click();
  await page.getByRole('button',{name:'Applications',exact:true}).click();
  await page.getByRole('button',{name:'Resume autofill'}).waitFor();
  assert.equal(sent.profile.preferredStart,'2027-05-15');
  assert.equal(sent.profile.sponsorship,'No');
  assert.equal(sent.jobId,job.id);
  await page.getByRole('button',{name:'Your profile',exact:true}).click();
  await page.locator('#resume-upload').waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
