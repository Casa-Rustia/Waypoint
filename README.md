# Casa Rustia Waypoint

A job-search workspace for Filipino remote workers. Browse direct-employer listings, review job details, and track applications on a Kanban board. Applications are submitted by the user on the employer's website.

## Stack

GitHub Pages hosts the website. Supabase provides email authentication, private workspace data and resume storage. Z.com manages domain DNS. Production does not require a Node server.

## Create a fresh repository

See docs/GITHUB-SETUP.md. Upload the contents of this folder to the new repository's root, including .github. No old repository or commit history is included here.

The Pages workflow builds web into a deployable site with index.html, signin.html and dashboard.html. Keep Pages Source set to GitHub Actions.

## Supabase

The existing database setup is already complete. Keep supabase/setup.sql for recreating it if necessary; frontend updates do not require running it again.

web/config.js contains the project URL and public anon key. User tokens and Supabase policies control access. Never add service-role keys, AI keys or private .env files to this repository.

After choosing the new repository name, update Supabase Authentication URL Configuration to its exact Pages URL and signin.html redirect. Capitalization matters. Custom-domain changes also require updating those URLs.

Resume text is extracted on the device. After review and confirmation, the resume and profile are saved privately in Supabase. PDF, DOCX and TXT files are supported up to 3 MB; scanned PDFs need a text version.

## Development

Use Node 24 or later:

```sh
npm ci
npx playwright install chromium
npm test
```

Tests use synthetic resumes and mocked Supabase endpoints. Confirm a real account on the deployed site to verify live authentication and storage policies.

## Scope

Sign-up, sign-in/out, profile review, preferences, CSV import, job edits, application queue, Kanban stages and follow-up notes are connected. Optional AI review, source fetching and self-service account deletion need separate authenticated server functions. Contact Casa Rustia for account removal.
