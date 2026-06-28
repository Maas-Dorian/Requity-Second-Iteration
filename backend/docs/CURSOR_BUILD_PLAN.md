# REQUITY Backend Build Plan for Cursor

Stack:
- Supabase Auth + Postgres + Storage + Edge Functions
- Brevo for transactional email
- Vercel for frontend hosting
- GitHub for repo hosting and Vercel deploys
- In-house messaging stored in Supabase `messages`

What is included here:
- `supabase/schema.sql`: clean schema scaffold
- `src/matching.ts`: agent-client matching formula and archetype maps
- `src/brevo.ts`: clean Brevo email sender and REQUITY reviewer match email
- `src/email/*.legacy.ts`: pulled from Requity 6 for reference/migration
- `public/archetype-images`: archetype image assets copied from Requity 6

Client source rules:
1. QR-code clients belong directly to that agent's dashboard.
2. QR-code clients do not enter the REQUITY reviewer queue.
3. REQUITY reviewer clients receive the badge: `REQUITY Client Match`.
4. Reviewer match notification body:
   "You've received a client match from REQUITY! If you have any issues message requity@support.com. Thank you for working with us."

Matching formula:
Final Match Score =
- 30% orientation fit
- 25% style/focus fit
- 25% stress-response support fit
- 10% negotiation fit
- 10% perceived-value fit

Best primary matches:
The Creative Guide = The Visionary, 99%
The Trendsetter = The Trailblazer, 99%
The Stylist = The Dreamchaser, 94%
The Cheerleader = The Inspirer, 95%
The Analyst = The Strategist, 99%
The Deal Maker = The Closer, 99%
The Adapter = The Pathfinder, 94%
The Agent Supporter = The Advocate, 93%
The Refiner = The Curator, 97%
The Catalyst = The Spark, 95%
The Observer = The Explorer, 92%
The Encourager = The Harmonizer, 97%
The Coordinator = The Organizer, 97%
The Agent Producer = The Producer, 95%
The Adjuster = The Navigator, 96%
The Collaborator = The Supporter, 97%

Recommended next Cursor tasks:
1. Convert static pages into a Vite or Next.js frontend.
2. Add Supabase client env vars.
3. Wire login/signup to Supabase Auth.
4. Create assessment submission endpoints through Supabase Edge Functions.
5. On client assessment submit:
   - calculate client archetype
   - if source = qr: assign to agent and create dashboard message
   - if source = requity_reviewer: create reviewer queue item
6. On reviewer approval:
   - create match_recommendation approved
   - assign client to agent
   - create message for agent
   - send Brevo email using `requityReviewerMatchEmail()`
7. Replace demo dashboard data with Supabase queries.
