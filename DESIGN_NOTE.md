# Design Notes & Lessons Learned

## Making the Scraper Reliable

The biggest challenge with this assignment was dealing with the mock store's intentional obstacles. Things load at random times, requests time out on purpose, and there are fake "block error" states designed to trip up bots.

Here is how I tackled it:

1. **Using Playwright over simple fetch:** 
   Normally I'd just use a simple HTTP client to scrape, but since the mock store requires you to actually click a "Reveal Price" button that only shows up after a delay, I had to use a real browser. Playwright made it easier to mimic human behavior.

2. **Retry logic that doesn't hide errors:**
   The scraper has a loop that tries to find and click the elements. Because the store intentionally throws "BlockErrorState" or just fails to click sometimes, I made sure my scraper catches these specific errors. Instead of crashing the whole app or saving fake data, it logs the exact failure reason to the database and moves on to the next product. I wanted the logs to be completely honest about when it failed and why.

3. **Stateless Cron Triggers:**
   I hosted this on Render's free tier, which goes to sleep if nobody uses it. So, a basic `setInterval` loop in Node wouldn't run overnight. I decided to make a secured `POST` endpoint instead and used a free external cron service to ping it every 2 hours.

## Trade-offs I Had to Make

- **Memory vs Accuracy:** Using Playwright is heavy. It takes up way more memory than simple scraping, and I even had to switch the backend to a Docker deployment on Render just so I could install the browser dependencies. It was a pain, but it was the only way to beat the hover/dwell time bot checks.
- **Splitting up the Database:** I decided to separate `products`, `price_history`, and `scrape_logs` into three different tables. This meant I had to write slightly messier join queries on the frontend, but it keeps the main product table clean and stops the database from getting bloated with thousands of price arrays over time.

## AI Tools: Mistakes & Corrections

I used AI a lot while building this, but it definitely got some things wrong on the first try, which I had to fix manually:

- **Missing the anti-bot hover check:** At first, the AI just gave me code that did `page.click('.price-reveal')`. This failed miserably because the site checks if your mouse actually hovered over the element for a certain amount of time. I had to go in and add `page.mouse.move()` and `page.waitForTimeout()` to simulate a real human hesitating before clicking.
- **Database schema bugs:** The AI tried to use the external product ID from the mock store as the primary UUID in my Supabase tables. This caused huge issues with upsert conflicts. I had to redesign the schema to use our own internal UUID as the primary key, and keep the store's ID as a separate `external_id` column.
- **Deployment failures:** The AI confidently told me to just push the code to Render as a standard Web Service. It completely forgot that Playwright needs OS-level dependencies to run headless browsers. The build failed immediately. I had to figure out how to write a Dockerfile using the official Playwright base image and switch my Render setup to use Docker instead.
