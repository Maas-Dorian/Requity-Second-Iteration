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
        autoMode: 'off' // 'off', 'running', 'complete'
    };

    // --- DOM Elements ------------------------------------------------------
    const elQueueList = document.getElementById('queue-list');
    const elProfileCard = document.getElementById('profile-card');
    const elFitsList = document.getElementById('fits-list');
    const elPairedList = document.getElementById('paired-list');

    const elCountPending = document.getElementById('count-pending');
    const elCountFits = document.getElementById('count-fits');
    const elCountScheduled = document.getElementById('count-scheduled');
    const elCountNeedsReview = document.getElementById('count-needs-review');

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
        const fits = rankings.map(function (r, i) {
            const agent = (r && r.agent) || {};
            return {
                agentId: agent.id || null,
                name: agent.name || 'Unknown agent',
                archetype: agent.archetype || ', ',
                fit: (r && typeof r.score === 'number') ? r.score : null,
                label: (r && r.label) || '',
                reason: (r && r.reason) || '',
                top: i === 0
            };
        });
        return {
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
            status: 'Pending Review',
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

    function recomputeCounts() {
        state.counts.pending = clients.length;
        state.counts.fits = clients.reduce(function (sum, c) { return sum + (c.fits ? c.fits.length : 0); }, 0);
        state.counts.needsReview = clients.length;
        // scheduled is incremented as the reviewer approves matches this session.
    }

    // --- Render Functions --------------------------------------------------
    function renderLoading() {
        elQueueList.innerHTML = '<div class="leads-empty">' + LOADING_MSG + '</div>';
        elProfileCard.innerHTML = '<div class="leads-empty">' + LOADING_MSG + '</div>';
        elFitsList.innerHTML = '<div class="leads-empty">' + LOADING_MSG + '</div>';
    }

    function renderQueue() {
        elQueueList.innerHTML = '';

        if (state.loadError) {
            elQueueList.innerHTML = '<div class="leads-empty">' + ERROR_QUEUE_MSG + '</div>';
            return;
        }
        if (!clients.length) {
            elQueueList.innerHTML =
                '<div class="leads-empty"><strong>' + EMPTY_QUEUE_TITLE + '</strong><br>' + EMPTY_QUEUE_SUB + '</div>';
            return;
        }

        clients.forEach(function (client) {
            const isActive = client.id === state.activeClientId ? 'active' : '';
            const html =
                '<div class="queue-item ' + isActive + '" onclick="selectClient(\'' + esc(client.id) + '\')" id="q-' + esc(client.id) + '">' +
                    '<div class="queue-info">' +
                        '<h3>' + esc(client.name) + '</h3>' +
                        '<div class="queue-meta">Transaction: ' + esc(client.transaction) + ' &bull; Market: ' + esc(client.market) + ' &bull; ' + esc(client.archetype) + '</div>' +
                    '</div>' +
                    '<span class="badge badge-pending">' + esc(client.status) + '</span>' +
                '</div>';
            elQueueList.insertAdjacentHTML('beforeend', html);
        });
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
            return;
        }

        // Render Profile (live client fields only)
        elProfileCard.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">' +
                '<div>' +
                    '<h3 class="text-xl mb-1">' + esc(client.name) + '</h3>' +
                    '<div class="helper-text">Real estate guidance</div>' +
                '</div>' +
                '<span class="badge badge-pending">' + esc(client.status) + '</span>' +
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
            elFitsList.innerHTML = '<div class="leads-empty">No recommended real estate agent matches are available for this client yet.</div>';
        } else {
            client.fits.forEach(function (fit, idx) {
                const isTop = fit.top ? 'top-match' : '';
                const isSelected = state.selectedAgentId && state.selectedAgentId === fit.agentId ? 'selected' : '';
                const badgeHtml = fit.top ? '<span class="badge badge-highest">Highest recommended fit</span>' : '';
                const pctHtml = (fit.fit != null) ? '<span class="badge badge-internal">' + fit.fit + '%</span>' : '';
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
                            '<div style="display:flex; gap:0.5rem; align-items:center;">' + badgeHtml + pctHtml + '</div>' +
                        '</div>' +
                        labelHtml +
                        reasonHtml +
                        '<button class="btn btn-outline" onclick="selectGuide(\'' + esc(fit.agentId) + '\')">Select Agent</button>' +
                    '</div>';
                elFitsList.insertAdjacentHTML('beforeend', html);
            });
        }

        // Decision panel
        elDecisionActions.classList.remove('hidden');
        elDecisionSuccess.classList.add('hidden');
        elDecisionAgent.textContent = state.selectedAgentName || ', ';
    }

    function updateSummary() {
        if (elCountPending) elCountPending.textContent = state.counts.pending;
        if (elCountFits) elCountFits.textContent = state.counts.fits;
        if (elCountScheduled) elCountScheduled.textContent = state.counts.scheduled;
        if (elCountNeedsReview) elCountNeedsReview.textContent = state.counts.needsReview;
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

    function renderPaired() {
        if (!elPairedList) return;
        if (!pairedClients.length) {
            elPairedList.innerHTML = '<div class="leads-empty">No pairings yet.</div>';
            return;
        }
        elPairedList.innerHTML = '';
        pairedClients.forEach(function (p) {
            var fit = (typeof p.score === 'number' && p.score > 0)
                ? (p.label ? (p.label + ' · ' + p.score + '%') : (p.score + '%'))
                : (p.label || null);
            var card = document.createElement('div');
            card.className = 'lead-card';
            card.innerHTML =
                '<div class="lead-top">' +
                    '<div><div class="lead-name">' + esc(p.clientName || 'Unknown client') + '</div>' +
                    '<div class="lead-contact">' + esc(p.clientEmail || 'no email') +
                        (p.clientArchetype ? (' &middot; ' + esc(p.clientArchetype)) : '') + '</div></div>' +
                    '<div class="lead-badges">' +
                        (fit ? ('<span class="badge badge-source">' + esc(fit) + '</span>') : '') +
                        '<span class="badge badge-status-completed">' + esc(p.status || 'assigned') + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="lead-meta">' +
                    '<span>Transaction <strong>' + esc(transactionText(p.transactionIntentLabel ? { transaction_intent_label: p.transactionIntentLabel } : { transaction_intent: p.transactionIntent })) + '</strong></span>' +
                    pairedMarketHtml(p) +
                    '<span>Paired agent <strong>' + esc(p.agentName || 'Unknown agent') + '</strong></span>' +
                    (p.agentEmail ? ('<span>Agent email <strong>' + esc(p.agentEmail) + '</strong></span>') : '') +
                    (p.agentArchetype ? ('<span>Agent archetype <strong>' + esc(p.agentArchetype) + '</strong></span>') : '') +
                    '<span>Matched <strong>' + fmtPairedDate(p.matchedAt) + '</strong></span>' +
                '</div>';
            elPairedList.appendChild(card);
        });
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

    window.approveSelected = function () {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client || !state.selectedAgentId) return;
        const fit = client.fits.find(function (f) { return f.agentId === state.selectedAgentId; });
        if (!fit) return;
        if (!window.RequityAPI || !window.RequityAPI.approveReviewerMatch) return;

        setDecisionBusy(true);
        Promise.resolve(window.RequityAPI.approveReviewerMatch({
            clientId: client.clientId,
            agentId: fit.agentId,
            score: fit.fit != null ? fit.fit : undefined,
            reason: fit.reason || undefined
        })).then(function () {
            addLog('Reviewer approved ' + fit.name + ' for ' + client.name + '. Client assigned and the agent was notified.');
            removeClientFromQueue(client.id);
            state.counts.scheduled++;
        }).catch(function () {
            addLog('Could not approve ' + fit.name + ' for ' + client.name + '. Please try again.');
        }).finally(function () {
            setDecisionBusy(false);
        });
    };

    window.holdSelected = function () {
        const client = clients.find(function (c) { return c.id === state.activeClientId; });
        if (!client) return;
        addLog('Profile held for review: ' + client.name);
    };

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
                await window.RequityAPI.approveReviewerMatch({
                    clientId: client.clientId,
                    agentId: fit.agentId,
                    score: fit.fit != null ? fit.fit : undefined,
                    reason: fit.reason || undefined
                });
                scheduled++;
                state.counts.scheduled++;
                autoScheduled.textContent = scheduled;
                clients = clients.filter(function (c) { return c.id !== client.id; });
                addLog(client.name + ' assigned to ' + fit.name + '. The agent was notified.');
            } catch (e) {
                addLog('Auto could not assign ' + client.name + '. Skipped.');
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
