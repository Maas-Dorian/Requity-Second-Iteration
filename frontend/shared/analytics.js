/**
 * REQUITY shared client-side analytics helper (Vercel Web Analytics).
 *
 * The site is static HTML, so custom events go through the Vercel beacon
 * (`/_vercel/insights/script.js`) via `window.va("event", { name, data })`.
 * This file must load BEFORE any script that tracks events; it installs the
 * standard queue stub so events fired before the beacon loads are not lost.
 *
 * Privacy rules (enforced here, not left to call sites):
 *   - properties must be flat primitives (string | number | boolean | null)
 *   - nested objects/arrays are rejected
 *   - undefined properties are removed
 *   - strings are truncated to 255 characters
 *   - event names must be snake_case
 * Never pass names, emails, phones, free-text answers, tokens, or raw ids.
 *
 * Custom events require a supported Vercel plan. When unavailable this helper
 * silently no-ops; page analytics and all business flows keep working.
 */
(function () {
    "use strict";

    // Queue stub: the beacon script drains window.vaq when it loads.
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

    var EVENT_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;
    var MAX_PROPS = 20;
    var MAX_STRING = 255;
    var ATTRIBUTION_KEY = "requity_attribution_v1";

    function isDebug() {
        try {
            var host = window.location.hostname;
            return host === "localhost" || host === "127.0.0.1" ||
                (typeof localStorage !== "undefined" && localStorage.requity_debug === "1");
        } catch (e) { return false; }
    }

    function sanitizeProps(props) {
        var out = {};
        if (!props || typeof props !== "object") return out;
        var count = 0;
        for (var key in props) {
            if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
            if (count >= MAX_PROPS) break;
            var v = props[key];
            if (v === undefined) continue;
            var t = typeof v;
            if (v !== null && t !== "string" && t !== "number" && t !== "boolean") continue; // reject nested
            if (t === "number" && !isFinite(v)) continue;
            if (t === "string") {
                v = v.slice(0, MAX_STRING);
                if (v === "") continue;
            }
            out[key] = v;
            count += 1;
        }
        return out;
    }

    /** Safe wrapper: never throws, never blocks navigation. */
    function trackClientEvent(eventName, properties) {
        try {
            if (typeof window === "undefined") return;
            if (typeof eventName !== "string" || !EVENT_NAME_RE.test(eventName)) {
                if (isDebug()) console.warn("[REQUITY analytics] invalid event name:", eventName);
                return;
            }
            var data = sanitizeProps(properties);
            if (isDebug()) console.log("[REQUITY analytics]", eventName, data);
            if (typeof window.va === "function") {
                window.va("event", { name: eventName, data: data });
            }
        } catch (e) { /* analytics must never break the page */ }
    }

    /** Fire an event at most once per browser session (sessionStorage flag). */
    function trackOnce(flagKey, eventName, properties) {
        try {
            var key = "rq_evt_" + flagKey;
            if (sessionStorage.getItem(key)) return false;
            sessionStorage.setItem(key, "1");
        } catch (e) { /* storage unavailable: still fire, accept duplicates */ }
        trackClientEvent(eventName, properties);
        return true;
    }

    function getDeviceType() {
        try {
            var w = window.innerWidth || 1024;
            if (w < 768) return "mobile";
            if (w < 1024) return "tablet";
            return "desktop";
        } catch (e) { return "desktop"; }
    }

    /** Normalize document.referrer to a safe category. Never stores full URLs. */
    function normalizeReferrer(ref) {
        if (!ref) return "direct";
        try {
            var host = new URL(ref).hostname.toLowerCase();
            if (host === window.location.hostname) return "internal";
            if (/(^|\.)google\./.test(host)) return "google";
            if (/(^|\.)bing\.com$/.test(host)) return "bing";
            if (/(^|\.)(duckduckgo|yahoo)\./.test(host)) return "search";
            if (/(^|\.)(facebook|fb)\.com$/.test(host)) return "facebook";
            if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
            if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
            if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
            if (/(^|\.)(twitter|x)\.com$/.test(host)) return "social";
            return "referral";
        } catch (e) { return "other"; }
    }

    function referrerType(normalized) {
        if (normalized === "direct" || normalized === "internal") return "direct";
        if (normalized === "google" || normalized === "bing" || normalized === "search") return "search";
        if (normalized === "facebook" || normalized === "instagram" || normalized === "tiktok" ||
            normalized === "linkedin" || normalized === "social") return "social";
        if (normalized === "referral") return "referral";
        return "unknown";
    }

    /**
     * First-touch attribution: captured once per browser, never overwritten.
     * Stores only UTM values, the normalized referrer, and a path group.
     */
    function captureAttribution() {
        try {
            if (localStorage.getItem(ATTRIBUTION_KEY)) return;
            var qs = new URLSearchParams(window.location.search);
            var normalized = normalizeReferrer(document.referrer || "");
            if (normalized === "internal") return; // internal navigation is never first touch
            var att = {
                utm_source: (qs.get("utm_source") || "").slice(0, 100) || null,
                utm_medium: (qs.get("utm_medium") || "").slice(0, 100) || null,
                utm_campaign: (qs.get("utm_campaign") || "").slice(0, 100) || null,
                utm_content: (qs.get("utm_content") || "").slice(0, 100) || null,
                utm_term: (qs.get("utm_term") || "").slice(0, 100) || null,
                referrer: normalized,
                landing_path_group: pathGroup(),
                ts: Date.now()
            };
            localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(att));
        } catch (e) { /* ignore */ }
    }

    /** First-touch attribution fields, safe to attach to events. */
    function getAttribution() {
        var att = null;
        try { att = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "null"); } catch (e) {}
        att = att || {};
        var utmType = att.utm_medium === "cpc" || att.utm_medium === "paid" ? "paid" : null;
        return {
            utm_source: att.utm_source || null,
            utm_medium: att.utm_medium || null,
            utm_campaign: att.utm_campaign || null,
            utm_content: att.utm_content || null,
            referrer_type: utmType || referrerType(att.referrer || normalizeReferrer(document.referrer || ""))
        };
    }

    function pathGroup() {
        try {
            var p = window.location.pathname;
            if (p === "/" || p === "/client/index.html" || p === "/index.html") return "homepage";
            if (p.indexOf("/buyers/") === 0) return "buyers";
            if (p.indexOf("/sellers/") === 0) return "sellers";
            if (p.indexOf("/client/") === 0) return "client";
            if (p.indexOf("/agent/") === 0) return "agent";
            if (p.indexOf("/reviewer/") === 0) return "reviewer";
            if (/-real-estate-agent\.html$/.test(p)) return "market";
            return "resource";
        } catch (e) { return "other"; }
    }

    /** Market slug for the current page (market landing pages only). */
    function pageMarket() {
        return typeof window.REQUITY_PAGE_MARKET === "string" && window.REQUITY_PAGE_MARKET
            ? window.REQUITY_PAGE_MARKET : null;
    }

    /** Page type: set by templates/generators as window.REQUITY_PAGE_TYPE. */
    function pageType() {
        return typeof window.REQUITY_PAGE_TYPE === "string" && window.REQUITY_PAGE_TYPE
            ? window.REQUITY_PAGE_TYPE : null;
    }

    // --- Landing page auto-tracking ----------------------------------------
    // Runs only on pages that declare window.REQUITY_PAGE_TYPE (homepage,
    // market pages, buyer/seller pages, resource pages). Fires:
    //   landing_page_viewed, founder video events, client/agent CTA clicks.
    function initLandingTracking() {
        var pt = pageType();
        if (!pt) return;
        var market = pageMarket();
        var att = getAttribution();
        var locationChoice = "not_asked";
        try {
            locationChoice = localStorage.getItem("requity_location_choice") || "not_asked";
        } catch (e) {}

        trackClientEvent("landing_page_viewed", {
            page_type: pt,
            market: market,
            path_group: pathGroup(),
            referrer_type: att.referrer_type,
            utm_source: att.utm_source,
            utm_medium: att.utm_medium,
            utm_campaign: att.utm_campaign,
            utm_content: att.utm_content,
            device_type: getDeviceType(),
            location_choice: locationChoice
        });

        initFounderVideoTracking(pt, market);
        initCtaTracking(pt, market, att);
    }

    function initFounderVideoTracking(pt, market) {
        var video = document.querySelector("[data-founder-video]");
        if (!video) return;
        var base = { page_type: pt, market: market, video_id: "founder_introduction" };

        if (typeof IntersectionObserver === "function") {
            var seen = false;
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting && !seen) {
                        seen = true;
                        trackOnce("video_impression", "founder_video_impression", base);
                        io.disconnect();
                    }
                });
            }, { threshold: 0.4 });
            io.observe(video);
        }

        video.addEventListener("play", function () {
            trackOnce("video_started", "founder_video_started", base);
        });

        // Milestones fire once per page session, driven by playback position so
        // seeking or replaying never re-fires them.
        var milestones = [
            { pct: 25, name: "founder_video_25_percent" },
            { pct: 50, name: "founder_video_50_percent" },
            { pct: 75, name: "founder_video_75_percent" }
        ];
        var fired = {};
        video.addEventListener("timeupdate", function () {
            if (!video.duration || !isFinite(video.duration)) return;
            var pct = (video.currentTime / video.duration) * 100;
            milestones.forEach(function (m) {
                if (pct >= m.pct && !fired[m.pct]) {
                    fired[m.pct] = true;
                    trackOnce("video_" + m.pct, m.name, base);
                }
            });
        });
        video.addEventListener("ended", function () {
            trackOnce("video_completed", "founder_video_completed", base);
        });
    }

    function ctaLocation(el) {
        try {
            if (el.closest("footer")) return "footer";
            if (el.closest(".founder-video-section")) return "video_section";
            if (el.closest(".hero, .hero-section, .demo-nav, nav, header")) return "hero";
            var section = el.closest("section");
            if (section && section.id === "how-it-works") return "how_it_works";
            if (pageType() === "resource" || pageType() === "buyer" || pageType() === "seller") return "resource";
            return "how_it_works";
        } catch (e) { return "hero"; }
    }

    function initCtaTracking(pt, market, att) {
        // Client CTA: "Find your agent" controls carry data-assessment-cta on
        // app pages; generated resource pages use plain assessment links.
        var ctaEls = [];
        document.querySelectorAll('[data-assessment-cta], a[href^="/client/assessment"]').forEach(function (el) {
            if (ctaEls.indexOf(el) === -1) ctaEls.push(el);
        });
        ctaEls.forEach(function (el) {
            el.addEventListener("click", function () {
                trackClientEvent("client_cta_clicked", {
                    page_type: pt,
                    market: market,
                    cta_location: ctaLocation(el),
                    destination: "client_assessment",
                    utm_source: att.utm_source,
                    utm_campaign: att.utm_campaign
                });
            });
        });
        // Agent CTA: links into the agent experience.
        document.querySelectorAll('a[href*="/agent/"]').forEach(function (el) {
            el.addEventListener("click", function () {
                var href = el.getAttribute("href") || "";
                var destination = href.indexOf("login") >= 0 ? "agent_login"
                    : href.indexOf("index") >= 0 || /\/agent\/?$/.test(href) ? "agent_information"
                    : "agent_information";
                trackClientEvent("agent_cta_clicked", {
                    page_type: pt,
                    market: market,
                    cta_location: ctaLocation(el),
                    destination: destination
                });
            });
        });
    }

    captureAttribution();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initLandingTracking);
    } else {
        initLandingTracking();
    }

    window.RequityAnalytics = {
        track: trackClientEvent,
        trackOnce: trackOnce,
        getDeviceType: getDeviceType,
        getAttribution: getAttribution,
        pathGroup: pathGroup,
        pageMarket: pageMarket,
        pageType: pageType
    };
})();
