/**
 * Homepage-only optional location prompt.
 *
 * Loaded exclusively by client/index.html (the generic homepage). Shows a
 * small dismissible banner once. If the visitor opts in, browser geolocation
 * is called exactly once; when the position is within a target market's
 * radius they are routed to that market's landing page. Declining, failing,
 * or being outside every market keeps them on the generic homepage and the
 * prompt never reappears (state lives in localStorage).
 *
 * localStorage keys:
 *   requity_location_choice   allowed | declined | unavailable
 *   requity_selected_market   market slug (e.g. dallas)
 *
 * Market data comes from window.REQUITY_MARKETS (client/market-data.js,
 * generated from scripts/seo-content/markets.mjs).
 */
(function () {
    "use strict";

    var CHOICE_KEY = "requity_location_choice";
    var MARKET_KEY = "requity_selected_market";

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }

    // Safe analytics: no-ops when the shared helper is unavailable. Only
    // categorical values are sent, never coordinates.
    function track(name, props) {
        try {
            if (window.RequityAnalytics) window.RequityAnalytics.track(name, props);
        } catch (e) { /* ignore */ }
    }

    var markets = Array.isArray(window.REQUITY_MARKETS) ? window.REQUITY_MARKETS : [];
    if (!markets.length) return;
    if (!("geolocation" in navigator)) return;
    if (storageGet(CHOICE_KEY)) return; // already answered, never re-prompt

    function getDistanceMiles(lat1, lng1, lat2, lng2) {
        var R = 3958.8;
        var toRad = function (v) { return (v * Math.PI) / 180; };
        var dLat = toRad(lat2 - lat1);
        var dLng = toRad(lng2 - lng1);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function nearestMarket(lat, lng) {
        var best = null;
        var bestDist = Infinity;
        markets.forEach(function (m) {
            var d = getDistanceMiles(lat, lng, m.lat, m.lng);
            if (d > m.radiusMiles) return;
            // City markets win over the statewide Virginia page when both are
            // in range (e.g. a Washington DC visitor near the border).
            var score = m.statewide ? d + 1000 : d;
            if (score < bestDist) { best = m; bestDist = score; }
        });
        return best;
    }

    var STYLES = [
        ".market-locate-banner { position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 1200;",
        "  max-width: 460px; margin-left: auto; background: #FFFFFF; border: 1px solid #D8E5F5;",
        "  border-radius: 12px; box-shadow: 0 12px 32px rgba(30, 63, 122, 0.16); padding: 1.1rem 1.2rem; }",
        ".market-locate-banner h3 { font-size: 1.05rem; color: #102033; margin: 0 0 0.4rem; }",
        ".market-locate-banner p { font-size: 0.92rem; color: #4A607C; line-height: 1.5; margin: 0 0 0.5rem; }",
        ".market-locate-banner .mlb-privacy { font-size: 0.8rem; color: #7086A3; margin-bottom: 0.8rem; }",
        ".market-locate-banner .mlb-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }",
        ".market-locate-banner button { font: inherit; cursor: pointer; border-radius: 8px; padding: 0.55rem 1rem; border: 1px solid transparent; }",
        ".market-locate-banner .mlb-primary { background: #1E3F7A; color: #FFFFFF; }",
        ".market-locate-banner .mlb-primary:hover { background: #152d59; }",
        ".market-locate-banner .mlb-secondary { background: transparent; color: #1E3F7A; border-color: #D8E5F5; }",
        ".market-locate-banner .mlb-secondary:hover { background: #F3F7FC; }",
        "@media (max-width: 480px) { .market-locate-banner { left: 10px; right: 10px; bottom: 10px; } }"
    ].join("\n");

    function buildBanner() {
        var style = document.createElement("style");
        style.textContent = STYLES;
        document.head.appendChild(style);

        var banner = document.createElement("div");
        banner.className = "market-locate-banner";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-label", "See REQUITY in your market");
        banner.innerHTML =
            '<h3>See REQUITY in your market</h3>' +
            '<p>REQUITY can use your location to show the most relevant local page and support your agent matching experience. You can also continue without sharing your location.</p>' +
            '<p class="mlb-privacy">We only use this to route you to a relevant REQUITY market page. You can continue without sharing.</p>' +
            '<div class="mlb-actions">' +
            '<button type="button" class="mlb-primary">Use my location</button>' +
            '<button type="button" class="mlb-secondary">Continue without location</button>' +
            '</div>';
        document.body.appendChild(banner);

        function remove() {
            if (banner.parentNode) banner.parentNode.removeChild(banner);
        }

        track("location_prompt_shown", { page_type: "generic" });

        banner.querySelector(".mlb-secondary").addEventListener("click", function () {
            storageSet(CHOICE_KEY, "declined");
            track("location_permission_declined", { page_type: "generic" });
            remove();
        });

        banner.querySelector(".mlb-primary").addEventListener("click", function () {
            var primary = banner.querySelector(".mlb-primary");
            primary.disabled = true;
            primary.textContent = "Locating...";
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    storageSet(CHOICE_KEY, "allowed");
                    var m = nearestMarket(pos.coords.latitude, pos.coords.longitude);
                    track("location_permission_allowed", {
                        page_type: "generic",
                        nearest_market: m ? m.slug : null,
                        within_market_radius: !!m
                    });
                    if (m) {
                        storageSet(MARKET_KEY, m.slug);
                        track("market_page_routed", { page_type: "generic", market: m.slug });
                        window.location.href = m.url;
                    } else {
                        remove(); // outside every market: stay on the homepage
                    }
                },
                function () {
                    storageSet(CHOICE_KEY, "unavailable");
                    track("location_permission_unavailable", { page_type: "generic" });
                    remove();
                },
                { timeout: 8000, maximumAge: 600000 }
            );
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", buildBanner);
    } else {
        buildBanner();
    }
})();
