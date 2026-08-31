# Concourse E Field QC

Public, mobile-first browser interface for the Concourse E quality-control system.

The browser application reads approved-product and project-progress data from restricted Supabase views. Field writes, manager history, private photo evidence, database migrations, and server-side credentials remain in the private `conceqc/QC` repository and Supabase project.

## Security boundary

This public repository may contain only browser-safe code and public configuration. Never commit a Supabase secret/service-role key, database password, GitHub token, OpenAI key, or QC manager review code here.

## Publishing

GitHub Pages serves the files from the repository root through the workflow in `.github/workflows/deploy-pages.yml`.
