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

## Required columns

`SSOP`, `TAP`, `EX`, `NR13`, `PIMS Punch`, `SPIE`, `SIG`, `TOOLs`, `TRAINING`, `F.Status`, `Primeiro Description`
