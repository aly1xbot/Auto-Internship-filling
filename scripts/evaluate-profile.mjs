// Fill only the saved local form fixture; all network requests are blocked.
import fs from 'node:fs';
import {chromium} from 'playwright';
import {fillForm} from '../form-filler.mjs';
const html=fs.readFileSync('private/form-fixture.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/\son\w+="[^"]*"/gi,'');
const profile=JSON.parse(fs.readFileSync('private/profile.json','utf8'));
const config=Object.values(fs.readdirSync('private').filter(x=>x.endsWith('.json')&&!['profile.json','jobs.json','settings.json'].includes(x))).map(x=>JSON.parse(fs.readFileSync('private/'+x,'utf8'))).find(x=>x.job&&x.profile);
const context={workCountry:'US',jobTitle:config?.job?.title||''};
let resume='';try{resume=JSON.parse(fs.readFileSync('private/settings.json','utf8')).resume||'';}catch{}
const browser=await chromium.launch();
try {
 const page=await browser.newPage();await page.route('**/*',route=>route.abort());await page.setContent(html,{waitUntil:'domcontentloaded'});
 const result=await fillForm(page,profile,resume,context);
 console.log(JSON.stringify({completed:result.completed,total:result.total,coverage:result.coverage,newlyFilled:result.filled.length,filledLabels:result.filled,existing:result.existing.length,needsAttention:result.needsAttention.map(x=>({label:x.label,reason:x.reason,required:x.required,options:x.options.length?x.options.slice(0,5):undefined}))},null,2));
} finally {await browser.close();}
