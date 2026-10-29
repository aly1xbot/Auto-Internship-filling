import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {fillForm} from '../form-filler.mjs';
import {fieldValue} from '../answers.mjs';
const profile={firstName:'Test',lastName:'Student',email:'test@example.com',phone:'5551234567',school:'Georgia Institute of Technology',major:'Computer Engineering',graduation:'June 2030',preferredStart:'2027-05-15',city:'Atlanta',state:'Georgia',country:'United States',zip:'30332',linkedin:'https://example.com/linkedin',github:'https://example.com/github',portfolio:'https://example.com',classYear:'Freshman',disability:'No',veteran:'No',sponsorship:'No',highSchool:'Test High',highSchoolGraduation:'2026'};
const question=(label,input)=>`<li class="application-question"><div class="application-label">${label} ✱</div><div class="application-field">${input}</div></li>`;
test('Lever-style labels and question groups fill at least 95% when profile answers exist',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  const fields=['Full name','Email','Phone','Current location','City','State','Country','Zip code','LinkedIn URL','GitHub URL','Current company','Portfolio URL','Major','Class year','High School Name','Year of High School Graduation','Preferred start date','Year of graduation'];
  await page.setContent(`<form onsubmit="window.submitted=true;return false">${fields.map(q=>question(q,'<input placeholder="Type your response">')).join('')}${question('Which university are you currently attending?', '<select><option>Click Here (If you encounter an issue)</option><option>Georgia Institute of Technology</option></select>')}${question('Will you require sponsorship?', '<select><option>Select...</option><option>Yes</option><option>No</option></select>')}${question('Veteran status','<label><input name="v" type="radio">I am a protected veteran</label><label><input name="v" type="radio">I am not a protected veteran</label>')}<button>Submit</button></form>`);
  const result=await fillForm(page,profile);
  assert.equal(result.total,19);
  assert.ok(result.needsAttention.every(x=>!/(current company|current employer|portfolio|personal website)/i.test(x.label)));
  assert.ok(result.coverage>=95,JSON.stringify(result.needsAttention));
  assert.equal(await page.locator('input').nth(15).inputValue(),'2026');
  assert.equal(await page.evaluate(()=>window.submitted),undefined);
  const again=await fillForm(page,profile);
  assert.equal(again.filled.length,0);assert.equal(again.coverage,100);
 }finally{await browser.close();}
});
test('saved checkbox answers and incompatible dates are handled honestly',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(question('Language skills','<label><input type="checkbox" name="lang">English</label><label><input type="checkbox" name="lang">French</label>')+question('If selected, when would you be able to start?','<select><option>Select...</option><option>May 2026</option></select>')+question('I consent to recording','<input type="checkbox" name="consent">'));
  const result=await fillForm(page,{...profile,customAnswers:{'Language skills':'English'}});
  assert.equal(await page.getByLabel('English').isChecked(),true);
  assert.equal(await page.locator('[name=consent]').isChecked(),false);
  assert.ok(result.needsAttention.some(x=>x.reason.includes('2027-05-15')));
  assert.equal(fieldValue('High school graduation year',profile),'2026');
 }finally{await browser.close();}
});
const captured='private/form-fixture.html';
test('captured Palantir form, offline only',{skip:process.env.RUN_CAPTURED_FORM!=='1'||!fs.existsSync(captured)},async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>route.abort());
  // Disable scripts and handlers: this is a local DOM fixture, never an employer submission.
  const html=fs.readFileSync(captured,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son\w+="[^"]*"/gi,'');
  await page.setContent(html,{waitUntil:'domcontentloaded'});
  const result=await fillForm(page,profile);
  assert.equal(await page.locator('[name=name]').inputValue(),'Test Student');
  assert.equal(await page.locator('[name=email]').inputValue(),'test@example.com');
  assert.ok(result.filled.some(x=>/university/.test(x)));
  assert.ok(result.needsAttention.some(x=>x.reason.includes('2027-05-15')));
  assert.ok(result.needsAttention.every(x=>!x.label.startsWith('cards[')));
  console.log(`Captured form: ${result.completed}/${result.total} completed; ${result.needsAttention.length} need missing answers or compatible choices.`);
 }finally{await browser.close();}
});

test('unconfirmed location suggestions are not counted as completed',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.setContent(question('Current location','<input name="location"><input type="hidden" name="selectedLocation">'));
  for(let i=0;i<2;i++){
   const result=await fillForm(page,profile);
   assert.equal(result.completed,0);
   assert.ok(result.needsAttention[0].reason.includes('suggestion'));
  }
 }finally{await browser.close();}
});
