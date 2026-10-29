import fs from 'node:fs';
import {fieldValue,optionMatches,normalizeLabel} from './answers.mjs';

// Runs inside each frame. Read visible questions instead of opaque ATS field IDs.
export function controlMeta(e) {
  if(Array.isArray(e))return e.map(controlMeta);
  const text=node=>{if(!node)return '';const c=node.cloneNode(true);c.querySelectorAll('input,select,textarea,button,ul,[role=listbox]').forEach(x=>x.remove());return c.textContent.replace(/\s+/g,' ').trim();};
  const labelled=node=>(node.getAttribute('aria-labelledby')||'').split(' ').map(id=>document.getElementById(id)?.textContent||'').join(' ').trim();
  const container=e.closest('.application-question,fieldset,[role=radiogroup],[data-testid="form-field"],.ashby-application-form-field-entry');
  const group=text(container?.querySelector('.application-label,legend,[data-testid="field-label"]'))||container?.getAttribute('aria-label')|| (container&&labelled(container));
  const own=[...e.labels||[]].map(text).join(' ')||e.getAttribute('aria-label')||labelled(e);
  let label=group||own;
  // Lever's published form schema supplies the exact question for custom controls.
  const match=e.name?.match(/^cards\[([^\]]+)\]\[field(\d+)\]/);
  if(match){
    const template=[...document.querySelectorAll('input[type=hidden]')].find(x=>x.name===`cards[${match[1]}][baseTemplate]`);
    try{label=JSON.parse(template?.value).fields[Number(match[2])].text||label;}catch{}
  }
  label=label||e.getAttribute('placeholder')||e.name||e.id||'Unlabeled field';
  const isChoice=['radio','checkbox'].includes(e.type);
  return {label,option:own||e.value,type:e.type,tag:e.tagName,role:e.getAttribute('role'),name:e.name||'',value:e.value||'',required:e.required||container?.classList.contains('required-field')||false,
    selected:e.tagName==='SELECT'?[...e.selectedOptions].map(o=>({value:o.value,label:o.textContent,disabled:o.disabled})):[],
    checked:e.checked,fileCount:e.files?.length||0,isChoice};
}
const placeholder=o=>!o.value||o.disabled||/^(select|choose|please select|click here|--)/i.test(o.label.trim());

export async function fillForm(page,p,resume='',context={}) {
  const filled=[],existing=[],needsAttention=[],seen=new Set();
  for(const [frameIndex,frame] of page.frames().entries()) {
    const controls=frame.locator('input,textarea,select,[role=combobox]:not(input):not(select)');
    for(let i=0;i<await controls.count();i++) {
      const el=controls.nth(i);
      let meta;
      try {
        meta=await el.evaluate(controlMeta);
        if(['hidden','submit','button','reset','password'].includes(meta.type)&&meta.role!=='combobox')continue;
        const questionKey=normalizeLabel(meta.label);
        if(questionKey==='additional information'||questionKey.startsWith('preferred name ' )||questionKey==='preferred name')continue;
        if(/current (?:company|employer)/.test(questionKey)||/portfolio|personal website/.test(questionKey))continue;
        if(!await el.isEnabled()||meta.type!=='file'&&!await el.isVisible())continue;
        if(await el.evaluate(e=>!!e.closest('#assistant-panel')))continue;
        const normalizedQuestion=normalizeLabel(meta.label);
        if(normalizedQuestion==='additional information'||normalizedQuestion.startsWith('preferred name ' )||normalizedQuestion==='preferred name')continue;
        if(/current (?:company|employer)/.test(normalizedQuestion)||/portfolio|personal website/.test(normalizedQuestion))continue;
        const key=`${frameIndex}:${meta.isChoice?meta.name||meta.label:i}`;
        if(seen.has(key))continue;seen.add(key);
        const missing=(reason,options=[])=>needsAttention.push({label:meta.label,reason,required:!!meta.required,options,type:meta.type||meta.role||meta.tag.toLowerCase()});
        let value=fieldValue(meta.label,p,context);
        if(meta.isChoice) {
          const group=meta.name?frame.locator(`input[type="${meta.type}"][name=${JSON.stringify(meta.name)}]`).filter({visible:true}):el;
          const members=(await group.evaluateAll(controlMeta)).map((m,j)=>({item:group.nth(j),m}));
          if(members.some(x=>x.m.checked)){existing.push(meta.label);continue;}
          const options=members.map(x=>x.m.option);
          // Checkboxes (including consent/attestations) require exact saved answers.
          const explicit=Object.entries(p.customAnswers||{}).find(([q])=>normalizeLabel(q)===normalizeLabel(meta.label))?.[1];
          if(meta.type==='checkbox')value=explicit??(/language/i.test(meta.label)?p.languages?.split(/[,\n]/).map(x=>x.trim()).filter(Boolean):undefined);
          if(!value){missing('Add an answer to your profile or answer bank',options);continue;}
          const wanted=meta.type==='checkbox'?(Array.isArray(value)?value:String(value).split(/[,\n]/)).map(x=>x.trim()).filter(Boolean):[String(value)];
          const matches=wanted.map(answer=>members.filter(x=>optionMatches(x.m.option,answer,meta.label)));
          if(matches.some(x=>x.length!==1)){missing('Saved answer does not uniquely match the choices',options);continue;}
          for(const [match] of matches)await match.item.check({timeout:2000});
          filled.push(meta.label);continue;
        }
        if(meta.type==='file') {
          if(meta.fileCount){existing.push(meta.label);continue;}
          if(/resume|cv/i.test(meta.label+' '+meta.name)&&resume&&fs.existsSync(resume)) {await el.setInputFiles(resume,{timeout:5000});filled.push(meta.label);}
          else missing('Upload your resume in Your profile, or attach this file yourself');
          continue;
        }
        if(meta.tag==='SELECT'?meta.selected.some(o=>!placeholder(o)):meta.value.trim()) {
          if(meta.name==='location'&&await frame.locator('input[name=selectedLocation]').count()&&!await frame.locator('input[name=selectedLocation]').inputValue()){missing('Choose a location suggestion to confirm the city');continue;}
          existing.push(meta.label);continue;
        }
        let options=[];
        if(meta.tag==='SELECT')options=await el.locator('option').evaluateAll(es=>es.map(e=>({label:e.textContent.trim(),value:e.value,disabled:e.disabled})).filter(o=>!o.disabled));
        if(!value){missing('Add an answer to your profile or answer bank',options.filter(o=>!placeholder(o)).map(o=>o.label));continue;}
        if(meta.tag==='SELECT') {
          const matches=options.filter(o=>optionMatches(o.label,value,meta.label));
          if(matches.length!==1){missing(`Your saved answer (${value}) is not offered by this form`,options.filter(o=>!placeholder(o)).map(o=>o.label));continue;}
          await el.selectOption(matches[0].value,{timeout:2000});
        } else if(meta.name==='location'&&await frame.locator('input[name=selectedLocation]').count()) {
          await el.fill([p.city,p.state,p.country].filter(Boolean).join(', '),{timeout:2000});
          const suggestions=frame.locator('.dropdown-results > *,[role=listbox] [role=option],[role=option]');
          await suggestions.first().waitFor({state:'visible',timeout:2500}).catch(()=>{});
          const labels=await suggestions.allTextContents();
          const city=normalizeLabel(p.city||''),state=normalizeLabel(p.state||'');
          const matches=labels.map((label,index)=>({label,index})).filter(x=>{const t=normalizeLabel(x.label);return city&&t.includes(city)&&(!state||t.includes(state)||t.includes(normalizeLabel(p.country||'')));});
          if(matches.length===1)await suggestions.nth(matches[0].index).click({timeout:2000});
          const selected=await frame.locator('input[name=selectedLocation]').inputValue();
          if(!selected){await el.fill('');missing('Choose a matching location suggestion to confirm the city',labels);continue;}
        } else if(meta.role==='combobox') {
          await el.click({timeout:2000});
          // Scope suggestions to this control's listbox when the ATS supplies one.
          const listId=await el.getAttribute('aria-controls')||await el.getAttribute('aria-owns');
          const scope=listId?frame.locator(`[id=${JSON.stringify(listId)}]`):frame;
          const choices=scope.getByRole('option').filter({visible:true});
          let labels=await choices.allTextContents();
          let matches=labels.map((label,index)=>({label,index})).filter(o=>optionMatches(o.label,value,meta.label));
          if(matches.length!==1&&meta.tag==='INPUT') {
            await el.fill(String(value),{timeout:2000});
            await choices.first().waitFor({state:'visible',timeout:2000}).catch(()=>{});
            labels=await choices.allTextContents();matches=labels.map((label,index)=>({label,index})).filter(o=>optionMatches(o.label,value,meta.label));
          }
          if(matches.length!==1){if(meta.tag==='INPUT')await el.fill('');await el.press('Escape');missing('Choose an autocomplete option manually',labels);continue;}
          await choices.nth(matches[0].index).click({timeout:2000});
        } else {
          let formatted=String(value);
          if(meta.type==='month'&&/^\d{4}-\d{2}-\d{2}$/.test(formatted))formatted=formatted.slice(0,7);
          await el.fill(formatted,{timeout:2000});
          await el.blur();
          if(meta.name==='location'&&await frame.locator('input[name=selectedLocation]').count()&&!await frame.locator('input[name=selectedLocation]').inputValue()){missing('Choose a location suggestion to confirm the city');continue;}
          if(await el.inputValue()!==formatted){missing('The site did not retain the answer');continue;}
        }
        filled.push(meta.label);
      } catch(error) {needsAttention.push({label:meta?.label||'Field',reason:`Could not fill this control: ${error.message.split('\n')[0]}`,required:!!meta?.required,options:[]});}
    }
  }
  const completed=filled.length+existing.length,total=completed+needsAttention.length;
  return {filled,existing,unresolved:needsAttention.map(x=>x.label),needsAttention,completed,total,coverage:total?Math.round(completed/total*100):0};
}
