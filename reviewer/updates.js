/* REQUITY Reviewer: Updates tab (announcements for agents).
 *
 * Lazy-loaded: nothing is fetched until the reviewer opens the Updates tab.
 * Reviewers create, edit, preview, publish, unpublish, archive, and remove
 * announcements. Agents only ever see active, targeted announcements after
 * login; nothing here renders on public pages.
 */
(function () {
    'use strict';

    var listEl = document.getElementById('ann-list');
    if (!listEl) return;

    var createBtn = document.getElementById('ann-create-btn');
    var formWrap = document.getElementById('ann-form-wrap');
    var formTitle = document.getElementById('ann-form-title');
    var fTitle = document.getElementById('ann-title');
    var fBody = document.getElementById('ann-body');
    var fPriority = document.getElementById('ann-priority');
    var fAudience = document.getElementById('ann-audience');
    var targetsWrap = document.getElementById('ann-targets-wrap');
    var targetSearch = document.getElementById('ann-target-search');
    var targetList = document.getElementById('ann-target-list');
    var targetCount = document.getElementById('ann-target-count');
    var fCtaLabel = document.getElementById('ann-cta-label');
    var fCtaUrl = document.getElementById('ann-cta-url');
    var fStarts = document.getElementById('ann-starts');
    var fEnds = document.getElementById('ann-ends');
    var fDismissible = document.getElementById('ann-dismissible');
    var previewWrap = document.getElementById('ann-preview-wrap');
    var previewEl = document.getElementById('ann-preview');
    var formMsg = document.getElementById('ann-form-msg');
    var saveDraftBtn = document.getElementById('ann-save-draft');
    var savePublishBtn = document.getElementById('ann-save-publish');
    var previewBtn = document.getElementById('ann-preview-btn');
    var cancelBtn = document.getElementById('ann-cancel');

    var PRIORITY_LABELS = { info: 'Info', important: 'Important', urgent: 'Urgent', maintenance: 'Maintenance' };
    var STATUS_LABELS = { draft: 'Draft', scheduled: 'Scheduled', active: 'Active', expired: 'Expired', archived: 'Archived' };

    var state = {
        loaded: false,
        loading: false,
        announcements: [],
        summary: null,
        tableAvailable: true,
        editingId: null,
        agents: [],           // for the selected-agents picker
        agentsLoaded: false,
        selectedAgentIds: {}, // id -> true
        openMenuId: null
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function api() { return window.RequityAPI || null; }

    function confirmAction(opts) {
        if (window.requityConfirm) return window.requityConfirm(opts);
        return Promise.resolve(window.confirm(opts.body || 'Are you sure?'));
    }

    function fmtDate(s) {
        if (!s) return null;
        try {
            return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { return String(s); }
    }

    function formMessage(kind, text) {
        if (!formMsg) return;
        formMsg.className = 'drawer-msg ' + (kind === 'error' ? 'is-error' : 'is-ok');
        formMsg.textContent = text || '';
    }

    // --- Load -----------------------------------------------------------------
    function load(force) {
        var A = api();
        if (!A || !A.fetchReviewerAnnouncements) return;
        if (state.loading) return;
        if (state.loaded && !force) { render(); return; }
        state.loading = true;
        listEl.innerHTML = '<div class="leads-empty">Loading announcements…</div>';
        Promise.resolve(A.fetchReviewerAnnouncements()).then(function (res) {
            state.announcements = (res && res.announcements) || [];
            state.summary = (res && res.summary) || null;
            state.tableAvailable = !res || res.announcementsTableAvailable !== false;
            state.loaded = true;
            state.loading = false;
            renderSummary();
            render();
        }).catch(function () {
            state.loading = false;
            listEl.innerHTML = '<div class="leads-empty">We couldn’t load announcements. Please try again.</div>';
        });
    }

    window.__reviewerLoadUpdates = function () { load(false); };

    function renderSummary() {
        var s = state.summary || {};
        var set = function (id, v) {
            var el = document.getElementById(id);
            if (el) el.textContent = String(Number(v) || 0);
        };
        set('ann-count-active', s.active);
        set('ann-count-scheduled', s.scheduled);
        set('ann-count-drafts', s.drafts);
        set('ann-count-archived', s.archived);
        if (typeof window.__reviewerSetTabCount === 'function') {
            window.__reviewerSetTabCount('updates', s.active || 0);
        }
    }

    // --- Agent banner markup (shared by preview and, visually, the agent side) -
    function bannerHtml(a) {
        var p = a.priority || 'info';
        var colors = {
            info: { bg: '#F2F6FC', border: '#C9D9F0', accent: '#07366E' },
            important: { bg: '#FFF6EC', border: '#FFD9AE', accent: '#B45309' },
            urgent: { bg: '#FDF1F0', border: '#F2C4C0', accent: '#9C2A21' },
            maintenance: { bg: '#F4F5F7', border: '#D7DCE3', accent: '#3D4C60' }
        };
        var c = colors[p] || colors.info;
        var cta = (a.ctaLabel && a.ctaUrl)
            ? '<a href="' + esc(a.ctaUrl) + '" class="btn btn-outline btn-sm" style="text-decoration:none;">' + esc(a.ctaLabel) + '</a>'
            : '';
        var dismiss = a.dismissible !== false
            ? '<button type="button" aria-label="Dismiss" style="background:none;border:none;font-size:1.1rem;line-height:1;cursor:pointer;color:' + c.accent + ';">&times;</button>'
            : '';
        return '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.9rem;background:' + c.bg +
            ';border:1px solid ' + c.border + ';border-radius:12px;padding:0.85rem 1rem;">' +
            '<div style="min-width:0;">' +
                '<strong style="color:' + c.accent + ';font-size:0.95rem;display:block;">' + esc(a.title || 'Untitled') + '</strong>' +
                '<div style="color:#4A607C;font-size:0.85rem;margin-top:0.2rem;white-space:pre-line;">' + esc(a.body || '') + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">' + cta + dismiss + '</div>' +
        '</div>';
    }

    // --- List -------------------------------------------------------------------
    function annRowHtml(a) {
        var status = a.effectiveStatus || a.status || 'draft';
        var facts = [];
        facts.push(PRIORITY_LABELS[a.priority] || 'Info');
        facts.push(a.audienceLabel || 'All agents');
        if (a.audience === 'selected_agents') {
            facts.push((a.targetAgentIds || []).length + ' targeted');
        }
        if (a.startsAt || a.endsAt) {
            facts.push('Visible ' + (fmtDate(a.startsAt) || 'now') + ' to ' + (fmtDate(a.endsAt) || 'no end date'));
        }
        if (a.updatedAt) facts.push('Updated ' + fmtDate(a.updatedAt));
        if (a.dismissedCount > 0) facts.push(a.dismissedCount + ' dismissed');

        var statusPillClass = status === 'active' ? 'status-active' : '';
        var statusPill = statusPillClass
            ? '<span class="status-pill ' + statusPillClass + '">' + esc(STATUS_LABELS[status] || status) + '</span>'
            : '<span class="badge badge-source">' + esc(STATUS_LABELS[status] || status) + '</span>';

        var menuOpen = state.openMenuId === a.id;
        var menuItems = '';
        menuItems += '<button type="button" data-ann-act="preview" data-ann-id="' + esc(a.id) + '">Preview</button>';
        menuItems += '<button type="button" data-ann-act="edit" data-ann-id="' + esc(a.id) + '">Edit</button>';
        if (status === 'active' || status === 'scheduled') {
            menuItems += '<button type="button" data-ann-act="unpublish" data-ann-id="' + esc(a.id) + '">Unpublish</button>';
        } else {
            menuItems += '<button type="button" data-ann-act="publish" data-ann-id="' + esc(a.id) + '">Publish</button>';
        }
        if (status !== 'archived') {
            menuItems += '<button type="button" data-ann-act="archive" data-ann-id="' + esc(a.id) + '">Archive</button>';
        }
        menuItems += '<button type="button" class="is-danger" data-ann-act="remove" data-ann-id="' + esc(a.id) + '">Remove entirely</button>';

        return '<div class="acc-row">' +
            '<div class="acc-row-main">' +
                '<span class="acc-row-name">' + esc(a.title || 'Untitled') + '</span>' +
                '<span class="acc-row-sub">' + facts.map(esc).join(' &middot; ') + '</span>' +
            '</div>' +
            '<div class="acc-row-side">' + statusPill +
                '<button type="button" class="btn btn-primary btn-sm" data-ann-act="edit" data-ann-id="' + esc(a.id) + '">Edit</button>' +
                '<div class="acc-menu-wrap">' +
                    '<button type="button" class="btn btn-outline btn-sm" data-ann-menu="' + esc(a.id) + '" aria-haspopup="true" aria-expanded="' + (menuOpen ? 'true' : 'false') + '">Actions</button>' +
                    (menuOpen ? '<div class="acc-menu">' + menuItems + '</div>' : '') +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function render() {
        if (!state.loaded) return;
        if (!state.tableAvailable) {
            listEl.innerHTML = '<div class="leads-empty">The announcements tables are not set up yet. Apply migration 0015_reviewer_announcements.sql in Supabase, then reload.</div>';
            return;
        }
        if (!state.announcements.length) {
            listEl.innerHTML = '<div class="leads-empty">No announcements yet.</div>';
            return;
        }
        listEl.innerHTML = state.announcements.map(annRowHtml).join('');
    }

    function annById(id) {
        return state.announcements.find(function (a) { return a.id === id; }) || null;
    }

    // --- Selected agents picker ---------------------------------------------------
    function loadAgentsForPicker() {
        if (state.agentsLoaded) { renderTargetList(); return; }
        var A = api();
        if (!A || !A.fetchReviewerAgents) return;
        if (targetList) targetList.innerHTML = '<div class="helper-text">Loading agents…</div>';
        Promise.resolve(A.fetchReviewerAgents()).then(function (res) {
            state.agents = ((res && res.agents) || []).filter(function (a) { return a.status === 'active'; });
            state.agentsLoaded = true;
            renderTargetList();
        }).catch(function () {
            if (targetList) targetList.innerHTML = '<div class="helper-text">Could not load agents.</div>';
        });
    }

    function renderTargetList() {
        if (!targetList) return;
        var q = ((targetSearch && targetSearch.value) || '').trim().toLowerCase();
        var rows = state.agents.filter(function (a) {
            if (!q) return true;
            return ((a.name || '') + ' ' + (a.email || '')).toLowerCase().indexOf(q) !== -1;
        });
        if (!rows.length) {
            targetList.innerHTML = '<div class="helper-text">No agents match this search.</div>';
        } else {
            targetList.innerHTML = rows.slice(0, 100).map(function (a) {
                var checked = state.selectedAgentIds[a.id] ? ' checked' : '';
                var subs = [];
                if (a.email) subs.push(a.email);
                subs.push(a.paymentStatusLabel || 'Unpaid');
                subs.push(a.missingLocation ? 'Missing location' : (a.marketCity || 'No market'));
                return '<label class="ann-target-row">' +
                    '<input type="checkbox" data-ann-target="' + esc(a.id) + '"' + checked + '>' +
                    '<span><strong>' + esc(a.name) + '</strong> <span class="helper-text">' + esc(subs.join(' · ')) + '</span></span>' +
                '</label>';
            }).join('');
        }
        updateTargetCount();
    }

    function updateTargetCount() {
        if (!targetCount) return;
        var n = Object.keys(state.selectedAgentIds).length;
        targetCount.textContent = n + (n === 1 ? ' agent selected' : ' agents selected');
    }

    if (targetSearch) targetSearch.addEventListener('input', renderTargetList);
    if (targetList) targetList.addEventListener('change', function (ev) {
        var box = ev.target;
        if (!box || !box.getAttribute) return;
        var id = box.getAttribute('data-ann-target');
        if (!id) return;
        if (box.checked) state.selectedAgentIds[id] = true;
        else delete state.selectedAgentIds[id];
        updateTargetCount();
    });

    // --- Form ------------------------------------------------------------------
    function toLocalInputValue(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            var pad = function (n) { return String(n).padStart(2, '0'); };
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch (e) { return ''; }
    }

    function openForm(existing) {
        state.editingId = existing ? existing.id : null;
        state.selectedAgentIds = {};
        if (existing && existing.targetAgentIds) {
            existing.targetAgentIds.forEach(function (id) { state.selectedAgentIds[id] = true; });
        }
        if (formTitle) formTitle.textContent = existing ? 'Edit announcement' : 'Create announcement';
        if (fTitle) fTitle.value = existing ? (existing.title || '') : '';
        if (fBody) fBody.value = existing ? (existing.body || '') : '';
        if (fPriority) fPriority.value = existing ? (existing.priority || 'info') : 'info';
        if (fAudience) fAudience.value = existing ? (existing.audience || 'all_agents') : 'all_agents';
        if (fCtaLabel) fCtaLabel.value = existing ? (existing.ctaLabel || '') : '';
        if (fCtaUrl) fCtaUrl.value = existing ? (existing.ctaUrl || '') : '';
        if (fStarts) fStarts.value = existing ? toLocalInputValue(existing.startsAt) : '';
        if (fEnds) fEnds.value = existing ? toLocalInputValue(existing.endsAt) : '';
        if (fDismissible) fDismissible.value = existing && existing.dismissible === false ? 'no' : 'yes';
        formMessage('ok', '');
        if (previewWrap) previewWrap.hidden = true;
        syncTargetsVisibility();
        if (formWrap) {
            formWrap.hidden = false;
            formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function closeForm() {
        state.editingId = null;
        if (formWrap) formWrap.hidden = true;
    }

    function syncTargetsVisibility() {
        var isSelected = fAudience && fAudience.value === 'selected_agents';
        if (targetsWrap) targetsWrap.hidden = !isSelected;
        if (isSelected) loadAgentsForPicker();
    }

    if (fAudience) fAudience.addEventListener('change', syncTargetsVisibility);
    if (createBtn) createBtn.addEventListener('click', function () { openForm(null); });
    if (cancelBtn) cancelBtn.addEventListener('click', closeForm);

    function formPayload() {
        return {
            announcementId: state.editingId || undefined,
            title: (fTitle && fTitle.value || '').trim(),
            body: (fBody && fBody.value || '').trim(),
            priority: (fPriority && fPriority.value) || 'info',
            audience: (fAudience && fAudience.value) || 'all_agents',
            ctaLabel: (fCtaLabel && fCtaLabel.value || '').trim() || undefined,
            ctaUrl: (fCtaUrl && fCtaUrl.value || '').trim() || undefined,
            dismissible: !(fDismissible && fDismissible.value === 'no'),
            startsAt: fStarts && fStarts.value ? new Date(fStarts.value).toISOString() : undefined,
            endsAt: fEnds && fEnds.value ? new Date(fEnds.value).toISOString() : undefined,
            targetAgentIds: Object.keys(state.selectedAgentIds)
        };
    }

    function validateForm(p) {
        if (!p.title) return 'A title is required.';
        if (!p.body) return 'A body is required.';
        if (p.ctaUrl && !(p.ctaUrl.indexOf('/') === 0 && p.ctaUrl.indexOf('//') !== 0) && !/^https:\/\//i.test(p.ctaUrl)) {
            return 'The CTA URL must be a relative URL (/...) or an https URL.';
        }
        if (p.ctaUrl && !p.ctaLabel) return 'Add a CTA label for the CTA URL.';
        if (p.startsAt && p.endsAt && Date.parse(p.endsAt) <= Date.parse(p.startsAt)) {
            return 'The end date must be after the start date.';
        }
        if (p.audience === 'selected_agents' && !p.targetAgentIds.length) {
            return 'Select at least one agent for a selected-agents announcement.';
        }
        return null;
    }

    function save(publishNow) {
        var A = api();
        if (!A) return;
        var p = formPayload();
        var problem = validateForm(p);
        if (problem) { formMessage('error', problem); return; }
        p.publishNow = publishNow === true;
        var call = state.editingId ? A.updateReviewerAnnouncement(p) : A.createReviewerAnnouncement(p);
        if (saveDraftBtn) saveDraftBtn.disabled = true;
        if (savePublishBtn) savePublishBtn.disabled = true;
        Promise.resolve(call).then(function () {
            if (saveDraftBtn) saveDraftBtn.disabled = false;
            if (savePublishBtn) savePublishBtn.disabled = false;
            closeForm();
            load(true);
        }).catch(function (err) {
            if (saveDraftBtn) saveDraftBtn.disabled = false;
            if (savePublishBtn) savePublishBtn.disabled = false;
            formMessage('error', (err && (err.serverError || err.message)) || 'Could not save the announcement.');
        });
    }

    if (saveDraftBtn) saveDraftBtn.addEventListener('click', function () { save(false); });
    if (savePublishBtn) savePublishBtn.addEventListener('click', function () { save(true); });
    if (previewBtn) previewBtn.addEventListener('click', function () {
        var p = formPayload();
        if (previewEl) previewEl.innerHTML = bannerHtml(p);
        if (previewWrap) previewWrap.hidden = false;
    });

    // --- Row actions --------------------------------------------------------------
    function statusAction(id, action) {
        var A = api();
        if (!A || !A.setReviewerAnnouncementStatus) return;
        Promise.resolve(A.setReviewerAnnouncementStatus(id, action)).then(function () {
            load(true);
        }).catch(function () {
            window.alert('Could not update the announcement. Please try again.');
        });
    }

    function handleAction(act, id) {
        var a = annById(id);
        state.openMenuId = null;
        if (!a) { render(); return; }
        if (act === 'edit') { render(); openForm(a); return; }
        if (act === 'preview') {
            render();
            openForm(a);
            if (previewEl) previewEl.innerHTML = bannerHtml(a);
            if (previewWrap) previewWrap.hidden = false;
            return;
        }
        if (act === 'publish') { render(); statusAction(id, 'publish'); return; }
        if (act === 'unpublish') { render(); statusAction(id, 'unpublish'); return; }
        if (act === 'archive') { render(); statusAction(id, 'archive'); return; }
        if (act === 'remove') {
            render();
            confirmAction({
                title: 'Remove this announcement?',
                body: 'This will remove the announcement from agent dashboards. This action cannot be undone.',
                confirmLabel: 'Remove entirely'
            }).then(function (ok) {
                if (!ok) return;
                var A = api();
                if (!A || !A.deleteReviewerAnnouncement) return;
                Promise.resolve(A.deleteReviewerAnnouncement(id)).then(function () {
                    load(true);
                }).catch(function () {
                    window.alert('Could not remove the announcement. Please try again.');
                });
            });
            return;
        }
        render();
    }

    listEl.addEventListener('click', function (ev) {
        var menuBtn = ev.target.closest ? ev.target.closest('[data-ann-menu]') : null;
        if (menuBtn) {
            var mid = menuBtn.getAttribute('data-ann-menu');
            state.openMenuId = state.openMenuId === mid ? null : mid;
            render();
            return;
        }
        var actBtn = ev.target.closest ? ev.target.closest('[data-ann-act]') : null;
        if (actBtn) handleAction(actBtn.getAttribute('data-ann-act'), actBtn.getAttribute('data-ann-id'));
    });

    document.addEventListener('click', function (ev) {
        if (!state.openMenuId) return;
        var inMenu = ev.target.closest && ev.target.closest('.acc-menu-wrap');
        if (!inMenu) { state.openMenuId = null; render(); }
    });
})();
