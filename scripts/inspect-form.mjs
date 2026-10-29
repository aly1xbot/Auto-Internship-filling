import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 await page.goto('https://jobs.lever.co/palantir/5c4c65c5-77da-4d36-856c-4ade87631019/apply',{waitUntil:'domcontentloaded'});
 await page.locator('input[name="name"]').waitFor();
 await fs.writeFile('private/form-fixture.html',await page.content());
 console.log('Saved a read-only form snapshot to private/form-fixture.html');
}finally{await browser.close();}
