# SMOOR BOM Explorer — Next.js

Next.js + TypeScript rebuild of the Streamlit FG–PM BOM Explorer. Same data files, same calculations, new UI.

## Run

```bash
npm install
cp .env.example .env.local      # set BOM_EDITOR_PASSWORD, SESSION_SECRET, ERP_* credentials
npm run dev                     # http://localhost:3000
# production
npm run build && npm start      # or deploy .next/standalone
```

The app reads and writes the same Excel files as the Streamlit version, in `./data` (or `BOM_DATA_DIR`):
`BOM_Master.xlsx`, `BOM_Draft.xlsx`, `BOM_History.xlsx`, `SOH_Cache.xlsx`, `backups/`.
Both apps can point at the same folder, and files written by one open correctly in the other.

**Hosting:** on Netlify the Excel files and images live in Netlify Blobs (see `DEPLOY_NETLIFY.md`). Anywhere else (a VM, an office PC) they live in `./data`, same as before. The switch is automatic.

## Home page & branding

`/` is the home page: the hero photo is `public/hero.jpg` (`hero-sm.jpg` for phones) and the logo is `public/smoor-mark.png`. Replace either file to change them. The top bar's bell holds the stock (SOH) refresh/upload and the draft alert; the avatar holds editor sign-in.

## Product images (Order check tiles)

Put product images in `data/fg-images/` (or `<BOM_DATA_DIR>/fg-images/`). Name each file with its **FG code**, e.g. `FGC0984.png` (`.png`, `.jpg`, `.webp`). A file named exactly like the FG name also works, but the code is safer. New images appear on the next page load with no rebuild. Every image is cropped to the same 16:10 frame. Products without an image get a maroon tile with their initials.

## What's where

| Streamlit (`app.py` / modules) | Next.js |
|---|---|
| `suggestions`, `search`, `attach_soh`, `fg_summary`, `order_check`, `pm_name_lookup` | `src/lib/bom/calc.ts` |
| `bom_store.clean_code`, `normalize`, `replace_fg_in`, `diff`, `validate`, `data_warnings` | `src/lib/bom/core.ts` |
| `erp_soh.drystock_to_soh`, `_report_to_df` | `src/lib/soh/drystock.ts` |
| Excel I/O, draft/publish/history, SOH cache | `src/lib/server/store.ts`, `xlsx.ts` |
| ERP API pull (`fetch_drystock_api`, `refresh_soh`) | `src/lib/server/erp.ts` |
| pandas/numpy numeric semantics (pairwise sum, Kahan groupby sum, `np.round`, Python `format`) | `src/lib/num.ts` |
| Sidebar access + SOH panel, tabs | `src/components/Shell.tsx`, `src/app/*/page.tsx` |
| Each tab | `src/components/views/*View.tsx` |

Calculation code doesn't import any UI code. Search and order check run in the browser, so they respond instantly. Edits, publishing, SOH refresh and Excel exports run on the server.

## Calculation parity

`parity/` checks that the TypeScript results match the original Python. `py_reference.py` takes the calculation functions straight from the original `app.py` (via `ast`) and imports `bom_store` and `erp_soh` unchanged. It runs them on the real master and SOH data, on a synthetic dataset with fractional quantities, rates and stock (to stress floor and rounding boundaries), and with SOH empty. `compare.ts` then runs the TypeScript port on the same inputs:

```bash
STREAMLIT_APP_DIR=../smoor_bom_app npm run parity:py   # needs python3 + pandas
BOM_DATA_DIR=./data npm run parity
```

Latest run: **5,186 / 5,187 checks identical.** That covers 480 searches, 478 order checks, 80 random edit/diff/validate cases, DryStock parsing, and all number formatting. The single difference is a test-harness artifact: JavaScript can't tell `1.0` from `1`, so a numeric cell in a text column (e.g. a UOM cell holding the number 1.0) becomes `"1"` instead of Python's `"1.0"`. This doesn't come up with real BOM data. Run the check again after any change to `src/lib`.

## Behaviour kept on purpose

- `normalize` keeps only the standard BOM columns plus `Row ID`, so the extra `Tag` column in the current master is dropped on publish, the same as in Streamlit.
- The status strings (`✅ Can place`, `❌ Short`, `⚠️ No BOM lines`, …) are kept verbatim in exports. The UI shows them as coloured badges.
- SOH Total = Avalahalli + Jigani (`SOH_TOTAL_WAREHOUSES` in `src/lib/config.ts`).

## Differences from the Streamlit version

- **Selenium fallback:** not available in the web app. *Refresh SOH* uses the ERP API; if that fails, upload a DryStock export or keep running `python erp_soh.py` on a schedule against the same data folder.
- **Editor sessions** use a signed, http-only cookie (12 h), instead of re-entering the password on every rerun. Changing `BOM_EDITOR_PASSWORD` logs everyone out.
- **New in the UI (calculations unaffected):** responsive layout with a mobile drawer; shareable search links (`Copy link`); print styles; reset/clear buttons; inline validation (whole-number order quantities, required PM code on new lines, no negative qty/rate); two-step confirmation for Delete FG and Discard draft; loading, empty and error states; tooltips on key fields.
- **History** sorts newest first and keeps rows from the same publish in their original order (pandas' default sort didn't guarantee that order).
