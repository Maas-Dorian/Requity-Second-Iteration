/* REQUITY Reviewer JS, live data only.
 *
 * The reviewer matching queue is populated exclusively from the secure
 * /api/reviewer/matches endpoint (reviewer/admin auth required). There is no
 * demo mode and no sample/simulation data: when the queue is empty we show a
 * clean empty state, and when the request fails we show a clean error state.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Analytics (safe no-op wrapper) -------------------------------------
    // Reviewer workflow instrumentation. Only categorical/banded metadata is
    // sent; never client or agent identities, search text, or contact info.
    function rqTrack(name, props) {
        try { if (window.RequityAnalytics) window.RequityAnalytics.track(name, props); } catch (e) { /* ignore */ }
    }
    function rqDistanceBand(miles) {
        if (miles == null || isNaN(miles)) return 'unavailable';
        if (miles <= 10) return '0_to_10';
        if (miles <= 25) return '11_to_25';
        if (miles <= 50) return '26_to_50';
        if (miles <= 75) return '51_to_75';
        return 'over_75';
    }
    function rqFitBand(score) {
        if (score == null || isNaN(score)) return 'unknown';
        if (score >= 85) return 'top';
        if (score >= 70) return 'strong';
        if (score >= 50) return 'moderate';
        return 'limited';
    }
    function rqCountBand(n) {
        n = Number(n) || 0;
        if (n === 0) return 'zero';
        if (n <= 5) return '1_to_5';
        if (n <= 10) return '6_to_10';
        return 'over_10';
    }

    // --- Empty / error copy ------------------------------------------------
    const EMPTY_QUEUE_TITLE = 'No pending matches yet.';
    const EMPTY_QUEUE_SUB = 'Completed client assessments will appear here when they are ready for review.';
    const ERROR_QUEUE_MSG = 'We couldn’t load reviewer matches. Please try again.';
    const LOADING_MSG = 'Loading reviewer matches…';

    // --- Live state (never seeded with sample data) ------------------------
    let clients = [];
    let pairedClients = [];

    let state = {
        loaded: false,
        loadError: false,
        activeClientId: null,
        selectedAgentId: null,
        selectedAgentName: null,
        counts: { pending: 0, fits: 0, scheduled: 0, needsReview: 0 },
        autoMode: 'off', // 'off', 'running', 'complete'
        queueFilter: 'all',       // all | buying | selling | both | general
        queueSearch: '',
        pairedLaneFilter: '',     // '' | buying | selling | both | general
        pairedPaymentFilter: '',  // '' | paid | unpaid
        pairedSearch: '',
        // Match Desk: the lane the reviewer is matching right now. Always
        // explicit; preset from the client's own intent, never a silent
        // default to buying.
        deskLane: null,           // buying | selling | both | general
        deskAgentSearch: '',
        deskHideLimited: false,
        deskInRangeOnly: false,
        deskShowAssessment: false,
        deskConfirmOpen: false
    };

    // --- DOM Elements ------------------------------------------------------
    const elQueueList = document.getElementById('queue-list');
    const elPairedList = document.getElementById('paired-list');
    const elClosedList = document.getElementById('closed-list');

    // Match Desk elements
    const elDeskEmpty = document.getElementById('desk-empty');
    const elDeskBody = document.getElementById('desk-body');
    const elDeskLanePills = document.getElementById('desk-lane-pills');
    const elDeskLaneContext = document.getElementById('desk-lane-context');
    const elDeskClientCard = document.getElementById('desk-client-card');
    const elDeskCurrentMatch = document.getElementById('desk-current-match');
    const elDeskAgentList = document.getElementById('desk-agent-list');
    const elDeskAgentCount = document.getElementById('desk-agent-count');
    const elDeskAgentSearch = document.getElementById('desk-agent-search');
    const elDeskHideLimited = document.getElementById('desk-hide-limited');
    const elDeskInRangeOnly = document.getElementById('desk-in-range-only');
    const elDeskSelectedCard = document.getElementById('desk-selected-card');
    const elDeskConfirm = document.getElementById('desk-confirm');
    const elDeskConfirmBody = document.getElementById('desk-confirm-body');
    const elDeskConfirmError = document.getElementById('desk-confirm-error');
    const elDeskConfirmBtn = document.getElementById('desk-confirm-btn');
    const elDeskConfirmCancel = document.getElementById('desk-confirm-cancel');
    const elDeskNotifyClient = document.getElementById('desk-notify-client');
    const elDeskNotifyNew = document.getElementById('desk-notify-new');
    const elDeskNotifyPrev = document.getElementById('desk-notify-prev');
    const elDeskNotifyPrevWrap = document.getElementById('desk-notify-prev-wrap');
    const elDeskNoteText = document.getElementById('desk-note-text');

    // Update a tab's count badge (defined by the tabs IIFE in index.html).
    function setTabCount(name, count) {
        if (typeof window.__reviewerSetTabCount === 'function') window.__reviewerSetTabCount(name, count);
    }

    const elCountPending = document.getElementById('count-pending');
    const elCountFits = document.getElementById('count-fits');
    const elCountScheduled = document.getElementById('count-scheduled');
    const elCountNeedsReview = document.getElementById('count-needs-review');
    const elCountPairedClients = document.getElementById('count-paired-clients');

    const elActivityLog = document.getElementById('activity-log');

    const autoModal = document.getElementById('auto-modal');
    const btnHeaderAuto = document.getElementById('btn-header-auto');
    const btnConfirmAuto = document.getElementById('btn-confirm-auto');
    const modalName = document.getElementById('modal-name');
    const modalRole = document.getElementById('modal-role');
    const modalConfirm = document.getElementById('modal-confirm');

    const autoStatusPanel = document.getElementById('auto-status-panel');
    const autoBadge = document.getElementById('auto-badge');
    const autoStatusCopy = document.getElementById('auto-status-copy');
    const autoProgressContainer = document.getElementById('auto-progress-container');
    const autoScanned = document.getElementById('auto-scanned');
    const autoScheduled = document.getElementById('auto-scheduled');
    const autoCurrentProfile = document.getElementById('auto-current-profile');

    const bottomBar = document.getElementById('bottom-bar');
    const bottomTitle = document.getElementById('bottom-title');
    const bottomCopy = document.getElementById('bottom-copy');

    // --- Helpers -----------------------------------------------------------
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // --- Client pipeline status (Potential/Active/Under Contract/Closed) ---
    // The reviewer can SEE and SET this status for matched/paired clients. Values
    // map 1:1 to the agent dashboard pipeline status so changes stay consistent.
    var STATUS_OPTIONS = [
        { value: 'potential', label: 'Potential' },
        { value: 'active', label: 'Active' },
        { value: 'under_contract', label: 'Under Contract' },
        { value: 'closed', label: 'Closed' }
    ];
    var STATUS_LABELS = { potential: 'Potential', active: 'Active', under_contract: 'Under Contract', closed: 'Closed' };

    // Normalize any incoming/legacy status into one of the four pipeline values.
    function normalizeStatus(value) {
        var v = String(value == null ? '' : value).trim().toLowerCase();
        if (v === 'active' || v === 'under_contract' || v === 'closed' || v === 'potential') return v;
        if (v === 'assigned' || v === 'matched' || v === 'paired') return 'active';
        if (v === 'closing') return 'under_contract';
        // submitted/completed/ready_for_review/pending_review/etc. → potential.
        return 'potential';
    }

    function statusLabel(value) {
        return STATUS_LABELS[normalizeStatus(value)] || 'Potential';
    }

    // A read-only status pill (formatted, color-coded via the status- class).
    function statusPillHtml(value) {
        var v = normalizeStatus(value);
        return '<span class="status-pill status-' + v + '">' + esc(STATUS_LABELS[v]) + '</span>';
    }

    // An editable status dropdown. target identifies the row to update:
    //   { kind: 'client'|'lead', id: '<uuid>' }. The current value is preselected.
    function statusSelectHtml(value, target) {
        var v = normalizeStatus(value);
        var attrs = 'class="status-select status-' + v + '"' +
            ' data-target-kind="' + esc(target && target.kind ? target.kind : 'client') + '"' +
            ' data-target-id="' + esc(target && target.id ? target.id : '') + '"' +
            ' data-prev="' + v + '"' +
            ' onchange="onReviewerStatusChange(this)"' +
            ' onclick="event.stopPropagation();"' +
            ' aria-label="Client status"';
        var opts = STATUS_OPTIONS.map(function (o) {
            return '<option value="' + o.value + '"' + (o.value === v ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('');
        return '<select ' + attrs + '>' + opts + '</select>';
    }

    // Debug logging (frontend), only when explicitly enabled. No tokens or
    // private payloads are ever logged.
    function reviewerDebug(name, payload) {
        if (typeof localStorage !== 'undefined' && localStorage.requity_debug === '1') {
            try { console.log(name, payload); } catch (e) {}
        }
    }

    // Shared classification counts (incomplete count is set by the Incomplete
    // Assessments loader in index.html). Logged together once known.
    window.__reviewerCounts = window.__reviewerCounts || { incompleteCount: 0, upForReviewCount: 0, pairedCount: 0 };
    function logQueueClassification() {
        reviewerDebug('reviewer:queue-classification', {
            incompleteCount: window.__reviewerCounts.incompleteCount,
            upForReviewCount: window.__reviewerCounts.upForReviewCount,
            pairedCount: window.__reviewerCounts.pairedCount
        });
    }
    window.__reviewerLogClassification = logQueueClassification;

    // Human-readable transaction intent (buying/selling/other) for a client row.
    function transactionText(c) {
        if (!c) return 'Not specified';
        if (c.transaction_intent_label) return c.transaction_intent_label;
        var intent = c.transaction_intent;
        if (intent === 'buying') return 'Buying';
        if (intent === 'selling') return 'Selling';
        if (intent === 'both') return 'Buying and Selling';
        if (intent === 'other') return c.transaction_intent_other || 'Other';
        return 'Not specified';
    }

    function cityOrNull(v) {
        return (v && String(v).trim()) ? String(v).trim() : null;
    }

    // Human-readable city/market for a client row (combined summary).
    function marketText(c) {
        if (!c) return 'Not specified';
        var m = cityOrNull(c.market_city) ||
            cityOrNull(c.buying_market_city) || cityOrNull(c.selling_market_city);
        return m || 'Not specified';
    }

    // Map a live /api/reviewer/matches item ({ client, rankings }) into the
    // shape the reviewer UI renders. Only real fields are used.
    function mapQueueItem(item) {
        const c = (item && item.client) || {};
        const rankings = (item && Array.isArray(item.rankings)) ? item.rankings : [];
        // ALL ranked agents are kept (eligible first, the server sorts them).
        // Ineligible agents (missing location, out of range) are shown with
        // clear warning pills instead of being hidden, so the reviewer always
        // sees the full agent pool. Only eligible agents can be auto-paired.
        let eligibleSeen = 0;
        const fits = rankings.filter(Boolean).map(function (r) {
            const agent = (r && r.agent) || {};
            const row = (r && r.agentRow) || {};
            const eligible = r.eligible !== false;
            if (eligible) eligibleSeen++;
            const locationReason = r.locationReason || '';
            return {
                agentId: agent.id || null,
                name: agent.name || 'Unknown agent',
                archetype: agent.archetype || ', ',
                email: row.email || '',
                phone: row.phone || '',
                marketCity: row.market_city || '',
                marketState: row.market_state || '',
                fit: (r && typeof r.score === 'number') ? r.score : null,
                label: (r && r.label) || '',
                // Prefer the location-aware match reason when present.
                reason: (r && (r.matchReason || r.reason)) || '',
                // Proximity-aware extras (present from the location-aware ranker).
                total: (r && typeof r.totalScore === 'number') ? r.totalScore : null,
                locationScore: (r && typeof r.locationScore === 'number') ? r.locationScore : null,
                distanceMiles: (r && r.distanceMiles != null) ? r.distanceMiles : null,
                limitedFit: !!(r && r.limitedFit),
                warning: (r && r.locationWarning) || null,
                eligible: eligible,
                missingLocation: locationReason === 'Agent location missing',
                outsideRange: !eligible && locationReason === 'Outside agent service range',
                locationReason: locationReason,
                // Informational only. Agents are reusable without limit.
                activeMatchCount: (r && typeof r.activeMatchCount === 'number') ? r.activeMatchCount : 0,
                top: eligible && eligibleSeen === 1
            };
        });
        const matchSummary = (c && c.matchSummary) || null;
        return {
            matchSummary: matchSummary,
            id: c.id,
            clientId: c.id,
            name: c.full_name || 'Unknown client',
            email: c.email || '',
            phone: c.phone || '',
            birthday: c.date_of_birth || '',
            archetype: c.archetype || ', ',
            orientation: c.orientation || ', ',
            style: c.style || ', ',
            stressResponse: c.stress_response || ', ',
            transaction: transactionText(c),
            market: marketText(c),
            buyingMarket: cityOrNull(c.buying_market_city),
            sellingMarket: cityOrNull(c.selling_market_city),
            report: c.report || null,
            // Pipeline status the reviewer can see/set. rowKind tells the update
            // endpoint whether this row is a clients row or an assessment_leads row.
            pipelineStatus: normalizeStatus(c.pipelineStatus || c.pipeline_status),
            rowKind: c.rowKind === 'lead' ? 'lead' : 'client',
            // Raw intent + per-lane match status (Part 5: buying-and-selling
            // clients can hold one active match per lane).
            intent: String(c.transaction_intent || '').toLowerCase(),
            laneStatus: c.laneStatus || null,
            status: statusLabel(c.pipelineStatus || c.pipeline_status),
            highestMatch: (function () { var f = fits.find(function (x) { return x.eligible; }); return f ? f.name : null; })(),
            highestMatchAgentId: (function () { var f = fits.find(function (x) { return x.eligible; }); return f ? f.agentId : null; })(),
            fits: fits
        };
    }

    // The strongest ELIGIBLE fit for a client, or null. Ineligible agents are
    // visible in the list (with warnings) but are never auto-selected.
    function firstEligibleFit(client) {
        return (client && client.fits || []).find(function (f) { return f.eligible !== false; }) || null;
    }

    function clientFieldText(v, fallback) {
        const s = (v === null || v === undefined) ? '' : String(v).trim();
        return s ? s : (fallback || 'Not specified');
    }

    function reportListHtml(items, max) {
        if (!Array.isArray(items) || !items.length) return '';
        return '<ul class="report-list">' +
            items.slice(0, max || 6).map(function (x) { return '<li>' + esc(String(x)) + '</li>'; }).join('') +
            '</ul>';
    }

    function reportApproachSection(title, approachLabel, approaches, avoidLabel, avoid, extras) {
        let body = '';
        if (Array.isArray(approaches) && approaches.length) {
            body += '<span class="report-subhead">' + esc(approachLabel) + '</span>' + reportListHtml(approaches);
        }
        if (avoid && String(avoid).trim()) {
            body += '<span class="report-subhead">' + esc(avoidLabel) + '</span>' +
                '<p class="report-avoid">' + esc(String(avoid)) + '</p>';
        }
        (extras || []).forEach(function (ex) {
            if (Array.isArray(ex.items) && ex.items.length) {
                body += '<span class="report-subhead">' + esc(ex.label) + '</span>' + reportListHtml(ex.items);
            }
        });
        if (!body) return '';
        return '<div class="report-section"><h4>' + esc(title) + '</h4>' + body + '</div>';
    }

    // Full Relational-Roadmap-style detail for the active client profile.
    function buildClientReportHtml(client) {
        const r = client && client.report ? client.report : null;
        const g = r && r.guidelines ? r.guidelines : null;
        const buyer = r && r.buyerProfile ? r.buyerProfile : null;
        const seller = r && r.sellerProfile ? r.sellerProfile : null;

        if (typeof localStorage !== 'undefined' && localStorage.requity_debug === '1') {
            try {
                console.log('client-assessment-detail-render', {
                    id: client.id,
                    archetype: client.archetype || null,
                    hasGuidelines: !!g,
                    hasBuyerProfile: !!buyer,
                    hasSellerProfile: !!seller,
                    transactionIntentLabel: client.transaction,
                    marketCity: client.market
                });
            } catch (e) {}
        }

        const contact =
            '<div class="report-section"><h4>Contact Information</h4>' +
                '<div class="profile-grid">' +
                    '<div class="profile-field"><span class="detail-label">Name</span><span class="detail-value">' + esc(clientFieldText(client.name)) + '</span></div>' +
                    '<div class="profile-field"><span class="detail-label">Email</span><span class="detail-value">' + esc(clientFieldText(client.email)) + '</span></div>' +
                    '<div class="profile-field"><span class="detail-label">Phone</span><span class="detail-value">' + esc(clientFieldText(client.phone)) + '</span></div>' +
                    '<div class="profile-field"><span class="detail-label">Birthday</span><span class="detail-value">' + esc(clientFieldText(client.birthday)) + '</span></div>' +
                '</div>' +
            '</div>';

        if (!r || (!g && !buyer && !seller)) {
            // Legacy/unknown-archetype records: still show the relationship
            // preferences when the client answered the final questions.
            var legacyValued = r ? (r.appreciationStyleLabel || r.appreciationStyle) : null;
            var legacyNotes = r ? (r.agentExpectationsNotes || r.expectationsOrQuestions) : null;
            var legacyPrefs =
                '<div class="report-section"><h4>Agent Relationship Preferences</h4>' +
                    '<span class="report-subhead">How they feel valued</span>' +
                    '<p class="report-text">' + esc(legacyValued || 'Not answered') + '</p>' +
                    '<span class="report-subhead">Expectations, questions, and additional information</span>' +
                    '<p class="report-text" style="white-space:pre-line;">' + esc(legacyNotes || 'Not answered') + '</p>' +
                '</div>';
            return '<div class="client-report">' + contact +
                '<div class="report-section"><h4>Relational Roadmap</h4>' +
                    '<p class="report-text">Detailed guidance is not available for this client yet.</p>' +
                '</div>' + legacyPrefs + '</div>';
        }

        const afterBullets = (r.whatThisClientIsAfter && r.whatThisClientIsAfter.length)
            ? reportListHtml(r.whatThisClientIsAfter, 4)
            : (r.summary ? '<p class="report-text">' + esc(r.summary) + '</p>' : '<p class="report-text">Not available</p>');
        let marketLine;
        if (client.buyingMarket || client.sellingMarket) {
            marketLine = '';
            if (client.buyingMarket) marketLine += ' &nbsp;·&nbsp; Buying market: ' + esc(client.buyingMarket);
            if (client.sellingMarket) marketLine += ' &nbsp;·&nbsp; Selling market: ' + esc(client.sellingMarket);
        } else {
            marketLine = ' &nbsp;·&nbsp; Market: ' + esc(client.market);
        }
        const context = '<p class="report-text">Transaction: ' + esc(client.transaction) + marketLine + '</p>';
        const after = '<div class="report-section"><h4>What This Client Is After</h4>' + afterBullets + context + '</div>';

        const buyerSection = reportApproachSection(
            'As a Buyer',
            'Recommended Buyer Approaches', g ? (g.buyer && g.buyer.approaches) : null,
            'What Buyers Should Avoid', g ? (g.buyer && g.buyer.avoid) : null,
            [
                { label: 'Communication', items: buyer ? buyer.communication : null },
                { label: 'Reducing Stress', items: buyer ? buyer.stressReduction : null }
            ]
        );
        const sellerSection = reportApproachSection(
            'As a Seller',
            'Key Approaches', g ? (g.seller && g.seller.approaches) : null,
            'Avoid', g ? (g.seller && g.seller.avoid) : null,
            [
                { label: 'Communication', items: seller ? seller.communication : null },
                { label: 'Reducing Stress', items: seller ? seller.stressReduction : null }
            ]
        );
        const simultaneousSection = reportApproachSection(
            'Buying & Selling Together',
            'Approaches', g ? (g.simultaneous && g.simultaneous.approaches) : null,
            'Avoid', g ? (g.simultaneous && g.simultaneous.avoid) : null,
            []
        );
        const commSection = reportApproachSection(
            'Communication & Interaction Guidelines',
            'Recommended Approaches', g ? (g.communication && g.communication.recommended) : null,
            '', null,
            [{ label: 'Approaches to Avoid', items: g ? (g.communication && g.communication.avoid) : null }]
        );

        // Agent Relationship Preferences: the two final assessment questions.
        // Old assessments without these answers show "Not answered" (never hidden,
        // never an error). Line breaks in the written response are preserved.
        const valuedLabel = r.appreciationStyleLabel || r.appreciationStyle || 'Not answered';
        const expectationsText = r.agentExpectationsNotes || r.expectationsOrQuestions || '';
        const relationshipPrefs =
            '<div class="report-section"><h4>Agent Relationship Preferences</h4>' +
                '<span class="report-subhead">How they feel valued</span>' +
                '<p class="report-text">' + esc(valuedLabel) + '</p>' +
                '<span class="report-subhead">Expectations, questions, and additional information</span>' +
                '<p class="report-text" style="white-space:pre-line;">' +
                    esc(expectationsText || 'Not answered') + '</p>' +
            '</div>';

        return '<div class="client-report">' + contact + after +
            '<div class="report-grid">' + buyerSection + sellerSection + '</div>' +
            simultaneousSection + commSection + relationshipPrefs +
            '</div>';
    }

    // Clear, reviewer-facing "no eligible local match" guidance + next actions
    // (Part 7). Falls back to a neutral message when no summary is present.
    function noEligibleMatchHtml(summary) {
        var msg = (summary && summary.message)
            ? summary.message
            : 'No eligible agents found in this market.';
        var actions = (summary && summary.suggestedActions) || [];
        var actionsHtml = actions.length
            ? '<ul class="loc-actions">' + actions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>'
            : '';
        var exParts = [];
        if (summary) {
            var missing = summary.missingLocationCount || (summary.excludedAgents && summary.excludedAgents.missingLocation) || 0;
            var outOfRange = summary.outOfRangeCount || (summary.excludedAgents && summary.excludedAgents.outOfRange) || 0;
            var incomplete = summary.incompleteProfileCount || (summary.excludedAgents && summary.excludedAgents.incompleteProfile) || 0;
            if (missing) exParts.push(missing + ' missing location');
            if (outOfRange) exParts.push(outOfRange + ' out of range');
            if (incomplete) exParts.push(incomplete + ' incomplete profile');
        }
        var exHtml = exParts.length ? '<div class="loc-row-sub" style="margin-top:0.4rem;">Excluded agents: ' + esc(exParts.join(' · ')) + '</div>' : '';
        return '<div class="leads-empty"><strong>' + esc(msg) + '</strong>' + actionsHtml + exHtml + '</div>';
    }

    function recomputeCounts() {
        state.counts.needsReview = clients.length;
        // "Pending lane match": buying-and-selling clients with one lane matched
        // and the other lane still open.
        state.counts.pending = clients.filter(function (c) {
            var ls = c.laneStatus;
            return !!(ls && ls.activeMatches && ls.activeMatches.length && !ls.fullyMatched);
        }).length;
        state.counts.fits = clients.reduce(function (sum, c) {
            return sum + (c.fits ? c.fits.filter(function (f) { return f.eligible !== false; }).length : 0);
        }, 0);
        // scheduled is incremented as the reviewer approves matches this session.
    }

    // --- Render Functions --------------------------------------------------
    function renderLoading() {
        elQueueList.innerHTML = '<div class="leads-empty">' + LOADING_MSG + '</div>';
        if (elDeskEmpty) {
            elDeskEmpty.textContent = LOADING_MSG;
            elDeskEmpty.classList.remove('hidden');
        }
        if (elDeskBody) elDeskBody.classList.add('hidden');
    }

    // Client-side queue filters: intent lane pills + a name/email/market search.
    function queueIntentOf(client) {
        var v = String(client.intent || '').toLowerCase();
        if (v === 'buying' || v === 'selling' || v === 'both') return v;
        return 'general';
    }

    function filteredQueueClients() {
        var f = state.queueFilter || 'all';
        var q = (state.queueSearch || '').toLowerCase();
        return clients.filter(function (c) {
            if (f !== 'all' && queueIntentOf(c) !== f) return false;
            if (q) {
                var hay = ((c.name || '') + ' ' + (c.email || '') + ' ' + (c.market || '') +
                    ' ' + (c.buyingMarket || '') + ' ' + (c.sellingMarket || '')).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
    }

    function renderQueue() {
        elQueueList.innerHTML = '';

        if (state.loadError) {
            elQueueList.innerHTML = '<div class="leads-empty">' + ERROR_QUEUE_MSG + '</div>';
            return;
        }
        if (!clients.length) {
            elQueueList.innerHTML =
                '<div class="leads-empty"><strong>No clients need review right now.</strong><br>' + EMPTY_QUEUE_SUB + '</div>';
            return;
        }
        var visible = filteredQueueClients();
        if (!visible.length) {
            elQueueList.innerHTML = '<div class="leads-empty">No clients match these filters.</div>';
            return;
        }

        visible.forEach(function (client) {
            const isActive = client.id === state.activeClientId ? 'active' : '';
            const html =
                '<div class="queue-item ' + isActive + '" onclick="selectClient(\'' + esc(client.id) + '\')" id="q-' + esc(client.id) + '">' +
                    '<div class="queue-info">' +
                        '<h3>' + esc(client.name) + '</h3>' +
                        '<div class="queue-meta">' + esc(client.transaction) + ' &middot; ' + esc(client.market) + ' &middot; ' + esc(client.archetype) + '</div>' +
                        compactPrefsHtml(client) +
                        laneStatusHtml(client) +
                    '</div>' +
                    statusPillHtml(client.pipelineStatus) +
                '</div>';
            elQueueList.insertAdjacentHTML('beforeend', html);
        });
    }

    // Compact relationship-preference indicators (queue cards only; the full
    // open-ended response is intentionally reserved for View full assessment).
    function compactPrefsHtml(client) {
        var r = client && client.report;
        if (!r) return '';
        var bits = [];
        var label = r.appreciationStyleLabel || null;
        if (label) bits.push('Appreciation: ' + esc(label));
        if (r.agentExpectationsNotes || r.expectationsOrQuestions) bits.push('Additional expectations provided');
        if (!bits.length) return '';
        return '<div class="queue-meta" style="margin-top:0.2rem;">' + bits.join(' &bull; ') + '</div>';
    }

    // Lane summary for buying-and-selling clients still in the queue (Part 5):
    // shows which side is already matched and which side still needs a match.
    function laneStatusHtml(client) {
        var ls = client && client.laneStatus;
        if (!ls || !ls.activeMatches || !ls.activeMatches.length || ls.fullyMatched) return '';
        var matched = ls.activeMatches.map(function (m) {
            return esc(m.laneLabel || 'Match') + ' matched' + (m.agentName ? (' with ' + esc(m.agentName)) : '');
        }).join(' &bull; ');
        var needs = (ls.unmatchedLaneLabels || []).map(esc).join(', ');
        return '<div class="queue-meta" style="margin-top:0.2rem;">' + matched +
            (needs ? (' &bull; Still needs: ' + needs + ' match') : '') + '</div>';
    }

    // --- Match Desk ----------------------------------------------------------
    // Compact matching station: client summary on the left, agent options on
    // the right, one lane selector on top, one primary action at the bottom.

    var LANE_LABELS = { buying: 'Buying', selling: 'Selling', both: 'Both', general: 'General' };

    // Frontend mirror of the backend lane overlap rule: buying and selling can
    // coexist; a both/general match overlaps everything.
    function lanesOverlapFE(a, b) {
        if (!a || !b) return true;
        if (a === b) return true;
        if (a === 'both' || b === 'both' || a === 'general' || b === 'general') return true;
        return false;
    }

    // The lane pills shown for a client. Never wider than the client's intent.
    function lanesForClient(client) {
        var intent = queueIntentOf(client);
        if (intent === 'buying') return ['buying'];
        if (intent === 'selling') return ['selling'];
        if (intent === 'both') return ['buying', 'selling', 'both'];
        return ['general'];
    }

    // Preset lane: the client's own intent. For buying-and-selling clients the
    // first UNMATCHED lane is selected, never a hidden default to buying.
    function defaultLaneFor(client) {
        var intent = queueIntentOf(client);
        if (intent === 'buying' || intent === 'selling' || intent === 'general') return intent;
        var unmatched = (client.laneStatus && client.laneStatus.unmatchedLanes) || [];
        return unmatched.length ? unmatched[0] : 'buying';
    }

    // The current active match (if any) for the selected lane.
    function currentMatchForLane(client, lane) {
        var ls = client && client.laneStatus;
        if (!ls || !ls.activeMatches || !ls.activeMatches.length) return null;
        var exact = ls.activeMatches.find(function (m) { return m.lane === lane; });
        if (exact) return exact;
        return ls.activeMatches.find(function (m) { return lanesOverlapFE(m.lane, lane); }) || null;
    }

    function laneContextText(lane) {
        if (lane === 'both') return 'You are matching both sides with one agent.';
        return 'You are matching the ' + (LANE_LABELS[lane] || 'general').toLowerCase() + ' side.';
    }

    function intentChipHtml(client) {
        var intent = queueIntentOf(client);
        var label = intent === 'both' ? 'Buying and selling' : (LANE_LABELS[intent] || 'General');
        return '<span class="intent-chip intent-' + esc(intent) + '">' + esc(label) + '</span>';
    }

    // --- Agent payment status cache, loaded once and lazily -----------------
    // Agents are REQUITY's paying clients; consumer clients never have a
    // payment status, so this map is keyed by agent id only.
    var paymentsMap = null;       // agent id -> { status, label }
    var paymentsMapLoading = false;
    function ensurePaymentsMap() {
        if (paymentsMap || paymentsMapLoading) return;
        var api = window.RequityAPI;
        if (!api || !api.fetchReviewerPayments) return;
        paymentsMapLoading = true;
        Promise.resolve(api.fetchReviewerPayments({})).then(function (res) {
            var map = {};
            ((res && res.records) || []).forEach(function (r) {
                if (r && r.entityType === 'agent' && r.entityId) {
                    map[r.entityId] = { status: r.status || 'unpaid', label: r.statusLabel || '' };
                }
            });
            paymentsMap = map;
            paymentsMapLoading = false;
            renderDesk();
        }).catch(function () {
            paymentsMapLoading = false;
        });
    }
    function agentPaymentFor(agentId) {
        if (!paymentsMap || !agentId) return null;
        return paymentsMap[agentId] || { status: 'unpaid', label: 'Unpaid' };
    }
    function setAgentPaymentInMap(agentId, status) {
        if (!paymentsMap) paymentsMap = {};
        paymentsMap[agentId] = { status: status, label: PAYMENT_LABELS[status] || status };
    }

    function renderDesk() {
        if (!elDeskBody) return;
        const client = clients.find(function (c) { return c.id === state.activeClientId; });

        if (!client) {
            if (elDeskEmpty) {
                elDeskEmpty.textContent = clients.length
                    ? 'Select a client from the queue to start matching.'
                    : 'No clients need review right now.';
                elDeskEmpty.classList.remove('hidden');
            }
            elDeskBody.classList.add('hidden');
            return;
        }

        if (elDeskEmpty) elDeskEmpty.classList.add('hidden');
        elDeskBody.classList.remove('hidden');

        if (!state.deskLane || lanesForClient(client).indexOf(state.deskLane) === -1) {
            state.deskLane = defaultLaneFor(client);
        }

        ensurePaymentsMap();
        renderDeskLaneBar(client);
        renderDeskClientCard(client);
        renderDeskCurrentMatch(client);
        renderDeskSelectedCard(client);
        renderDeskAgentList(client);
    }

    function renderDeskLaneBar(client) {
        if (!elDeskLanePills) return;
        var lanes = lanesForClient(client);
        elDeskLanePills.innerHTML = lanes.map(function (lane) {
            var active = lane === state.deskLane ? ' is-active' : '';
            var covered = currentMatchForLane(client, lane) && lane !== state.deskLane ? ' is-covered' : '';
            return '<button type="button" class="lane-pill' + active + covered + '" data-desk-lane="' + esc(lane) + '">' +
                esc(lane === 'both' ? 'Both, one agent' : LANE_LABELS[lane]) + '</button>';
        }).join('');
        if (elDeskLaneContext) elDeskLaneContext.textContent = laneContextText(state.deskLane);
    }

    function deskTopNeedsHtml(client) {
        var r = client && client.report;
        var needs = (r && Array.isArray(r.whatThisClientIsAfter)) ? r.whatThisClientIsAfter.slice(0, 3) : [];
        if (!needs.length) return '';
        return '<div class="desk-needs"><span class="detail-label">Top needs</span><ul>' +
            needs.map(function (n) { return '<li>' + esc(String(n)) + '</li>'; }).join('') +
            '</ul></div>';
    }

    function renderDeskClientCard(client) {
        if (!elDeskClientCard) return;
        // Consumer clients never have a payment status; agent payment pills
        // live on the agent rows and the Agent Payments tab.
        var marketBits = [];
        if (client.buyingMarket) marketBits.push('Buying: ' + esc(client.buyingMarket));
        if (client.sellingMarket) marketBits.push('Selling: ' + esc(client.sellingMarket));
        var marketHtml = marketBits.length ? marketBits.join(' &middot; ') : esc(client.market);

        // Compact appreciation-style field (Part 10). The full open-ended
        // response stays inside View full assessment; only an indicator that
        // expectations exist is shown here.
        var deskReport = client.report || null;
        var valuedLabel = (deskReport && (deskReport.appreciationStyleLabel || deskReport.appreciationStyle)) || 'Not answered';
        var hasExpectations = !!(deskReport && (deskReport.agentExpectationsNotes || deskReport.expectationsOrQuestions));

        elDeskClientCard.innerHTML =
            '<div class="desk-client-head">' +
                '<div>' +
                    '<h3 class="desk-client-name">' + esc(client.name) + '</h3>' +
                    '<div class="desk-client-sub">' + esc(client.email || 'No email') + (client.phone ? (' &middot; ' + esc(client.phone)) : '') + '</div>' +
                '</div>' +
                '<div class="status-control"><span class="status-control-label">Status</span>' +
                    statusSelectHtml(client.pipelineStatus, { kind: client.rowKind, id: client.id }) +
                '</div>' +
            '</div>' +
            '<div class="desk-chip-row">' + intentChipHtml(client) + '</div>' +
            '<div class="desk-meta-grid">' +
                '<div><span class="detail-label">Market</span><span class="detail-value">' + marketHtml + '</span></div>' +
                '<div><span class="detail-label">Archetype</span><span class="detail-value">' + esc(client.archetype) + '</span></div>' +
                '<div><span class="detail-label">Communication style</span><span class="detail-value">' + esc(client.style) + '</span></div>' +
                '<div><span class="detail-label">How they feel valued</span><span class="detail-value">' + esc(valuedLabel) + '</span></div>' +
            '</div>' +
            (hasExpectations ? '<div class="queue-meta" style="margin-top:0.35rem;">Additional expectations provided</div>' : '') +
            deskTopNeedsHtml(client) +
            '<div class="desk-client-actions">' +
                '<button type="button" class="btn btn-outline btn-sm" id="desk-assessment-toggle">' +
                    (state.deskShowAssessment ? 'Hide full assessment' : 'View full assessment') + '</button>' +
                '<button type="button" class="btn btn-outline btn-sm" id="desk-delete-btn" onclick="deleteActiveClient()">Delete from review</button>' +
            '</div>' +
            '<div id="desk-full-assessment" class="desk-full-assessment' + (state.deskShowAssessment ? '' : ' hidden') + '">' +
                (state.deskShowAssessment ? buildClientReportHtml(client) : '') +
            '</div>';

        var assessBtn = document.getElementById('desk-assessment-toggle');
        if (assessBtn) assessBtn.addEventListener('click', function () {
            state.deskShowAssessment = !state.deskShowAssessment;
            if (state.deskShowAssessment) {
                rqTrack('reviewer_assessment_opened', {
                    location: 'match_desk',
                    transaction_type: queueIntentOf(client) || null,
                    lane: state.deskLane
                });
            }
            renderDeskClientCard(client);
        });
    }

    function renderDeskCurrentMatch(client) {
        if (!elDeskCurrentMatch) return;
        var lane = state.deskLane;
        var current = currentMatchForLane(client, lane);
        var title = 'Current ' + (LANE_LABELS[lane] || 'General').toLowerCase() + ' match';
        if (!current) {
            elDeskCurrentMatch.innerHTML =
                '<span class="detail-label">' + esc(title) + '</span>' +
                '<div class="desk-current-none">No active match yet.</div>';
            return;
        }
        var laneNote = current.lane !== lane
            ? ' (covered by the ' + (LANE_LABELS[current.lane] || 'general').toLowerCase() + ' match)'
            : '';
        elDeskCurrentMatch.innerHTML =
            '<span class="detail-label">' + esc(title) + '</span>' +
            '<div class="desk-current-agent">' +
                '<strong>' + esc(current.agentName || 'Unknown agent') + '</strong>' +
                '<span class="status-pill status-active">Active</span>' +
            '</div>' +
            '<div class="helper-text">Selecting an agent below will replace this match' + esc(laneNote) + '. The old match moves to history.</div>';
    }

    function deskFilteredFits(client) {
        var q = (state.deskAgentSearch || '').toLowerCase();
        return (client.fits || []).filter(function (fit) {
            if (state.deskHideLimited && fit.limitedFit) return false;
            if (state.deskInRangeOnly && fit.eligible === false) return false;
            if (q) {
                var hay = ((fit.name || '') + ' ' + (fit.archetype || '') + ' ' + (fit.email || '') +
                    ' ' + (fit.phone || '') + ' ' + (fit.marketCity || '') + ' ' + (fit.marketState || '')).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
    }

    function deskHasActiveFilters() {
        return !!(state.deskAgentSearch || state.deskHideLimited || state.deskInRangeOnly);
    }

    // Clear every Match Desk agent filter and re-render (empty-state button).
    window.clearDeskFilters = function () {
        state.deskAgentSearch = '';
        state.deskHideLimited = false;
        state.deskInRangeOnly = false;
        if (elDeskAgentSearch) elDeskAgentSearch.value = '';
        if (elDeskHideLimited) elDeskHideLimited.checked = false;
        if (elDeskInRangeOnly) elDeskInRangeOnly.checked = false;
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (client) renderDeskAgentList(client);
    };

    // The primary action text for the selected lane, kept short on purpose.
    function deskPrimaryActionText(client) {
        var lane = state.deskLane;
        var current = currentMatchForLane(client, lane);
        if (current) {
            if (lane === 'buying') return 'Replace buying match';
            if (lane === 'selling') return 'Replace selling match';
            return 'Replace match';
        }
        if (lane === 'buying') return 'Pair for buying';
        if (lane === 'selling') return 'Pair for selling';
        if (lane === 'both') return 'Pair for both sides';
        return 'Pair agent';
    }

    function renderDeskAgentList(client) {
        if (!elDeskAgentList) return;
        if (!client.fits || !client.fits.length) {
            if (elDeskAgentCount) elDeskAgentCount.textContent = '';
            elDeskAgentList.innerHTML = noEligibleMatchHtml(client.matchSummary);
            return;
        }
        var rows = deskFilteredFits(client);
        if (elDeskAgentCount) {
            elDeskAgentCount.textContent = rows.length === client.fits.length
                ? 'Showing ' + rows.length + ' agent' + (rows.length === 1 ? '' : 's')
                : 'Showing ' + rows.length + ' of ' + client.fits.length + ' agents';
        }
        if (!rows.length) {
            elDeskAgentList.innerHTML =
                '<div class="leads-empty"><strong>No agents match these filters.</strong><br>' +
                '<button type="button" class="btn btn-outline btn-sm mt-2" onclick="clearDeskFilters()">Clear filters</button></div>';
            return;
        }
        var laneWord = laneMarketWordFE(state.deskLane);
        var isBothClient = queueIntentOf(client) === 'both';
        var actionText = deskPrimaryActionText(client);
        elDeskAgentList.innerHTML = rows.map(function (fit) {
            var isSelected = state.selectedAgentId && state.selectedAgentId === fit.agentId;
            var agentPay = agentPaymentFor(fit.agentId);
            var bits = [];
            if (fit.archetype && fit.archetype !== ', ') bits.push(esc(fit.archetype));
            if (fit.missingLocation) bits.push('Location not on file');
            else bits.push(fit.distanceMiles != null ? (fit.distanceMiles + ' mi from ' + laneWord) : 'Distance unavailable');
            if (fit.activeMatchCount > 0) bits.push(fit.activeMatchCount + ' active match' + (fit.activeMatchCount === 1 ? '' : 'es'));
            var badges = '';
            if (fit.top) badges += '<span class="badge badge-highest">Top fit</span>';
            if (fit.fit != null) badges += '<span class="badge badge-internal">' + fit.fit + '%</span>';
            if (fit.limitedFit) badges += '<span class="badge badge-source">Limited fit</span>';
            if (fit.outsideRange) badges += '<span class="badge badge-warn">Outside range</span>';
            if (fit.missingLocation) badges += '<span class="badge badge-warn">Missing location</span>';
            if (agentPay && agentPay.status !== 'paid') badges += '<span class="status-pill pay-' + esc(agentPay.status) + '">' + esc(agentPay.label || 'Unpaid') + '</span>';
            else if (agentPay) badges += '<span class="status-pill pay-paid">Paid</span>';
            // Range context: the backend warning already says "only in range for
            // the buying/selling side"; both-side coverage gets a positive note.
            var rangeNote = fit.warning
                ? '<div class="loc-row-warning">' + esc(fit.warning) + '</div>'
                : (isBothClient && fit.eligible !== false && !fit.limitedFit && fit.distanceMiles != null
                    ? '<div class="desk-range-note">This agent is in range for both sides.</div>'
                    : '');
            // The selected card's button IS the primary action: selecting an
            // agent turns its button into "Pair for buying" (no bottom bar).
            var btn = isSelected
                ? '<button type="button" class="btn btn-primary btn-sm" onclick="pairSelectedAgent()">' + esc(actionText) + '</button>'
                : '<button type="button" class="btn btn-outline btn-sm" onclick="selectGuide(\'' + esc(fit.agentId) + '\')">Select</button>';
            return '<div class="desk-agent-row' + (isSelected ? ' is-selected' : '') + '">' +
                '<div class="desk-agent-main">' +
                    '<span class="desk-agent-name">' + esc(fit.name) + '</span>' +
                    '<span class="desk-agent-sub">' + bits.join(' &middot; ') + '</span>' +
                    rangeNote +
                '</div>' +
                '<div class="desk-agent-side">' + badges + btn + '</div>' +
            '</div>';
        }).join('');
    }

    // Compact selected-agent action card at the top of the agent panel. This
    // replaces the old sticky bottom action bar entirely.
    function renderDeskSelectedCard(client) {
        if (!elDeskSelectedCard) return;
        var fit = state.selectedAgentId
            ? (client.fits || []).find(function (f) { return f.agentId === state.selectedAgentId; })
            : null;
        if (!fit) {
            elDeskSelectedCard.innerHTML =
                '<div class="desk-selected-empty">Select an agent below to pair with ' + esc(client.name) + '.</div>';
            return;
        }
        var agentPay = agentPaymentFor(fit.agentId);
        var bits = [];
        if (fit.archetype && fit.archetype !== ', ') bits.push(esc(fit.archetype));
        if (fit.missingLocation) bits.push('Location not on file');
        else if (fit.distanceMiles != null) bits.push(fit.distanceMiles + ' mi from ' + laneMarketWordFE(state.deskLane));
        if (agentPay) bits.push(esc(agentPay.label || 'Unpaid'));
        elDeskSelectedCard.innerHTML =
            '<div class="desk-selected-main">' +
                '<span class="detail-label">Selected agent</span>' +
                '<span class="desk-selected-name">' + esc(fit.name) + '</span>' +
                (bits.length ? '<span class="desk-selected-sub">' + bits.join(' &middot; ') + '</span>' : '') +
            '</div>' +
            '<button type="button" class="btn btn-primary" onclick="pairSelectedAgent()"' +
                (state.deskConfirmOpen ? ' disabled' : '') + '>' +
                esc(deskPrimaryActionText(client)) + '</button>';
    }

    // Primary pairing action (from the selected card or a selected agent row).
    window.pairSelectedAgent = function () {
        if (!state.selectedAgentId || state.deskConfirmOpen) return;
        openDeskConfirm();
    };

    // The lane the reviewer explicitly has selected on the Match Desk.
    function selectedMatchLane() {
        return state.deskLane || null;
    }

    // --- Desk confirmation panel (small inline panel, not a modal) -----------
    function openDeskConfirm() {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client || !state.selectedAgentId || !elDeskConfirm) return;
        var lane = state.deskLane;
        var laneWord = (LANE_LABELS[lane] || 'General').toLowerCase();
        var current = currentMatchForLane(client, lane);
        state.deskConfirmOpen = true;
        if (elDeskConfirmBody) {
            elDeskConfirmBody.textContent = 'This will make ' + (state.selectedAgentName || 'the selected agent') +
                ' the active ' + laneWord + ' match for ' + client.name +
                '. Previous active matches for this lane will move to history.';
        }
        if (elDeskNotifyClient) elDeskNotifyClient.checked = true;
        if (elDeskNotifyNew) elDeskNotifyNew.checked = true;
        if (elDeskNotifyPrev) elDeskNotifyPrev.checked = false;
        if (elDeskNotifyPrevWrap) elDeskNotifyPrevWrap.classList.toggle('hidden', !current);
        if (elDeskNoteText) elDeskNoteText.value = '';
        if (elDeskConfirmError) { elDeskConfirmError.style.display = 'none'; elDeskConfirmError.textContent = ''; }
        if (elDeskConfirmBtn) { elDeskConfirmBtn.disabled = false; elDeskConfirmBtn.textContent = 'Confirm match'; }
        elDeskConfirm.classList.remove('hidden');
        renderDeskSelectedCard(client);
        elDeskConfirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeDeskConfirm() {
        state.deskConfirmOpen = false;
        if (elDeskConfirm) elDeskConfirm.classList.add('hidden');
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (client) renderDeskSelectedCard(client);
    }

    function confirmDeskMatch(forceReplace) {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client || !state.selectedAgentId) return;
        const fit = (client.fits || []).find(function (f) { return f.agentId === state.selectedAgentId; });
        if (!fit) return;
        if (!window.RequityAPI || !window.RequityAPI.approveReviewerMatch) return;

        var lane = state.deskLane;
        var current = currentMatchForLane(client, lane);
        var payload = matchTargetPayload(client);
        payload.agentId = fit.agentId;
        payload.score = fit.fit != null ? fit.fit : undefined;
        payload.reason = fit.reason || undefined;
        payload.matchLane = lane;
        if (current || forceReplace) payload.replaceExisting = true;
        payload.notifyClient = !elDeskNotifyClient || elDeskNotifyClient.checked;
        payload.notifyNewAgent = !elDeskNotifyNew || elDeskNotifyNew.checked;
        payload.notifyPreviousAgent = !!(elDeskNotifyPrev && elDeskNotifyPrev.checked && (current || forceReplace));
        var note = ((elDeskNoteText && elDeskNoteText.value) || '').trim();
        if (note) payload.reviewerNotes = note;

        if (elDeskConfirmBtn) { elDeskConfirmBtn.disabled = true; elDeskConfirmBtn.textContent = 'Updating...'; }
        if (elDeskConfirmError) { elDeskConfirmError.style.display = 'none'; elDeskConfirmError.textContent = ''; }

        Promise.resolve(window.RequityAPI.approveReviewerMatch(payload)).then(function (res) {
            res = res || {};
            state.counts.scheduled++;
            var laneWord = (LANE_LABELS[lane] || 'General').toLowerCase();
            addLog('Match updated. ' + fit.name + ' is now the ' + laneWord + ' match for ' + client.name + '.');
            closeDeskConfirm();
            if (res.fullyMatched === false) {
                var needs = (res.unmatchedLanes || []).join(', ');
                addLog(client.name + ' still needs a ' + (needs || 'second') + ' match and stays in the queue.');
                // Move the desk straight to the lane that still needs a match.
                if (res.unmatchedLanes && res.unmatchedLanes.length) state.deskLane = res.unmatchedLanes[0];
            }
            loadQueue();
        }).catch(function (err) {
            if (err && err.code === 'CLIENT_ALREADY_MATCHED' && !payload.replaceExisting) {
                // Stale view: an active match exists that we did not know about.
                var active = (err.data && err.data.activeMatch) || {};
                if (elDeskConfirmBody) {
                    elDeskConfirmBody.textContent = 'This client already has an active match with ' +
                        (active.agentName || 'another agent') + '. Confirm again to replace it; the old match will move to history.';
                }
                if (elDeskNotifyPrevWrap) elDeskNotifyPrevWrap.classList.remove('hidden');
                if (elDeskConfirmBtn) {
                    elDeskConfirmBtn.disabled = false;
                    elDeskConfirmBtn.textContent = 'Replace match';
                    elDeskConfirmBtn.setAttribute('data-force-replace', '1');
                }
                return;
            }
            if (elDeskConfirmError) {
                elDeskConfirmError.textContent = (err && (err.serverError || err.message)) || 'Could not update the match. Please try again.';
                elDeskConfirmError.style.display = 'block';
            }
            if (elDeskConfirmBtn) { elDeskConfirmBtn.disabled = false; elDeskConfirmBtn.textContent = 'Confirm match'; }
        });
    }

    // --- Desk event wiring ----------------------------------------------------
    if (elDeskLanePills) elDeskLanePills.addEventListener('click', function (ev) {
        var pill = ev.target.closest ? ev.target.closest('[data-desk-lane]') : null;
        if (!pill) return;
        state.deskLane = pill.getAttribute('data-desk-lane');
        var laneClient = clients.find(function (c) { return c.id === state.activeClientId; });
        rqTrack('reviewer_lane_selected', {
            lane: state.deskLane,
            transaction_type: laneClient ? (queueIntentOf(laneClient) || null) : null
        });
        closeDeskConfirm();
        renderDesk();
    });
    if (elDeskAgentSearch) {
        var deskSearchTimer = null;
        elDeskAgentSearch.addEventListener('input', function () {
            if (deskSearchTimer) clearTimeout(deskSearchTimer);
            deskSearchTimer = setTimeout(function () {
                state.deskAgentSearch = (elDeskAgentSearch.value || '').trim();
                const client = clients.find(function (c) { return c.id === state.activeClientId; });
                if (client) {
                    renderDeskAgentList(client);
                    // Search text is never sent, only that a search happened
                    // and how many results it produced.
                    rqTrack('reviewer_agent_search_used', {
                        lane: state.deskLane,
                        result_count: deskFilteredFits(client).length,
                        filter_count: (state.deskHideLimited ? 1 : 0) + (state.deskInRangeOnly ? 1 : 0),
                        search_has_text: !!state.deskAgentSearch
                    });
                }
            }, 200);
        });
    }
    if (elDeskHideLimited) elDeskHideLimited.addEventListener('change', function () {
        state.deskHideLimited = !!elDeskHideLimited.checked;
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (client) renderDeskAgentList(client);
    });
    if (elDeskInRangeOnly) elDeskInRangeOnly.addEventListener('change', function () {
        state.deskInRangeOnly = !!elDeskInRangeOnly.checked;
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (client) renderDeskAgentList(client);
    });
    if (elDeskConfirmCancel) elDeskConfirmCancel.addEventListener('click', closeDeskConfirm);
    if (elDeskConfirmBtn) elDeskConfirmBtn.addEventListener('click', function () {
        var force = elDeskConfirmBtn.getAttribute('data-force-replace') === '1';
        elDeskConfirmBtn.removeAttribute('data-force-replace');
        confirmDeskMatch(force);
    });

    function updateSummary() {
        if (elCountPending) elCountPending.textContent = state.counts.pending;
        if (elCountFits) elCountFits.textContent = state.counts.fits;
        if (elCountScheduled) elCountScheduled.textContent = state.counts.scheduled;
        if (elCountNeedsReview) elCountNeedsReview.textContent = state.counts.needsReview;
        if (elCountPairedClients) {
            elCountPairedClients.textContent = pairedClients.filter(function (p) {
                return normalizeStatus(p.pipelineStatus) !== 'closed';
            }).length;
        }
        // Unpaid agents + matches-changed cards are owned by the Agent
        // Payments loader in index.html (applySummary).
    }

    function renderAll() {
        recomputeCounts();
        renderQueue();
        renderDesk();
        renderPaired();
        updateSummary();
    }

    // Live "Paired Clients", real matched/assigned pairings only. Clean empty
    // state when there are none. Never fabricated.
    function fmtPairedDate(s) {
        if (!s) return ', ';
        try {
            var d = new Date(s);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { return s; }
    }

    function pairedMarketHtml(p) {
        var buy = cityOrNull(p.buyingMarket);
        var sell = cityOrNull(p.sellingMarket);
        if (buy || sell) {
            var out = '';
            if (buy) out += '<span>Buying market <strong>' + esc(buy) + '</strong></span>';
            if (sell) out += '<span>Selling market <strong>' + esc(sell) + '</strong></span>';
            return out;
        }
        var general = cityOrNull(p.market);
        return '<span>Market <strong>' + esc(general || 'Not specified') + '</strong></span>';
    }

    // Payment pill for a paired card: explicit status when set, Unpaid otherwise.
    var PAYMENT_LABELS = {
        unpaid: 'Unpaid', invoice_sent: 'Invoice sent', paid: 'Paid',
        waived: 'Waived', refunded: 'Refunded', not_required: 'Not required'
    };
    function payPillHtml(status, label) {
        var v = status || 'unpaid';
        return '<span class="status-pill pay-' + esc(v) + '">' + esc(label || PAYMENT_LABELS[v] || 'Unpaid') + '</span>';
    }

    function pairedKey(p) {
        return (p.clientId || p.leadId || p.matchId || '') + ':' + (p.matchLane || 'general');
    }

    // One card per CLIENT with one compact row per lane (buying/selling/both/
    // general), so a buying-and-selling client is a single card with two rows.
    function laneSortIndex(lane) {
        var order = { buying: 0, selling: 1, both: 2, general: 3 };
        return order[lane] != null ? order[lane] : 3;
    }

    function groupPairedRows(list) {
        var groups = [];
        var byKey = {};
        list.forEach(function (p) {
            var key = p.clientId || p.leadId || p.matchId || '';
            if (!byKey[key]) {
                byKey[key] = { key: key, rows: [] };
                groups.push(byKey[key]);
            }
            byKey[key].rows.push(p);
        });
        groups.forEach(function (g) {
            g.rows.sort(function (a, b) {
                return laneSortIndex(a.matchLane || 'general') - laneSortIndex(b.matchLane || 'general');
            });
        });
        return groups;
    }

    // --- Paired card display model -------------------------------------------
    // Every paired client renders as ONE card the reviewer can read in under
    // 5 seconds: header (who + markets), one compact row per lane, and a
    // bottom "Transaction team" recap. Buying-and-selling clients ALWAYS get
    // separate buying and selling rows unless one agent truly covers both.

    var DISPLAY_LANE_LABELS = { buying: 'Buying', selling: 'Selling', both: 'Both, one agent', general: 'General match' };

    function pairedIntentOf(p) {
        var v = String(p.transactionIntent || '').toLowerCase();
        if (v === 'buying' || v === 'selling' || v === 'both') return v;
        return 'general';
    }

    function firstNameOf(name) {
        var n = String(name || '').trim();
        return n ? n.split(/\s+/)[0] : '';
    }

    function laneMarketWordFE(lane) {
        if (lane === 'buying') return 'buying market';
        if (lane === 'selling') return 'selling market';
        return 'client market';
    }

    // Lane-specific market city for copy (buying/selling first, then fallbacks).
    function pairedLaneMarket(p, lane) {
        if (lane === 'buying') return cityOrNull(p.buyingMarket) || cityOrNull(p.market);
        if (lane === 'selling') return cityOrNull(p.sellingMarket) || cityOrNull(p.market);
        return cityOrNull(p.marketLabel) || cityOrNull(p.market) || cityOrNull(p.buyingMarket) || cityOrNull(p.sellingMarket);
    }

    // Distance copy is never blank: "12 mi from buying market" or an honest
    // "Distance unavailable" when coordinates are missing.
    function pairedDistanceLabel(p, lane) {
        if (p.distanceMiles != null) return p.distanceMiles + ' mi from ' + laneMarketWordFE(lane);
        if (p.distanceLabel && p.distanceLabel !== 'Distance unavailable') return p.distanceLabel;
        return 'Distance unavailable';
    }

    function shortDistance(p) {
        return p.distanceMiles != null ? p.distanceMiles + ' mi' : 'Distance unavailable';
    }

    function archetypeWord(a) {
        return String(a || '').replace(/^The\s+/i, '').toLowerCase();
    }

    // One or two lines explaining why this pairing makes sense, built from the
    // lane market, distance, and both archetypes. Weak fits get an honest note.
    function buildMatchBlurb(p, lane) {
        var weak = (p.agentHasLocation === false) ||
            (typeof p.score === 'number' && p.score < 60) ||
            /limited/i.test(p.label || '');
        if (weak) {
            return 'Fit note: This is a limited fit. Review distance, market coverage, and communication style before confirming.';
        }
        var name = firstNameOf(p.agentName) || 'This agent';
        var market = pairedLaneMarket(p, lane);
        var parts = [];
        if (market && p.distanceMiles != null && p.distanceMiles <= 30) {
            parts.push(name + ' is close to the ' + market + ' ' + laneMarketWordFE(lane));
        } else if (market) {
            parts.push(name + ' is aligned with the ' + market + ' ' + laneMarketWordFE(lane));
        }
        if (p.agentArchetype && p.clientArchetype) {
            parts.push('the ' + archetypeWord(p.agentArchetype) + ' style fits this ' + archetypeWord(p.clientArchetype) + ' client');
        } else if (p.agentArchetype) {
            parts.push('the ' + archetypeWord(p.agentArchetype) + ' style supports clear, steady guidance');
        }
        if (!parts.length) {
            return 'Why this works: This agent was selected for market fit, availability, and communication alignment.';
        }
        return 'Why this works: ' + parts.join(' and ') + '.';
    }

    /**
     * The lane rows to DISPLAY for one client card. Entries are
     * { kind: 'match'|'needs', lane, row }. Buying-and-selling clients always
     * get separate buying + selling rows (with Needs match placeholders) unless
     * a single both/general match covers everything, which shows as
     * "Both, one agent". Single-intent clients show their intent lane even when
     * the stored match row is a legacy general lane.
     */
    function displayLanesForGroup(g) {
        var first = g.rows[0];
        var intent = pairedIntentOf(first);
        var byLane = {};
        g.rows.forEach(function (p) { byLane[p.matchLane || 'general'] = p; });

        if (intent === 'both') {
            var covering = byLane.both || byLane.general;
            if (covering && !byLane.buying && !byLane.selling) {
                return [{ kind: 'match', lane: 'both', row: covering }];
            }
            // A lane without its own match falls back to a covering both/general
            // match (legacy mixed data) before showing Needs match.
            var buyEntry = byLane.buying ? { kind: 'match', lane: 'buying', row: byLane.buying }
                : covering ? { kind: 'match', lane: 'buying', row: covering }
                : { kind: 'needs', lane: 'buying', row: first };
            var sellEntry = byLane.selling ? { kind: 'match', lane: 'selling', row: byLane.selling }
                : covering ? { kind: 'match', lane: 'selling', row: covering }
                : { kind: 'needs', lane: 'selling', row: first };
            return [buyEntry, sellEntry];
        }
        if (intent === 'buying' || intent === 'selling') {
            var row = byLane[intent] || byLane.both || byLane.general || first;
            return [{ kind: 'match', lane: intent, row: row }];
        }
        // Unknown intent: show the actual stored lanes, clearly labeled.
        return g.rows.map(function (p) {
            return { kind: 'match', lane: (p.matchLane || 'general'), row: p };
        });
    }

    function laneChangeLabel(lane) {
        if (lane === 'buying') return 'Change buying';
        if (lane === 'selling') return 'Change selling';
        if (lane === 'both') return 'Change agent';
        return 'Change match';
    }

    function pairedLaneRowHtml(entry) {
        var p = entry.row;
        var lane = entry.lane;
        var laneLabel = DISPLAY_LANE_LABELS[lane] || 'General match';
        var lastEmail = p.lastEmailAt ? fmtPairedDate(p.lastEmailAt) : 'Not sent';
        var agentPaid = p.agentPaymentStatus === 'paid';
        var payAction = agentPaid ? 'Change payment' : 'Mark agent paid';
        var warning = (p.agentHasLocation === false)
            ? '<div class="loc-row-warning">Needs location review. The paired agent has no market on file.</div>'
            : '';
        var subBits = [];
        if (p.agentArchetype) subBits.push(esc(p.agentArchetype));
        if (p.agentEmail) subBits.push(esc(p.agentEmail));
        else if (p.agentPhone) subBits.push(esc(p.agentPhone));
        var factBits = [
            esc(pairedDistanceLabel(p, lane)),
            'Last email: ' + esc(lastEmail),
            '<span class="status-pill status-active">Active</span>'
        ];
        return '<div class="paired-lane-row">' +
            '<div class="paired-lane-main">' +
                '<span class="paired-lane-label lane-' + esc(lane === 'both' ? 'both' : lane) + '">' + esc(laneLabel) + '</span>' +
                '<span class="paired-lane-agent">' + esc(p.agentName || 'Unknown agent') + '</span>' +
                (subBits.length ? '<span class="paired-lane-sub">' + subBits.join(' &middot; ') + '</span>' : '') +
                payPillHtml(p.agentPaymentStatus, p.agentPaymentLabel) +
            '</div>' +
            '<div class="paired-lane-facts">' + factBits.join(' &middot; ') + '</div>' +
            '<div class="paired-lane-blurb">' + esc(buildMatchBlurb(p, lane)) + '</div>' +
            '<div class="paired-lane-actions">' +
                '<button type="button" class="btn btn-outline btn-sm" data-paired-act="change" data-paired-key="' + esc(pairedKey(p)) + '" data-cm-lane="' + esc(lane) + '">' + esc(laneChangeLabel(lane)) + '</button>' +
                (p.matchId ? ('<button type="button" class="btn btn-outline btn-sm" data-paired-act="resend" data-paired-key="' + esc(pairedKey(p)) + '">Resend agent email</button>') : '') +
                '<button type="button" class="btn btn-outline btn-sm" data-paired-act="agentpay" data-paired-key="' + esc(pairedKey(p)) + '">' + esc(payAction) + '</button>' +
            '</div>' +
            warning +
        '</div>';
    }

    // A "needs match" row for a lane with no active match yet. The button opens
    // the Match Desk (or Change match editor) on exactly that lane.
    function pairedNeedsRowHtml(p, lane) {
        var matchLabel = lane === 'buying' ? 'Match buying' : lane === 'selling' ? 'Match selling' : 'Match';
        return '<div class="paired-lane-row is-needs">' +
            '<div class="paired-lane-main">' +
                '<span class="paired-lane-label lane-' + esc(lane) + '">' + esc(DISPLAY_LANE_LABELS[lane] || lane) + '</span>' +
                '<span class="paired-lane-agent paired-needs-text">Needs match</span>' +
            '</div>' +
            '<div class="paired-lane-actions">' +
                '<button type="button" class="btn btn-primary btn-sm" data-paired-act="deskmatch" data-paired-key="' + esc(pairedKey(p)) + '" data-desk-lane="' + esc(lane) + '">' + esc(matchLabel) + '</button>' +
            '</div>' +
        '</div>';
    }

    // Header line 2: "email · Buying: Lexington · Selling: Louisville".
    function pairedHeaderContact(first) {
        var bits = [esc(first.clientEmail || 'no email')];
        var intent = pairedIntentOf(first);
        var buy = cityOrNull(first.buyingMarket);
        var sell = cityOrNull(first.sellingMarket);
        var general = cityOrNull(first.market);
        if (intent === 'both') {
            bits.push('Buying: ' + esc(buy || general || 'Not specified'));
            bits.push('Selling: ' + esc(sell || general || 'Not specified'));
        } else if (intent === 'buying') {
            bits.push('Buying: ' + esc(buy || general || 'Not specified'));
        } else if (intent === 'selling') {
            bits.push('Selling: ' + esc(sell || general || 'Not specified'));
        } else {
            bits.push('Market: ' + esc(general || buy || sell || 'Not specified'));
        }
        return bits.join(' &middot; ');
    }

    // "Agents involved: Josh Hunt for buying · Mike Gandolfo for selling",
    // collapsing to one agent when the same agent covers both sides and
    // showing "needs match" for uncovered lanes.
    function agentsInvolvedLine(entries) {
        var matches = entries.filter(function (e) { return e.kind === 'match'; });
        if (!matches.length) return '';
        if (matches.length === 1 && matches[0].lane === 'both') {
            return 'Agent involved: ' + esc(matches[0].row.agentName || 'Unknown agent') + ' for buying and selling';
        }
        var sameAgent = matches.length === 2 &&
            matches[0].row.agentId && matches[0].row.agentId === matches[1].row.agentId;
        if (sameAgent) {
            return 'Agent involved: ' + esc(matches[0].row.agentName || 'Unknown agent') + ' for buying and selling';
        }
        var bits = entries.map(function (e) {
            var laneWord = e.lane === 'buying' ? 'buying' : e.lane === 'selling' ? 'selling' : 'this client';
            if (e.kind === 'needs') {
                return esc(e.lane === 'selling' ? 'Selling' : 'Buying') + ': needs match';
            }
            return esc(e.row.agentName || 'Unknown agent') + ' for ' + laneWord;
        });
        var label = matches.length > 1 ? 'Agents involved: ' : 'Agent involved: ';
        return label + bits.join(' &middot; ');
    }

    // Bottom recap so the reviewer sees the whole team without expanding
    // anything: one line per lane with agent, distance, and payment status.
    function transactionTeamHtml(entries) {
        var lines = entries.map(function (e) {
            var laneWord = e.lane === 'buying' ? 'Buying agent'
                : e.lane === 'selling' ? 'Selling agent'
                : e.lane === 'both' ? 'Buying and selling agent'
                : 'Agent';
            if (e.kind === 'needs') {
                return '<div class="paired-team-line is-needs">' + esc(laneWord) + ': Needs match</div>';
            }
            var p = e.row;
            var pay = p.agentPaymentLabel || PAYMENT_LABELS[p.agentPaymentStatus || 'unpaid'] || 'Unpaid';
            return '<div class="paired-team-line">' + esc(laneWord) + ': ' +
                '<strong>' + esc(p.agentName || 'Unknown agent') + '</strong>' +
                ' &middot; ' + esc(shortDistance(p)) + ' &middot; ' + esc(pay) + '</div>';
        });
        return '<div class="paired-team">' +
            '<span class="paired-team-label">Transaction team</span>' + lines.join('') +
        '</div>';
    }

    function pairedGroupCardHtml(g) {
        var first = g.rows[0];
        var statusTarget = (!first.clientId && first.leadId)
            ? { kind: 'lead', id: first.leadId }
            : { kind: 'client', id: first.clientId };
        var intent = pairedIntentOf(first);
        var intentLabel = intent === 'both' ? 'Buying and selling' : (LANE_LABELS[intent] || 'General');

        var entries = displayLanesForGroup(g);
        var laneRows = entries.map(function (e) {
            return e.kind === 'needs' ? pairedNeedsRowHtml(e.row, e.lane) : pairedLaneRowHtml(e);
        }).join('');

        var agentsLine = agentsInvolvedLine(entries);

        // Compact relationship-preference indicators. The full open-ended
        // response is only shown in the full assessment view, never here.
        var prefBits = [];
        if (first.appreciationStyleLabel) prefBits.push('Appreciation: ' + esc(first.appreciationStyleLabel));
        if (first.hasExpectationsNotes) prefBits.push('Additional expectations provided');
        var prefsLine = prefBits.length
            ? '<div class="paired-agents-line">' + prefBits.join(' &middot; ') + '</div>'
            : '';

        var detailBits = g.rows.map(function (p) {
            var bits = [];
            bits.push('<strong>' + esc(p.matchLaneLabel || 'General') + '</strong>: ' + esc(p.agentName || 'Unknown agent'));
            if (p.agentEmail) bits.push(esc(p.agentEmail));
            if (p.agentPhone) bits.push(esc(p.agentPhone));
            if (p.matchedAt) bits.push('Matched ' + fmtPairedDate(p.matchedAt));
            return '<div class="paired-detail-line">' + bits.join(' &middot; ') + '</div>';
        }).join('');

        // Resend client email lives at the CLIENT-card level (never inside one
        // agent lane) and is only enabled when every required lane is matched,
        // so a partial buying-and-selling match can never email the client.
        var fullyMatched = entries.length > 0 && entries.every(function (e) { return e.kind === 'match'; });
        var resendClientBtn = '<button type="button" class="btn btn-outline btn-sm" data-paired-act="resendclient" data-paired-key="' + esc(pairedKey(first)) + '"' +
            (fullyMatched ? '' : ' disabled title="Available once every side of this match is complete."') +
            '>Resend client email</button>';

        return '<div class="lead-top">' +
                '<div><div class="lead-name">' + esc(first.clientName || 'Unknown client') +
                    ' <span class="intent-chip intent-' + esc(intent) + '">' + esc(intentLabel) + '</span></div>' +
                '<div class="lead-contact">' + pairedHeaderContact(first) + '</div></div>' +
                '<div class="lead-badges">' +
                    '<div class="status-control"><span class="status-control-label">Status</span>' +
                        statusSelectHtml(first.pipelineStatus, statusTarget) +
                    '</div>' +
                '</div>' +
            '</div>' +
            (agentsLine ? '<div class="paired-agents-line">' + agentsLine + '</div>' : '') +
            prefsLine +
            '<div class="paired-lane-rows">' + laneRows + '</div>' +
            transactionTeamHtml(entries) +
            '<div class="paired-actions">' +
                '<button type="button" class="btn btn-outline btn-sm" data-paired-act="assessment" data-paired-key="' + esc(pairedKey(first)) + '">Client assessment</button>' +
                resendClientBtn +
                '<button type="button" class="btn btn-outline btn-sm" data-paired-act="view" data-paired-key="' + esc(pairedKey(first)) + '">View details</button>' +
                '<button type="button" class="btn btn-outline btn-sm" onclick="removePairedClient(\'' + esc(first.clientId || '') + '\', \'' + esc(first.leadId || '') + '\')">Archive</button>' +
            '</div>' +
            '<div class="paired-assessment hidden" data-assessment-slot></div>' +
            '<div class="paired-details hidden">' +
                '<div class="lead-meta">' + pairedMarketHtml(first) + '</div>' +
                detailBits +
            '</div>';
    }

    // Active (non-closed) pairings render in Paired Clients; Closed pairings move
    // to the Closed tab. Both keep the editable status control so a reviewer can
    // move a client back and forth.
    // Client-side Paired filters: lane, AGENT payment state, and search.
    function pairedMatchesFilters(p) {
        if (state.pairedLaneFilter && (p.matchLane || 'general') !== state.pairedLaneFilter) return false;
        if (state.pairedPaymentFilter === 'paid' && p.agentPaymentStatus !== 'paid') return false;
        if (state.pairedPaymentFilter === 'unpaid' && p.agentPaymentStatus === 'paid') return false;
        var q = (state.pairedSearch || '').toLowerCase();
        if (q) {
            var hay = ((p.clientName || '') + ' ' + (p.clientEmail || '') + ' ' +
                (p.agentName || '') + ' ' + (p.agentEmail || '')).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        return true;
    }

    function renderPairedGroupsInto(container, rows, emptyMsg) {
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = '<div class="leads-empty">' + emptyMsg + '</div>';
            return;
        }
        container.innerHTML = '';
        groupPairedRows(rows).forEach(function (g) {
            var card = document.createElement('div');
            card.className = 'lead-card paired-card';
            card.innerHTML = pairedGroupCardHtml(g);
            container.appendChild(card);
        });
    }

    function renderPaired() {
        var active = [];
        var closed = [];
        pairedClients.forEach(function (p) {
            if (normalizeStatus(p.pipelineStatus) === 'closed') closed.push(p); else active.push(p);
        });

        var visible = active.filter(pairedMatchesFilters);
        var hasFilters = !!(state.pairedLaneFilter || state.pairedPaymentFilter || state.pairedSearch);
        renderPairedGroupsInto(elPairedList, visible,
            hasFilters ? 'No paired clients match these filters.' : 'No pairings yet.');
        renderPairedGroupsInto(elClosedList, closed, 'No closed clients yet.');

        setTabCount('paired', groupPairedRows(active).length);
        setTabCount('closed', groupPairedRows(closed).length);
        setTabCount('review', clients.length);
    }

    function selectActiveAgent(client) {
        var best = firstEligibleFit(client);
        if (best) {
            state.selectedAgentId = best.agentId;
            state.selectedAgentName = best.name;
        } else {
            state.selectedAgentId = null;
            state.selectedAgentName = null;
        }
    }

    // --- Global Actions (attached to window for inline onclick) ------------
    // Open a client on the Match Desk, optionally forcing a specific lane
    // (used by "Change buying"/"Change selling" so the clicked lane wins).
    window.selectClient = function (id, lane) {
        if (state.autoMode === 'running') return;
        state.activeClientId = id;
        const client = clients.find(function (c) { return c.id === id; });
        state.deskLane = client
            ? (lane && lanesForClient(client).indexOf(lane) !== -1 ? lane : defaultLaneFor(client))
            : null;
        state.deskAgentSearch = '';
        state.deskShowAssessment = false;
        state.deskInRangeOnly = false;
        state.deskHideLimited = false;
        if (elDeskAgentSearch) elDeskAgentSearch.value = '';
        if (elDeskHideLimited) elDeskHideLimited.checked = false;
        if (elDeskInRangeOnly) elDeskInRangeOnly.checked = false;
        closeDeskConfirm();
        selectActiveAgent(client);
        renderQueue();
        renderDesk();
    };

    window.selectGuide = function (agentId) {
        if (state.autoMode === 'running') return;
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client) return;
        const fit = client.fits.find(function (f) { return f.agentId === agentId; });
        if (!fit) return;
        state.selectedAgentId = fit.agentId;
        state.selectedAgentName = fit.name;
        // Analytics: banded fit/distance only; the agent identity is never sent.
        var pay = agentPaymentFor(fit.agentId);
        rqTrack('reviewer_agent_selected', {
            lane: state.deskLane,
            distance_band: rqDistanceBand(fit.distanceMiles),
            fit_band: rqFitBand(fit.fit),
            agent_payment_status: (pay && pay.status) || 'unknown',
            active_match_count_band: rqCountBand(fit.activeMatchCount)
        });
        renderDeskSelectedCard(client);
        renderDeskAgentList(client);
    };

    // Reviewer sets a client's pipeline status from any status dropdown. Updates
    // optimistically, reverts on failure, and keeps the matching local row in sync
    // so a re-render (and a refresh) shows the new status.
    window.onReviewerStatusChange = function (el) {
        if (!el) return;
        var prev = el.getAttribute('data-prev') || 'potential';
        var next = normalizeStatus(el.value);
        var kind = el.getAttribute('data-target-kind') || 'client';
        var id = el.getAttribute('data-target-id') || '';
        if (!id || next === prev) return;
        var api = window.RequityAPI;
        if (!api || !api.updateReviewerClientStatus) {
            el.value = prev;
            return;
        }

        reviewerDebug('reviewer:status-change', { id: id, previousStatus: prev, nextStatus: next });

        // Optimistic: reflect the new color immediately + disable while saving.
        el.className = 'status-select status-' + next;
        el.disabled = true;

        var payload = { status: next };
        if (kind === 'lead') payload.leadId = id; else payload.clientId = id;

        Promise.resolve(api.updateReviewerClientStatus(payload)).then(function (res) {
            var applied = normalizeStatus(res && res.status ? res.status : next);
            el.setAttribute('data-prev', applied);
            // Keep the local data rows in sync so re-renders/refresh are consistent.
            pairedClients.forEach(function (p) { if (p.clientId === id) p.pipelineStatus = applied; });
            clients.forEach(function (c) { if (c.id === id) { c.pipelineStatus = applied; c.status = statusLabel(applied); } });
            addLog('Status updated to ' + statusLabel(applied) + '.');
            // Re-render so the queue pill + paired cards reflect the change.
            renderQueue();
            renderPaired();
        }).catch(function () {
            // Revert cleanly on failure.
            el.value = prev;
            el.className = 'status-select status-' + prev;
            addLog('Could not update the client status. Please try again.');
        }).finally(function () {
            el.disabled = false;
        });
    };

    // Build the client/lead identifier payload for the match API. Reviewer leads
    // that never became a clients row are matched by leadId; everyone else by clientId.
    function matchTargetPayload(client) {
        return client.rowKind === 'lead'
            ? { leadId: client.clientId }
            : { clientId: client.clientId };
    }

    // Confirm helper: uses the shared modal when present, window.confirm otherwise.
    function confirmAction(opts) {
        if (window.requityConfirm) return window.requityConfirm(opts);
        return Promise.resolve(window.confirm(opts.body || 'Are you sure?'));
    }

    // Part 6: soft-delete (archive) the active up-for-review client. Assessment
    // history and match records are kept; the client just leaves active views.
    window.deleteActiveClient = function () {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client) return;
        if (!window.RequityAPI || !window.RequityAPI.deleteReviewerClient) return;
        confirmAction({
            title: 'Delete client from review?',
            body: 'Are you sure you want to delete this client from review? This will remove them from active reviewer queues but keep assessment history unless permanent deletion is explicitly supported.',
            confirmLabel: 'Delete from review'
        }).then(function (ok) {
            if (!ok) return;
            setDecisionBusy(true);
            const payload = client.rowKind === 'lead'
                ? { leadId: client.clientId, scope: 'up_for_review' }
                : { clientId: client.clientId, scope: 'up_for_review' };
            Promise.resolve(window.RequityAPI.deleteReviewerClient(payload)).then(function () {
                addLog('Deleted ' + client.name + ' from review. Assessment history is kept.');
                removeClientFromQueue(client.id);
            }).catch(function (err) {
                addLog('Could not delete ' + client.name + ' from review. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            }).finally(function () {
                setDecisionBusy(false);
            });
        });
    };

    // Part 6: soft-delete (archive) a paired client card. History is kept.
    window.removePairedClient = function (clientId, leadId) {
        if (!window.RequityAPI || !window.RequityAPI.deleteReviewerClient) return;
        if (!clientId && !leadId) return;
        confirmAction({
            title: 'Remove paired client?',
            body: 'Are you sure you want to remove this paired client? This will archive the client from active reviewer views and keep historical match records.',
            confirmLabel: 'Remove paired client'
        }).then(function (ok) {
            if (!ok) return;
            const payload = { scope: 'paired' };
            if (clientId) payload.clientId = clientId;
            if (leadId) payload.leadId = leadId;
            Promise.resolve(window.RequityAPI.deleteReviewerClient(payload)).then(function () {
                pairedClients = pairedClients.filter(function (p) {
                    if (clientId) return p.clientId !== clientId;
                    return p.leadId !== leadId;
                });
                addLog('Removed the paired client from active views. Match history is kept.');
                renderPaired();
            }).catch(function (err) {
                addLog('Could not remove the paired client. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
        });
    };

    // --- Paired card actions: change match, resend email, agent payment -----
    function findPairedByKey(key) {
        return pairedClients.find(function (p) { return pairedKey(p) === key; }) || null;
    }

    function handlePairedAction(act, key, btn) {
        var p = findPairedByKey(key);
        if (!p) return;
        if (act === 'change') {
            // The lane of the ROW the reviewer clicked wins. Change selling
            // never opens buying, even when the stored match lane is general.
            openChangeMatch(p, btn.getAttribute('data-cm-lane') || null);
            return;
        }
        if (act === 'view') {
            var card = btn.closest ? btn.closest('.paired-card') : null;
            var details = card ? card.querySelector('.paired-details') : null;
            if (details) {
                details.classList.toggle('hidden');
                btn.textContent = details.classList.contains('hidden') ? 'View details' : 'Hide details';
            }
            return;
        }
        if (act === 'deskmatch') {
            // Open the Match Desk on the exact lane that still needs a match.
            var lane = btn.getAttribute('data-desk-lane') || null;
            var targetId = p.clientId || p.leadId;
            var inQueue = clients.find(function (c) { return c.id === targetId; });
            if (!inQueue) {
                addLog('This client is not in the review queue right now. Refresh and try again.');
                return;
            }
            var reviewTab = document.querySelector('#reviewer-tabs [data-tab="review"]');
            if (reviewTab) reviewTab.click();
            window.selectClient(targetId, lane);
            return;
        }
        if (act === 'agentpay') {
            if (!window.RequityAPI || !window.RequityAPI.setReviewerPaymentStatus || !p.agentId) return;
            var nextAgent = (p.agentPaymentStatus === 'paid') ? 'unpaid' : 'paid';
            btn.disabled = true;
            Promise.resolve(window.RequityAPI.setReviewerPaymentStatus({
                entityType: 'agent', entityId: p.agentId, status: nextAgent
            })).then(function () {
                pairedClients.forEach(function (row) {
                    if (row.agentId === p.agentId) {
                        row.agentPaymentStatus = nextAgent;
                        row.agentPaymentLabel = PAYMENT_LABELS[nextAgent];
                    }
                });
                setAgentPaymentInMap(p.agentId, nextAgent);
                addLog('Marked ' + (p.agentName || 'agent') + ' as ' + PAYMENT_LABELS[nextAgent].toLowerCase() + '.');
                renderPaired();
                if (typeof window.__reviewerRefreshPayments === 'function') window.__reviewerRefreshPayments();
            }).catch(function (err) {
                btn.disabled = false;
                addLog('Could not update the agent payment status. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
            return;
        }
        if (act === 'resend') {
            if (!window.RequityAPI || !window.RequityAPI.resendReviewerMatchEmail || !p.matchId) return;
            btn.disabled = true;
            btn.textContent = 'Sending…';
            Promise.resolve(window.RequityAPI.resendReviewerMatchEmail(p.matchId)).then(function (res) {
                p.lastEmailAt = new Date().toISOString();
                var laneWord = (p.matchLaneLabel || 'General').toLowerCase();
                addLog('Resent the ' + laneWord + ' match email to ' + (p.agentName || 'the agent') + '.');
                renderPaired();
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Resend agent email';
                addLog('Could not resend the match email. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
            return;
        }
        if (act === 'resendclient') {
            if (!window.RequityAPI || !window.RequityAPI.resendReviewerClientEmail) return;
            if (btn.disabled) return;
            var rcParams = p.clientId ? { clientId: p.clientId } : { leadId: p.leadId };
            btn.disabled = true;
            btn.textContent = 'Sending…';
            Promise.resolve(window.RequityAPI.resendReviewerClientEmail(rcParams)).then(function () {
                btn.textContent = 'Resend client email';
                btn.disabled = false;
                addLog('Resent the client match email to ' + (p.clientName || 'the client') + '.');
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Resend client email';
                addLog('Could not resend the client email. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
            return;
        }
        if (act === 'assessment') {
            togglePairedAssessment(p, btn);
            return;
        }
    }

    // --- Paired "Client assessment" dropdown (Part 11) -----------------------
    // Details are fetched only when first opened, cached per client/lead for
    // the session, and re-rendered from cache on later toggles.
    var pairedAssessmentCache = {};

    function pairedAssessmentTargetKey(p) {
        return p.clientId ? ('client:' + p.clientId) : ('lead:' + (p.leadId || ''));
    }

    function pairedAssessmentHtml(data) {
        var field = function (label, value) {
            return '<div class="profile-field"><span class="detail-label">' + esc(label) +
                '</span><span class="detail-value">' + esc(value || 'Not answered') + '</span></div>';
        };
        var marketBits = [];
        if (data.buyingMarket) marketBits.push('Buying: ' + data.buyingMarket);
        if (data.sellingMarket) marketBits.push('Selling: ' + data.sellingMarket);
        if (!marketBits.length && data.market) marketBits.push(data.market);
        var needs = (data.topNeeds || []).length
            ? '<div class="profile-field"><span class="detail-label">Top needs</span><ul class="report-list">' +
                data.topNeeds.map(function (n) { return '<li>' + esc(String(n)) + '</li>'; }).join('') + '</ul></div>'
            : field('Top needs', 'Not available');
        var legacyNote = data.legacy
            ? '<div class="queue-meta" style="margin-top:0.35rem;">Some details are unavailable for this older assessment.</div>'
            : '';
        var expectations = (data.agentExpectationsNotes || '').trim();
        return '<h4 style="margin:0 0 0.5rem;">Client Assessment</h4>' +
            '<div class="profile-grid">' +
                field('Transaction', data.transactionIntentLabel) +
                field('Markets', marketBits.join(' · ') || null) +
                field('Communication style', data.communicationStyle) +
                field('Client archetype', data.archetype) +
                needs +
                field('How they feel valued', data.appreciationStyleLabel || 'Not answered') +
            '</div>' +
            '<span class="report-subhead">Expectations and questions</span>' +
            '<p class="report-text" style="white-space:pre-line;">' + esc(expectations || 'Not answered') + '</p>' +
            legacyNote +
            '<button type="button" class="btn btn-outline btn-sm" data-paired-full-report>View full assessment</button>' +
            '<div class="paired-full-report hidden"></div>';
    }

    function bindPairedFullReport(slot, data) {
        var fullBtn = slot.querySelector('[data-paired-full-report]');
        var fullBox = slot.querySelector('.paired-full-report');
        if (!fullBtn || !fullBox) return;
        fullBtn.addEventListener('click', function () {
            var hidden = fullBox.classList.toggle('hidden');
            fullBtn.textContent = hidden ? 'View full assessment' : 'Hide full assessment';
            if (!hidden && !fullBox.innerHTML) {
                // Reuse the Match Desk full-report renderer with a client-shaped object.
                fullBox.innerHTML = buildClientReportHtml({
                    id: data.id,
                    name: data.clientName,
                    email: data.clientEmail,
                    phone: null,
                    birthday: null,
                    archetype: data.archetype,
                    transaction: data.transactionIntentLabel,
                    market: data.market,
                    buyingMarket: data.buyingMarket,
                    sellingMarket: data.sellingMarket,
                    report: data.report
                });
            }
        });
    }

    function togglePairedAssessment(p, btn) {
        var card = btn.closest ? btn.closest('.paired-card') : null;
        var slot = card ? card.querySelector('[data-assessment-slot]') : null;
        if (!slot) return;

        var isHidden = slot.classList.contains('hidden');
        if (!isHidden) {
            // Collapse only; cached content stays for the next open.
            slot.classList.add('hidden');
            btn.textContent = 'Client assessment';
            return;
        }
        slot.classList.remove('hidden');
        btn.textContent = 'Hide client assessment';
        rqTrack('reviewer_assessment_opened', {
            location: 'paired_clients',
            transaction_type: (p && p.transactionIntent) || null,
            is_legacy: !!(p && p.leadId && !p.clientId)
        });

        var key = pairedAssessmentTargetKey(p);
        var cached = pairedAssessmentCache[key];
        if (cached) {
            if (!slot.getAttribute('data-assessment-loaded')) {
                slot.innerHTML = pairedAssessmentHtml(cached);
                slot.setAttribute('data-assessment-loaded', '1');
                bindPairedFullReport(slot, cached);
            }
            return;
        }
        if (!window.RequityAPI || !window.RequityAPI.fetchReviewerClientAssessment) {
            slot.innerHTML = '<div class="leads-empty">We could not load this assessment.</div>';
            return;
        }
        slot.innerHTML = '<div class="leads-empty">Loading assessment...</div>';
        var params = p.clientId ? { clientId: p.clientId } : { leadId: p.leadId };
        Promise.resolve(window.RequityAPI.fetchReviewerClientAssessment(params)).then(function (data) {
            pairedAssessmentCache[key] = data || {};
            slot.innerHTML = pairedAssessmentHtml(pairedAssessmentCache[key]);
            slot.setAttribute('data-assessment-loaded', '1');
            bindPairedFullReport(slot, pairedAssessmentCache[key]);
        }).catch(function () {
            slot.innerHTML = '<div class="leads-empty">We could not load this assessment.</div>';
        });
    }

    function bindPairedActions(container) {
        if (!container) return;
        container.addEventListener('click', function (ev) {
            var btn = ev.target.closest ? ev.target.closest('[data-paired-act]') : null;
            if (!btn) return;
            handlePairedAction(btn.getAttribute('data-paired-act'), btn.getAttribute('data-paired-key'), btn);
        });
    }
    bindPairedActions(elPairedList);
    bindPairedActions(elClosedList);

    // --- Change match editor -------------------------------------------------
    // Replaces the paired agent for ONE explicit lane. The lane the reviewer
    // clicked is preselected; it never falls back to buying on its own.
    var cmState = { paired: null, agents: [], selectedAgent: null, busy: false };
    var cmModal = document.getElementById('change-match-modal');
    var cmLane = document.getElementById('cm-lane');
    var cmError = document.getElementById('cm-error');
    var cmCurrentAgent = document.getElementById('cm-current-agent');
    var cmNewAgent = document.getElementById('cm-new-agent');
    var cmSearch = document.getElementById('cm-agent-search');
    var cmResults = document.getElementById('cm-agent-results');
    var cmReason = document.getElementById('cm-reason');
    var cmNotes = document.getElementById('cm-notes');
    var cmNotifyClient = document.getElementById('cm-notify-client');
    var cmNotifyNew = document.getElementById('cm-notify-new');
    var cmNotifyPrev = document.getElementById('cm-notify-prev');
    var cmCancel = document.getElementById('cm-cancel');
    var cmConfirm = document.getElementById('cm-confirm');
    var cmSearchTimer = null;

    function cmShowError(msg) {
        if (cmError) { cmError.textContent = msg; cmError.style.display = 'block'; }
    }

    function openChangeMatch(p, laneOverride) {
        if (!cmModal) return;
        cmState.paired = p;
        cmState.agents = [];
        cmState.selectedAgent = null;
        cmState.busy = false;
        if (cmError) { cmError.style.display = 'none'; cmError.textContent = ''; }
        // Explicit lane: exactly the lane of the ROW the reviewer clicked (so
        // Change selling opens selling even for a legacy general match row).
        if (cmLane) cmLane.value = laneOverride || p.matchLane || 'general';
        if (cmCurrentAgent) cmCurrentAgent.textContent = (p.agentName || 'None') + (p.agentEmail ? (' · ' + p.agentEmail) : '');
        if (cmNewAgent) cmNewAgent.textContent = 'Not selected';
        if (cmSearch) cmSearch.value = '';
        if (cmReason) cmReason.value = '';
        if (cmNotes) cmNotes.value = '';
        if (cmNotifyClient) cmNotifyClient.checked = true;
        if (cmNotifyNew) cmNotifyNew.checked = true;
        if (cmNotifyPrev) cmNotifyPrev.checked = false;
        if (cmConfirm) { cmConfirm.disabled = true; cmConfirm.textContent = 'Update match'; }
        if (cmResults) cmResults.innerHTML = '<div class="leads-empty">Loading agents…</div>';
        cmModal.classList.remove('hidden');
        loadChangeMatchAgents(p);
    }

    function closeChangeMatch() {
        if (cmState.busy) return;
        if (cmModal) cmModal.classList.add('hidden');
        cmState.paired = null;
    }

    function loadChangeMatchAgents(p) {
        if (!window.RequityAPI || !window.RequityAPI.fetchReviewerMatchSuggestions) {
            if (cmResults) cmResults.innerHTML = '<div class="leads-empty">Agent search is not available.</div>';
            return;
        }
        var params = p.clientId ? { clientId: p.clientId } : { leadId: p.leadId };
        Promise.resolve(window.RequityAPI.fetchReviewerMatchSuggestions(params)).then(function (result) {
            result = result || {};
            cmState.agents = result.eligibleAgents || result.suggestions || [];
            renderChangeMatchAgents();
        }).catch(function () {
            if (cmResults) cmResults.innerHTML = '<div class="leads-empty">Could not load agents. Please try again.</div>';
        });
    }

    function renderChangeMatchAgents() {
        if (!cmResults) return;
        var q = ((cmSearch && cmSearch.value) || '').trim().toLowerCase();
        var rows = cmState.agents.filter(function (s) {
            if (!q) return true;
            var hay = ((s.agentName || '') + ' ' + (s.agentEmail || '') + ' ' +
                (s.agentArchetype || '') + ' ' + (s.marketCity || '') + ' ' + (s.marketState || '')).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
        if (!rows.length) {
            cmResults.innerHTML = '<div class="leads-empty">No agents match this search.</div>';
            return;
        }
        cmResults.innerHTML = rows.map(function (s) {
            var isSel = cmState.selectedAgent && cmState.selectedAgent.agentId === s.agentId;
            var bits = [];
            if (s.agentArchetype) bits.push(esc(s.agentArchetype));
            if (s.marketCity) bits.push(esc(s.marketCity) + (s.marketState ? (', ' + esc(s.marketState)) : ''));
            if (s.distanceMiles != null) bits.push(s.distanceMiles + ' mi');
            if (typeof s.totalScore === 'number') bits.push('Total ' + s.totalScore + '%');
            if (typeof s.activeMatchCount === 'number' && s.activeMatchCount > 0) bits.push(s.activeMatchCount + ' active match' + (s.activeMatchCount === 1 ? '' : 'es'));
            return '<div class="cm-agent-card' + (isSel ? ' is-selected' : '') + '">' +
                '<div class="cm-agent-main">' +
                    '<span class="cm-agent-name">' + esc(s.agentName || 'Agent') + '</span>' +
                    '<span class="cm-agent-sub">' + bits.join(' · ') + '</span>' +
                '</div>' +
                '<button type="button" class="btn btn-outline btn-sm" data-cm-select="' + esc(s.agentId || '') + '">' + (isSel ? 'Selected' : 'Select') + '</button>' +
            '</div>';
        }).join('');
    }

    if (cmResults) cmResults.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-cm-select]') : null;
        if (!btn) return;
        var id = btn.getAttribute('data-cm-select');
        var agent = cmState.agents.find(function (s) { return s.agentId === id; });
        if (!agent) return;
        cmState.selectedAgent = agent;
        if (cmNewAgent) cmNewAgent.textContent = agent.agentName || 'Agent';
        if (cmConfirm) cmConfirm.disabled = false;
        renderChangeMatchAgents();
    });

    if (cmSearch) cmSearch.addEventListener('input', function () {
        if (cmSearchTimer) clearTimeout(cmSearchTimer);
        cmSearchTimer = setTimeout(renderChangeMatchAgents, 200);
    });

    function confirmChangeMatch() {
        var p = cmState.paired;
        var agent = cmState.selectedAgent;
        if (!p || !agent || cmState.busy) return;
        if (!window.RequityAPI || !window.RequityAPI.approveReviewerMatch) return;
        var lane = (cmLane && cmLane.value) || p.matchLane || 'general';
        var payload = p.clientId ? { clientId: p.clientId } : { leadId: p.leadId };
        payload.agentId = agent.agentId;
        payload.matchLane = lane;
        payload.replaceExisting = true;
        if (typeof agent.compatibilityScore === 'number') payload.score = agent.compatibilityScore;
        if (agent.matchReason) payload.reason = agent.matchReason;
        var reason = (cmReason && cmReason.value) || '';
        if (reason) {
            var reasonLabels = {
                client_request: 'Client request', agent_unavailable: 'Agent unavailable',
                better_fit: 'Better fit', location_change: 'Location change', other: 'Other'
            };
            payload.replaceReason = reasonLabels[reason] || reason;
        }
        var notes = ((cmNotes && cmNotes.value) || '').trim();
        if (notes) payload.reviewerNotes = notes;
        payload.notifyClient = !cmNotifyClient || cmNotifyClient.checked;
        payload.notifyNewAgent = !cmNotifyNew || cmNotifyNew.checked;
        payload.notifyPreviousAgent = !!(cmNotifyPrev && cmNotifyPrev.checked);

        cmState.busy = true;
        if (cmError) { cmError.style.display = 'none'; cmError.textContent = ''; }
        if (cmConfirm) { cmConfirm.disabled = true; cmConfirm.textContent = 'Updating…'; }
        Promise.resolve(window.RequityAPI.approveReviewerMatch(payload)).then(function () {
            cmState.busy = false;
            closeChangeMatch();
            var laneWord = lane === 'general' ? 'general' : lane;
            addLog('Updated the ' + laneWord + ' match for ' + (p.clientName || 'client') + ': ' +
                (agent.agentName || 'new agent') + ' is now active. The old match is kept in history.');
            loadQueue();
        }).catch(function (err) {
            cmState.busy = false;
            if (cmConfirm) { cmConfirm.disabled = false; cmConfirm.textContent = 'Update match'; }
            cmShowError((err && (err.serverError || err.message)) || 'Could not update the match. Please try again.');
        });
    }

    if (cmCancel) cmCancel.addEventListener('click', closeChangeMatch);
    if (cmConfirm) cmConfirm.addEventListener('click', confirmChangeMatch);
    if (cmModal) cmModal.addEventListener('click', function (ev) { if (ev.target === cmModal) closeChangeMatch(); });

    // Exposed for the Agent Control Center drawer: open the Change match
    // editor for an explicit client + lane (the lane clicked always wins).
    window.openReviewerChangeMatch = function (paired, lane) {
        openChangeMatch(paired || {}, lane || null);
    };

    // Exposed for the Agent Control Center: refresh the queue + paired data
    // after an unmatch or agent archive so every tab stays in sync.
    window.__reviewerReloadQueue = loadQueue;

    // --- Queue + Paired filter wiring ---------------------------------------
    var queuePillsEl = document.getElementById('queue-filter-pills');
    if (queuePillsEl) queuePillsEl.addEventListener('click', function (ev) {
        var pill = ev.target.closest ? ev.target.closest('[data-queue-filter]') : null;
        if (!pill) return;
        state.queueFilter = pill.getAttribute('data-queue-filter') || 'all';
        queuePillsEl.querySelectorAll('.filter-pill').forEach(function (b) {
            b.classList.toggle('is-active', b === pill);
        });
        renderQueue();
    });
    var queueSearchEl = document.getElementById('queue-search');
    var queueSearchTimer = null;
    if (queueSearchEl) queueSearchEl.addEventListener('input', function () {
        if (queueSearchTimer) clearTimeout(queueSearchTimer);
        queueSearchTimer = setTimeout(function () {
            state.queueSearch = (queueSearchEl.value || '').trim();
            renderQueue();
        }, 250);
    });

    var pairedLaneEl = document.getElementById('paired-filter-lane');
    var pairedPaymentEl = document.getElementById('paired-filter-payment');
    var pairedSearchEl = document.getElementById('paired-search');
    var pairedSearchTimer = null;
    if (pairedLaneEl) pairedLaneEl.addEventListener('change', function () {
        state.pairedLaneFilter = pairedLaneEl.value || '';
        renderPaired();
    });
    if (pairedPaymentEl) pairedPaymentEl.addEventListener('change', function () {
        state.pairedPaymentFilter = pairedPaymentEl.value || '';
        renderPaired();
    });
    if (pairedSearchEl) pairedSearchEl.addEventListener('input', function () {
        if (pairedSearchTimer) clearTimeout(pairedSearchTimer);
        pairedSearchTimer = setTimeout(function () {
            state.pairedSearch = (pairedSearchEl.value || '').trim();
            renderPaired();
        }, 250);
    });

    window.openAutoModal = function () {
        if (state.autoMode !== 'off') return;
        autoModal.classList.remove('hidden');
        validateModal();
    };

    window.closeAutoModal = function () {
        autoModal.classList.add('hidden');
    };

    function validateModal() {
        btnConfirmAuto.disabled = !(modalName.value.trim() && modalRole.value.trim() && modalConfirm.checked);
    }

    modalName.addEventListener('input', validateModal);
    modalRole.addEventListener('input', validateModal);
    modalConfirm.addEventListener('change', validateModal);

    window.enableAuto = function () {
        closeAutoModal();
        startAutoMatching();
    };

    // --- Queue mutation helpers --------------------------------------------
    function removeClientFromQueue(id) {
        clients = clients.filter(function (c) { return c.id !== id; });
        if (state.activeClientId === id) {
            const next = clients[0] || null;
            state.activeClientId = next ? next.id : null;
            selectActiveAgent(next);
        }
        renderAll();
    }

    function setDecisionBusy(busy) {
        var deleteBtn = document.getElementById('desk-delete-btn');
        if (deleteBtn) deleteBtn.disabled = busy;
        var card = elDeskSelectedCard ? elDeskSelectedCard.querySelector('.btn-primary') : null;
        if (card) card.disabled = busy || !state.selectedAgentId;
    }

    // --- Activity Log Helper -----------------------------------------------
    function addLog(actionText) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const li = document.createElement('li');
        li.innerHTML = '<div class="log-time">' + esc(timeStr) + '</div><div class="log-action">' + esc(actionText) + '</div>';
        elActivityLog.prepend(li);
    }

    // --- Auto matching (live: approves each queued client's top match) ------
    async function startAutoMatching() {
        if (!window.RequityAPI || !window.RequityAPI.approveReviewerMatch) return;

        const pending = clients.slice();
        if (!pending.length) {
            addLog('Auto: no pending matches to process.');
            return;
        }

        state.autoMode = 'running';

        btnHeaderAuto.textContent = 'Auto: Running';
        btnHeaderAuto.classList.add('auto-running-pulse');

        autoStatusPanel.querySelector('h2').textContent = 'Auto is running';
        autoBadge.textContent = 'Active';
        autoBadge.className = 'badge badge-auto';
        autoStatusCopy.textContent = 'Auto is reviewing pending profiles, selecting the highest percentage matched real estate agent, and assigning each client.';
        autoProgressContainer.classList.remove('hidden');

        bottomBar.className = 'bottom-bar auto-running';
        bottomTitle.textContent = 'Auto running';
        bottomCopy.textContent = 'Pending profiles are being reviewed and assigned to the highest percentage matched real estate agent.';

        addLog('Auto enabled by ' + (modalName.value || 'reviewer'));

        let scanned = 0;
        let scheduled = 0;

        for (const client of pending) {
            const fit = firstEligibleFit(client);
            scanned++;
            autoScanned.textContent = scanned;
            autoCurrentProfile.textContent = client.name;

            if (!fit || !fit.agentId) {
                addLog('Auto skipped ' + client.name + ': no recommended match available.');
                continue;
            }

            addLog('Auto reviewing: ' + client.name);
            try {
                const payload = matchTargetPayload(client);
                payload.agentId = fit.agentId;
                payload.score = fit.fit != null ? fit.fit : undefined;
                payload.reason = fit.reason || undefined;
                await window.RequityAPI.approveReviewerMatch(payload);
                scheduled++;
                state.counts.scheduled++;
                autoScheduled.textContent = scheduled;
                clients = clients.filter(function (c) { return c.id !== client.id; });
                addLog(client.name + ' assigned to ' + fit.name + '. The agent was notified.');
            } catch (e) {
                // Auto never silently replaces an existing client match.
                if (e && e.code === 'CLIENT_ALREADY_MATCHED') {
                    addLog('Auto skipped ' + client.name + ': already has an active match. Replace it manually if needed.');
                } else {
                    addLog('Auto could not assign ' + client.name + '. Skipped.');
                }
            }
        }

        // Refresh active selection + queue after the run.
        state.activeClientId = clients.length ? clients[0].id : null;
        selectActiveAgent(clients[0] || null);

        state.autoMode = 'complete';
        btnHeaderAuto.textContent = 'Auto: Complete';
        btnHeaderAuto.classList.remove('auto-running-pulse');
        btnHeaderAuto.classList.replace('btn-primary', 'btn-outline');

        autoStatusPanel.querySelector('h2').textContent = 'Auto completed';
        autoBadge.textContent = 'Done';
        autoBadge.className = 'badge badge-success';
        autoCurrentProfile.textContent = 'All pending processed';

        bottomBar.className = 'bottom-bar';
        bottomTitle.textContent = 'Auto complete';
        bottomCopy.textContent = 'Pending profiles were assigned to their highest percentage matched real estate agent. Each agent receives the client profile when their match is ready.';

        renderAll();
    }

    // --- Load: live reviewer queue (gated on reviewer/admin auth) ----------
    function loadQueue() {
        const api = window.RequityAPI;
        const fetchQueue = api && (api.fetchReviewerQueue || api.fetchReviewerMatches);
        if (!fetchQueue) {
            state.loadError = true;
            state.loaded = true;
            clients = [];
            pairedClients = [];
            renderAll();
            return;
        }
        renderLoading();
        // Prefer the richer payload ({ queue, pairedClients }); fall back to the
        // legacy array shape if only fetchReviewerMatches exists.
        Promise.resolve(
            api.fetchReviewerQueue ? api.fetchReviewerQueue() : api.fetchReviewerMatches()
        ).then(function (payload) {
            const queue = Array.isArray(payload) ? payload : (payload && payload.queue) || [];
            const paired = (payload && !Array.isArray(payload) && payload.pairedClients) || [];
            state.loadError = false;
            state.loaded = true;
            clients = queue.map(mapQueueItem).filter(function (c) { return !!c.id; });
            pairedClients = paired;
            window.__reviewerCounts.upForReviewCount = clients.length;
            window.__reviewerCounts.pairedCount = pairedClients.length;
            logQueueClassification();
            // Keep the currently opened client selected across refreshes (e.g.
            // a both-sides client staying in the queue after one lane matched).
            const keep = clients.find(function (c) { return c.id === state.activeClientId; }) || null;
            const active = keep || clients[0] || null;
            state.activeClientId = active ? active.id : null;
            if (!keep) state.deskLane = active ? defaultLaneFor(active) : null;
            selectActiveAgent(active);
            renderAll();
        }).catch(function () {
            state.loadError = true;
            state.loaded = true;
            clients = [];
            pairedClients = [];
            state.activeClientId = null;
            selectActiveAgent(null);
            renderAll();
        });
    }

    function load() {
        const gate = window.__reviewerGate || Promise.resolve({ ok: false });
        Promise.resolve(gate).then(function (g) {
            if (!g || g.ok === false) return; // blocked: never render data
            loadQueue();
        });
    }

    // Initial paint shows a neutral loading state until the gate + fetch resolve.
    renderLoading();
    updateSummary();
    load();
});
