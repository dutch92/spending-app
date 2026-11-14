# Spending App

Mobile-first, local-first expense tracker for iPhone PWA.

## Features
- Add and edit expenses (amount, category, comment, date and time)
- Browse history by day and monthly statistics
- Manage categories and choose custom emoji icons
- Store expenses locally in IndexedDB (Dexie)
- Manual JSON export and restore
- Manual Google Drive backup and restore via Google OAuth
- PWA update prompts and version/build number display

Google Sheets export is planned.

## Develop locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

GitHub Actions deploys pushes to `main` to GitHub Pages:
https://dutch92.github.io/spending-app/

Configure **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Versioning and releases

The app displays `MAJOR.MINOR.PATCH+BUILD`, e.g. `0.3.0+48`.
The GitHub Actions deployment run number (`BUILD`) is automatic and independent
of the SemVer release version in `package.json`.

`release-please` reads Conventional Commits and opens/updates a **Release PR**
with changes to `package.json` and `CHANGELOG.md`. It does **not** merge it
automatically. Merge the Release PR when ready to publish a new SemVer version
and GitHub release/tag. The normal Pages deployment remains separate.

Commit conventions:
- `fix: ...` → patch (`0.3.0` → `0.3.1`)
- `feat: ...` → minor (`0.3.0` → `0.4.0`)
- `feat!: ...` / `BREAKING CHANGE:` → major (as configured)
- `docs: ...`, `chore: ...`, `ci: ...` → no release by themselves

Release Please uses `.release-please-manifest.json` and
`release-please-config.json`, bootstrapped at `0.3.0` to avoid releasing
all previous development history.

**Repository setup:** under **Settings → Actions → General → Workflow permissions**,
enable **Allow GitHub Actions to create and approve pull requests** if Release
Please reports a permission error. The workflow requests write permissions for
contents, issues, and pull requests. It uses the built-in `GITHUB_TOKEN`,
so GitHub may suppress other workflows on events created by that bot; merging
the Release PR from the GitHub UI normally triggers the existing Pages deploy.

## Data safety

Expense data stays in browser IndexedDB; it is not committed to GitHub.
Do not clear site data or uninstall the PWA before making a JSON or
Google Drive backup. Backups contain financial records in unencrypted JSON.
