# Deploying the INE Price Tracker Backend to Render & cron-job.org

This guide walks you through deploying the backend to Render's free tier as a Docker container, and configuring an external cron service (cron-job.org) to handle scheduled scraping tasks.

## Why Background Processing on Render Free Tier?

Render's free tier imposes several restrictions:
- The container spins down after 15 minutes of inactivity.
- External cron triggers from third-party services often have tight request timeouts (e.g. cron-job.org times out in ~30s).

Because scraping a full product catalog with Playwright can take several minutes, a synchronous endpoint would time out, causing the cron service to falsely report failure or retry uncontrollably. 
Therefore, our `POST /api/cron/scrape` endpoint responds immediately with `202 Accepted` and offloads the scraping job to a background task within the container. 

## Prerequisites
- A Render account (https://render.com)
- A cron-job.org account (https://cron-job.org)
- Your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (MUST use the service role key, the anon key is explicitly rejected by the backend).
- A generated random string for `CRON_SECRET` (e.g., generate via `openssl rand -hex 32`).

---

## 1. Supabase Migration

Before deploying, you must create the overlap protection table in your Supabase database:
1. Open the Supabase SQL Editor.
2. Paste and run the contents of `/backend/db/migrations/002_scrape_runs.sql`.

---

## 2. Deploy to Render

The repository contains a `render.yaml` Blueprint which handles the configuration for you.

1. Connect your GitHub repository to Render.
2. Render should automatically detect the `render.yaml` file in the root directory.
3. Apply the Blueprint. Render will create a Docker-based Web Service named `ine-price-tracker-backend`.
4. Navigate to the **Environment** tab of the newly created service in the Render Dashboard and fill in your secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (make sure you save this string for the next step).
5. Wait for the deployment to finish and note your Render URL (e.g., `https://ine-price-tracker-backend.onrender.com`).

### Cold Starts
If the service hasn't received traffic in 15 minutes, the next request will take up to a minute to process as Render spins up the Docker container. This is normal.

---

## 3. Configure cron-job.org

We need two jobs to manage this deployment effectively.

### Job 1: "Keep Warm" (Ping)
Keeps the instance warm so it doesn't spin down continuously, making actual cron jobs and API requests faster.

- **Title:** INE Backend - Keep Warm
- **URL:** `https://<YOUR_RENDER_URL>/api/health`
- **Schedule:** Every 10 minutes
- **Method:** GET

### Job 2: "Scrape Trigger"
Triggers the background scraper task securely.

- **Title:** INE Backend - Scrape Trigger
- **URL:** `https://<YOUR_RENDER_URL>/api/cron/scrape`
- **Method:** POST
- **Schedule:** Every 2 hours (Cron expression: `0 */2 * * *`)
- **Headers:** Add a new header:
  - Name: `X-Cron-Secret`
  - Value: `<YOUR_CRON_SECRET>`

*Failure Notifications:* Enable notifications on cron-job.org if the job fails (e.g., due to a 500 error or if the service is down). Note that because the scrape runs in the background, this will only alert you if the endpoint itself crashes, not if an individual scrape fails (you can check `/api/runs/latest` for scrape success).

---

## 4. Verification

You can manually verify the deployment using `curl` from your terminal.

**1. Test Unauthorized Access (Should fail):**
```bash
curl -X POST https://<YOUR_RENDER_URL>/api/cron/scrape
# Expected output: {"error":"Unauthorized"} (HTTP 401)
```

**2. Test Authorized Access (Should succeed):**
```bash
curl -X POST https://<YOUR_RENDER_URL>/api/cron/scrape \
  -H "X-Cron-Secret: <YOUR_CRON_SECRET>"
# Expected output: {"message":"Scrape started in background","runId":"..."} (HTTP 202)
```

**3. Test Overlap Protection (Run immediately after previous step):**
```bash
curl -X POST https://<YOUR_RENDER_URL>/api/cron/scrape \
  -H "X-Cron-Secret: <YOUR_CRON_SECRET>"
# Expected output: {"error":"run_in_progress"} (HTTP 409)
```

**4. Check Run Status:**
```bash
curl https://<YOUR_RENDER_URL>/api/runs/latest
# Expected output: JSON describing the active or finished run.
```
