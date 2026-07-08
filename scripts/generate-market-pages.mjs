/**
 * Market landing page generator for REQUITY.
 *
 * Renders one static HTML page per market defined in
 * scripts/seo-content/markets.mjs (e.g. /dallas-real-estate-agent.html) and
 * also emits two derived files:
 *
 *   client/market-data.js   small browser config (window.REQUITY_MARKETS)
 *                           used by the homepage location prompt and the
 *                           assessment market prefill
 *   client/market.css       per-market theme variables + skyline hero styles
 *
 * Re-run after editing the market config:
 *
 *   node scripts/generate-market-pages.mjs
 *
 * Rules: one H1 per page, canonical on www.requityapp.com, WebPage +
 * BreadcrumbList JSON-LD, no noindex, no cross dashes, analytics script
 * included exactly once (same tag as every other public page). The skyline
 * is a CSS background on the hero of the active page only; a missing SVG
 * simply leaves the soft gradient fallback.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKET_LIST } from "./seo-content/markets.mjs";
import { LOGO, FOOTER } from "./seo-content/chrome.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const SITE = "https://www.requityapp.com";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function buildJsonLd(m) {
  const url = SITE + m.url;
  const graph = [
    {
      "@type": "WebPage",
      "@id": url,
      url,
      name: m.title,
      description: m.metaDescription,
      isPartOf: { "@id": SITE + "/#website" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: `Find a Real Estate Agent in ${m.name}`, item: url },
      ],
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

const TRUST_PILLS = `                    <div class="hero-trust-pills" aria-label="Why REQUITY">
                        <span class="trust-pill">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
                            Human-reviewed matches
                        </span>
                        <span class="trust-pill">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"></path><path d="M22 4 12 14.01l-3-3"></path></svg>
                            Matched to your style
                        </span>
                        <span class="trust-pill">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                            Free to start
                        </span>
                    </div>`;

const JOURNEY_CARD = `                <div class="hero-visual">
                    <div class="journey-card">
                        <h3 class="journey-title">Your Review</h3>
                        <div class="journey-list">
                            <div class="j-item active">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                <span>Intake started</span>
                            </div>
                            <div class="j-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                <span>Assessment in progress</span>
                            </div>
                            <div class="j-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                <span>Profile received</span>
                            </div>
                            <div class="j-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <span>Match under review</span>
                            </div>
                            <div class="j-item">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                                <span>You&#8217;ll be notified</span>
                            </div>
                        </div>
                    </div>
                </div>`;

function renderPage(m) {
  const url = SITE + m.url;
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(m.title)}</title>
    <meta name="description" content="${esc(m.metaDescription)}">
    <link rel="canonical" href="${url}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Requity" />
    <meta property="og:title" content="${esc(m.title)}" />
    <meta property="og:description" content="${esc(m.metaDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/apple-touch-icon.png" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(m.title)}" />
    <meta name="twitter:description" content="${esc(m.metaDescription)}" />
    <meta name="twitter:image" content="${SITE}/apple-touch-icon.png" />

    <script type="application/ld+json">
${buildJsonLd(m)}
    </script>

    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Nunito:wght@800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/client/styles.css">
    <link rel="stylesheet" href="/client/market.css">
    <script defer src="/_vercel/insights/script.js"></script>
</head>
<body class="${m.themeClass}">

    <nav class="sticky-nav">
        <div class="nav-container">
            ${LOGO}
            <div class="nav-links">
                <a href="/">Home</a>
                <a href="/resources.html">Resources</a>
                <a href="${m.assessmentUrl}" data-market-cta>Find your match</a>
            </div>
        </div>
    </nav>

    <main>
        <!-- Market hero: skyline background applies to this section only. -->
        <section class="hero section market-hero">
            <div class="container grid-2 align-center">
                <div class="hero-content">
                    <h1 class="hero-headline">${esc(m.h1)}</h1>
                    <p class="hero-subheadline">${esc(m.subheadline)}</p>
                    <div class="hero-actions">
                        <a class="btn btn-primary" href="${m.assessmentUrl}" data-market-cta>${esc(m.ctaLabel)}</a>
                        <a href="/agent/index.html" class="btn btn-text">For real estate agents</a>
                    </div>
${TRUST_PILLS}
                </div>
${JOURNEY_CARD}
            </div>
        </section>

        <!-- Local fit section: intentionally small, not an SEO block. -->
        <section class="section market-local">
            <div class="container" style="max-width: 860px;">
                <h2 class="section-title">${esc(m.localTitle)}</h2>
                <p class="support-copy">${esc(m.localBody)}</p>
                <ul class="market-bullets">
${m.localBullets.map((b) => `                    <li>${esc(b)}</li>`).join("\n")}
                </ul>
                <p class="support-copy compact-links mt-m">New to the process? Read <a href="/how-to-find-a-good-real-estate-agent.html">how to find a good real estate agent</a> or see <a href="/how-it-works.html">how REQUITY works</a>.</p>
            </div>
        </section>

        <!-- CTA -->
        <section class="section text-center market-cta">
            <div class="container">
                <h2 class="section-title">Ready to find your match?</h2>
                <p class="support-copy mx-auto" style="max-width: 600px;">Start with a short assessment about your goals, communication style, and what your move needs. A REQUITY team member reviews every profile before a match is finalized.</p>
                <a class="btn btn-primary mt-m" href="${m.assessmentUrl}" data-market-cta>${esc(m.ctaLabel)}</a>
            </div>
        </section>
    </main>

${FOOTER}

    <script>
    // Remember the chosen market so the assessment can prefill it. The CTA
    // links already carry ?market=${m.slug}; this is a non-blocking extra.
    (function () {
        document.querySelectorAll("[data-market-cta]").forEach(function (el) {
            el.addEventListener("click", function () {
                try { localStorage.setItem("requity_selected_market", "${m.slug}"); } catch (e) { /* ignore */ }
            });
        });
    })();
    </script>
</body>
</html>
`;
}

// --- Browser market config (window.REQUITY_MARKETS) ------------------------
function renderMarketData() {
  const compact = MARKET_LIST.map((m) => ({
    slug: m.slug,
    name: m.name,
    stateCode: m.stateCode,
    statewide: m.statewide,
    lat: m.lat,
    lng: m.lng,
    radiusMiles: m.radiusMiles,
    url: m.url,
  }));
  return `// Generated by scripts/generate-market-pages.mjs. Do not edit by hand;
// edit scripts/seo-content/markets.mjs and re-run the generator.
window.REQUITY_MARKETS = ${JSON.stringify(compact, null, 2)};
`;
}

// --- Market theme CSS -------------------------------------------------------
function renderMarketCss() {
  const themes = MARKET_LIST.map(
    (m) => `body.${m.themeClass} {
    --market-accent: ${m.theme.accent};
    --market-soft: ${m.theme.soft};
    --market-deep: ${m.theme.deep};
    --market-overlay: ${m.theme.overlay};
    --market-skyline: url("${m.skylineImage}");
}`
  ).join("\n\n");

  return `/* Generated by scripts/generate-market-pages.mjs. Do not edit by hand;
 * edit scripts/seo-content/markets.mjs and re-run the generator.
 *
 * Market landing page themes. Each page's <body> carries exactly one
 * market-theme-* class, so the browser downloads only that page's skyline
 * SVG. If the SVG is missing the hero falls back to the soft overlay color
 * over white and nothing breaks. This stylesheet is loaded only by market
 * pages, never by the homepage.
 */

${themes}

/* Skyline hero: overlay gradient is layered over the skyline so text stays
   readable. Applies only to the hero section, not the whole page. */
.market-hero {
    background-color: var(--market-soft, #F3F7FC);
    background-image:
        linear-gradient(180deg, var(--market-overlay, rgba(255, 255, 255, 0.85)) 0%, rgba(255, 255, 255, 0.68) 60%, rgba(255, 255, 255, 0.9) 100%),
        var(--market-skyline, none);
    background-size: cover, cover;
    background-position: center bottom, center bottom;
    background-repeat: no-repeat, no-repeat;
}

.market-hero .hero-headline { color: var(--market-deep, var(--primary-text)); }

.market-hero .hero-trust-pills .trust-pill svg { color: var(--market-accent, #FF6A00); }

/* Local fit section */
.market-local { background-color: var(--market-soft, #F3F7FC); }

.market-bullets {
    list-style: none;
    padding: 0;
    margin-top: 1.25rem;
    display: grid;
    gap: 0.6rem;
}
.market-bullets li {
    position: relative;
    padding-left: 1.6rem;
    color: var(--secondary-text);
    font-size: 1.05rem;
    line-height: 1.6;
}
.market-bullets li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.42em;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--market-accent, #FF6A00);
    opacity: 0.85;
}

/* Small accent underline under the local section title keeps each market
   feeling distinct without going off-brand. */
.market-local .section-title::after {
    content: "";
    display: block;
    width: 56px;
    height: 4px;
    border-radius: 2px;
    margin-top: 0.6rem;
    background: var(--market-accent, #FF6A00);
}

/* Mobile readability: slightly stronger overlay so the headline stays clear
   over busier skyline areas on narrow screens. */
@media (max-width: 768px) {
    .market-hero {
        background-image:
            linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.8) 60%, rgba(255, 255, 255, 0.94) 100%),
            var(--market-skyline, none);
    }
}
`;
}

for (const m of MARKET_LIST) {
  const outPath = path.join(rootDir, m.url.replace(/^\//, ""));
  fs.writeFileSync(outPath, renderPage(m));
  const hasSkyline = fs.existsSync(path.join(rootDir, m.skylineImage.replace(/^\//, "")));
  console.log(`${m.url.replace(/^\//, "")}${hasSkyline ? "" : "  (WARNING: missing skyline asset)"}`);
}

fs.writeFileSync(path.join(rootDir, "client/market-data.js"), renderMarketData());
fs.writeFileSync(path.join(rootDir, "client/market.css"), renderMarketCss());
console.log(`Generated ${MARKET_LIST.length} market pages, client/market-data.js, client/market.css.`);
