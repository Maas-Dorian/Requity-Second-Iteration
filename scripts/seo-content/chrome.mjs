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

/**
 * Founder introduction video section, shared by the buyer/seller landing
 * pages. Must stay in sync with the same section in client/index.html (which
 * the market page generator clones). client/script.js hides the section when
 * the MP4 is missing, so a broken player can never show in production.
 */
export const FOUNDER_VIDEO_SECTION = `        <!-- Founder introduction video (shared section; keep in sync with client/index.html) -->
        <section id="meet-the-founder" class="section founder-video-section">
            <div class="container" style="max-width: 980px;">
                <h2 class="section-title text-center">Meet the founder of REQUITY</h2>
                <p class="support-copy text-center mx-auto" style="max-width: 720px;">Learn why REQUITY was created and how our human-reviewed matching process helps buyers and sellers make a more informed choice when selecting a real estate agent.</p>
                <div class="founder-video-frame mt-l">
                    <video controls playsinline preload="metadata" aria-label="Introduction to REQUITY from the founder" data-founder-video>
                        <source src="/assets/videos/requity-founder-introduction.mp4" type="video/mp4" />
                        <!-- TODO: add a <track kind="captions"> when /assets/videos/requity-founder-introduction.vtt exists -->
                        Your browser does not support the video element.
                    </video>
                </div>
            </div>
        </section>
        <script>
        (function () {
            var video = document.querySelector('[data-founder-video]');
            if (!video) return;
            var section = video.closest('.founder-video-section');
            function hideSection() {
                if (section) section.style.display = 'none';
                if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
                    console.warn('[REQUITY] Founder introduction video failed to load; hiding the section.');
                }
            }
            video.addEventListener('error', hideSection);
            var sources = video.querySelectorAll('source');
            if (sources.length) sources[sources.length - 1].addEventListener('error', hideSection);
        })();
        </script>`;

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
