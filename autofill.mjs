import fs from 'node:fs';
import path from 'node:path';
import {fillForm} from './form-filler.mjs';
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const {job,profile:p,resume}=config;
const resultPath=process.argv[2]+'.result';
function report(status,detail={}){fs.writeFileSync(resultPath+'.tmp',JSON.stringify({jobId:job.id,status,...detail,updated:new Date().toISOString()}));fs.renameSync(resultPath+'.tmp',resultPath);}

try {
  const { chromium } = await import('playwright');
  const browser=await chromium.launch({headless:false});
  const context=await browser.newContext();
  const page=await context.newPage();
  let busy=false;
  async function fill(){
    if(busy)return; busy=true;
    await page.evaluate(()=>{const status=document.querySelector('#assistant-status');if(status)status.textContent='Reading questions and filling supported answers…';}).catch(()=>{});
    try {
      let current=p,currentResume=resume;
      try{current=JSON.parse(fs.readFileSync(path.join(path.dirname(process.argv[2]),'profile.json'),'utf8'));}catch{}
      try{currentResume=JSON.parse(fs.readFileSync(path.join(path.dirname(process.argv[2]),'settings.json'),'utf8')).resume||resume;}catch{}
      const result=await fillForm(page,current,currentResume,{workCountry:/united states|\bUSA\b|Washington,? D\.?C\.?/i.test(job.location||'')?'US':null,jobTitle:job.title});
      const {filled,unresolved}=result;
      report('Needs your review',{...result,message:filled.length?'Review every field. Use Fill current page after manually moving to the next step.':'No supported fields found. Open the application form or sign in, then click Fill current page.'});
      await page.evaluate(({completed,total,coverage,filled,needsAttention})=>{document.querySelector('#assistant-status').textContent=`${completed}/${total} fields completed (${coverage}%) · ${filled.length} newly filled. Review before submitting.`;const details=document.querySelector('#assistant-missing');details.replaceChildren();for(const item of needsAttention){const line=document.createElement('p');line.textContent=item.label+': '+item.reason;details.append(line);}},{...result}).catch(()=>{});
    }catch(e){report('Needs attention',{message:e.message});}finally{busy=false;}
  }
  await page.exposeBinding('internshipFill',fill);
  async function banner(){await page.evaluate(()=>{
    if(document.querySelector('#assistant-panel'))return;
    const bar=document.createElement('div');bar.id='assistant-panel';bar.style='position:fixed;bottom:12px;left:12px;z-index:2147483647;background:#102d25;color:white;padding:16px;border-radius:10px;font:14px sans-serif;max-width:420px;box-shadow:0 5px 30px #0005';
    const label=document.createElement('div');label.id='assistant-status';label.textContent='Assistant never clicks Next or Submit. Review fields on every page.';
    const button=document.createElement('button');button.textContent='Fill current page';button.style='margin-top:10px;padding:8px';button.onclick=()=>window.internshipFill();const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Questions needing attention';const list=document.createElement('div');list.id='assistant-missing';list.style='max-height:220px;overflow:auto';details.append(summary,list);bar.append(label,button,details);document.body.append(bar);
  }).catch(()=>{});}
  page.on('domcontentloaded',banner);
  await page.goto(job.url,{waitUntil:'domcontentloaded',timeout:60000});await banner();await fill();
  page.on('close',()=>{browser.close();});
  await new Promise(resolve=>browser.on('disconnected',resolve));
}catch(e){report('Autofill failed',{message:e.message});}
