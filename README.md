# Spending App

Mobile-first, local-first expense tracker for iPhone PWA.

## Features (initial version)
- Add expenses with amount, category, optional comment and editable date/time
- Browse expenses grouped by day
- Local IndexedDB storage using Dexie
- Category ordering by frequency of use
- Basic monthly statistics
- Deploy to GitHub Pages via GitHub Actions

Google Drive backups and Google Sheets export are planned but **not yet implemented**.

## Develop locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

Open **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The deployment workflow runs on pushes to `main`.

Expected URL: https://dutch92.github.io/spending-app/

## Data safety

All records are stored in the browser's IndexedDB, **not GitHub**. Do not clear website data or uninstall the PWA before exporting a backup. Manual Google Drive backup will be added later.
