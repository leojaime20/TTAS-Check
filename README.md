# TTAS Check

Static SSOP readiness dashboard for the commissioning phase. It presents all TTAS prerequisites in one status matrix and includes a browser-based administration page for validating CSV and Excel updates.

## Run locally

```bash
npm install
npm run dev
```

## Update the published data

1. Open `#/admin` in the deployed site.
2. Upload and validate the CSV or Excel file.
3. Download the normalized `ttas.csv` file.
4. Replace `public/data/ttas.csv` in this repository and commit the change.

GitHub Actions rebuilds and deploys the site automatically. A local import is stored only in that browser; no database or credentials are used.

The dashboard discovers requirement columns automatically. `SSOP`, `CTO`, `F.Status`, and `Primeiro Description` are reserved; every other column is treated as an `OK`/`NOK` requirement in CSV order. The green header displays the date of the latest commit that changed `public/data/ttas.csv`.

Each deployment also compares the published CSV with its immediately previous committed version. The dashboard's **View changes** page lists affected SSOPs, new blockers, resolved blockers, readiness changes, and added or removed records. The comparison is generated during the GitHub Pages build, so replacing and committing `public/data/ttas.csv` is enough to refresh it.

## Reserved columns

`SSOP`, `CTO`, `F.Status`, `Primeiro Description`

`CTO` accepts `OK` or `Check`. `Check` is displayed as a separate fiscal-review alert and does not automatically change requirement completion.
