# Publish a fresh repository

1. Create a new GitHub repository. Use main as the default branch.
2. Upload all files and folders from this project to the repository root, including .github/workflows/pages.yml. Do not upload a containing Assisstant folder.
3. Open Settings > Pages and choose GitHub Actions as the source.
4. In Actions, run Publish welcome page if it did not start automatically. Wait for a green checkmark.
5. Copy the exact published URL from Settings > Pages.
6. In Supabase Authentication > URL Configuration, set Site URL to that URL and add signin.html beneath the same URL as a redirect.
7. Open the published sign-in page, create and confirm an account, save a preference, and reload the dashboard to check persistence.

The existing Supabase database stays in use. Do not repeat the SQL setup for this repository change.

Keep web/vendor: those files provide authentication and local resume extraction. Keep scripts and .github: those publish the homepage at the correct root. tests and package files let you check future changes.

Z.com DNS can be configured after the new GitHub Pages site works. Do not change the company's existing website DNS while publishing this workspace.
