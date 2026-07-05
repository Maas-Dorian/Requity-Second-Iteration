# Google Search Console: Post Deployment Steps

Run these steps after each SEO deployment.

1. Open Google Search Console.
2. Add or verify the property for https://www.requityapp.com.
3. Submit the sitemap: https://www.requityapp.com/sitemap.xml
4. Use URL Inspection to request indexing for:
   - https://www.requityapp.com/
   - https://www.requityapp.com/find-a-real-estate-agent.html
   - https://www.requityapp.com/real-estate-agent-matching.html
   - https://www.requityapp.com/buyers/find-buyers-agent.html
   - https://www.requityapp.com/sellers/find-listing-agent.html
   - https://www.requityapp.com/how-it-works.html
5. For https://www.requityapp.com/auth: after the 301 redirect deploys, use
   Removals (temporary removal) or request reindexing of /auth so Google picks
   up the redirect and drops it from results.

Notes:

- /auth now 301 redirects to /agent/login.html (configured in vercel.json).
- robots.txt disallows /auth, /agent/dashboard.html, /reviewer/, and /api/.
- Private pages (agent dashboard, reviewer pages) carry noindex, nofollow.
