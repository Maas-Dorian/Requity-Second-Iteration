/**
 * Market landing page generator for REQUITY.
 *
 * Each market page is the FULL original homepage (client/index.html) cloned
 * at build time, with only these personalizations:
 *
 *   1. head SEO (title, description, canonical, OG, Twitter, JSON-LD)
 *   2. body theme class (market-theme-*)
 *   3. hero headline, subheadline, and primary CTA label
 *   4. skyline background on the first hero section only (via market.css)
 *   5. a small additive "local fit" section right after the hero
 *   6. window.REQUITY_PAGE_MARKET so every CTA carries ?market=slug
 *   7. static assessment links rewritten to the market assessment URL
 *
 * Nothing is removed from the homepage template, so market pages always have
 * the same sections, cards, FAQ, and footer as the real homepage. The
 * homepage-only location prompt scripts are stripped (geolocation must not
 * run on market pages).
 *
 * Every transformation is anchored on exact homepage markup and THROWS if an
 * anchor is missing, so a future homepage edit fails the generation loudly
 * instead of silently producing broken market pages. If you edit
 * client/index.html and generation fails, update the anchors below.
 *
 * Also emits (do not edit these by hand):
 *   client/market-data.js  window.REQUITY_MARKETS for the homepage location
 *                          prompt and the assessment market prefill
 *   client/market.css      per-market theme variables + skyline hero styles
 *
 * Re-run after editing scripts/seo-content/markets.mjs or client/index.html:
 *
 *   node scripts/generate-market-pages.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKET_LIST } from "./seo-content/markets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const SITE = "https://www.requityapp.com";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const TEMPLATE = fs.readFileSync(path.join(rootDir, "client/index.html"), "utf8");

/** Replace an exact anchor; throw if it is not present exactly `count` times. */
function replaceAnchored(html, anchor, replacement, label, count = 1) {
  const occurrences = html.split(anchor).length - 1;
  if (occurrences !== count) {
    throw new Error(
      `Market page template anchor "${label}" matched ${occurrences} times (expected ${count}). ` +
        "client/index.html changed; update scripts/generate-market-pages.mjs."
    );
  }
  return html.split(anchor).join(replacement);
}

function buildJsonLd(m) {
  const url = SITE + m.url;
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": SITE + "/#organization",
          name: "REQUITY",
          url: SITE,
          logo: SITE + "/apple-touch-icon.png",
          description:
            "REQUITY is a real estate brokerage and referral based agent matching platform. It helps buyers and sellers connect with real estate agents through personality based assessments, communication insights, market fit, and agent client compatibility matching.",
        },
        {
          "@type": "WebSite",
          "@id": SITE + "/#website",
          name: "REQUITY",
          url: SITE,
          publisher: { "@id": SITE + "/#organization" },
        },
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
      ],
    },
    null,
    2
  );
}

function localSection(m) {
  return `        <!-- Market local fit section (additive; unique to market pages) -->
        <section class="section market-local">
            <div class="container" style="max-width: 860px;">
                <span class="market-badge">${esc(m.displayName)} market</span>
                <h2 class="section-title">${esc(m.localTitle)}</h2>
                <p class="support-copy">${esc(m.localBody)}</p>
                <ul class="market-bullets">
${m.localBullets.map((b) => `                    <li>${esc(b)}</li>`).join("\n")}
                </ul>
            </div>
        </section>

`;
}

function renderPage(m) {
  const url = SITE + m.url;
  let html = TEMPLATE;

  // --- Head: SEO metadata -------------------------------------------------
  html = replaceAnchored(
    html,
    "<title>Requity | Find a Real Estate Agent Match Built Around You</title>",
    `<title>${esc(m.title)}</title>`,
    "title"
  );
  html = replaceAnchored(
    html,
    '<meta name="description" content="Requity helps buyers and sellers find real estate agents through relationship style assessments, communication insights, transaction needs, and agent client compatibility matching.">',
    `<meta name="description" content="${esc(m.metaDescription)}">`,
    "meta description"
  );
  html = replaceAnchored(
    html,
    '<link rel="canonical" href="https://www.requityapp.com/" />',
    `<link rel="canonical" href="${url}" />`,
    "canonical"
  );
  html = replaceAnchored(
    html,
    '<meta property="og:title" content="Requity | Real Estate Agent Matching" />',
    `<meta property="og:title" content="${esc(m.title)}" />`,
    "og:title"
  );
  html = replaceAnchored(
    html,
    '<meta property="og:description" content="Requity helps buyers and sellers find real estate agents through personality based assessments, communication insights, and compatibility matching." />',
    `<meta property="og:description" content="${esc(m.metaDescription)}" />`,
    "og:description"
  );
  html = replaceAnchored(
    html,
    '<meta property="og:url" content="https://www.requityapp.com/" />',
    `<meta property="og:url" content="${url}" />`,
    "og:url"
  );
  html = replaceAnchored(
    html,
    '<meta name="twitter:title" content="Requity | Find a Real Estate Agent Match Built Around You" />',
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    "twitter:title"
  );
  html = replaceAnchored(
    html,
    '<meta name="twitter:description" content="Find a real estate agent who fits your communication style, goals, and buying or selling needs." />',
    `<meta name="twitter:description" content="${esc(m.metaDescription)}" />`,
    "twitter:description"
  );

  // JSON-LD: swap the homepage Organization/WebSite/WebApplication/FAQPage
  // graph for a market-specific WebPage + BreadcrumbList graph (the FAQPage
  // markup stays exclusive to the homepage to avoid duplicate FAQ schema).
  const ldStart = html.indexOf('<script type="application/ld+json">');
  const ldEnd = html.indexOf("</script>", ldStart);
  if (ldStart === -1 || ldEnd === -1) {
    throw new Error("Market page template anchor \"JSON-LD block\" not found.");
  }
  html =
    html.slice(0, ldStart) +
    `<script type="application/ld+json">\n${buildJsonLd(m)}\n    </script>` +
    html.slice(ldEnd + "</script>".length);

  // Market theme stylesheet (loaded by market pages only).
  html = replaceAnchored(
    html,
    '<link rel="stylesheet" href="/client/styles.css">',
    '<link rel="stylesheet" href="/client/styles.css">\n    <link rel="stylesheet" href="/client/market.css">',
    "styles.css link"
  );

  // --- Body: theme class, hero personalization ----------------------------
  html = replaceAnchored(html, "<body>", `<body class="${m.themeClass}">`, "body tag");
  html = replaceAnchored(
    html,
    '<section class="hero section">',
    '<section class="hero section market-hero">',
    "hero section"
  );
  html = replaceAnchored(
    html,
    '<h1 class="hero-headline">Find a real estate agent who fits how you communicate.</h1>',
    `<h1 class="hero-headline">${esc(m.heroHeadline)}</h1>`,
    "hero headline"
  );
  html = replaceAnchored(
    html,
    '<p class="hero-subheadline">Requity uses personality based assessments and relationship insights to help buyers and sellers connect with real estate agents whose working style fits their needs.</p>',
    `<p class="hero-subheadline">${esc(m.heroSubheadline)}</p>`,
    "hero subheadline"
  );
  html = replaceAnchored(
    html,
    '<button class="btn btn-primary js-assessment-cta" data-assessment-cta>Find your agent match</button>',
    `<button class="btn btn-primary js-assessment-cta" data-assessment-cta>${esc(m.primaryCta)}</button>`,
    "hero primary CTA"
  );
  html = replaceAnchored(
    html,
    '<button class="btn btn-primary mt-m js-assessment-cta" data-assessment-cta>Find your match</button>',
    `<button class="btn btn-primary mt-m js-assessment-cta" data-assessment-cta>${esc(m.primaryCta)}</button>`,
    "final CTA button"
  );

  // Additive local section directly after the hero, before "A Better Way".
  html = replaceAnchored(
    html,
    "        <!-- 2. A Better Way Section",
    localSection(m) + "        <!-- 2. A Better Way Section",
    "better-way section comment"
  );

  // Static assessment links carry the market query for no-JS visitors and
  // crawlers (script.js rewrites the data-assessment-cta ones at runtime to
  // the same URL).
  html = html.split('href="/client/assessment.html"').join(`href="${m.assessmentUrl}"`);

  // --- Scripts: market context in, homepage location prompt out -----------
  html = replaceAnchored(
    html,
    '<script src="/client/script.js"></script>',
    `<script>window.REQUITY_PAGE_MARKET = "${m.slug}";</script>\n    <script src="/client/script.js"></script>`,
    "script.js include"
  );
  html = replaceAnchored(
    html,
    `    <!-- Optional market routing: homepage only. Asks once, stores the answer
         in localStorage, and never forces a redirect. -->
    <script defer src="/client/market-data.js"></script>
    <script defer src="/client/market-location.js"></script>
`,
    "",
    "location prompt scripts"
  );

  return html;
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
 * image. If the image file is missing, the CSS background simply does not
 * paint and the hero falls back to the normal clean homepage hero over the
 * soft tint; nothing breaks and no broken-image icon can appear (CSS
 * backgrounds never render one). This stylesheet is loaded only by market
 * pages, never by the homepage.
 */

${themes}

/* Skyline hero: the image sits behind a soft overlay gradient so the navy
   headline stays readable. Applies only to the first hero section. */
.market-hero {
    background-color: var(--market-soft, #F3F7FC);
    background-image:
        linear-gradient(180deg, var(--market-overlay, rgba(255, 255, 255, 0.85)) 0%, rgba(255, 255, 255, 0.66) 55%, rgba(255, 255, 255, 0.92) 100%),
        var(--market-skyline, none);
    background-size: cover, cover;
    background-position: center bottom, center bottom;
    background-repeat: no-repeat, no-repeat;
}

.market-hero .hero-headline { color: var(--market-deep, var(--primary-text)); }

.market-hero .hero-trust-pills .trust-pill svg { color: var(--market-accent, #FF6A00); }

/* Keep the "Your Review" journey card clean white and readable on top of
   the skyline. */
.market-hero .journey-card {
    background: var(--white, #FFFFFF);
    box-shadow: 0 10px 30px rgba(30, 63, 122, 0.12);
}

/* Local fit section (additive, market pages only) */
.market-local { background-color: var(--market-soft, #F3F7FC); }

.market-badge {
    display: inline-block;
    padding: 0.3rem 0.75rem;
    margin-bottom: 0.9rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #FFFFFF;
    background: var(--market-accent, #FF6A00);
}

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

/* Mobile readability: stronger overlay so the headline stays clear over
   busier skyline areas on narrow screens. */
@media (max-width: 768px) {
    .market-hero {
        background-image:
            linear-gradient(180deg, rgba(255, 255, 255, 0.93) 0%, rgba(255, 255, 255, 0.82) 55%, rgba(255, 255, 255, 0.95) 100%),
            var(--market-skyline, none);
    }
}
`;
}

for (const m of MARKET_LIST) {
  const outPath = path.join(rootDir, m.url.replace(/^\//, ""));
  fs.writeFileSync(outPath, renderPage(m));
  const hasSkyline = fs.existsSync(path.join(rootDir, m.skylineImage.replace(/^\//, "")));
  console.log(`${m.url.replace(/^\//, "")}${hasSkyline ? "" : "  (note: skyline image missing, hero falls back to clean style)"}`);
}

fs.writeFileSync(path.join(rootDir, "client/market-data.js"), renderMarketData());
fs.writeFileSync(path.join(rootDir, "client/market.css"), renderMarketCss());
console.log(`Generated ${MARKET_LIST.length} market pages, client/market-data.js, client/market.css.`);
