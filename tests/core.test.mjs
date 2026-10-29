import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assess,canonical,paginate} from '../matching.mjs';
import {fieldValue,optionMatches} from '../answers.mjs';
const profile={graduation:'June 2030',preferredStart:'2027-05-15',authorizedUS:'Yes',sponsorship:'No',permanentResident:'Yes',disability:'No',veteran:'No'};
const job=description=>({title:'Software Intern Summer 2027',description});
test('freshman and graduation restrictions',()=>{
 assert.equal(assess(job('Freshmen welcome'),profile).eligibility,'Freshman explicit');
 for(const text of ['No freshmen','Freshmen are not eligible','Must have junior standing','Graduating in 2028 or 2029','Graduating in 2031'])assert.equal(assess(job(text),profile).eligibility,'Excluded',text);
 assert.equal(assess(job('Undergraduate students'),profile).eligibility,'Needs review');
 assert.equal(assess(job('Pay range: Engineering Intern/Freshman/Sophomore: $28/hour'),profile).eligibility,'Needs review');
 assert.equal(assess({title:'Spring 2027 Software Internship'},profile).eligibility,'Excluded');
 assert.equal(assess(job('Graduating in 2028 or later'),profile).eligibility,'Needs review');
});
test('permanent residency is distinct from citizenship',()=>{
 assert.equal(assess(job('Must be a US citizen'),profile).eligibility,'Excluded');
 assert.equal(assess(job('Must be a US citizen or lawful permanent resident'),profile).eligibility,'Needs review');
});
test('dates and URLs',()=>{
 assert.equal(assess({title:'Summer 2026 Intern'},profile).eligibility,'Excluded');
 assert.equal(assess({...job(''),startDate:'2027-05-01'},profile).eligibility,'Excluded');
 assert.equal(canonical('https://example.com/apply?job=123'),'https://example.com/apply?job=123');
 assert.equal(canonical('javascript:alert(1)'),'');
 assert.equal(paginate(Array.from({length:25}),2).length,5);
});
test('user supplied screening answers only',()=>{
 for(const q of ['Will you now or in the future require sponsorship?','Do you have a disability?','Are you a protected veteran?'])assert.equal(fieldValue(q,profile),'No');
 assert.equal(fieldValue('Are you legally authorized to work in the United States?',profile),'Yes');
 assert.equal(fieldValue('Are you authorized to work in Canada?',profile),null);
 assert.equal(fieldValue('Are you a US citizen?',profile),null);
 assert.equal(fieldValue('Earliest available start date',profile),'2027-05-15');
 assert.equal(fieldValue('Why are you interested in this company?',profile),null);
 assert.equal(optionMatches('No, I do not have a disability','No','Disability'),true);
 assert.equal(optionMatches('I am not a protected veteran','No','Veteran status'),true);
 assert.equal(optionMatches('I do not want to answer','No','Disability'),false);
});
