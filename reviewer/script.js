/* REQUITY Reviewer JS */

document.addEventListener('DOMContentLoaded', () => {

    // --- State Data ---
    const clients = [
        {
            id: 'client-1',
            name: 'Jordan Miller',
            need: 'Real estate guidance',
            market: 'Louisville, KY',
            archetype: 'The Trailblazer',
            decisionStyle: 'Decisive and action-oriented',
            communicationPreference: 'Clear, direct updates',
            underStress: 'Needs quick clarity and forward movement',
            bestSupport: 'Confident guidance with clear next steps',
            status: 'Pending Review',
            highestMatch: 'Taylor Brooks',
            fits: [
                {
                    name: 'Taylor Brooks',
                    archetype: 'The Trendsetter',
                    fit: 95,
                    strengths: 'Confident guidance, momentum, design-aware communication',
                    reason: 'Best fit for a Trailblazer client who prefers clear direction, quick clarity, and confident next steps.',
                    top: true
                },
                {
                    name: 'Morgan Lee',
                    archetype: 'The Trusted Advisor',
                    fit: 89,
                    strengths: 'Reassurance, steady communication, patient guidance',
                    reason: 'Strong fit for clients who value trust, calm explanation, and consistent support.',
                    top: false
                },
                {
                    name: 'Casey Grant',
                    archetype: 'The Strategist',
                    fit: 84,
                    strengths: 'Structure, planning, careful review',
                    reason: 'Good fit for clients who appreciate organized guidance and carefully explained options.',
                    top: false
                }
            ]
        },
        {
            id: 'client-2',
            name: 'Avery Collins',
            need: 'Real estate guidance',
            market: 'Nashville, TN',
            archetype: 'The Harmonizer',
            decisionStyle: 'Collaborative and reassurance-oriented',
            communicationPreference: 'Warm, steady communication',
            underStress: 'Needs calm explanation and trust',
            bestSupport: 'A patient real estate agent who builds confidence',
            status: 'Pending Review',
            highestMatch: 'Morgan Lee',
            fits: [
                {
                    name: 'Morgan Lee',
                    archetype: 'The Trusted Advisor',
                    fit: 92,
                    strengths: 'Reassurance, steady communication, patient guidance',
                    reason: 'Excellent real estate agent fit for a Harmonizer needing reassurance and relationship-centered support.',
                    top: true
                },
                {
                    name: 'Casey Grant',
                    archetype: 'The Strategist',
                    fit: 85,
                    strengths: 'Structure, planning, careful review',
                    reason: 'Good secondary fit providing structure and clear plans.',
                    top: false
                }
            ]
        },
        {
            id: 'client-3',
            name: 'Riley Morgan',
            need: 'Real estate guidance',
            market: 'Cincinnati, OH',
            archetype: 'The Planner',
            decisionStyle: 'Careful and structured',
            communicationPreference: 'Detailed updates with clear order',
            underStress: 'Needs preparation and organized next steps',
            bestSupport: 'A strategic real estate agent who explains the path clearly',
            status: 'Pending Review',
            highestMatch: 'Casey Grant',
            fits: [
                {
                    name: 'Casey Grant',
                    archetype: 'The Strategist',
                    fit: 90,
                    strengths: 'Structure, planning, careful review',
                    reason: 'Ideal fit for a Planner needing organized, analytical, and plan-focused guidance.',
                    top: true
                },
                {
                    name: 'Taylor Brooks',
                    archetype: 'The Trendsetter',
                    fit: 82,
                    strengths: 'Confident guidance, momentum, design-aware communication',
                    reason: 'Can provide decisive action once the plan is established.',
                    top: false
                }
            ]
        }
    ];

    let state = {
        activeClientId: 'client-1',
        selectedAgentName: 'Taylor Brooks',
        counts: { pending: 3, fits: 8, scheduled: 0, needsReview: 0 },
        autoMode: 'off' // 'off', 'running', 'complete'
    };

    // --- DOM Elements ---
    const elQueueList = document.getElementById('queue-list');
    const elProfileCard = document.getElementById('profile-card');
    const elFitsList = document.getElementById('fits-list');
    
    const elCountPending = document.getElementById('count-pending');
    const elCountScheduled = document.getElementById('count-scheduled');
    
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

    // --- Initialization ---
    function init() {
        renderQueue();
        renderActiveClient();
    }

    // --- Render Functions ---
    function renderQueue() {
        elQueueList.innerHTML = '';
        clients.forEach(client => {
            const isActive = client.id === state.activeClientId ? 'active' : '';
            let badgeClass = client.status === 'Pending Review' ? 'badge-pending' : 'badge-success';
            
            const html = `
                <div class="queue-item ${isActive}" onclick="selectClient('${client.id}')" id="q-${client.id}">
                    <div class="queue-info">
                        <h3>${client.name}</h3>
                        <div class="queue-meta">${client.need} &bull; ${client.archetype}</div>
                    </div>
                    <span class="badge ${badgeClass}">${client.status}</span>
                </div>
            `;
            elQueueList.insertAdjacentHTML('beforeend', html);
        });
    }

    function renderActiveClient() {
        const client = clients.find(c => c.id === state.activeClientId);
        if(!client) return;

        // Render Profile
        let badgeClass = client.status === 'Pending Review' ? 'badge-pending' : 'badge-success';
        elProfileCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                <div>
                    <h3 class="text-xl mb-1">${client.name}</h3>
                    <div class="helper-text">${client.market} &bull; ${client.need}</div>
                </div>
                <span class="badge ${badgeClass}">${client.status}</span>
            </div>
            <p class="helper-text mb-2">This profile helps the reviewer understand which real estate agent relationship may support the client best.</p>
            
            <div class="profile-grid">
                <div class="profile-field">
                    <span class="detail-label">Client Archetype</span>
                    <span class="detail-value text-blue">${client.archetype}</span>
                </div>
                <div class="profile-field">
                    <span class="detail-label">Decision Style</span>
                    <span class="detail-value">${client.decisionStyle}</span>
                </div>
                <div class="profile-field">
                    <span class="detail-label">Communication Preference</span>
                    <span class="detail-value">${client.communicationPreference}</span>
                </div>
                <div class="profile-field">
                    <span class="detail-label">Under Stress</span>
                    <span class="detail-value">${client.underStress}</span>
                </div>
                <div class="profile-field full-width">
                    <span class="detail-label">Best Support</span>
                    <span class="detail-value">${client.bestSupport}</span>
                </div>
            </div>
        `;
        elProfileCard.classList.remove('fade-in');
        void elProfileCard.offsetWidth; // trigger reflow
        elProfileCard.classList.add('fade-in');

        // Render Fits
        elFitsList.innerHTML = '';
        client.fits.forEach((fit, idx) => {
            const isTop = fit.top ? 'top-match' : '';
            const isSelected = state.selectedAgentName === fit.name ? 'selected' : '';
            const badgeHtml = fit.top ? `<span class="badge badge-highest">Highest recommended fit</span>` : '';
            
            const html = `
                <div class="fit-card ${isTop} ${isSelected}" id="fit-${idx}">
                    <div class="fit-header">
                        <div>
                            <h3 class="fit-name">${fit.name}</h3>
                            <div class="fit-meta">Agent Archetype: <strong class="text-blue">${fit.archetype}</strong></div>
                        </div>
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            ${badgeHtml}
                            <span class="badge badge-internal">${fit.fit}%</span>
                        </div>
                    </div>
                    <div class="mb-2"><span class="detail-label">Strengths:</span> <span class="helper-text" style="color:var(--text-primary)">${fit.strengths}</span></div>
                    <div class="fit-reason"><span class="detail-label">Reason</span><p class="mt-1">${fit.reason}</p></div>
                    <button class="btn btn-outline" onclick="selectGuide('${fit.name}')">Select Agent</button>
                </div>
            `;
            elFitsList.insertAdjacentHTML('beforeend', html);
        });

        // Update Decision Panel
        if(client.status === 'Scheduled Match') {
            elDecisionActions.classList.add('hidden');
            elDecisionSuccess.classList.remove('hidden');
            elDecisionSuccess.textContent = `${state.selectedAgentName} is scheduled for this client after the 48-hour review window.`;
        } else {
            elDecisionActions.classList.remove('hidden');
            elDecisionSuccess.classList.add('hidden');
        }
    }

    function updateSummary() {
        elCountPending.textContent = state.counts.pending;
        elCountScheduled.textContent = state.counts.scheduled;
    }

    // --- Global Actions (attached to window for onclick) ---
    
    window.selectClient = function(id) {
        if(state.autoMode === 'running') return; // Disable manual switch during auto
        state.activeClientId = id;
        const client = clients.find(c => c.id === id);
        state.selectedAgentName = client.highestMatch; // Reset to highest on switch
        renderQueue();
        renderActiveClient();
    };

    window.selectGuide = function(name) {
        if(state.autoMode === 'running') return;
        state.selectedAgentName = name;
        elDecisionAgent.textContent = name;
        renderActiveClient(); // re-renders to update selected state
    };

    window.approveSelected = function() {
        const client = clients.find(c => c.id === state.activeClientId);
        if(client.status !== 'Pending Review') return;

        client.status = 'Scheduled Match';
        state.counts.pending--;
        state.counts.scheduled++;
        
        updateSummary();
        renderQueue();
        renderActiveClient();
        addLog(`Reviewer manually approved ${state.selectedAgentName} for ${client.name}. Scheduled after 48-hour window.`);
    };

    window.holdSelected = function() {
        const client = clients.find(c => c.id === state.activeClientId);
        client.status = 'Held';
        renderQueue();
        renderActiveClient();
        addLog(`Profile held for review: ${client.name}`);
    };

    window.openAutoModal = function() {
        if(state.autoMode !== 'off') return;
        autoModal.classList.remove('hidden');
        validateModal();
    };

    window.closeAutoModal = function() {
        autoModal.classList.add('hidden');
    };

    function validateModal() {
        if(modalName.value.trim() && modalRole.value.trim() && modalConfirm.checked) {
            btnConfirmAuto.disabled = false;
        } else {
            btnConfirmAuto.disabled = true;
        }
    }

    modalName.addEventListener('input', validateModal);
    modalRole.addEventListener('input', validateModal);
    modalConfirm.addEventListener('change', validateModal);

    window.enableAuto = function() {
        closeAutoModal();
        startAutoMatching();
    };

    // --- Activity Log Helper ---
    function addLog(actionText) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const li = document.createElement('li');
        li.innerHTML = `<div class="log-time">${timeStr}</div><div class="log-action">${actionText}</div>`;
        elActivityLog.prepend(li); // Add to top
    }

    // --- Auto script Logic ---
    async function startAutoMatching() {
        state.autoMode = 'running';
        
        // Update Header Button
        btnHeaderAuto.textContent = 'Auto: Running';
        btnHeaderAuto.classList.add('auto-running-pulse');

        // Update Auto Panel
        autoStatusPanel.querySelector('h2').textContent = 'Auto is running';
        autoBadge.textContent = 'Active';
        autoBadge.className = 'badge badge-auto';
        autoStatusCopy.textContent = 'Auto is reviewing pending profiles, selecting the highest percentage matched real estate agent, and scheduling matches after the review window.';
        autoProgressContainer.classList.remove('hidden');

        // Update Bottom Bar
        bottomBar.className = 'bottom-bar auto-running';
        bottomTitle.textContent = 'Auto running';
        bottomCopy.textContent = 'Pending profiles are being reviewed and scheduled with the highest percentage matched real estate agent after the 48-hour review window.';

        addLog(`Auto enabled by ${modalName.value || 'System Reviewer'}`);

        let scanned = 0;
        let scheduled = 0;

        for (const client of clients) {
            if(client.status !== 'Pending Review') continue;

            // Update UI to show current client
            window.selectClient(client.id);
            autoCurrentProfile.textContent = client.name;
            addLog(`Auto reviewing: ${client.name}`);
            
            await sleep(1200); // simulate thinking

            // Select highest fit
            window.selectGuide(client.highestMatch);
            addLog(`Auto selected highest real estate agent match: ${client.highestMatch} for ${client.name}`);
            
            await sleep(800); // simulate thinking

            // Approve
            client.status = 'Scheduled Match';
            state.counts.pending--;
            state.counts.scheduled++;
            scanned++;
            scheduled++;

            autoScanned.textContent = scanned;
            autoScheduled.textContent = scheduled;
            
            updateSummary();
            renderQueue();
            renderActiveClient();
            
            addLog(`${client.name} scheduled with ${client.highestMatch} after 48-hour review window.`);
            
            await sleep(1500); // pause before next
        }

        // Finish Auto
        state.autoMode = 'complete';
        btnHeaderAuto.textContent = 'Auto: Complete';
        btnHeaderAuto.classList.remove('auto-running-pulse');
        btnHeaderAuto.classList.replace('btn-primary', 'btn-outline');
        
        autoStatusPanel.querySelector('h2').textContent = 'Auto completed';
        autoBadge.textContent = 'Done';
        autoBadge.className = 'badge badge-success';
        autoCurrentProfile.textContent = 'All pending processed';

        bottomBar.className = 'bottom-bar demo-complete';
        bottomTitle.textContent = 'Auto demo complete';
        bottomCopy.textContent = 'Matches have been scheduled after the review window. The real estate agent receives the client profile only when the scheduled match is ready.';
        
        document.body.classList.remove('demo-active');
    }

    // --- Demo Sequence Logic ---
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    document.getElementById('btn-run-demo').addEventListener('click', async function() {
        // Prevent clicks
        document.body.classList.add('demo-active');
        this.disabled = true;
        this.textContent = 'Demo Running...';

        // 1. Ensure Jordan is selected
        window.selectClient('client-1');
        
        // Let user read
        await sleep(1500);

        // 2. Open Modal
        window.openAutoModal();
        await sleep(800);

        // 3. Fill Modal slowly
        modalName.value = 'Sarah Reviewer';
        validateModal();
        await sleep(500);
        
        modalRole.value = 'Lead Match Admin';
        validateModal();
        await sleep(500);

        modalConfirm.checked = true;
        validateModal();
        await sleep(800);

        // 4. Click Enable
        window.enableAuto();

        // The startAutoMatching function handles the rest of the loop
    });

    init();
});
