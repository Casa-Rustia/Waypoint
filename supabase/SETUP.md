# Supabase setup

The Waypoint database has already been set up successfully. There is no need to run SQL again when creating a new GitHub repository.

Keep setup.sql as the complete setup script for recreating the database if needed. It creates tables, access policies, workspace functions, private resume storage and the public job catalog.

When the new repository is published, update Authentication > URL Configuration to the exact new Pages URL and its signin.html redirect. See ../docs/GITHUB-SETUP.md.

Browser configuration uses the public anon key in web/config.js. Service-role and AI provider keys must never go into frontend files.
