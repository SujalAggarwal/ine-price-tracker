# INE Price Tracker - My Web Scraper Assignment

This is my submission for the Software Engineer Intern assignment. I built a price tracker that lets users select products from the mock store, tracks their price changes over time, and shows the scraping logs. 

I kept the stack pretty standard: React on the frontend (with Tailwind for styling), and a Node/Express backend talking to a Supabase PostgreSQL database. For the scraper itself, I went with Playwright.

## How to Set It Up

If you want to run this locally, you'll need two `.env` files.

**For the backend (`backend/.env`):**
```env
PORT=5000
NODE_ENV=development
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CLIENT_ORIGIN=http://localhost:5173
CRON_SECRET=local-dev-cron-secret
```

**For the frontend (`frontend/.env`):**
```env
VITE_API_URL=http://localhost:5000/api
```

### Steps to Run

1. **Install everything:**
   ```bash
   cd backend
   npm install
   npx playwright install chromium --with-deps

   cd ../frontend
   npm install
   ```

2. **Database:**
   Just copy the SQL from `backend/db/schema.sql` and run it in your Supabase SQL editor. It sets up the tables for products, history, and logs.

3. **Start the servers:**
   Open two terminals.
   In one, run `npm run dev` in the backend folder.
   In the other, run `npm run dev` in the frontend folder.

## How the Scraping Schedule Works

Since I'm using free hosting on Render (which spins down when not in use), running a continuous `setInterval` loop in Node wasn't going to work. 

Instead, I set up a secure API endpoint (`POST /api/cron/scrape`) that requires an `Authorization` header with a secret key. I used **cron-job.org** to ping this endpoint every 2 hours. This wakes up the server and triggers the batch scrape.

## Testing the Scraper Manually

If you want to actually see the scraper in action (like how it hovers to bypass the bot detection or handles fake errors), you can run it in headed mode:

```bash
cd backend
node src/scraper/cli.js --headed
```
