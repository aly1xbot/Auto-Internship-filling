export function normalizeLabel(label) {
  return String(label||'').normalize('NFKC').replace(/[✱✳✻*⁎]/g,'').replace(/\(required\)|\(optional\)/ig,'').replace(/\s+/g,' ').replace(/[:?\s]+$/g,'').trim().toLowerCase();
}
// Saved answers are exact-question matches; no personal facts are invented.
export function fieldValue(label,p,context={}) {
  const l=normalizeLabel(label);
  const saved=Object.entries(p.customAnswers||{}).find(([q])=>normalizeLabel(q)===l);
  if(saved && String(saved[1]).trim())return String(saved[1]);
  if (/first name|given name/.test(l))return p.firstName;
  if (/last name|family name|surname/.test(l))return p.lastName;
  if (/pronunciation/.test(l))return p.namePronunciation;
  if (/preferred name/.test(l))return p.preferredName;
  if (/^(full name|name|legal name|your name)$/.test(l))return [p.firstName,p.lastName].filter(Boolean).join(' ');
  if (/^(e-?mail(?: address)?|your e-?mail(?: address)?)$/.test(l))return p.email;
  if (/country code/.test(l))return p.phoneCountryCode;
  if (/phone|mobile number/.test(l))return p.phone;
  if (/security clearance/.test(l)&&/currently hold|hold.*active|active.*hold/.test(l))return p.activeUSClearance;
  if (/linkedin/.test(l))return p.linkedin;
  if (/github/.test(l))return p.github;
  if (/portfolio|personal website/.test(l))return p.portfolio;
  if (/^(street address|address line 1|address)$/.test(l))return p.address;
  if (/^(zip|zip code|postal code)$/.test(l))return p.zip;
  if (/^(current location|location|location \(city\)|city|city of residence|where are you currently located)$/.test(l))return [p.city,p.state,p.country].filter(Boolean).join(', ')||p.currentLocation;
  if (/^(state|province|state\/province)$/.test(l))return p.state;
  if (/^(country|country of residence)$/.test(l))return p.country;
  if (/current company|current employer/.test(l))return p.currentCompany;
  if (/upcoming offer deadline|offer deadline/.test(l))return p.hasUpcomingOfferDeadline;
  if (/how (did|you) hear|referral source|source of.*application/.test(l))return p.referralSource;
  if (/security clearance/.test(l)&&/eligible to obtain|eligibility to obtain|eligible for/.test(l))return p.clearanceEligible;
  if (/ai notetaker|ai note.?taking|transcribe.*conversation/.test(l))return p.aiNotetakerConsent;
  if (/referral.*detail|if other.*(describe|specify)|how did you hear.*other/.test(l))return p.referralDetails;
  if (/high school/.test(l))return /graduat|year/.test(l)?p.highSchoolGraduation:p.highSchool;
  if (/^(school|university|college)( name)?$|which (university|school)|name of.*(university|school)|university.*attend/.test(l))return p.school;
  if (/^(major|field of study|discipline)$|what.*major|what.*(study|studying)|primary.*study/.test(l))return p.major;
  if (/most interested|position.*interested|role.*interest/.test(l)&&context.jobTitle){
    if(/forward deployed software engineer/i.test(context.jobTitle))return /usg|government/i.test(context.jobTitle)?'Forward Deployed Software Engineer (Delta) - US Government':'Forward Deployed Software Engineer (Delta) - Commercial';
    if(/software engineer/i.test(context.jobTitle))return 'Software Engineer (Dev)';
  }
  if (/language/.test(l))return p.languages?String(p.languages).split(/[,\n]/).map(x=>x.trim()).filter(Boolean):null;
  if (/^(degree|degree type|education level)$/.test(l))return p.degree;
  if (/^(gpa|grade point average)$/.test(l))return p.gpa;
  if (/class year|year (of|in) (school|study|college)|academic year/.test(l))return p.classYear;
  if (/preferred start|available.*start|start date|earliest.*start|when.*(start|available to begin)/.test(l))return p.preferredStart;
  if (/high school/.test(l))return /graduat|year/.test(l)?p.highSchoolGraduation:p.highSchool;
  const graduation=String(p.graduation||'');
  if (/graduat/.test(l)) {
    if (/year/.test(l)&&!/month/.test(l))return graduation.match(/20\d{2}/)?.[0];
    if (/month/.test(l)&&!/year/.test(l))return graduation.match(/[a-z]+/i)?.[0];
    return p.graduation;
  }
  if (/describe|explain|if yes|what.*accommodation|which.*visa/.test(l))return null;
  if (/authori[sz]ed|eligible/.test(l)&&/sponsor/.test(l))return null;
  if (/canada|united kingdom|germany|australia|india|other countries/.test(l))return null;
  if (/sponsor|immigration.*visa|visa.*(work|employ)/.test(l)&&!/not require|without|no sponsorship/.test(l))return p.sponsorship;
  if (/(authori[sz]ed|eligible|legal right).*(work|employ).*(united states|u\.?s\.?\b)/.test(l))return p.authorizedUS;
  if (/permanent resident/.test(l)&&!/citizen.*or|or.*citizen/.test(l))return p.permanentResident;
  if (/citizen/.test(l))return null;
  if (/authori[sz]ed.*work.*country/.test(l)&&context.workCountry==='US')return p.authorizedUS;
  if (/signature|consent|certif|attest/.test(l))return null;
  if (/disabilit|disabled/.test(l))return p.disability;
  if (/veteran/.test(l))return p.veteran;
  if (/willing.*relocat|open.*relocat/.test(l))return p.relocation;
  return null;
}
export function optionMatches(text,answer,question='') {
  const t=normalizeLabel(text),a=normalizeLabel(answer);
  if(t===a)return true;
  if(/^\d{4}-\d{2}-\d{2}$/.test(a)){const date=new Date(a+'T12:00:00Z');const month=date.toLocaleString('en-US',{month:'long',timeZone:'UTC'}).toLowerCase();if(t===`${month} ${a.slice(0,4)}`)return true;}
  const aliases={
    'georgia institute of technology':['georgia tech','georgia institute of technology-main campus','georgia institute of technology - main campus'],
    'freshman':['first year','first-year','1st year','freshman / first year'],
    'chinese':['mandarin','mandarin chinese','chinese - mandarin','chinese (mandarin)'],
    'united states':['united states of america','us','usa'],
    'bachelor of science':['bs','b.s.','bachelor’s degree',"bachelor's degree"]
  };
  if(aliases[a]?.includes(t))return true;
  if(/language/i.test(question)&&(t===a||t.startsWith(a+' ')||t.startsWith(a+' (')||aliases[a]?.some(alias=>t.startsWith(alias+' ')||t.startsWith(alias+' ('))))return true;
  if(a==='georgia institute of technology'&&/^georgia institute of technology(?:\s*[-(].*campus\)?)?$/.test(t))return true;
  if(a==='no') {
    if(/disabilit|disabled/i.test(question))return /^no\b|^i (do not|don't) have a disability/.test(t)&&!/prefer|decline/.test(t);
    if(/veteran/i.test(question))return /^no\b|^(i am |i'm )?not (a |a protected )?veteran/.test(t);
    return /^no\b/.test(t);
  }
  return a==='yes'&&/^yes\b/.test(t);
}
