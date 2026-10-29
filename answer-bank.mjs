// DOM APIs keep employer question text and user answers out of HTML interpolation.
export function renderAnswerBank(root,applications,profile,save) {
  const section=document.createElement('section');section.className='panel';
  const heading=document.createElement('h3');heading.textContent='Reusable answers';section.append(heading);
  const intro=document.createElement('p');intro.textContent='Save missing answers once, then click Fill current page in the application browser. Answers are reused only for the same question. For multiple checkboxes, enter one exact option per line. Leave questions blank if they do not apply.';section.append(intro);
  const questions=new Map();
  for(const app of applications)for(const item of app.needsAttention||[])if(item.type!=='file'&&!questions.has(item.label))questions.set(item.label,item);
  for(const label of Object.keys(profile.customAnswers||{}))if(!questions.has(label))questions.set(label,{label});
  const form=document.createElement('form');
  const controls=[];
  for(const item of questions.values()) {
    const label=document.createElement('label');label.textContent=item.label+(item.required?' (required)':' (optional)');
    const answer=document.createElement('textarea');answer.rows=2;answer.value=profile.customAnswers?.[item.label]||'';label.append(answer);form.append(label);controls.push({question:item.label,answer});
    const help=document.createElement('p');help.className='muted';help.textContent=item.reason||'Saved answer';form.append(help);
    if(item.options?.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Available choices';details.append(summary);const choices=document.createElement('p');choices.textContent=item.options.join(' · ');details.append(choices);form.append(details);}
  }
  if(!controls.length){const text=document.createElement('p');text.textContent='Questions that need your input appear here after autofill runs.';section.append(text);}
  else {
    const button=document.createElement('button');button.className='button primary';button.textContent='Save reusable answers';form.append(button);
    form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{const customAnswers={};for(const {question,answer} of controls)if(answer.value.trim())customAnswers[question]=answer.value.trim();await save({...profile,customAnswers});}finally{button.disabled=false;}};
    section.append(form);
  }
  root.append(section);
}
