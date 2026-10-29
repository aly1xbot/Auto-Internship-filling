export const PAGE_SIZE = 20;
export function assess(job, profile) {
  const text = `${job.title}. ${job.description || job.requirements || ''}`;
  const reasons = [], blockers = [];
  const graduationYear=Number((profile.graduation||'').match(/20\d{2}/)?.[0]);
  const season=Number((profile.preferredStart||'2027-05-15').slice(0,4));
  if (/\b(?:junior|senior)[ -]level\b|(?:must|required|minimum)[^.\n]{0,65}(?:junior|senior|third.year|second.year)|(?:junior|senior|sophomore)(?:s)?\s+(?:standing|required)/i.test(text)) blockers.push('Requires a later class year');
  if (/\b(?:must be|requires?|only)\s+(?:a\s+)?(?:u\.?s\.?|united states)\s+citizen/i.test(text)) {if(!/citizen[^.]{0,80}(?:or|and)[^.]{0,40}permanent resident/i.test(text))blockers.push('US citizenship required; permanent residency is not citizenship');}
  if (/(?:must|require)[^.\n]{0,60}(?:active|current)[^.\n]{0,30}(?:security clearance|secret clearance)/i.test(text)) blockers.push('Requires an existing security clearance');
  if (/(?:must|require)[^.\n]{0,50}(?:ph\.?d|master.s)/i.test(text) && !/bachelor/i.test(text)) blockers.push('Graduate degree requirement');
  const graduation = text.match(/(?:graduat\w*|class of)[^.!\n]{0,100}/ig) || [];
  for (const sentence of graduation) {
    const years = (sentence.match(/20[23]\d/g)||[]).map(Number);
    if (years.length && !/or later|or after|onward|at least/i.test(sentence) && graduationYear && (Math.max(...years)<graduationYear || Math.min(...years)>graduationYear)) blockers.push(`Graduation restriction: ${sentence.trim()}`);
  }
  if (/no freshm[ae]n|freshm[ae]n[^.]{0,25}(?:not eligible|ineligible)|(?:sophomore|junior|senior)s? (?:or above|or higher|only)/i.test(text))blockers.push('First-year students do not meet the class-year requirement');
  const freshman = /(?:open to|eligible|welcome|accept\w*)[^.]{0,65}(?:freshm[ae]n|first.year)|(?:freshm[ae]n|first.year)[^.]{0,55}(?:welcome|eligible|encouraged to apply)|(?:all|any) (?:class years|year levels)/i.test(text) && !blockers.length;
  if (freshman) reasons.push('Posting explicitly mentions first-year eligibility');
  if (graduationYear && graduation.some(s=>s.includes(String(graduationYear)))) reasons.push(`Graduation wording includes ${graduationYear}; verify full requirement`);
  const summerYear=text.match(/summer[^.\n]{0,25}?(20\d{2})|(20\d{2})[^.\n]{0,25}?summer/i);
  const earlyTerm=job.title.match(/(?:spring|winter)[^.]{0,20}?(20\d{2})|(20\d{2})[^.]{0,20}?(?:spring|winter)/i);
  if(earlyTerm && Number(earlyTerm[1]||earlyTerm[2])<=season)blockers.push('Winter/spring posting starts before your summer availability');
  const term=summerYear ? Number(summerYear[1]||summerYear[2])===season ? `Summer ${season}` : 'Other summer' : 'Term unclear';
  if(term==='Other summer')blockers.push('Posting is for a different summer');
  if(job.startDate && job.startDate < profile.preferredStart)blockers.push('Posted start is before your availability; ask employer about flexibility');
  const matched = ['python','systemverilog','verilog','c++','java','javascript','typescript','fpga','risc-v','rtl','robotics','embedded','control','cad'].filter(s=>text.toLowerCase().includes(s));
  const eligibility = blockers.length ? 'Excluded' : freshman ? 'Freshman explicit' : 'Needs review';
  const preferred = profile.preferredStart || '2027-05-15';
  const start = !job.startDate ? 'Start date unspecified' : job.startDate===preferred ? 'Preferred start matches' : `Starts ${job.startDate < preferred ? 'before' : 'after'} preferred date (${job.startDate})`;
  return {eligibility,term,start,matched,reasons,blockers,score:matched.length};
}
export function canonical(url) {try {const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return '';return u.origin+u.pathname.replace(/\/$/,'')+u.search;}catch{return '';}}
export function paginate(items,page){return items.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);}
