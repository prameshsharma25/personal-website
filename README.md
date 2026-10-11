Welcome to my personal website!

## Local development

This project uses Next.js and Node.js 22. This workspace has a project-local
Node.js installation in `.local/node`; dependencies and the npm cache also stay
inside the project.

Install dependencies from the lockfile:

```sh
sh scripts/local.sh ci
```

Start the development server:

```sh
sh scripts/local.sh
```

Open http://127.0.0.1:3000. Changes reload automatically. Press Ctrl+C to stop.
For a production build, run `sh scripts/local.sh run build`.

On a fresh checkout, install Node.js 22 first; the script also supports Node.js
on your normal PATH. The `.local` directory is ignored by Git.

The contact form requires these values in an untracked `.env.local` file:

```dotenv
USER_EMAIL=
GMAIL_APP_PASSWORD=
RECIPIENT_EMAIL=
```

Use a Gmail app password for `GMAIL_APP_PASSWORD`. These settings are optional
for browsing the site, and must be configured to send contact emails. The
Substack feed requires internet access.

## PhD Opportunities

The `/research-opportunities` page reads `data/research-opportunities.json`.
It covers worldwide PhD recruitment in computational biology, bioinformatics, and all
machine learning, with no fixed entry year. Browsing the page makes no AI calls.
The initial dataset is intentionally empty, with no fabricated listings.

### Enable the weekly scan

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
   Use a project eligible for the free tier. Check its model and search quotas;
   a key attached to a paid project can incur charges even at low volume.
2. Add `GEMINI_API_KEY` under repository **Settings → Secrets and variables →
   Actions**. The existing Substack workflow uses the same secret name.
3. Under **Settings → Actions → General → Workflow permissions**, enable
   **Allow GitHub Actions to create and approve pull requests**. This workflow
   only creates updates for review; it does not approve or merge them.
4. Commit and push these files to the default branch. Under **Actions → Research
   Opportunities → Run workflow**, start the first scan. It also runs Mondays
   at 14:23 UTC (10:23 AM Eastern during daylight saving time, 9:23 AM otherwise).
5. Review the generated pull request, then merge to publish on the next site
   deployment. Confirm your hosting provider deploys changes merged to main.
   The workflow also saves the proposed JSON as a 14-day artifact if PR creation
   fails because of repository permissions.

The workflow uses Gemini 2.5 Flash with Google Search grounding, making at most
six generation requests and requesting five candidates per area. Each area uses
one grounded search followed by one tool-free, schema-constrained extraction.
Each search request may perform multiple searches. There are no retries or paid-model fallbacks;
API/quota errors abort the run without changing the dataset. This bounds work,
but does not enforce a billing-account spending cap. Free quotas and model
availability can change: check [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing).

### Source checks and review

Candidates must have a public HTTPS HTML source and an exact recruiting excerpt
found on that live page. Sources and redirects are checked for public network
addresses; domains are no longer restricted to `.edu`. The search targets official
universities, research institutes, and labs across all countries. URL safety
checks do not establish institutional ownership: confirm that in the pull request.
PDF/JavaScript-only pages may still be skipped.

Country uses uppercase ISO alpha-2 codes (for example US, GB, DE, IN) and is shown
as a country name with a filter on the page. Existing US records remain compatible.
Original-language recruiting excerpts are preserved, with English summaries;
reviewers should check their meaning rather than relying on English keyword matches.
Before merging, review country, institution, professor/lab, intake, recruiting
status, funding, eligibility (including international and language requirements),
deadline/timezone, and application route. Code checks the country format; reviewers
confirm the actual country. The same six-call budget and five-candidate-per-area
limit apply, so each scan is a worldwide sample, not exhaustive coverage.

An undated invitation is labeled **General invitation**, not a confirmed current
opening. Unknown fields remain null and display as **Not stated**. Existing
listings are never deleted just because a search missed them. Only successfully
checked candidates get a fresh `lastChecked` date. Listings older than 45 days
are labeled **Needs recheck** and hidden from the default view; past deadlines
are labeled **Expired**. Deadline date comparison uses UTC days; applicants
should consult the source for the exact deadline time and timezone.

### Run locally

Python 3.10+ is sufficient; this script has no third-party dependencies. Export
`GEMINI_API_KEY` in your terminal environment (the script does not load `.env.local`),
then run:

```sh
python3 scripts/research_opportunities.py
python3 -m unittest discover -s tests -p 'test_research_opportunities.py'
```

The tests use fixtures and mocks and make no API calls. For a separate review
file, pass `--output /tmp/research-opportunities.json`; the page continues reading
the repository dataset until you copy reviewed results into it.
