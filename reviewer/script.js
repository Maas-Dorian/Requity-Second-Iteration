/* REQUITY Reviewer JS, live data only.
 *
 * The reviewer matching queue is populated exclusively from the secure
 * /api/reviewer/matches endpoint (reviewer/admin auth required). There is no
 * demo mode and no sample/simulation data: when the queue is empty we show a
 * clean empty state, and when the request fails we show a clean error state.
 */

document.addEventListener('DOMContentLoaded', () => {

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
        pairedSearch: ''
    };

    // --- DOM Elements ------------------------------------------------------
    const elQueueList = document.getElementById('queue-list');
    const elProfileCard = document.getElementById('profile-card');
    const elFitsList = document.getElementById('fits-list');
    const elPairedList = document.getElementById('paired-list');
    const elClosedList = document.getElementById('closed-list');

    // Update a tab's count badge (defined by the tabs IIFE in index.html).
    function setTabCount(name, count) {
        if (typeof window.__reviewerSetTabCount === 'function') window.__reviewerSetTabCount(name, count);
    }

    const elCountPending = document.getElementById('count-pending');
    const elCountFits = document.getElementById('count-fits');
    const elCountScheduled = document.getElementById('count-scheduled');
    const elCountNeedsReview = document.getElementById('count-needs-review');
    const elCountPairedClients = document.getElementById('count-paired-clients');

    const elDecisionAgent = document.getElementById('decision-selected-agent');
    const elDecisionActions = document.getElementById('decision-actions');
    const elDecisionSuccess = document.getElementById('decision-success');

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
        // Location is REQUIRED: only agents flagged eligible are shown as matches.
        // Ineligible agents (missing location, out of range, etc.) are never shown
        // as a recommendation or auto-paired; they are summarized via matchSummary.
        const eligibleRankings = rankings.filter(function (r) { return r && r.eligible !== false; });
        const fits = eligibleRankings.map(function (r, i) {
            const agent = (r && r.agent) || {};
            return {
                agentId: agent.id || null,
                name: agent.name || 'Unknown agent',
                archetype: agent.archetype || ', ',
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
                // Informational only. Agents are reusable without limit.
                activeMatchCount: (r && typeof r.activeMatchCount === 'number') ? r.activeMatchCount : 0,
                top: i === 0
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
            highestMatch: fits.length ? fits[0].name : null,
            highestMatchAgentId: fits.length ? fits[0].agentId : null,
            fits: fits
        };
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
            return '<div class="client-report">' + contact +
                '<div class="report-section"><h4>Relational Roadmap</h4>' +
                    '<p class="report-text">Detailed guidance is not available for this client yet.</p>' +
                '</div></div>';
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

        const appreciation = (r.appreciationStyle)
            ? '<div class="report-section"><h4>Client\'s Appreciation Style</h4><p class="report-text">' + esc(r.appreciationStyle) + '</p></div>'
            : '';
        const expectations =
            '<div class="report-section"><h4>Client\'s Expectations &amp; Questions</h4><p class="report-text">' +
            esc(r.expectationsOrQuestions || 'No additional expectations provided') + '</p></div>';

        return '<div class="client-report">' + contact + after +
            '<div class="report-grid">' + buyerSection + sellerSection + '</div>' +
            simultaneousSection + commSection + appreciation + expectations +
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
        state.counts.fits = clients.reduce(function (sum, c) { return sum + (c.fits ? c.fits.length : 0); }, 0);
        // scheduled is incremented as the reviewer approves matches this session.
    }

    // --- Render Functions --------------------------------------------------
    function renderLoading() {
        elQueueList.innerHTML = '<div class="leads-empty">' + LOADING_MSG + '</div>';
        elProfileCard.innerHTML = '<div class="leads-empty">' + LOADING_MSG + '</div>';
        elFitsList.innerHTML = '<div class="leads-empty">' + LOADING_MSG + '</div>';
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
                        '<div class="queue-meta">Transaction: ' + esc(client.transaction) + ' &bull; Market: ' + esc(client.market) + ' &bull; ' + esc(client.archetype) + '</div>' +
                        laneStatusHtml(client) +
                    '</div>' +
                    statusPillHtml(client.pipelineStatus) +
                '</div>';
            elQueueList.insertAdjacentHTML('beforeend', html);
        });
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

    function renderActiveClient() {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });

        if (!client) {
            const profileMsg = clients.length
                ? 'Select a client from the queue to view their profile.'
                : 'No client profiles to review yet.';
            const fitsMsg = clients.length
                ? 'Select a client to see recommended real estate agent matches.'
                : 'Recommended real estate agent matches will appear here when a client is ready for review.';
            elProfileCard.innerHTML = '<div class="leads-empty">' + profileMsg + '</div>';
            elFitsList.innerHTML = '<div class="leads-empty">' + fitsMsg + '</div>';
            elDecisionActions.classList.add('hidden');
            elDecisionSuccess.classList.add('hidden');
            elDecisionAgent.textContent = ', ';
            updateLanePicker(null);
            return;
        }

        // Render Profile (live client fields only)
        elProfileCard.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">' +
                '<div>' +
                    '<h3 class="text-xl mb-1">' + esc(client.name) + '</h3>' +
                    '<div class="helper-text">Real estate guidance</div>' +
                '</div>' +
                '<div class="status-control"><span class="status-control-label">Status</span>' +
                    statusSelectHtml(client.pipelineStatus, { kind: client.rowKind, id: client.id }) +
                '</div>' +
            '</div>' +
            '<p class="helper-text mb-2">This profile helps the reviewer understand which real estate agent relationship may support the client best.</p>' +
            '<div class="profile-grid">' +
                '<div class="profile-field"><span class="detail-label">Transaction</span><span class="detail-value text-blue">' + esc(client.transaction) + '</span></div>' +
                '<div class="profile-field"><span class="detail-label">Market</span><span class="detail-value text-blue">' + esc(client.market) + '</span></div>' +
                '<div class="profile-field"><span class="detail-label">Client Archetype</span><span class="detail-value text-blue">' + esc(client.archetype) + '</span></div>' +
                '<div class="profile-field"><span class="detail-label">Orientation</span><span class="detail-value">' + esc(client.orientation) + '</span></div>' +
                '<div class="profile-field"><span class="detail-label">Style</span><span class="detail-value">' + esc(client.style) + '</span></div>' +
                '<div class="profile-field"><span class="detail-label">Stress Response</span><span class="detail-value">' + esc(client.stressResponse) + '</span></div>' +
            '</div>' +
            buildClientReportHtml(client);
        elProfileCard.classList.remove('fade-in');
        void elProfileCard.offsetWidth; // trigger reflow
        elProfileCard.classList.add('fade-in');

        // Render Fits
        elFitsList.innerHTML = '';
        if (!client.fits.length) {
            elFitsList.innerHTML = noEligibleMatchHtml(client.matchSummary);
        } else {
            client.fits.forEach(function (fit, idx) {
                const isTop = fit.top ? 'top-match' : '';
                const isSelected = state.selectedAgentId && state.selectedAgentId === fit.agentId ? 'selected' : '';
                const badgeHtml = fit.top ? '<span class="badge badge-highest">Highest recommended fit</span>' : '';
                const pctHtml = (fit.fit != null) ? '<span class="badge badge-internal">' + fit.fit + '%</span>' : '';
                const totalHtml = (fit.total != null) ? '<span class="badge badge-source">Total ' + fit.total + '%</span>' : '';
                const distHtml = (fit.distanceMiles != null)
                    ? '<span class="badge badge-source">' + fit.distanceMiles + ' mi</span>'
                    : (fit.locationScore != null ? '<span class="badge badge-source">Loc ' + fit.locationScore + '</span>' : '');
                const limitedHtml = fit.limitedFit ? '<span class="badge badge-source">Limited fit</span>' : '';
                const matchedHtml = (fit.activeMatchCount > 0)
                    ? '<span class="badge badge-internal">Matched with ' + fit.activeMatchCount + ' client' + (fit.activeMatchCount === 1 ? '' : 's') + '</span>'
                    : '';
                const warnHtml = fit.warning ? '<div class="loc-row-warning">' + esc(fit.warning) + '</div>' : '';
                const labelHtml = fit.label
                    ? '<div class="mb-2"><span class="detail-label">Fit:</span> <span class="helper-text" style="color:var(--text-primary)">' + esc(fit.label) + '</span></div>'
                    : '';
                const reasonHtml = fit.reason
                    ? '<div class="fit-reason"><span class="detail-label">Reason</span><p class="mt-1">' + esc(fit.reason) + '</p></div>'
                    : '';
                const html =
                    '<div class="fit-card ' + isTop + ' ' + isSelected + '" id="fit-' + idx + '">' +
                        '<div class="fit-header">' +
                            '<div>' +
                                '<h3 class="fit-name">' + esc(fit.name) + '</h3>' +
                                '<div class="fit-meta">Agent Archetype: <strong class="text-blue">' + esc(fit.archetype) + '</strong></div>' +
                            '</div>' +
                            '<div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">' + badgeHtml + pctHtml + totalHtml + distHtml + limitedHtml + matchedHtml + '</div>' +
                        '</div>' +
                        labelHtml +
                        reasonHtml +
                        warnHtml +
                        '<button class="btn btn-outline" onclick="selectGuide(\'' + esc(fit.agentId) + '\')">Select Agent</button>' +
                    '</div>';
                elFitsList.insertAdjacentHTML('beforeend', html);
            });
        }

        // Decision panel
        elDecisionActions.classList.remove('hidden');
        elDecisionSuccess.classList.add('hidden');
        elDecisionAgent.textContent = state.selectedAgentName || ', ';
        updateLanePicker(client);
    }

    // The lane picker is ALWAYS visible and explicit. It is preset from the
    // client's own intent (a selling client presets to Selling, a general
    // client to General); it never silently defaults to buying.
    function updateLanePicker(client) {
        var wrap = document.getElementById('decision-lane-wrap');
        var select = document.getElementById('decision-lane');
        var hint = document.getElementById('decision-lane-hint');
        if (!wrap || !select) return;
        wrap.classList.toggle('hidden', !client);
        if (!client) return;
        var intent = queueIntentOf(client);
        var preset = intent; // buying -> buying, selling -> selling, general -> general
        var hintText = '';
        if (intent === 'both') {
            // Buying-and-selling client: preset the first lane that still needs
            // a match so the reviewer works the open side, not a hidden default.
            var unmatched = (client.laneStatus && client.laneStatus.unmatchedLanes) || [];
            preset = unmatched.length ? unmatched[0] : 'both';
            hintText = 'This client is buying and selling. Match each lane separately, or pick Both if one agent covers both sides.';
        } else if (intent === 'buying') {
            hintText = 'This client is buying.';
        } else if (intent === 'selling') {
            hintText = 'This client is selling.';
        } else {
            hintText = 'This client has a general intent.';
        }
        if (['buying', 'selling', 'both', 'general'].indexOf(preset) !== -1) select.value = preset;
        if (hint) hint.textContent = hintText;
    }

    // The lane the reviewer explicitly has selected in the picker.
    function selectedMatchLane() {
        var wrap = document.getElementById('decision-lane-wrap');
        var select = document.getElementById('decision-lane');
        if (!wrap || !select || wrap.classList.contains('hidden')) return null;
        return select.value || null;
    }

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
        // Unpaid agents/clients + matches-changed cards are owned by the
        // Payments loader in index.html (applySummary).
    }

    function renderAll() {
        recomputeCounts();
        renderQueue();
        renderActiveClient();
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

    function pairedCardHtml(p) {
        var fit = (typeof p.score === 'number' && p.score > 0)
            ? (p.label ? (p.label + ' · ' + p.score + '%') : (p.score + '%'))
            : (p.label || null);
        // Part 12: existing pairings whose agent has no usable location are flagged
        // for review rather than deleted, so reviewers can fix the agent market.
        var reviewWarning = (p.agentHasLocation === false)
            ? '<div class="loc-row-warning">This recommendation needs location review. The paired agent has no market on file.</div>'
            : '';
        // Lane badge: every card names its lane explicitly (including General).
        var laneBadge = '<span class="badge badge-internal">' + esc(p.matchLaneLabel || 'General') + ' match</span>';
        var statusTarget = (!p.clientId && p.leadId)
            ? { kind: 'lead', id: p.leadId }
            : { kind: 'client', id: p.clientId };
        var clientPaid = (p.clientPaymentStatus === 'paid');
        var lastEmail = p.lastEmailAt ? fmtPairedDate(p.lastEmailAt) : 'Not sent';
        return reviewWarning + '<div class="lead-top">' +
                '<div><div class="lead-name">' + esc(p.clientName || 'Unknown client') + '</div>' +
                '<div class="lead-contact">' + esc(p.clientEmail || 'no email') +
                    (p.clientArchetype ? (' &middot; ' + esc(p.clientArchetype)) : '') + '</div></div>' +
                '<div class="lead-badges">' +
                    laneBadge +
                    (fit ? ('<span class="badge badge-source">' + esc(fit) + '</span>') : '') +
                    '<div class="status-control"><span class="status-control-label">Status</span>' +
                        statusSelectHtml(p.pipelineStatus, statusTarget) +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="lead-meta">' +
                '<span>Transaction <strong>' + esc(transactionText(p.transactionIntentLabel ? { transaction_intent_label: p.transactionIntentLabel } : { transaction_intent: p.transactionIntent })) + '</strong></span>' +
                pairedMarketHtml(p) +
                '<span>Paired agent <strong>' + esc(p.agentName || 'Unknown agent') + '</strong></span>' +
                (p.agentEmail ? ('<span>Agent email <strong>' + esc(p.agentEmail) + '</strong></span>') : '') +
                (p.agentArchetype ? ('<span>Agent archetype <strong>' + esc(p.agentArchetype) + '</strong></span>') : '') +
                '<span>Matched <strong>' + fmtPairedDate(p.matchedAt) + '</strong></span>' +
                '<span>Last agent email <strong>' + esc(lastEmail) + '</strong></span>' +
            '</div>' +
            '<div class="paired-pay-row">' +
                '<span>Client payment ' + payPillHtml(p.clientPaymentStatus, p.clientPaymentLabel) + '</span>' +
                '<span>Agent payment ' + payPillHtml(p.agentPaymentStatus, p.agentPaymentLabel) + '</span>' +
            '</div>' +
            '<div class="paired-actions">' +
                '<button type="button" class="btn btn-outline btn-sm" data-paired-act="change" data-paired-key="' + esc(pairedKey(p)) + '">Change match</button>' +
                (p.matchId ? ('<button type="button" class="btn btn-outline btn-sm" data-paired-act="resend" data-paired-key="' + esc(pairedKey(p)) + '">Resend email</button>') : '') +
                '<button type="button" class="btn btn-outline btn-sm" data-paired-act="pay" data-paired-key="' + esc(pairedKey(p)) + '">' + (clientPaid ? 'Mark client unpaid' : 'Mark client paid') + '</button>' +
                '<button type="button" class="btn btn-outline btn-sm" onclick="removePairedClient(\'' + esc(p.clientId || '') + '\', \'' + esc(p.leadId || '') + '\')">Archive</button>' +
            '</div>';
    }

    // Active (non-closed) pairings render in Paired Clients; Closed pairings move
    // to the Closed tab. Both keep the editable status control so a reviewer can
    // move a client back and forth.
    // Client-side Paired filters: lane, client payment state, and search.
    function pairedMatchesFilters(p) {
        if (state.pairedLaneFilter && (p.matchLane || 'general') !== state.pairedLaneFilter) return false;
        if (state.pairedPaymentFilter === 'paid' && p.clientPaymentStatus !== 'paid') return false;
        if (state.pairedPaymentFilter === 'unpaid' && p.clientPaymentStatus === 'paid') return false;
        var q = (state.pairedSearch || '').toLowerCase();
        if (q) {
            var hay = ((p.clientName || '') + ' ' + (p.clientEmail || '') + ' ' +
                (p.agentName || '') + ' ' + (p.agentEmail || '')).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
        }
        return true;
    }

    function renderPaired() {
        var active = [];
        var closed = [];
        pairedClients.forEach(function (p) {
            if (normalizeStatus(p.pipelineStatus) === 'closed') closed.push(p); else active.push(p);
        });

        if (elPairedList) {
            var visible = active.filter(pairedMatchesFilters);
            var hasFilters = !!(state.pairedLaneFilter || state.pairedPaymentFilter || state.pairedSearch);
            if (!visible.length) {
                elPairedList.innerHTML = '<div class="leads-empty">' +
                    (hasFilters ? 'No paired clients match these filters.' : 'No pairings yet.') + '</div>';
            } else {
                elPairedList.innerHTML = '';
                visible.forEach(function (p) {
                    var card = document.createElement('div');
                    card.className = 'lead-card';
                    card.innerHTML = pairedCardHtml(p);
                    elPairedList.appendChild(card);
                });
            }
        }

        if (elClosedList) {
            if (!closed.length) {
                elClosedList.innerHTML = '<div class="leads-empty">No closed clients yet.</div>';
            } else {
                elClosedList.innerHTML = '';
                closed.forEach(function (p) {
                    var card = document.createElement('div');
                    card.className = 'lead-card';
                    card.innerHTML = pairedCardHtml(p);
                    elClosedList.appendChild(card);
                });
            }
        }

        setTabCount('paired', active.length);
        setTabCount('closed', closed.length);
        setTabCount('review', clients.length);
    }

    function selectActiveAgent(client) {
        if (client && client.fits.length) {
            state.selectedAgentId = client.fits[0].agentId;
            state.selectedAgentName = client.fits[0].name;
        } else {
            state.selectedAgentId = null;
            state.selectedAgentName = null;
        }
    }

    // --- Global Actions (attached to window for inline onclick) ------------
    window.selectClient = function (id) {
        if (state.autoMode === 'running') return;
        state.activeClientId = id;
        const client = clients.find(function (c) { return c.id === id; });
        selectActiveAgent(client);
        renderQueue();
        renderActiveClient();
    };

    window.selectGuide = function (agentId) {
        if (state.autoMode === 'running') return;
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client) return;
        const fit = client.fits.find(function (f) { return f.agentId === agentId; });
        if (!fit) return;
        state.selectedAgentId = fit.agentId;
        state.selectedAgentName = fit.name;
        elDecisionAgent.textContent = fit.name;
        renderActiveClient();
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

    window.approveSelected = function () {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client || !state.selectedAgentId) return;
        const fit = client.fits.find(function (f) { return f.agentId === state.selectedAgentId; });
        if (!fit) return;
        if (!window.RequityAPI || !window.RequityAPI.approveReviewerMatch) return;

        setDecisionBusy(true);
        finalizeMatch(client, fit, false).finally(function () {
            setDecisionBusy(false);
        });
    };

    // Finalize a match. On a 409 CLIENT_ALREADY_MATCHED, confirm a replacement and
    // retry with replaceExisting so the old match is superseded (never duplicated).
    function finalizeMatch(client, fit, replaceExisting) {
        const payload = matchTargetPayload(client);
        payload.agentId = fit.agentId;
        payload.score = fit.fit != null ? fit.fit : undefined;
        payload.reason = fit.reason || undefined;
        const lane = selectedMatchLane();
        if (lane) payload.matchLane = lane;
        if (replaceExisting) payload.replaceExisting = true;

        return Promise.resolve(window.RequityAPI.approveReviewerMatch(payload)).then(function (res) {
            res = res || {};
            const laneNote = res.matchLane && res.matchLane !== 'general' ? (' (' + res.matchLane + ' side)') : '';
            addLog((replaceExisting ? 'Replaced match: ' : 'Reviewer approved ') + fit.name + laneNote + ' for ' + client.name + '. The agent was notified.');
            state.counts.scheduled++;
            if (res.fullyMatched === false) {
                // Buying-and-selling client with another lane still open: keep them
                // visible in the queue and refresh so lane status is current.
                const needs = (res.unmatchedLanes || []).join(', ');
                addLog(client.name + ' still needs a ' + (needs || 'second') + ' match and stays in the review queue.');
                loadQueue();
            } else {
                removeClientFromQueue(client.id);
                // Refresh so the new pairing shows in Paired Clients right away.
                loadQueue();
            }
        }).catch(function (err) {
            if (err && err.code === 'CLIENT_ALREADY_MATCHED') {
                const active = (err.data && err.data.activeMatch) || {};
                const currentName = active.agentName || 'another agent';
                const laneLabel = active.matchLaneLabel && active.matchLaneLabel !== 'General'
                    ? (active.matchLaneLabel.toLowerCase() + ' ') : '';
                const ok = window.confirm(
                    'This client already has an active ' + laneLabel + 'match with ' + currentName + '. ' +
                    'Replacing it will archive that match and make ' + fit.name + ' the current ' + laneLabel + 'match.'
                );
                if (ok) {
                    setDecisionBusy(true);
                    return finalizeMatch(client, fit, true).finally(function () { setDecisionBusy(false); });
                }
                addLog('Kept existing match for ' + client.name + ' (' + currentName + ').');
                return;
            }
            addLog('Could not approve ' + fit.name + ' for ' + client.name + '. Please try again.');
        });
    }

    window.holdSelected = function () {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client) return;
        addLog('Profile held for review: ' + client.name);
    };

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

    // --- Paired card actions: change match, resend email, mark paid ---------
    function findPairedByKey(key) {
        return pairedClients.find(function (p) { return pairedKey(p) === key; }) || null;
    }

    function handlePairedAction(act, key, btn) {
        var p = findPairedByKey(key);
        if (!p) return;
        if (act === 'change') { openChangeMatch(p); return; }
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
                btn.textContent = 'Resend email';
                addLog('Could not resend the match email. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
            return;
        }
        if (act === 'pay') {
            if (!window.RequityAPI || !window.RequityAPI.setReviewerPaymentStatus) return;
            var entityType = p.clientId ? 'client' : 'lead';
            var entityId = p.clientId || p.leadId;
            if (!entityId) return;
            var next = (p.clientPaymentStatus === 'paid') ? 'unpaid' : 'paid';
            btn.disabled = true;
            Promise.resolve(window.RequityAPI.setReviewerPaymentStatus({
                entityType: entityType, entityId: entityId, status: next
            })).then(function () {
                // Keep every lane card for this client in sync.
                pairedClients.forEach(function (row) {
                    var same = (p.clientId && row.clientId === p.clientId) || (!p.clientId && p.leadId && row.leadId === p.leadId);
                    if (same) { row.clientPaymentStatus = next; row.clientPaymentLabel = PAYMENT_LABELS[next]; }
                });
                addLog('Marked ' + (p.clientName || 'client') + ' as ' + PAYMENT_LABELS[next].toLowerCase() + '.');
                renderPaired();
                if (typeof window.__reviewerRefreshPayments === 'function') window.__reviewerRefreshPayments();
            }).catch(function (err) {
                btn.disabled = false;
                addLog('Could not update the payment status. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
        }
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

    function openChangeMatch(p) {
        if (!cmModal) return;
        cmState.paired = p;
        cmState.agents = [];
        cmState.selectedAgent = null;
        cmState.busy = false;
        if (cmError) { cmError.style.display = 'none'; cmError.textContent = ''; }
        // Explicit lane: exactly the lane of the card the reviewer clicked.
        if (cmLane) cmLane.value = p.matchLane || 'general';
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
        const buttons = elDecisionActions.querySelectorAll('button');
        buttons.forEach(function (b) { b.disabled = busy; });
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
            const fit = client.fits && client.fits.length ? client.fits[0] : null;
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
            const first = clients[0] || null;
            state.activeClientId = first ? first.id : null;
            selectActiveAgent(first);
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
