# INE Price Tracker - Software Engineer Intern Assignment

A full-stack web application that allows users to pick products from the INE mock storefront, track their prices over time via scheduled scraping, and view price trends and scrape logs.

## Tech Stack
- **Frontend:** React.js, Vite, Tailwind CSS (Vanilla CSS approach with utility classes)
- **Backend:** Node.js, Express
- **Database:** Supabase (PostgreSQL)
- **Scraping Engine:** Playwright
- **Deployment:** Render (Backend & Frontend)

## Environment Variables
Create a `.env` file in both `frontend` and `backend` directories.

### Backend (`backend/.env`)
```env
PORT=5000
NODE_ENV=development
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CLIENT_ORIGIN=http://localhost:5173 # Or your deployed frontend URL
CRON_SECRET=your_secret_string # Used to secure the cron scraping endpoint
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5000/api # Or your deployed backend URL + /api
```

## Setup Instructions

1. **Install Dependencies**
   ```bash
   # Install backend dependencies
   cd backend
   npm install
   npx playwright install chromium --with-deps

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

2. **Database Setup (Supabase)**
   Execute the SQL script located at `backend/db/schema.sql` in your Supabase SQL editor to create the necessary tables (`products`, `price_history`, `scrape_logs`).

3. **Run Locally**
   ```bash
   # Terminal 1 (Backend)
   cd backend
   npm run dev

   # Terminal 2 (Frontend)
   cd frontend
   npm run dev
   ```

## Scraping Schedule & Cron Job Setup
The scraper is designed to run in a scheduled manner, rather than an always-on loop (to accommodate free-tier hosting limitations). 

- **Schedule:** Every 2 hours.
- **Trigger URL:** `POST https://<your-backend-url>/api/cron/scrape`
- **Authentication:** Must pass the `Authorization` header matching your `CRON_SECRET`.
  `Authorization: Bearer <your_cron_secret>`

You can use a free service like [cron-job.org](https://cron-job.org) to ping this endpoint every 2 hours.

## Local Scraper Testing (Headed Mode)
To observe the scraper's behavior (handling slow loads or shifts), run it in headed mode locally:
```bash
cd backend
node src/scraper/cli.js --headed
```
