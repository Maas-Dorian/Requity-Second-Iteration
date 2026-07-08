/**
 * Shared page chrome for generated static pages (SEO resource pages and
 * market landing pages): the animated REQUITY logo and the global footer.
 * The wordmark markup must stay in sync with client/index.html.
 */

export const LOGO = `<a href="/" style="text-decoration:none;"><div class="logo"><div class="requity-animated-logo" aria-label="REQUITY">
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
export const FOOTER_LOGO = `<div class="footer-logo"><div class="requity-animated-logo" aria-label="REQUITY">
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

export const FOOTER = `    <footer class="site-footer">
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
