# Publishing SMOOR BOM Explorer on Netlify

On Netlify the Excel files (BOM_Master, Draft, History, SOH_Cache, backups) and FG images are stored in **Netlify Blobs**
(store `bom-data`), because Netlify's server disk is wiped after every request. Locally the app still uses `./data`.

## 1. Put the code on GitHub (private repo)
```bash
cd smoor-bom-explorer
git init
git add .
git commit -m "SMOOR BOM Explorer"
# create an empty PRIVATE repo on github.com, then:
git remote add origin https://github.com/<you>/smoor-bom-explorer.git
git branch -M main
git push -u origin main
```
`.env` is in `.gitignore`, so your passwords and ERP keys are not uploaded.

## 2. Create the site
1. Go to https://app.netlify.com → **Add new project → Import an existing project → GitHub**, then pick the repo.
2. Netlify reads `netlify.toml`, so leave the build command (`npm run build`) and publish directory (`.next`) as they are.
3. Before deploying, open **Environment variables** and add:

| Key | Value |
|---|---|
| BOM_EDITOR_PASSWORD | PM team password |
| SESSION_SECRET | any long random string (32+ characters) |
| ERP_BASE_URL | https://qa-erp.smoorchocolate.com |
| ERP_DRYSTOCK_REPORT | DryStock Balance |
| ERP_API_KEY / ERP_API_SECRET | from ERP → User → API Access |

4. Click **Deploy**. The first build takes 2–3 minutes and gives you `https://<name>.netlify.app`.

## 3. Upload your data once
The site opens with "No BOM master found" until the data is uploaded. On your PC, in the project folder:

1. Netlify → **Project configuration → General → Project details**: copy the **Project ID** (also called Site ID).
2. Netlify → avatar → **User settings → Applications → Personal access tokens → New access token**: copy it.
3. Run (PowerShell):
   ```powershell
   npm install
   $env:NETLIFY_SITE_ID="paste-site-id"; $env:NETLIFY_AUTH_TOKEN="paste-token"; npm run seed:blobs
   ```
   This uploads `data/BOM_Master.xlsx`, `SOH_Cache.xlsx`, `BOM_History.xlsx` (if any) and everything in `data/fg-images/`.
4. Reload the site. The BOM appears with no redeploy needed.

Use `npm run seed:blobs -- --skip-existing` later to add new images without overwriting edits made on the site.
**Don't re-run it without that flag after the PM team has started editing**: it would overwrite the live master with your local copy.

## 4. Optional: your own domain
Netlify → **Domain management → Add a domain**, e.g. `bom.smoorchocolates.com`, then add the CNAME record it shows at your DNS provider. HTTPS is set up automatically.

## Updating the app later
Push to GitHub (`git add . && git commit -m "..." && git push`) and Netlify rebuilds automatically. The data in Blobs is not touched by deploys.

## Things to know
- **Download a copy of the data:** Netlify → **Blobs** (in the project menu) → store `bom-data`. You can download `BOM_Master.xlsx`, `BOM_History.xlsx` or any backup from there. Each publish also keeps a copy under `backups/`.
- **SOH refresh:** Netlify stops a request after roughly 30–60 seconds. If the ERP is slow, or only accepts office IPs (Netlify has no fixed IP), the refresh fails. Use **Upload DryStock export** in the app instead, which always works.
- **Product images:** add them to `data/fg-images/` and run `npm run seed:blobs -- --skip-existing`.
- **Running locally** (`npm run dev`) still uses the `./data` folder, not Blobs.
