/* REQUITY Reviewer JS — live data only.
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

    // Human-readable transaction intent (buying/selling/other) for a client row.
    function transactionText(c) {
        if (!c) return 'Not specified';
        if (c.transaction_intent_label) return c.transaction_intent_label;
        var intent = c.transaction_intent;
        if (intent === 'buying') return 'Buying';
        if (intent === 'selling') return 'Selling';
        if (intent === 'other') return c.transaction_intent_other || 'Other';
        return 'Not specified';
    }

    // Human-readable city/market for a client row.
    function marketText(c) {
        if (!c) return 'Not specified';
        var m = c.market_city;
        return (m && String(m).trim()) ? String(m).trim() : 'Not specified';
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
                archetype: agent.archetype || '—',
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
            archetype: c.archetype || '—',
            orientation: c.orientation || '—',
            style: c.style || '—',
            stressResponse: c.stress_response || '—',
            transaction: transactionText(c),
            market: marketText(c),
            status: 'Pending Review',
            highestMatch: fits.length ? fits[0].name : null,
            highestMatchAgentId: fits.length ? fits[0].agentId : null,
            fits: fits
        };
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
            elDecisionAgent.textContent = '—';
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
            '</div>';
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
        elDecisionAgent.textContent = state.selectedAgentName || '—';
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
        updateSummary();
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
        if (!window.RequityAPI || !window.RequityAPI.fetchReviewerMatches) {
            state.loadError = true;
            state.loaded = true;
            clients = [];
            renderAll();
            return;
        }
        renderLoading();
        Promise.resolve(window.RequityAPI.fetchReviewerMatches()).then(function (queue) {
            state.loadError = false;
            state.loaded = true;
            clients = (queue || []).map(mapQueueItem).filter(function (c) { return !!c.id; });
            const first = clients[0] || null;
            state.activeClientId = first ? first.id : null;
            selectActiveAgent(first);
            renderAll();
        }).catch(function () {
            state.loadError = true;
            state.loaded = true;
            clients = [];
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
