/**
 * Static SEO resource page generator for REQUITY.
 *
 * Page content lives in scripts/seo-content/*.mjs as structured data. This
 * script renders each page with the shared REQUITY layout (nav, footer,
 * meta tags, JSON-LD) and writes committed static HTML files at the repo
 * root (and /buyers, /sellers). Re-run after editing content:
 *
 *   node scripts/generate-seo-pages.mjs
 *
 * Rules enforced here: one H1 per page, canonical on www.requityapp.com,
 * WebPage + BreadcrumbList JSON-LD on every page, FAQPage when FAQs exist,
 * CollectionPage for the resources hub, no noindex, no cross dashes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_PAGES } from "./seo-content/core.mjs";
import { GUIDE_PAGES } from "./seo-content/guides.mjs";
import { AUDIENCE_PAGES } from "./seo-content/audiences.mjs";
import { HUB_PAGES } from "./seo-content/hub.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const SITE = "https://www.requityapp.com";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Allow inline <a> links inside paragraph copy; escape nothing there since
// content is authored in-repo. FAQ answers used in JSON-LD are stripped.
const stripTags = (s) => String(s).replace(/<[^>]+>/g, "");

const LOGO = `<a href="/" style="text-decoration:none;"><div class="logo"><div class="requity-animated-logo" aria-label="REQUITY">
    <span class="rq-re">RE</span>
    <span class="rq-q-container" aria-hidden="true">
        <span class="rq-q-ring"></span>
        <span class="rq-q-tail"></span>
        <svg class="rq-splash-wrap" viewBox="0 0 100 60">
            <path class="rq-ripple rq-ripple-inner" d="M 35 15 Q 50 25 65 15" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
            <path class="rq-ripple rq-ripple-outer" d="M 20 25 Q 50 40 80 25" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
            <path class="rq-ripple rq-ripple-furthest" d="M 5 35 Q 50 55 95 35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
        </svg>
    </span>
    <span class="rq-uity">UITY</span>
</div></div></a>`;

// Footer brand mark: the same animated REQUITY wordmark used in the header,
// never plain text. External "helpful resources" links are intentionally NOT
// part of the global footer; if a page needs them, use its additionalReading
// section instead (rendered near the bottom of that page only).
const FOOTER_LOGO = `<div class="footer-logo"><div class="requity-animated-logo" aria-label="REQUITY">
    <span class="rq-re">RE</span>
    <span class="rq-q-container" aria-hidden="true">
        <span class="rq-q-ring"></span>
        <span class="rq-q-tail"></span>
        <svg class="rq-splash-wrap" viewBox="0 0 100 60">
            <path class="rq-ripple rq-ripple-inner" d="M 35 15 Q 50 25 65 15" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
            <path class="rq-ripple rq-ripple-outer" d="M 20 25 Q 50 40 80 25" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
            <path class="rq-ripple rq-ripple-furthest" d="M 5 35 Q 50 55 95 35" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
        </svg>
    </span>
    <span class="rq-uity">UITY</span>
</div></div>`;

const FOOTER = `    <footer class="site-footer">
        <div class="footer-container" style="grid-template-columns: 1.4fr 1.2fr 1fr;">
            <div class="footer-brand">
                ${FOOTER_LOGO}
                <p>REQUITY is a real estate brokerage and referral based agent matching platform. It helps home buyers and sellers connect with a real estate agent who fits their communication style, needs, and market.</p>
            </div>
            <div class="footer-column">
                <h4>Guides</h4>
                <a href="/resources.html">All Resources</a>
                <a href="/real-estate-agent-faq.html">Real Estate Agent FAQ</a>
                <a href="/how-to-find-a-good-real-estate-agent.html">How to Find a Good Real Estate Agent</a>
                <a href="/find-a-real-estate-agent.html">Find a Real Estate Agent</a>
                <a href="/real-estate-agent-matching.html">Real Estate Agent Matching</a>
                <a href="/buyers/find-buyers-agent.html">Find a Buyer Agent</a>
                <a href="/sellers/find-listing-agent.html">Find a Listing Agent</a>
                <a href="/how-it-works.html">How Requity Works</a>
            </div>
            <div class="footer-column">
                <h4>Get Started</h4>
                <a href="/">Home</a>
                <a href="/client/assessment.html">Client Assessment</a>
                <a href="/agent/index.html">For Real Estate Agents</a>
                <a href="/agent/login.html">Agent Login</a>
            </div>
        </div>
        <div class="footer-bottom">© 2026 REQUITY. All rights reserved.</div>
    </footer>`;

function renderSection(section, index) {
  const bg = index % 2 === 0 ? " bg-soft-blue" : "";
  let inner = "";
  if (section.paras) {
    inner += section.paras
      .map((p, i) => `                <p class="support-copy${i > 0 ? " mt-m" : ""}">${p}</p>`)
      .join("\n");
  }
  if (section.list) {
    const tag = section.ordered ? "ol" : "ul";
    inner += `\n                <div class="clean-card" style="margin-top: 1.5rem;">
                    <${tag} style="color: var(--secondary-text); font-size: 1.05rem; line-height: 1.8; padding-left: 1.25rem;">
${section.list.map((li) => `                        <li>${li}</li>`).join("\n")}
                    </${tag}>
                </div>`;
  }
  if (section.after) {
    inner += `\n                <p class="support-copy mt-m">${section.after}</p>`;
  }
  return `        <section class="section${bg}">
            <div class="container" style="max-width: 860px;">
                <h2 class="section-title">${esc(section.h2)}</h2>
${inner}
            </div>
        </section>`;
}

function renderFaqItems(faqs) {
  return faqs
    .map(
      (f) => `                    <details class="faq-item">
                        <summary class="faq-question">${esc(f.q)}</summary>
                        <p class="faq-answer">${f.a}</p>
                    </details>`
    )
    .join("\n");
}

function faqJson(faqs) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: stripTags(f.q),
      acceptedAnswer: { "@type": "Answer", text: stripTags(f.a) },
    })),
  };
}

function buildJsonLd(page) {
  const url = SITE + "/" + page.path;
  const graph = [];
  graph.push({
    "@type": page.collection ? "CollectionPage" : "WebPage",
    "@id": url,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { "@id": SITE + "/#website" },
  });
  const crumbs = [{ "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" }];
  if (page.path !== "resources.html") {
    crumbs.push({ "@type": "ListItem", position: 2, name: "Resources", item: SITE + "/resources.html" });
    crumbs.push({ "@type": "ListItem", position: 3, name: page.breadcrumb, item: url });
  } else {
    crumbs.push({ "@type": "ListItem", position: 2, name: "Resources", item: url });
  }
  graph.push({ "@type": "BreadcrumbList", itemListElement: crumbs });
  const allFaqs = page.faqs || (page.faqGroups ? page.faqGroups.flatMap((g) => g.faqs) : null);
  if (allFaqs && allFaqs.length) graph.push(faqJson(allFaqs));
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

function renderBody(page) {
  const parts = [];
  parts.push(`        <section class="section">
            <div class="container" style="max-width: 860px;">
                <h1 class="section-title">${esc(page.h1)}</h1>
${page.intro.map((p, i) => `                <p class="support-copy${i > 0 ? " mt-m" : ""}">${p}</p>`).join("\n")}
            </div>
        </section>`);

  if (page.linkGroups) {
    page.linkGroups.forEach((group, i) => {
      const bg = i % 2 === 0 ? " bg-soft-blue" : "";
      parts.push(`        <section class="section${bg}">
            <div class="container" style="max-width: 860px;">
                <h2 class="section-title">${esc(group.h2)}</h2>
                <p class="support-copy">${group.intro}</p>
                <div class="clean-card" style="margin-top: 1.5rem;">
                    <ul style="color: var(--secondary-text); font-size: 1.05rem; line-height: 1.9; padding-left: 1.25rem;">
${group.links.map((l) => `                        <li><a href="${l.href}">${esc(l.label)}</a>: ${l.desc}</li>`).join("\n")}
                    </ul>
                </div>
            </div>
        </section>`);
    });
  }

  if (page.sections) {
    page.sections.forEach((s, i) => parts.push(renderSection(s, i)));
  }

  parts.push(`        <section class="section text-center">
            <div class="container final-cta">
                <h2 class="section-title">${esc(page.ctaTitle || "Ready to find your agent match?")}</h2>
                <p class="support-copy mx-auto" style="max-width: 600px;">${page.ctaCopy || "Complete a short relationship style assessment and let Requity help you connect with a real estate agent who fits how you communicate."}</p>
                <a href="/client/assessment.html" class="btn btn-primary mt-m">Find your agent match</a>
            </div>
        </section>`);

  if (page.faqGroups) {
    const groups = page.faqGroups
      .map(
        (g) => `                <h2 class="section-title text-center mt-l">${esc(g.h2)}</h2>
                <div class="faq-list mt-m">
${renderFaqItems(g.faqs)}
                </div>`
      )
      .join("\n");
    parts.push(`        <section class="section bg-soft-blue">
            <div class="container" style="max-width: 860px;">
${groups}
            </div>
        </section>`);
  } else if (page.faqs) {
    parts.push(`        <section class="section bg-soft-blue">
            <div class="container" style="max-width: 860px;">
                <h2 class="section-title text-center">Frequently asked questions</h2>
                <div class="faq-list mt-l">
${renderFaqItems(page.faqs)}
                </div>
            </div>
        </section>`);
  }

  if (page.related && page.related.length) {
    parts.push(`        <section class="section">
            <div class="container" style="max-width: 860px;">
                <h2 class="section-title">Related guides</h2>
                <div class="clean-card" style="margin-top: 1.5rem;">
                    <ul style="color: var(--secondary-text); font-size: 1.05rem; line-height: 1.9; padding-left: 1.25rem;">
${page.related.map((r) => `                        <li><a href="${r.href}">${esc(r.label)}</a></li>`).join("\n")}
                        <li><a href="/resources.html">Browse all Requity resources</a></li>
                    </ul>
                </div>
            </div>
        </section>`);
  }

  // Optional per-page external reading. This is the ONLY place external links
  // are allowed: a small brand-styled section near the bottom of a dedicated
  // resource page, never the global footer or app pages. No endorsement implied.
  if (page.additionalReading && page.additionalReading.length) {
    parts.push(`        <section class="section">
            <div class="container" style="max-width: 860px;">
                <h2 class="section-title">Additional reading</h2>
                <p class="support-copy">Independent, non-affiliated references for further research. Requity is not associated with these organizations.</p>
                <div class="clean-card" style="margin-top: 1.5rem;">
                    <ul style="color: var(--secondary-text); font-size: 1.05rem; line-height: 1.9; padding-left: 1.25rem;">
${page.additionalReading.map((r) => `                        <li><a href="${r.href}" rel="nofollow noopener noreferrer" target="_blank">${esc(r.label)}</a>${r.desc ? `: ${r.desc}` : ""}</li>`).join("\n")}
                    </ul>
                </div>
            </div>
        </section>`);
  }

  return parts.join("\n\n");
}

function renderPage(page) {
  const url = SITE + "/" + page.path;
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}">
    <link rel="canonical" href="${url}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Requity" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/apple-touch-icon.png" />

    <!-- Twitter / X -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" />
    <meta name="twitter:image" content="${SITE}/apple-touch-icon.png" />

    <script type="application/ld+json">
${buildJsonLd(page)}
    </script>

    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Nunito:wght@800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/client/styles.css">
    <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>

    <nav class="sticky-nav">
        <div class="nav-container">
            ${LOGO}
            <div class="nav-links">
                <a href="/">Home</a>
                <a href="/resources.html">Resources</a>
                <a href="/client/assessment.html">Find your match</a>
            </div>
        </div>
    </nav>

    <main>
${renderBody(page)}
    </main>

${FOOTER}

</body>
</html>
`;
}

const ALL_PAGES = [...CORE_PAGES, ...GUIDE_PAGES, ...AUDIENCE_PAGES, ...HUB_PAGES];

function visibleWords(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").length;
}

for (const page of ALL_PAGES) {
  const html = renderPage(page);
  const outPath = path.join(rootDir, page.path);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log(`${page.path}: ${visibleWords(html)} words`);
}
console.log(`Generated ${ALL_PAGES.length} pages.`);
