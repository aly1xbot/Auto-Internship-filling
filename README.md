# Internship Application Assistant

Local internship discovery and application autofill for a first-year Georgia Tech Computer Engineering student. You choose opportunities; a visible browser fills supported fields; you review and submit.

## Start

Requires Node.js 20+ and Python 3.10+.

```sh
npm install
npx playwright install chromium
npm start
```

Open **http://127.0.0.1:8765** (or http://localhost:8765). Opening `index.html` directly does not work: discovery, resume storage, and browser workers require the local server. Set `PORT` to change the port.

## Use

1. Open **Your profile**, review the existing contact and graduation details, and upload your PDF or DOCX resume (up to 10 MB).
2. The profile defaults to May 15, **2027**, US lawful permanent residence, authorized to work in the US, no sponsorship required, no disability, and not a veteran. Answers and start year are editable. Citizenship questions remain for review; permanent residency is not treated as citizenship.
3. **Refresh all configured sources** queries the Greenhouse, Lever and Ashby company boards listed in `sources.json`, plus remote listings from Remotive and Jobicy. Remotive is delayed by 24 hours. Jobicy public listings remain linked to Jobicy and are cached for at least one hour; its public feed covers recent postings from a seven-day window. The opportunity list is restricted to internship titles with an explicit Summer 2027 term to match the saved May 15, 2027 availability. Roles with unclear dates, other terms, or co-op titles are hidden. Eligibility checks remain preliminary; inspect requirements for class year, location, GPA and other constraints.
4. Add postings from other boards using **Add a posting from another job board**, including the requirements for assessment. These entries are user supplied, not independently verified by the app.
5. Check the roles you want and click **Apply & autofill selected**. A visible Chromium window opens per selected role. Open its application form or sign in if necessary, then click **Fill current page**. Repeat after navigating each step. Keep this window open while completing the application.
6. Review every answer and uploaded file. Autofill supports labeled text/date fields, native selects, accessible dropdowns, radio groups with a legend, resume uploads, and forms in frames. Unknown questions, passwords, citizenship and essays remain for you unless you explicitly save an answer for that question. Consent and attestation checkboxes require explicit saved answers. It does not invent experience or click Next/Submit. Custom controls, CAPTCHA and login may require manual interaction.
7. **Applications** shows completed/total fields, a completion percentage, and the actual questions that need answers. Its **Reusable answers** section saves answers for exact matching questions across applications. For checkbox groups, enter one exact option per line. Save the answers, then click **Fill current page** again; the worker reloads your profile and resume without restarting. A repeated click counts existing answers instead of reporting misleading zero completion. Close a failed or completed browser session to enable **Resume autofill**, which opens a fresh browser session and refills supported fields (website login/progress may not persist). Mark **I submitted this application** only after actually submitting.

## Coverage and privacy

The search is broader than one employer platform, but it cannot enumerate every job posted online: it covers the employer boards configured in `sources.json`, two public remote aggregators, and postings you add yourself. The USAJOBS search API needs a separately requested API key, so federal jobs are not included until configured. The coverage screen lists successes and errors for each source. Failed-source cached listings are marked stale and cannot be selected until refreshed. Employer forms and openings can change at any time; US authorization does not imply authorization in another country.

The server binds only to loopback. Contact information is saved in this browser's local storage. Resumes, application-worker inputs, job caches, logs and history are stored in the git-ignored `private/` directory. Personal information is entered on employer sites only after you choose Apply. Uploaded resume files may be sent as soon as a supported file field is filled. Do not expose this service to the internet.

## Verify

```sh
npm test
python3 scripts/check_sources.py
```

`npm test` runs Node unit/browser tests and Python backend tests, with synthetic postings and no employer submissions. Chromium must be installed. The source check performs live read-only discovery and updates the local cache.

If a browser fails to launch, rerun `npm install` and `npx playwright install chromium`, then use Resume autofill. Inspect `private/worker.log` for launcher errors. Feed errors appear under Search coverage rather than silently disappearing.

API references: [Ashby public postings](https://developers.ashbyhq.com/docs/public-job-posting-api), [Remotive API and attribution terms](https://remotive.com/remote-jobs/api), [Jobicy public API documentation](https://jobicy.com/jobs-rss-feed), [USAJOBS API requirements](https://developer.usajobs.gov/guides/authentication), [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever postings API](https://github.com/lever/postings-api), [Playwright form actions](https://playwright.dev/docs/input).

Autofill coverage depends on the information provided and the employer form. Fields intentionally left blank for current company and portfolio URL, as well as preferred name and additional information, are omitted from the percentage. A local Lever-style regression fixture reaches 100% with a complete test profile; this does not guarantee 95% on every employer site. Missing resumes, personal answers, incompatible dates, signatures, CAPTCHA and conditional questions still require review. The assistant reports those reasons rather than inventing answers.

For the optional offline regression against a captured employer form, run `RUN_CAPTURED_FORM=1 npm test` after `node scripts/inspect-form.mjs`. The inspector only reads the configured Palantir form and saves it in ignored local storage; the regression blocks all network requests and removes scripts before filling synthetic test information.
