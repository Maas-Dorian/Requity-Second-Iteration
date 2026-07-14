/* REQUITY Reviewer: Agent Control Center (Agents tab + agent detail drawer).
 *
 * Lazy-loaded: nothing is fetched until the reviewer opens the Agents tab.
 * All data comes from the reviewer-only /api/reviewer/agents endpoints.
 * Agents are never hard deleted here; archive is a soft remove that keeps
 * every historical match, payment, and assessment record.
 */
(function () {
    'use strict';

    var listEl = document.getElementById('acc-list');
    if (!listEl) return;

    var searchEl = document.getElementById('acc-search');
    var payFilterEl = document.getElementById('acc-filter-payment');
    var locFilterEl = document.getElementById('acc-filter-location');
    var archFilterEl = document.getElementById('acc-filter-archetype');
    var statusFilterEl = document.getElementById('acc-filter-status');
    var matchesFilterEl = document.getElementById('acc-filter-matches');
    var countLineEl = document.getElementById('acc-count-line');

    var drawerOverlay = document.getElementById('agent-drawer-overlay');
    var drawerNameEl = document.getElementById('agent-drawer-name');
    var drawerSubEl = document.getElementById('agent-drawer-sub');
    var drawerBodyEl = document.getElementById('agent-drawer-body');
    var drawerTabsEl = document.getElementById('agent-drawer-tabs');
    var drawerCloseBtn = document.getElementById('agent-drawer-close');

    var PAYMENT_LABELS = {
        unpaid: 'Unpaid', invoice_sent: 'Invoice sent', paid: 'Paid',
        waived: 'Waived', refunded: 'Refunded', not_required: 'Not required'
    };

    // Platform access statuses (Stripe one-time $50 access fee, migration 0018).
    var ACCESS_LABELS = {
        grandfathered: 'Grandfathered', assessment_required: 'Assessment required',
        payment_required: 'Payment required', checkout_started: 'Checkout started',
        payment_pending: 'Payment pending', paid: 'Paid', complimentary: 'Complimentary',
        payment_failed: 'Payment failed', refunded: 'Refunded', suspended: 'Suspended'
    };

    var state = {
        loaded: false,
        loading: false,
        agents: [],
        summary: null,
        archetypes: [],
        search: '',
        payFilter: '',
        locFilter: '',
        archFilter: '',
        statusFilter: 'active',
        matchesFilter: '',
        openMenuId: null,
        drawer: {
            agentId: null,
            tab: 'summary',
            detail: null,
            loading: false
        }
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function fmtDate(s) {
        if (!s) return 'Not available';
        try {
            var d = new Date(s);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { return String(s); }
    }

    function api() { return window.RequityAPI || null; }

    function confirmAction(opts) {
        if (window.requityConfirm) return window.requityConfirm(opts);
        return Promise.resolve(window.confirm(opts.body || 'Are you sure?'));
    }

    function payPill(status, label) {
        var v = status || 'unpaid';
        return '<span class="status-pill pay-' + esc(v) + '">' + esc(label || PAYMENT_LABELS[v] || 'Unpaid') + '</span>';
    }

    // --- Load + summary ------------------------------------------------------
    function load(force) {
        var A = api();
        if (!A || !A.fetchReviewerAgents) return;
        if (state.loading) return;
        if (state.loaded && !force) { render(); return; }
        state.loading = true;
        listEl.innerHTML = '<div class="leads-empty">Loading agents…</div>';
        Promise.resolve(A.fetchReviewerAgents()).then(function (res) {
            state.agents = (res && res.agents) || [];
            state.summary = (res && res.summary) || null;
            if (res && res.archetypes && res.archetypes.length) state.archetypes = res.archetypes;
            state.loaded = true;
            state.loading = false;
            renderSummary();
            render();
        }).catch(function () {
            state.loading = false;
            listEl.innerHTML = '<div class="leads-empty">We couldn’t load agents. Please try again.</div>';
        });
    }

    // Lazy-load hook used by the tab switcher in index.html.
    window.__reviewerLoadAgents = function () { load(false); };

    function renderSummary() {
        var s = state.summary || {};
        var set = function (id, v) {
            var el = document.getElementById(id);
            if (el) el.textContent = Number(v) || 0;
        };
        set('acc-count-total', s.totalAgents);
        set('acc-count-active', s.activeAgents);
        set('acc-count-unpaid', s.unpaidAgents);
        set('acc-count-noloc', s.missingLocation);
        set('acc-count-noarch', s.missingArchetype);
        set('acc-count-matches', s.activeMatches);
        if (typeof window.__reviewerSetTabCount === 'function') {
            window.__reviewerSetTabCount('agents', s.activeAgents || 0);
        }
    }

    // --- Filters + list ------------------------------------------------------
    function filteredAgents() {
        var q = (state.search || '').toLowerCase();
        return state.agents.filter(function (a) {
            if (state.statusFilter && a.status !== state.statusFilter) return false;
            if (state.payFilter && (a.paymentStatus || 'unpaid') !== state.payFilter) return false;
            if (state.locFilter === 'missing' && !a.missingLocation) return false;
            if (state.locFilter === 'complete' && a.missingLocation) return false;
            if (state.archFilter === 'missing' && !a.missingArchetype) return false;
            if (state.archFilter === 'complete' && a.missingArchetype) return false;
            if (state.matchesFilter === 'with' && !(a.activeMatchCount > 0)) return false;
            if (state.matchesFilter === 'without' && a.activeMatchCount > 0) return false;
            if (q) {
                var hay = ((a.name || '') + ' ' + (a.email || '') + ' ' + (a.phone || '') + ' ' +
                    (a.marketCity || '') + ' ' + (a.marketState || '') + ' ' + (a.archetype || '')).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
    }

    function clearFilters() {
        state.search = '';
        state.payFilter = '';
        state.locFilter = '';
        state.archFilter = '';
        state.statusFilter = 'active';
        state.matchesFilter = '';
        if (searchEl) searchEl.value = '';
        if (payFilterEl) payFilterEl.value = '';
        if (locFilterEl) locFilterEl.value = '';
        if (archFilterEl) archFilterEl.value = '';
        if (statusFilterEl) statusFilterEl.value = 'active';
        if (matchesFilterEl) matchesFilterEl.value = '';
        render();
    }

    function marketText(a) {
        if (a.marketCity) return a.marketCity + (a.marketState ? (', ' + a.marketState) : '');
        return null;
    }

    function agentRowHtml(a) {
        var sub = [];
        if (a.email) sub.push(esc(a.email));
        if (a.phone) sub.push(esc(a.phone));
        var facts = [];
        facts.push(marketText(a) ? esc(marketText(a)) : 'No market on file');
        facts.push(a.archetype ? esc(a.archetype) : 'No archetype');
        facts.push((a.activeMatchCount || 0) + ' active match' + (a.activeMatchCount === 1 ? '' : 'es'));
        if (a.lastActivityAt) facts.push('Updated ' + esc(fmtDate(a.lastActivityAt)));

        var badges = '';
        if (a.status === 'archived') badges += '<span class="badge badge-source">Archived</span>';
        if (a.missingLocation) badges += '<span class="badge badge-warn">Missing location</span>';
        if (a.missingArchetype) badges += '<span class="badge badge-warn">Missing archetype</span>';
        if (a.needsAssessmentUpdate) badges += '<span class="badge badge-source">Update requested</span>';
        badges += payPill(a.paymentStatus, a.paymentStatusLabel);

        var menuOpen = state.openMenuId === a.id;
        var menu =
            '<div class="acc-menu-wrap">' +
                '<button type="button" class="btn btn-outline btn-sm" data-acc-menu="' + esc(a.id) + '" aria-haspopup="true" aria-expanded="' + (menuOpen ? 'true' : 'false') + '">Actions</button>' +
                (menuOpen
                    ? '<div class="acc-menu" data-acc-menu-panel="1">' +
                        '<button type="button" data-acc-act="location" data-acc-id="' + esc(a.id) + '">Edit location</button>' +
                        '<button type="button" data-acc-act="archetype" data-acc-id="' + esc(a.id) + '">Edit archetype</button>' +
                        (a.paymentStatus === 'paid'
                            ? '<button type="button" data-acc-act="unpaid" data-acc-id="' + esc(a.id) + '">Mark unpaid</button>'
                            : '<button type="button" data-acc-act="paid" data-acc-id="' + esc(a.id) + '">Mark paid</button>') +
                        '<button type="button" data-acc-act="matches" data-acc-id="' + esc(a.id) + '">View matches</button>' +
                        '<button type="button" data-acc-act="retake" data-acc-id="' + esc(a.id) + '">Request assessment update</button>' +
                        (a.status === 'archived'
                            ? '<button type="button" data-acc-act="restore" data-acc-id="' + esc(a.id) + '">Restore agent</button>'
                            : '<button type="button" class="is-danger" data-acc-act="archive" data-acc-id="' + esc(a.id) + '">Archive or remove</button>') +
                    '</div>'
                    : '') +
            '</div>';

        return '<div class="acc-row' + (a.status === 'archived' ? ' is-archived' : '') + '">' +
            '<div class="acc-row-main">' +
                '<span class="acc-row-name">' + esc(a.name) + '</span>' +
                (sub.length ? '<span class="acc-row-sub">' + sub.join(' &middot; ') + '</span>' : '') +
                '<span class="acc-row-sub">' + facts.join(' &middot; ') + '</span>' +
            '</div>' +
            '<div class="acc-row-side">' + badges +
                '<button type="button" class="btn btn-primary btn-sm" data-acc-act="view" data-acc-id="' + esc(a.id) + '">View agent</button>' +
                menu +
            '</div>' +
        '</div>';
    }

    function render() {
        if (!state.loaded) return;
        var rows = filteredAgents();
        if (countLineEl) {
            countLineEl.textContent = rows.length === state.agents.length
                ? 'Showing ' + rows.length + ' agent' + (rows.length === 1 ? '' : 's')
                : 'Showing ' + rows.length + ' of ' + state.agents.length + ' agents';
        }
        if (!rows.length) {
            listEl.innerHTML =
                '<div class="leads-empty"><strong>No agents match these filters.</strong><br>' +
                '<button type="button" class="btn btn-outline btn-sm mt-2" data-acc-act="clear-filters">Clear filters</button></div>';
            return;
        }
        listEl.innerHTML = rows.map(agentRowHtml).join('');
    }

    function agentById(id) {
        return state.agents.find(function (a) { return a.id === id; }) || null;
    }

    // --- Row actions ----------------------------------------------------------
    function setAgentPayment(agentId, status, note) {
        var A = api();
        if (!A || !A.setReviewerPaymentStatus) return Promise.reject(new Error('Not available'));
        var payload = { entityType: 'agent', entityId: agentId, status: status };
        if (note) payload.note = note;
        return Promise.resolve(A.setReviewerPaymentStatus(payload)).then(function () {
            var a = agentById(agentId);
            if (a) { a.paymentStatus = status; a.paymentStatusLabel = PAYMENT_LABELS[status] || status; }
            if (state.drawer.detail && state.drawer.agentId === agentId) {
                state.drawer.detail.payment.status = status;
                state.drawer.detail.payment.statusLabel = PAYMENT_LABELS[status] || status;
                if (note) state.drawer.detail.payment.note = note;
                state.drawer.detail.payment.updatedAt = new Date().toISOString();
            }
            renderSummaryFromAgents();
            render();
            if (typeof window.__reviewerRefreshPayments === 'function') window.__reviewerRefreshPayments();
        });
    }

    // Recompute the summary cards locally after quick edits (no refetch).
    function renderSummaryFromAgents() {
        var active = state.agents.filter(function (a) { return a.status === 'active'; });
        state.summary = {
            totalAgents: state.agents.length,
            activeAgents: active.length,
            unpaidAgents: active.filter(function (a) {
                return a.paymentStatus === 'unpaid' || a.paymentStatus === 'invoice_sent';
            }).length,
            missingLocation: active.filter(function (a) { return a.missingLocation; }).length,
            missingArchetype: active.filter(function (a) { return a.missingArchetype; }).length,
            activeMatches: active.reduce(function (sum, a) { return sum + (a.activeMatchCount || 0); }, 0)
        };
        renderSummary();
    }

    function archiveAgent(agentId) {
        var a = agentById(agentId);
        confirmAction({
            title: 'Remove agent from platform?',
            body: 'This removes ' + ((a && a.name) || 'the agent') + ' from future matching options and keeps historical records. Nothing is permanently deleted.',
            confirmLabel: 'Archive agent'
        }).then(function (ok) {
            if (!ok) return;
            var A = api();
            if (!A || !A.deleteReviewerAgent) return;
            Promise.resolve(A.deleteReviewerAgent({ agentId: agentId })).then(function () {
                if (a) a.status = 'archived';
                renderSummaryFromAgents();
                render();
                closeDrawer();
                if (typeof window.__reviewerReloadQueue === 'function') window.__reviewerReloadQueue();
            }).catch(function () {
                window.alert('Could not archive the agent. Please try again.');
            });
        });
    }

    function restoreAgent(agentId) {
        var A = api();
        if (!A || !A.updateReviewerAgent) return;
        Promise.resolve(A.updateReviewerAgent({ agentId: agentId, restore: true })).then(function () {
            var a = agentById(agentId);
            if (a) a.status = 'active';
            renderSummaryFromAgents();
            render();
            if (state.drawer.agentId === agentId) openDrawer(agentId, state.drawer.tab, true);
            if (typeof window.__reviewerReloadQueue === 'function') window.__reviewerReloadQueue();
        }).catch(function () {
            window.alert('Could not restore the agent. Please try again.');
        });
    }

    function requestAssessmentUpdate(agentId) {
        var a = agentById(agentId);
        confirmAction({
            title: 'Request assessment update?',
            body: 'REQUITY will send ' + ((a && a.name) || 'the agent') + ' a secure link to update their REQUITY assessment, and their dashboard will show an update banner until they complete it. Only reviewers can trigger this.',
            confirmLabel: 'Request update'
        }).then(function (ok) {
            if (!ok) return;
            var A = api();
            if (!A || !A.requestAgentAssessmentUpdate) return;
            Promise.resolve(A.requestAgentAssessmentUpdate(agentId)).then(function (res) {
                if (a) a.needsAssessmentUpdate = true;
                render();
                if (state.drawer.agentId === agentId) openDrawer(agentId, state.drawer.tab, true);
                window.alert(res && res.emailed
                    ? 'Assessment update requested. The agent was emailed a secure link.'
                    : 'Assessment update requested. The agent will see a banner in their dashboard.');
            }).catch(function (err) {
                window.alert('Could not request the assessment update. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
        });
    }

    function handleRowAction(act, id) {
        if (act === 'clear-filters') { clearFilters(); return; }
        if (!id) return;
        state.openMenuId = null;
        if (act === 'view') { openDrawer(id, 'summary'); return; }
        if (act === 'location') { openDrawer(id, 'location'); return; }
        if (act === 'archetype') { openDrawer(id, 'assessment'); return; }
        if (act === 'matches') { openDrawer(id, 'matches'); return; }
        if (act === 'paid') { setAgentPayment(id, 'paid').catch(function () { window.alert('Could not update the payment status.'); }); return; }
        if (act === 'unpaid') { setAgentPayment(id, 'unpaid').catch(function () { window.alert('Could not update the payment status.'); }); return; }
        if (act === 'retake') { requestAssessmentUpdate(id); return; }
        if (act === 'archive') { archiveAgent(id); return; }
        if (act === 'restore') { restoreAgent(id); return; }
        render();
    }

    listEl.addEventListener('click', function (ev) {
        var menuBtn = ev.target.closest ? ev.target.closest('[data-acc-menu]') : null;
        if (menuBtn) {
            var id = menuBtn.getAttribute('data-acc-menu');
            state.openMenuId = state.openMenuId === id ? null : id;
            render();
            return;
        }
        var actBtn = ev.target.closest ? ev.target.closest('[data-acc-act]') : null;
        if (actBtn) {
            handleRowAction(actBtn.getAttribute('data-acc-act'), actBtn.getAttribute('data-acc-id'));
        }
    });

    // Close any open actions menu when clicking elsewhere on the page.
    document.addEventListener('click', function (ev) {
        if (!state.openMenuId) return;
        var inMenu = ev.target.closest && (ev.target.closest('.acc-menu-wrap'));
        if (!inMenu) { state.openMenuId = null; render(); }
    });

    // --- Filter wiring --------------------------------------------------------
    var searchTimer = null;
    if (searchEl) searchEl.addEventListener('input', function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            state.search = (searchEl.value || '').trim();
            render();
        }, 200);
    });
    function bindFilter(el, key) {
        if (!el) return;
        el.addEventListener('change', function () {
            state[key] = el.value || '';
            render();
        });
    }
    bindFilter(payFilterEl, 'payFilter');
    bindFilter(locFilterEl, 'locFilter');
    bindFilter(archFilterEl, 'archFilter');
    bindFilter(statusFilterEl, 'statusFilter');
    bindFilter(matchesFilterEl, 'matchesFilter');

    // --- Agent detail drawer --------------------------------------------------
    function openDrawer(agentId, tab, forceReload) {
        if (!drawerOverlay) return;
        var sameAgent = state.drawer.agentId === agentId && state.drawer.detail;
        state.drawer.agentId = agentId;
        state.drawer.tab = tab || 'summary';
        drawerOverlay.classList.remove('hidden');
        renderDrawerTabs();
        if (sameAgent && !forceReload) { renderDrawerBody(); return; }
        state.drawer.detail = null;
        if (drawerBodyEl) drawerBodyEl.innerHTML = '<div class="leads-empty">Loading agent…</div>';
        var a = agentById(agentId);
        if (drawerNameEl) drawerNameEl.textContent = (a && a.name) || 'Agent';
        if (drawerSubEl) drawerSubEl.textContent = (a && a.email) || '';
        var A = api();
        if (!A || !A.fetchReviewerAgentDetail) return;
        state.drawer.loading = true;
        Promise.resolve(A.fetchReviewerAgentDetail(agentId)).then(function (detail) {
            state.drawer.loading = false;
            if (state.drawer.agentId !== agentId) return; // drawer moved on
            state.drawer.detail = detail || null;
            var ag = detail && detail.agent;
            if (drawerNameEl && ag) drawerNameEl.textContent = ag.name || 'Agent';
            if (drawerSubEl && ag) {
                var sub = [];
                if (ag.email) sub.push(ag.email);
                if (ag.phone) sub.push(ag.phone);
                if (ag.status === 'archived') sub.push('Archived');
                drawerSubEl.textContent = sub.join(' · ');
            }
            renderDrawerBody();
        }).catch(function () {
            state.drawer.loading = false;
            if (drawerBodyEl) drawerBodyEl.innerHTML = '<div class="leads-empty">We couldn’t load this agent. Please try again.</div>';
        });
    }

    function closeDrawer() {
        if (drawerOverlay) drawerOverlay.classList.add('hidden');
        state.drawer.agentId = null;
        state.drawer.detail = null;
    }

    if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeDrawer);
    if (drawerOverlay) drawerOverlay.addEventListener('click', function (ev) {
        if (ev.target === drawerOverlay) closeDrawer();
    });

    if (drawerTabsEl) drawerTabsEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-drawer-tab]') : null;
        if (!btn) return;
        state.drawer.tab = btn.getAttribute('data-drawer-tab');
        renderDrawerTabs();
        renderDrawerBody();
    });

    function renderDrawerTabs() {
        if (!drawerTabsEl) return;
        Array.prototype.slice.call(drawerTabsEl.querySelectorAll('.drawer-tab')).forEach(function (b) {
            b.classList.toggle('is-active', b.getAttribute('data-drawer-tab') === state.drawer.tab);
        });
    }

    function fieldHtml(label, value) {
        return '<div><span class="detail-label">' + esc(label) + '</span>' +
            '<span class="detail-value">' + esc(value == null || value === '' ? 'Not specified' : value) + '</span></div>';
    }

    function drawerMsg(kind, text) {
        var el = drawerBodyEl ? drawerBodyEl.querySelector('#drawer-msg') : null;
        if (!el) return;
        el.className = 'drawer-msg ' + (kind === 'error' ? 'is-error' : 'is-ok');
        el.textContent = text;
    }

    // --- Drawer tab renderers -------------------------------------------------
    function renderDrawerBody() {
        if (!drawerBodyEl) return;
        var d = state.drawer.detail;
        if (!d || !d.agent) {
            if (!state.drawer.loading) drawerBodyEl.innerHTML = '<div class="leads-empty">Loading agent…</div>';
            return;
        }
        var tab = state.drawer.tab;
        if (tab === 'summary') return renderSummaryTab(d);
        if (tab === 'matches') return renderMatchesTab(d);
        if (tab === 'assessment') return renderAssessmentTab(d);
        if (tab === 'location') return renderLocationTab(d);
        if (tab === 'payments') return renderPaymentsTab(d);
        if (tab === 'notes') return renderNotesTab(d);
        if (tab === 'danger') return renderDangerTab(d);
        renderSummaryTab(d);
    }

    function renderSummaryTab(d) {
        var a = d.agent;
        var areas = (a.serviceAreas || []).map(function (x) { return String(x); }).join(', ');
        drawerBodyEl.innerHTML =
            '<div class="drawer-grid">' +
                fieldHtml('Name', a.name) +
                fieldHtml('Email', a.email) +
                fieldHtml('Phone', a.phone) +
                fieldHtml('Status', a.status === 'archived' ? 'Archived' : 'Active') +
                fieldHtml('Market', a.marketCity ? (a.marketCity + (a.marketState ? (', ' + a.marketState) : '')) : null) +
                fieldHtml('Service areas', areas || null) +
                fieldHtml('Service radius', a.serviceRadiusMiles != null ? (a.serviceRadiusMiles + ' miles') : null) +
                fieldHtml('Archetype', a.archetype) +
                fieldHtml('Payment status', d.payment.statusLabel) +
                fieldHtml('Active matches', String(a.activeMatchCount || 0)) +
                fieldHtml('Created', fmtDate(a.createdAt)) +
                fieldHtml('Last activity', fmtDate(a.lastActivityAt)) +
            '</div>' +
            (a.needsAssessmentUpdate
                ? '<div class="drawer-msg is-ok" style="margin-top:0.9rem;">An assessment update was requested' +
                  (a.assessmentUpdateRequestedAt ? ' on ' + esc(fmtDate(a.assessmentUpdateRequestedAt)) : '') + '.</div>'
                : '');
    }

    function renderMatchesTab(d) {
        var rows = d.matches || [];
        if (!rows.length) {
            drawerBodyEl.innerHTML = '<div class="leads-empty">No matches for this agent yet.</div>';
            return;
        }
        var activeRows = rows.filter(function (m) { return m.isActive; });
        var historyRows = rows.filter(function (m) { return !m.isActive; });
        function matchRow(m) {
            var facts = [];
            facts.push(m.laneLabel || 'General');
            if (m.market) facts.push(m.market);
            facts.push(m.isActive ? 'Active' : (m.status || 'History'));
            if (m.matchedAt) facts.push('Matched ' + fmtDate(m.matchedAt));
            facts.push(m.lastEmailSentAt ? 'Last email ' + fmtDate(m.lastEmailSentAt) : 'No email sent');
            var actions = '';
            if (m.isActive) {
                actions =
                    '<div class="drawer-match-actions">' +
                        '<button type="button" class="btn btn-outline btn-sm" data-drawer-act="viewclient" data-match-id="' + esc(m.matchId) + '">View client</button>' +
                        '<button type="button" class="btn btn-outline btn-sm" data-drawer-act="changematch" data-match-id="' + esc(m.matchId) + '">Change match</button>' +
                        '<button type="button" class="btn btn-outline btn-sm" data-drawer-act="unmatch" data-match-id="' + esc(m.matchId) + '">Unmatch</button>' +
                        '<button type="button" class="btn btn-outline btn-sm" data-drawer-act="resend" data-match-id="' + esc(m.matchId) + '">Resend email</button>' +
                    '</div>';
            }
            return '<div class="drawer-match-row' + (m.isActive ? '' : ' is-history') + '">' +
                '<div class="drawer-match-head">' +
                    '<span class="drawer-match-name">' + esc(m.clientName || 'Unknown client') + '</span>' +
                    (m.isActive ? '<span class="status-pill status-active">Active</span>' : '<span class="badge badge-source">' + esc(m.status || 'History') + '</span>') +
                '</div>' +
                '<div class="drawer-match-sub">' + facts.map(esc).join(' · ') + '</div>' +
                actions +
            '</div>';
        }
        drawerBodyEl.innerHTML =
            (activeRows.length ? '<div class="drawer-section-title">Active matches</div>' + activeRows.map(matchRow).join('') : '') +
            (historyRows.length ? '<div class="drawer-section-title">History</div>' + historyRows.map(matchRow).join('') : '') +
            '<div id="drawer-msg" class="drawer-msg"></div>';
    }

    function renderAssessmentTab(d) {
        var a = d.agent;
        var options = (state.archetypes.length ? state.archetypes : [
            'The Creative Guide', 'The Trendsetter', 'The Stylist', 'The Cheerleader',
            'The Analyst', 'The Deal Maker', 'The Adapter', 'The Supporter',
            'The Refiner', 'The Catalyst', 'The Observer', 'The Encourager',
            'The Coordinator', 'The Producer', 'The Adjuster', 'The Collaborator'
        ]).map(function (name) {
            return '<option value="' + esc(name) + '"' + (a.archetype === name ? ' selected' : '') + '>' + esc(name) + '</option>';
        }).join('');
        drawerBodyEl.innerHTML =
            '<div class="drawer-grid">' +
                fieldHtml('Archetype', a.archetype) +
                fieldHtml('Completed', a.archetypeCompletedAt ? fmtDate(a.archetypeCompletedAt) : 'Not completed') +
                fieldHtml('Interaction style', a.interactionStyle) +
                fieldHtml('Focus', a.focus) +
                fieldHtml('Stress response', a.stressResponse) +
                fieldHtml('Perceived value', a.perceivedValue) +
                fieldHtml('Negotiation style', a.negotiationStyle) +
            '</div>' +
            '<div class="drawer-section-title">Edit archetype</div>' +
            '<p class="helper-text">Reassigning the archetype changes future match rankings for this agent. It does not change their saved assessment answers.</p>' +
            '<div class="form-group"><select id="drawer-archetype-select" class="form-input">' +
                '<option value="">Select an archetype</option>' + options + '</select></div>' +
            '<div class="drawer-actions">' +
                '<button type="button" class="btn btn-primary btn-sm" data-drawer-act="save-archetype">Save archetype</button>' +
            '</div>' +
            '<div class="drawer-section-title">Assessment update</div>' +
            '<p class="helper-text">Send the agent a secure link to update their REQUITY assessment. Their dashboard shows an update banner until they complete it. Only reviewers can trigger this.</p>' +
            (a.needsAssessmentUpdate
                ? '<p class="helper-text"><strong>An update is already pending</strong>' +
                  (a.assessmentUpdateRequestedAt ? ' (requested ' + esc(fmtDate(a.assessmentUpdateRequestedAt)) + ')' : '') + '.</p>'
                : '') +
            '<div class="drawer-actions">' +
                '<button type="button" class="btn btn-outline btn-sm" data-drawer-act="request-update">Request assessment update</button>' +
            '</div>' +
            '<div id="drawer-msg" class="drawer-msg"></div>';
    }

    function renderLocationTab(d) {
        var a = d.agent;
        var areas = (a.serviceAreas || []).map(function (x) { return String(x); }).join(', ');
        drawerBodyEl.innerHTML =
            '<p class="helper-text">City and state are required for market matching. The service radius defaults to 50 miles. Coordinates are resolved automatically from the city and state.</p>' +
            '<div class="form-group"><label class="detail-label">Market city</label>' +
                '<input type="text" id="drawer-loc-city" class="form-input" maxlength="80" value="' + esc(a.marketCity || '') + '" placeholder="e.g. Miami"></div>' +
            '<div class="form-group"><label class="detail-label">Market state</label>' +
                '<input type="text" id="drawer-loc-state" class="form-input" maxlength="60" value="' + esc(a.marketState || '') + '" placeholder="e.g. FL"></div>' +
            '<div class="form-group"><label class="detail-label">Service radius (miles)</label>' +
                '<input type="number" id="drawer-loc-radius" class="form-input" min="1" max="100000" value="' + esc(a.serviceRadiusMiles != null ? a.serviceRadiusMiles : '') + '" placeholder="50"></div>' +
            '<div class="form-group"><label class="detail-label">Service areas (comma separated)</label>' +
                '<input type="text" id="drawer-loc-areas" class="form-input" maxlength="400" value="' + esc(areas) + '" placeholder="e.g. Coral Gables, Doral"></div>' +
            (a.latitude != null && a.longitude != null
                ? '<p class="helper-text">Current coordinates: ' + esc(a.latitude.toFixed(4)) + ', ' + esc(a.longitude.toFixed(4)) + '</p>'
                : '') +
            '<div class="drawer-actions">' +
                '<button type="button" class="btn btn-primary btn-sm" data-drawer-act="save-location">Save location</button>' +
            '</div>' +
            '<div id="drawer-msg" class="drawer-msg"></div>';
    }

    function renderPaymentsTab(d) {
        var p = d.payment || {};
        var amount = (typeof p.amountCents === 'number')
            ? '$' + (p.amountCents / 100).toFixed(2)
            : null;
        var statuses = ['paid', 'unpaid', 'invoice_sent', 'waived', 'refunded', 'not_required'];
        var buttons = statuses.map(function (s) {
            var label = s === 'paid' ? 'Mark paid'
                : s === 'unpaid' ? 'Mark unpaid'
                : s === 'invoice_sent' ? 'Mark invoice sent'
                : s === 'waived' ? 'Mark waived'
                : s === 'refunded' ? 'Mark refunded'
                : 'Mark not required';
            var isCurrent = (p.status || 'unpaid') === s;
            return '<button type="button" class="btn ' + (isCurrent ? 'btn-primary' : 'btn-outline') + ' btn-sm"' +
                (isCurrent ? ' disabled' : '') + ' data-drawer-act="pay" data-pay-status="' + esc(s) + '">' + esc(label) + '</button>';
        }).join('');
        drawerBodyEl.innerHTML =
            '<div class="drawer-section-title" style="margin-top:0;">Platform access</div>' +
            '<div id="drawer-access"><p class="helper-text">Loading platform access…</p></div>' +
            '<div class="drawer-section-title">Manual payment log</div>' +
            '<p class="helper-text">Agent payments only. Consumer buyers and sellers are never billed. Every update is kept as history. Stripe-confirmed access payments appear automatically; this manual log never marks a Stripe Checkout as successful.</p>' +
            '<div class="drawer-grid">' +
                fieldHtml('Current status', p.statusLabel || 'Unpaid') +
                fieldHtml('Amount', amount) +
                fieldHtml('Last updated', p.updatedAt ? fmtDate(p.updatedAt) : 'Never') +
                fieldHtml('Note', p.note) +
            '</div>' +
            '<div class="drawer-section-title">Update status</div>' +
            '<div class="drawer-actions">' + buttons + '</div>' +
            '<details class="desk-note" style="margin-top:0.75rem;"><summary>Add note</summary>' +
                '<textarea id="drawer-pay-note" class="form-input" rows="2" placeholder="Optional note kept on the payment record"></textarea>' +
            '</details>' +
            '<div id="drawer-msg" class="drawer-msg"></div>';
        renderAccessSection(state.drawer.agentId);
    }

    // --- Platform access (Stripe one-time $50 access fee) ---------------------
    function renderAccessSection(agentId) {
        var host = drawerBodyEl ? drawerBodyEl.querySelector('#drawer-access') : null;
        if (!host || !agentId) return;
        var A = api();
        if (!A || !A.fetchAgentAccessDetails) { host.innerHTML = ''; return; }
        Promise.resolve(A.fetchAgentAccessDetails(agentId)).then(function (acc) {
            if (state.drawer.agentId !== agentId) return;
            var hostNow = drawerBodyEl.querySelector('#drawer-access');
            if (!hostNow) return;
            if (!acc || acc.accessSchemaReady === false) {
                hostNow.innerHTML = '<p class="helper-text">Platform access tracking is not available yet. Apply migration 0018 to enable it.</p>';
                return;
            }
            var status = acc.accessStatus || 'unknown';
            var stripeAmount = (typeof acc.stripeAmountPaid === 'number')
                ? '$' + (acc.stripeAmountPaid / 100).toFixed(2) + ' ' + String(acc.stripeCurrency || 'usd').toUpperCase()
                : null;
            var actions = [];
            if (acc.complimentaryAccess) {
                actions.push('<button type="button" class="btn btn-outline btn-sm" data-drawer-act="revoke-comp">Revoke complimentary access</button>');
            } else {
                actions.push('<button type="button" class="btn btn-primary btn-sm" data-drawer-act="grant-comp">Grant complimentary access</button>');
            }
            if (!acc.grandfathered && acc.stripePaymentStatus !== 'paid' && !acc.complimentaryAccess && status !== 'payment_required') {
                actions.push('<button type="button" class="btn btn-outline btn-sm" data-drawer-act="require-payment">Mark payment required</button>');
            }
            hostNow.innerHTML =
                '<div class="drawer-grid">' +
                    fieldHtml('Access status', ACCESS_LABELS[status] || acc.accessStatusLabel || status) +
                    fieldHtml('Dashboard access', acc.canAccess ? 'Allowed' : 'Blocked') +
                    fieldHtml('Grandfathered', acc.grandfathered ? ('Yes' + (acc.grandfatheredAt ? ' (' + fmtDate(acc.grandfatheredAt) + ')' : '')) : 'No') +
                    fieldHtml('Complimentary', acc.complimentaryAccess ? ('Yes' + (acc.complimentaryAccessGrantedAt ? ' (' + fmtDate(acc.complimentaryAccessGrantedAt) + ')' : '')) : 'No') +
                    fieldHtml('Stripe payment', acc.stripePaymentStatus || 'None') +
                    fieldHtml('Stripe amount', stripeAmount) +
                    fieldHtml('Stripe paid', acc.stripePaidAt ? fmtDate(acc.stripePaidAt) : null) +
                    fieldHtml('Checkout session', acc.stripeCheckoutSessionId) +
                    fieldHtml('Grant reason', acc.accessGrantReason) +
                    fieldHtml('Complimentary note', acc.complimentaryAccessNote) +
                '</div>' +
                '<div class="drawer-actions" style="margin-top:0.75rem;">' + actions.join('') + '</div>';
        }).catch(function () {
            var hostNow = drawerBodyEl ? drawerBodyEl.querySelector('#drawer-access') : null;
            if (hostNow) hostNow.innerHTML = '<p class="helper-text">We could not load the platform access details.</p>';
        });
    }

    function grantComplimentary(agentId) {
        var a = agentById(agentId);
        var reason = window.prompt('Grant complimentary access?\n\nThis agent will be able to use the REQUITY agent platform without paying the $50 access fee.\n\nEnter a reason (required):', '');
        if (reason == null) return;
        reason = reason.trim();
        if (!reason) { window.alert('A reason is required to grant complimentary access.'); return; }
        var note = window.prompt('Optional internal note (leave blank to skip):', '') || '';
        var A = api();
        if (!A || !A.grantAgentComplimentaryAccess) return;
        Promise.resolve(A.grantAgentComplimentaryAccess({ agentId: agentId, reason: reason, note: note.trim() || null })).then(function () {
            drawerMsg('ok', 'Complimentary access granted' + ((a && a.name) ? ' for ' + a.name : '') + '.');
            renderAccessSection(agentId);
            if (typeof window.__reviewerRefreshPayments === 'function') window.__reviewerRefreshPayments();
        }).catch(function (err) {
            window.alert('Could not grant complimentary access. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
        });
    }

    function revokeComplimentary(agentId) {
        confirmAction({
            title: 'Revoke complimentary access?',
            body: 'If this agent previously paid or is grandfathered, their access is restored to that status. Otherwise payment becomes required and their dashboard is blocked until they pay.',
            confirmLabel: 'Revoke access'
        }).then(function (ok) {
            if (!ok) return;
            var A = api();
            if (!A || !A.revokeAgentComplimentaryAccess) return;
            Promise.resolve(A.revokeAgentComplimentaryAccess(agentId)).then(function (res) {
                drawerMsg('ok', 'Complimentary access revoked. Status is now ' + ((res && res.accessStatusLabel) || 'updated') + '.');
                renderAccessSection(agentId);
                if (typeof window.__reviewerRefreshPayments === 'function') window.__reviewerRefreshPayments();
            }).catch(function (err) {
                window.alert('Could not revoke complimentary access. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
        });
    }

    function requirePayment(agentId) {
        confirmAction({
            title: 'Mark payment required?',
            body: 'This blocks dashboard access until the agent completes the one-time $50 access payment. Grandfathered agents and agents with a confirmed Stripe payment cannot be marked.',
            confirmLabel: 'Mark payment required'
        }).then(function (ok) {
            if (!ok) return;
            var A = api();
            if (!A || !A.resetAgentPaymentRequirement) return;
            Promise.resolve(A.resetAgentPaymentRequirement(agentId)).then(function () {
                drawerMsg('ok', 'Payment is now required for this agent.');
                renderAccessSection(agentId);
                if (typeof window.__reviewerRefreshPayments === 'function') window.__reviewerRefreshPayments();
            }).catch(function (err) {
                window.alert('Could not update the payment requirement. ' + ((err && (err.serverError || err.message)) || 'Please try again.'));
            });
        });
    }

    function renderNotesTab(d) {
        var a = d.agent;
        drawerBodyEl.innerHTML =
            '<p class="helper-text">Internal reviewer notes for this agent. Agents never see these.</p>' +
            '<div class="form-group">' +
                '<textarea id="drawer-notes-text" class="form-input" rows="6" maxlength="4000" placeholder="Add internal notes about this agent">' + esc(a.reviewerNotes || '') + '</textarea>' +
            '</div>' +
            '<div class="drawer-actions">' +
                '<button type="button" class="btn btn-primary btn-sm" data-drawer-act="save-notes">Save notes</button>' +
            '</div>' +
            '<div id="drawer-msg" class="drawer-msg"></div>';
    }

    function renderDangerTab(d) {
        var a = d.agent;
        drawerBodyEl.innerHTML =
            '<div class="drawer-danger-zone">' +
                '<div class="drawer-section-title" style="margin-top:0;">Archive agent</div>' +
                '<p class="helper-text">Removes the agent from future matching options and keeps historical records: matches, payments, emails, and assessment data all stay intact. Nothing is permanently deleted.</p>' +
                '<div class="drawer-actions">' +
                    (a.status === 'archived'
                        ? '<button type="button" class="btn btn-outline btn-sm" data-drawer-act="restore">Restore agent</button>'
                        : '<button type="button" class="btn btn-primary btn-sm" data-drawer-act="archive">Remove from platform</button>') +
                '</div>' +
            '</div>' +
            '<div id="drawer-msg" class="drawer-msg"></div>';
    }

    // --- Drawer actions -------------------------------------------------------
    function drawerMatchById(matchId) {
        var d = state.drawer.detail;
        return d && d.matches ? d.matches.find(function (m) { return m.matchId === matchId; }) : null;
    }

    function handleDrawerAction(btn) {
        var act = btn.getAttribute('data-drawer-act');
        var agentId = state.drawer.agentId;
        var d = state.drawer.detail;
        if (!act || !agentId || !d) return;
        var A = api();

        if (act === 'save-location') {
            var city = (document.getElementById('drawer-loc-city') || {}).value || '';
            var st = (document.getElementById('drawer-loc-state') || {}).value || '';
            var radiusRaw = (document.getElementById('drawer-loc-radius') || {}).value || '';
            var areasRaw = (document.getElementById('drawer-loc-areas') || {}).value || '';
            if (!city.trim() || !st.trim()) {
                drawerMsg('error', 'City and state are required for active market matching.');
                return;
            }
            var radius = radiusRaw !== '' && isFinite(Number(radiusRaw)) ? Number(radiusRaw) : 50;
            btn.disabled = true;
            Promise.resolve(A.updateReviewerAgent({
                agentId: agentId,
                location: {
                    marketCity: city.trim(),
                    marketState: st.trim(),
                    serviceRadiusMiles: radius,
                    serviceAreas: areasRaw.trim() || null
                }
            })).then(function () {
                openDrawer(agentId, 'location', true);
                load(true);
            }).catch(function (err) {
                btn.disabled = false;
                drawerMsg('error', (err && (err.serverError || err.message)) || 'Could not save the location.');
            });
            return;
        }

        if (act === 'save-archetype') {
            var sel = document.getElementById('drawer-archetype-select');
            var archetype = sel ? sel.value : '';
            if (!archetype) { drawerMsg('error', 'Select an archetype first.'); return; }
            btn.disabled = true;
            Promise.resolve(A.updateReviewerAgent({ agentId: agentId, archetype: archetype })).then(function () {
                openDrawer(agentId, 'assessment', true);
                load(true);
            }).catch(function (err) {
                btn.disabled = false;
                drawerMsg('error', (err && (err.serverError || err.message)) || 'Could not save the archetype.');
            });
            return;
        }

        if (act === 'save-notes') {
            var text = (document.getElementById('drawer-notes-text') || {}).value || '';
            btn.disabled = true;
            Promise.resolve(A.updateReviewerAgent({ agentId: agentId, reviewerNotes: text })).then(function () {
                btn.disabled = false;
                d.agent.reviewerNotes = text;
                drawerMsg('ok', 'Notes saved.');
            }).catch(function (err) {
                btn.disabled = false;
                drawerMsg('error', (err && (err.serverError || err.message)) || 'Could not save the notes.');
            });
            return;
        }

        if (act === 'pay') {
            var status = btn.getAttribute('data-pay-status');
            var note = ((document.getElementById('drawer-pay-note') || {}).value || '').trim();
            btn.disabled = true;
            setAgentPayment(agentId, status, note || null).then(function () {
                renderPaymentsTab(state.drawer.detail);
                drawerMsg('ok', 'Payment status updated to ' + (PAYMENT_LABELS[status] || status) + '.');
            }).catch(function () {
                btn.disabled = false;
                drawerMsg('error', 'Could not update the payment status.');
            });
            return;
        }

        if (act === 'request-update') { requestAssessmentUpdate(agentId); return; }
        if (act === 'archive') { archiveAgent(agentId); return; }
        if (act === 'restore') { restoreAgent(agentId); return; }
        if (act === 'grant-comp') { grantComplimentary(agentId); return; }
        if (act === 'revoke-comp') { revokeComplimentary(agentId); return; }
        if (act === 'require-payment') { requirePayment(agentId); return; }

        // Match actions
        var matchId = btn.getAttribute('data-match-id');
        var match = matchId ? drawerMatchById(matchId) : null;
        if (!match) return;

        if (act === 'viewclient') {
            // Jump to Paired Clients with the client prefilled in search.
            closeDrawer();
            var pairedTab = document.querySelector('#reviewer-tabs [data-tab="paired"]');
            if (pairedTab) pairedTab.click();
            var pairedSearch = document.getElementById('paired-search');
            if (pairedSearch && match.clientName) {
                pairedSearch.value = match.clientName;
                pairedSearch.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }

        if (act === 'changematch') {
            // Open the shared Change match editor with the lane made explicit.
            closeDrawer();
            if (typeof window.openReviewerChangeMatch === 'function') {
                window.openReviewerChangeMatch({
                    clientId: match.clientId,
                    leadId: match.leadId,
                    matchId: match.matchId,
                    matchLane: match.lane,
                    clientName: match.clientName,
                    agentName: (d.agent && d.agent.name) || null,
                    agentEmail: (d.agent && d.agent.email) || null
                }, match.lane);
            }
            return;
        }

        if (act === 'unmatch') {
            confirmAction({
                title: 'Remove this agent from this match?',
                body: 'The match will move to history. The client record will stay available for review.',
                confirmLabel: 'Unmatch'
            }).then(function (ok) {
                if (!ok || !A.unmatchReviewerMatch) return;
                btn.disabled = true;
                Promise.resolve(A.unmatchReviewerMatch(matchId)).then(function () {
                    openDrawer(agentId, 'matches', true);
                    load(true);
                    if (typeof window.__reviewerReloadQueue === 'function') window.__reviewerReloadQueue();
                }).catch(function (err) {
                    btn.disabled = false;
                    drawerMsg('error', (err && (err.serverError || err.message)) || 'Could not unmatch. Please try again.');
                });
            });
            return;
        }

        if (act === 'resend') {
            if (!A.resendReviewerMatchEmail) return;
            btn.disabled = true;
            btn.textContent = 'Sending…';
            Promise.resolve(A.resendReviewerMatchEmail(matchId)).then(function () {
                btn.textContent = 'Sent';
                drawerMsg('ok', 'Match email resent to the agent.');
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Resend email';
                drawerMsg('error', (err && (err.serverError || err.message)) || 'Could not resend the email.');
            });
            return;
        }
    }

    if (drawerBodyEl) drawerBodyEl.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-drawer-act]') : null;
        if (btn) handleDrawerAction(btn);
    });
})();
