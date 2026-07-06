/* REQUITY Client Assessment Logic */

// Exact Assessment Questions Provided
const consumerAssessmentQuestions = [
  {
    id: 1,
    question: "Who will be making decisions with you?",
    options: [
      { value: "just_me", text: "Just me", description: "I make decisions independently" },
      { value: "partner_spouse", text: "My partner/spouse", description: "My partner will be involved in decisions" },
      { value: "family", text: "My family", description: "Multiple family members will be involved" },
      { value: "other", text: "Other", description: "Others will be involved in the decision-making" }
    ]
  },
  {
    id: 2,
    question: "How do you like to make decisions?",
    options: [
      { value: "decide_quickly", text: "I prefer to decide quickly and confidently", description: "I make fast, confident decisions" },
      { value: "discuss_options", text: "I like to discuss options with others before deciding", description: "I value input from others" },
      { value: "someone_guide", text: "I prefer someone else to guide me", description: "I like expert guidance" },
      { value: "consider_possibilities", text: "I need time to consider all possibilities", description: "I take time to evaluate options" }
    ]
  },
  {
    id: 3,
    question: "When thinking about a property, what matters most to you?",
    note: "This applies whether you’re buying or selling.",
    options: [
      { value: "design_aesthetics", text: "I care most about design and aesthetics.", description: "Beautiful, stylish design matters most to me" },
      { value: "practical_features", text: "I focus on practical features and functionality.", description: "I value function over form" },
      { value: "space_layout", text: "I think about space and layout.", description: "How the space flows and works matters to me" },
      { value: "affordability", text: "I focus on affordability and value.", description: "I want the best value for the money" },
      { value: "location", text: "I prioritize location.", description: "The right neighborhood and area come first" }
    ]
  },
  {
    id: 4,
    question: "If something unexpected comes up, what helps you most?",
    options: [
      { value: "clear_guidance", text: "Clear, step-by-step guidance", description: "I need structured support" },
      { value: "information_clarity", text: "Information and clarity", description: "I want to understand what's happening" },
      { value: "quick_solutions", text: "Quick solutions and action", description: "Let's fix it fast and move on" },
      { value: "clear_plan", text: "A clear plan", description: "Show me the path forward" },
      { value: "space_time", text: "Space and time to process", description: "I need time to think through it" },
      { value: "distraction_humor", text: "Distraction or humor", description: "Help me step back from the stress" },
      { value: "extra_reassurance", text: "Extra reassurance and support", description: "I need emotional support" },
      { value: "encouragement", text: "Encouragement and support", description: "Positive reinforcement helps me cope" }
    ]
  },
  {
    id: 5,
    question: "When you're stressed, what helps you most?",
    options: [
      { value: "clear_guidance", text: "Clear, step-by-step guidance", description: "Structure helps me cope" },
      { value: "information_clarity", text: "Information and clarity", description: "Knowledge reduces my stress" },
      { value: "quick_solutions", text: "Quick solutions and action", description: "Action alleviates stress" },
      { value: "clear_plan", text: "A clear plan", description: "Having a roadmap calms me" },
      { value: "space_process", text: "Space to process", description: "I need breathing room" },
      { value: "distraction_humor", text: "Distraction or humor", description: "Lightening the mood helps" },
      { value: "extra_reassurance", text: "Extra reassurance and support", description: "I need comfort and support" },
      { value: "encouragement", text: "Encouragement and support", description: "Positive words motivate me" }
    ]
  },
  {
    id: 6,
    question: "In your ideal experience, what would you do?",
    options: [
      { value: "lead_process", text: "I lead the process and make quick decisions.", description: "I want to drive the timeline" },
      { value: "collaborate_team", text: "I collaborate closely with my agent and others.", description: "Teamwork makes it better" },
      { value: "guided_expert", text: "I’m guided by an expert I trust.", description: "I want expert real estate guidance" },
      { value: "thorough_research", text: "I do thorough research before each step.", description: "Knowledge is power" }
    ]
  },
  {
    id: 7,
    question: "When you think about a property, what do you focus on most?",
    note: "If you’re selling, answer based on what you believe buyers notice most about your property.",
    options: [
      { value: "visual_appeal", text: "I focus on visual appeal and design elements.", description: "Beauty and style catch my eye" },
      { value: "practical_aspects", text: "I focus on practical aspects and functionality.", description: "I notice how well it works" },
      { value: "investment_value", text: "I focus on investment potential and value.", description: "I think about the financial decision" },
      { value: "emotional_connection", text: "I focus on how the space makes me feel.", description: "I notice whether it feels like home" }
    ]
  },
  {
    id: 8,
    question: "What is your communication preference?",
    options: [
      { value: "frequent_updates", text: "I like frequent updates and quick responses.", description: "Keep me in the loop constantly" },
      { value: "scheduled_checkins", text: "I prefer scheduled check-ins at key milestones.", description: "Regular, structured communication works for me" },
      { value: "as_needed", text: "I prefer communication only when needed.", description: "I don’t want to be over-communicated with" },
      { value: "detailed_explanations", text: "I like detailed explanations of each step.", description: "Help me understand everything" }
    ]
  },
  {
    id: 9,
    question: "When facing a difficult decision, what do you do?",
    options: [
      { value: "trust_instincts", text: "I trust my instincts and decide.", description: "My gut usually knows" },
      { value: "seek_advice", text: "I seek advice from trusted people.", description: "Others help me see clearly" },
      { value: "research_thoroughly", text: "I research thoroughly before deciding.", description: "I need all the facts" },
      { value: "avoid_postpone", text: "I sometimes avoid or postpone the decision.", description: "Tough choices are stressful" }
    ]
  },
  {
    id: 10,
    question: "What is your biggest concern in a transaction?",
    options: [
      { value: "making_mistake", text: "I worry about making the wrong choice.", description: "What if I regret this decision" },
      { value: "process_delays", text: "I worry about delays in the process.", description: "I want things to move smoothly" },
      { value: "financial_aspects", text: "I worry about the financial aspects.", description: "Money matters are stressful for me" },
      { value: "relationship_conflicts", text: "I worry about conflicts with others involved.", description: "I want everyone to get along" }
    ]
  },
  {
    id: 11,
    question: "When do you feel most confident?",
    options: [
      { value: "in_control", text: "I feel confident when I’m in control of the situation.", description: "When I lead, things go well" },
      { value: "team_support", text: "I feel confident when I have a strong team supporting me.", description: "Together we’re stronger" },
      { value: "well_informed", text: "I feel confident when I’m well-informed about all options.", description: "Knowledge gives me confidence" },
      { value: "trusted_guidance", text: "I feel confident when I have trusted guidance.", description: "Expert advice reassures me" }
    ]
  },
  {
    id: 12,
    question: "In negotiations, what do you prefer to do?",
    options: [
      { value: "direct_assertive", text: "I prefer to be direct and assertive.", description: "I say what I want clearly" },
      { value: "collaborative_winwin", text: "I prefer to find collaborative win-win solutions.", description: "Everyone should benefit" },
      { value: "agent_handle", text: "I prefer to let my agent handle most of it.", description: "That’s what real estate agents are for" },
      { value: "careful_strategic", text: "I prefer to be careful and strategic.", description: "I think through every move" }
    ]
  },
  {
    id: 13,
    question: "When things don’t go as planned, what do you do?",
    options: [
      { value: "take_charge", text: "I take charge and find solutions.", description: "I’ll fix this myself" },
      { value: "work_together", text: "I work with others to adjust the plan.", description: "Let’s solve this together" },
      { value: "need_reassurance", text: "I need reassurance that it will work out.", description: "Tell me it’s going to be okay" },
      { value: "step_back", text: "I step back and reassess.", description: "I need to process this change" }
    ]
  },
  {
    id: 14,
    question: "What is your timeline preference?",
    options: [
      { value: "asap", text: "I want to move as soon as possible.", description: "Speed is important to me" },
      { value: "steady_pace", text: "I prefer a steady, predictable pace.", description: "Consistent progress works best" },
      { value: "flexible_timing", text: "I prefer flexible timing based on circumstances.", description: "I like to adapt as we go" },
      { value: "no_rush", text: "I’m in no rush and want to take the time needed.", description: "Good things take time" }
    ]
  },
  {
    id: 15,
    question: "How do you learn best?",
    options: [
      { value: "doing_experiencing", text: "I learn best by doing and experiencing.", description: "Hands-on learning works for me" },
      { value: "visual_materials", text: "I learn best through visual materials and examples.", description: "Show me what you mean" },
      { value: "detailed_explanations", text: "I learn best through detailed explanations and data.", description: "Give me the full picture" },
      { value: "personal_stories", text: "I learn best through personal stories and examples.", description: "Real experiences help me understand" }
    ]
  },
  {
    id: 16,
    question: "At the end of the process, what does success mean to you?",
    options: [
      { value: "achieved_goals", text: "I achieved my goals efficiently.", description: "I got what I wanted quickly" },
      { value: "positive_experience", text: "Everyone had a positive experience.", description: "The journey mattered as much as the outcome" },
      { value: "right_choice", text: "I made the right choice.", description: "This decision will serve me well" },
      { value: "stress_free", text: "The process was stress-free.", description: "I felt supported throughout" }
    ]
  }
];

document.addEventListener('DOMContentLoaded', () => {

    // Layout diagnostics (debug only): confirm the card fits the viewport with no
    // horizontal overflow. Never logs answers or any PII.
    try {
        if (typeof localStorage !== 'undefined' && localStorage.requity_debug === '1') {
            console.log('assessment:layout-check', { page: 'client', viewportWidth: window.innerWidth });
        }
    } catch (e) {}

    // --- State ---
    let currentStepIndex = -1; // -1 = Contact Info, 0-15 = Questions, 16 = Final Page
    let selectedGoal = null;
    let userAnswers = {};
    let isDemoRunning = false;
    let leadId = null; // incomplete-assessment lead id (for follow-up capture)
    let leadProgressTimer = null;
    // True when a branded slug URL was used but did not resolve to a real agent.
    // In that case we fall the submission back to the reviewer queue so it is
    // never orphaned, and show a clean "invalid or expired link" message.
    let slugInvalid = false;

    // --- DOM Elements ---
    const views = {
        contact: document.getElementById('step-contact'),
        assessment: document.getElementById('step-assessment'),
        waiting: document.getElementById('step-waiting')
    };
    
    // Contact Elements
    const goalOptions = document.querySelectorAll('#goalOptions .option-card');
    const startAssessmentBtn = document.getElementById('startAssessmentBtn');
    const inputs = ['fname', 'lname', 'email'].map(id => document.getElementById(id));
    const otherIntentWrap = document.getElementById('otherIntentWrap');
    const otherIntentInput = document.getElementById('otherIntent');
    const marketCityInput = document.getElementById('marketCity');
    const marketSection = document.getElementById('marketSection');
    const buyingMarketWrap = document.getElementById('buyingMarketWrap');
    const sellingMarketWrap = document.getElementById('sellingMarketWrap');
    const otherMarketWrap = document.getElementById('otherMarketWrap');
    const buyingMarketInput = document.getElementById('buyingMarketCity');
    const sellingMarketInput = document.getElementById('sellingMarketCity');
    const buyingStateInput = document.getElementById('buyingMarketState');
    const sellingStateInput = document.getElementById('sellingMarketState');
    const marketStateInput = document.getElementById('marketState');
    const sameMarketRow = document.getElementById('sameMarketRow');
    const sameMarketToggle = document.getElementById('sameMarketToggle');

    // --- Transaction intent helpers ---------------------------------------
    // selectedGoal holds the transaction intent: 'buying' | 'selling' | 'both' | 'other'.
    function isOtherIntent() { return selectedGoal === 'other'; }
    function needsBuyingMarket() { return selectedGoal === 'buying' || selectedGoal === 'both'; }
    function needsSellingMarket() { return selectedGoal === 'selling' || selectedGoal === 'both'; }
    function otherIntentText() { return otherIntentInput ? otherIntentInput.value.trim() : ''; }
    // City/market values. Metadata only, never included in archetype scoring.
    function cityText(el) { return el ? el.value.trim() : ''; }
    function cityValid(v) { return v.length >= 2 && v.length <= 120; }
    // "Buying and selling in the same market": copies the buying market into the
    // selling market so the client never enters the same location twice.
    function sameMarketChecked() { return selectedGoal === 'both' && !!(sameMarketToggle && sameMarketToggle.checked); }
    function buyingMarketText() { return cityText(buyingMarketInput); }
    function sellingMarketText() { return sameMarketChecked() ? buyingMarketText() : cityText(sellingMarketInput); }
    function otherMarketText() { return cityText(marketCityInput); }
    // State (metadata only, never scored).
    function buyingStateText() { return cityText(buyingStateInput); }
    function sellingStateText() { return sameMarketChecked() ? buyingStateText() : cityText(sellingStateInput); }
    function otherStateText() { return cityText(marketStateInput); }
    // Combined market_city summary, derived per the selected intent.
    function marketCityText() {
        if (selectedGoal === 'buying') return buyingMarketText();
        if (selectedGoal === 'selling') return sellingMarketText();
        if (selectedGoal === 'both') {
            const b = buyingMarketText(); const s = sellingMarketText();
            if (b && s) return b + ' / ' + s;
            return b || s;
        }
        if (selectedGoal === 'other') return otherMarketText();
        return '';
    }
    function transactionIntentLabel() {
        if (selectedGoal === 'buying') return 'Buying';
        if (selectedGoal === 'selling') return 'Selling';
        if (selectedGoal === 'both') return 'Buying and Selling';
        if (selectedGoal === 'other') return otherIntentText();
        return '';
    }
    // Reveal the right market fields for the chosen intent.
    function updateMarketFields() {
        if (marketSection) marketSection.classList.toggle('hidden', !selectedGoal);
        if (buyingMarketWrap) buyingMarketWrap.classList.toggle('hidden', !needsBuyingMarket());
        // The "same market" checkbox only applies to Buying and Selling.
        if (sameMarketRow) sameMarketRow.classList.toggle('hidden', selectedGoal !== 'both');
        // Hide the selling fields when the same-market shortcut is checked.
        var hideSelling = !needsSellingMarket() || sameMarketChecked();
        if (sellingMarketWrap) sellingMarketWrap.classList.toggle('hidden', hideSelling);
        if (otherMarketWrap) otherMarketWrap.classList.toggle('hidden', !isOtherIntent());
    }
    
    // Assessment Elements
    const qCounter = document.getElementById('qCounter');
    const qProgress = document.getElementById('qProgress');
    const questionText = document.getElementById('questionText');
    const questionOptionsContainer = document.getElementById('questionOptions');
    const backBtn = document.getElementById('backBtn');
    const continueBtn = document.getElementById('continueBtn');

    // Utility Elements
    const mainCard = document.getElementById('mainCard');


    // --- Scroll helper (Part 2) --------------------------------------------
    // Scrolls the assessment card back to the top whenever the question changes,
    // so a new question never appears halfway down the screen (especially on
    // mobile, where a long option list can push the next question below the fold).
    //
    // Behavior:
    // - Targets the question card (mainCard), not the raw page top, and accounts
    //   for the sticky nav height.
    // - Runs after the DOM update (requestAnimationFrame) so measurements are real.
    // - Skips the jump when the user is actively typing in a field, unless forced
    //   (view changes are always forced since the field they were typing in is gone).
    // - Smooth scroll by default; instant when immediate positioning is needed.
    function scrollAssessmentToTop(reason, opts) {
        opts = opts || {};
        const active = document.activeElement;
        const isTyping = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (isTyping && !opts.force) return;
        requestAnimationFrame(() => {
            const target = opts.target || mainCard || document.body;
            const nav = document.querySelector('.demo-nav');
            const navHeight = nav ? nav.offsetHeight : 0;
            const rect = target.getBoundingClientRect();
            // Already comfortably at the top? Nothing to do.
            if (!opts.force && rect.top >= 0 && rect.top <= navHeight + 24) return;
            const top = Math.max(0, rect.top + window.pageYOffset - navHeight - 12);
            window.scrollTo({ top: top, behavior: opts.behavior || 'smooth' });
            try {
                if (typeof localStorage !== 'undefined' && localStorage.requity_debug === '1') {
                    console.log('assessment:scroll-to-top', { reason: reason || 'unknown' });
                }
            } catch (e) { /* ignore */ }
        });
    }

    // --- View Controller ---
    function showView(viewName) {
        Object.values(views).forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('slide-enter');
        });
        views[viewName].classList.remove('hidden');
        
        // Trigger reflow for animation
        void views[viewName].offsetWidth; 
        views[viewName].classList.add('slide-enter');
        
        // Force: the previous view is gone, so the card must reposition even if
        // an input somewhere still holds focus.
        scrollAssessmentToTop('view:' + viewName, { force: true });
    }

    // --- Contact Logic ---
    function checkContactValid() {
        const hasText = inputs.every(inp => inp.value.trim() !== '');
        const hasGoal = selectedGoal !== null;
        // When "Other" is chosen, a non-empty custom description is required.
        const otherOk = !isOtherIntent() || otherIntentText() !== '';
        // Conditional market requirements per intent. For "Other" the market is
        // optional, but if provided it must be a valid length.
        let marketOk = true;
        if (needsBuyingMarket()) marketOk = marketOk && cityValid(buyingMarketText());
        if (needsSellingMarket()) marketOk = marketOk && cityValid(sellingMarketText());
        if (isOtherIntent()) {
            const m = otherMarketText();
            if (m) marketOk = marketOk && cityValid(m);
        }
        startAssessmentBtn.disabled = !(hasText && hasGoal && otherOk && marketOk);
    }

    inputs.forEach(inp => inp.addEventListener('input', checkContactValid));
    if (otherIntentInput) otherIntentInput.addEventListener('input', checkContactValid);
    [marketCityInput, buyingMarketInput, sellingMarketInput, buyingStateInput, sellingStateInput, marketStateInput].forEach(el => {
        if (el) el.addEventListener('input', checkContactValid);
    });
    if (sameMarketToggle) sameMarketToggle.addEventListener('change', function () {
        updateMarketFields();
        checkContactValid();
    });

    goalOptions.forEach(card => {
        card.addEventListener('click', () => {
            if(isDemoRunning) return;
            goalOptions.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedGoal = card.getAttribute('data-goal');
            // Reveal the free-text field only for "Other"; clear it otherwise.
            if (otherIntentWrap) {
                if (isOtherIntent()) {
                    otherIntentWrap.classList.remove('hidden');
                    if (otherIntentInput) otherIntentInput.focus();
                } else {
                    otherIntentWrap.classList.add('hidden');
                    if (otherIntentInput) otherIntentInput.value = '';
                }
            }
            // Clear market fields that no longer apply so stale values are not sent.
            if (!needsBuyingMarket() && buyingMarketInput) buyingMarketInput.value = '';
            if (!needsSellingMarket() && sellingMarketInput) sellingMarketInput.value = '';
            if (!isOtherIntent() && marketCityInput) marketCityInput.value = '';
            if (!needsBuyingMarket() && buyingStateInput) buyingStateInput.value = '';
            if (!needsSellingMarket() && sellingStateInput) sellingStateInput.value = '';
            if (!isOtherIntent() && marketStateInput) marketStateInput.value = '';
            if (selectedGoal !== 'both' && sameMarketToggle) sameMarketToggle.checked = false;
            updateMarketFields();
            checkContactValid();
            // The conditional buying/selling market questions just rendered;
            // gently bring them on screen if they landed below the fold. Skipped
            // during prefill so page load keeps its immediate position.
            if (!isPrefilling && marketSection && !marketSection.classList.contains('hidden')) {
                requestAnimationFrame(() => {
                    const rect = marketSection.getBoundingClientRect();
                    if (rect.top < 0 || rect.bottom > window.innerHeight) {
                        try { marketSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
                    }
                });
            }
        });
    });

    // --- Prefill carry-forward (avoid entering info twice) ----------------
    // The landing page may capture name/email/phone/intent/market first. We carry
    // those values forward here so the client never re-enters them, then clear the
    // one-time prefill so a later visit starts clean.
    let isPrefilling = false;
    function applyPrefill() {
        let data = null;
        try { data = JSON.parse(localStorage.getItem('requity_prefill') || 'null'); }
        catch (e) { data = null; }
        if (!data || typeof data !== 'object') return;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val != null && String(val).trim() !== '') el.value = String(val).trim();
        };
        setVal('fname', data.fname);
        setVal('lname', data.lname);
        setVal('email', data.email);
        setVal('phone', data.phone);
        setVal('birthday', data.birthday);
        const intent = (data.intent || '').toLowerCase();
        if (['buying', 'selling', 'both', 'other'].includes(intent)) {
            isPrefilling = true;
            const card = document.querySelector('#goalOptions .option-card[data-goal="' + intent + '"]');
            if (card) card.click();
            isPrefilling = false;
            const market = (data.marketCity || '').trim();
            if (market) {
                if (intent === 'buying' || intent === 'both') setVal('buyingMarketCity', market);
                else if (intent === 'selling') setVal('sellingMarketCity', market);
                else if (intent === 'other') setVal('marketCity', market);
            }
            if (intent === 'other' && data.intentOther) setVal('otherIntent', data.intentOther);
        }
        try { localStorage.removeItem('requity_prefill'); } catch (e) { /* ignore */ }
        checkContactValid();
    }
    applyPrefill();

    // --- Agent link resolution (no visible banner) -------------------------
    // Silently validate the branded slug against the backend so an unresolved
    // (invalid/expired) link falls back to the reviewer queue instead of being
    // orphaned. The agent is still resolved + attributed server-side on submit;
    // we intentionally render NO visible "You're completing this for…" banner.
    function initAgentLinkResolution() {
        if (!window.RequityAPI || typeof window.RequityAPI.fetchAgentPublicLink !== 'function') return;
        const slug = getAgentSlugFromPath();
        if (!slug) return; // token/QR links resolve entirely server-side
        Promise.resolve(window.RequityAPI.fetchAgentPublicLink({ slug: slug }))
            .then((res) => {
                if (!res || !res.ok) {
                    // Branded link that did not resolve → invalid / expired.
                    slugInvalid = true;
                }
            })
            .catch(() => { /* best-effort; submit still resolves the slug */ });
    }
    initAgentLinkResolution();

    startAssessmentBtn.addEventListener('click', () => {
        currentStepIndex = 0;
        startLeadCapture();
        renderQuestion(currentStepIndex);
        showView('assessment');
    });

    // --- Incomplete-assessment lead capture (does not block the flow) ---
    function startLeadCapture() {
        if (!window.RequityAPI || leadId) return;
        const src = getClientSource();
        const email = inputs[2].value.trim();
        const payload = {
            source: src.source,
            fullName: `${inputs[0].value.trim()} ${inputs[1].value.trim()}`.trim(),
            email: email,
            phone: (document.getElementById('phone') || {}).value || null,
            agentId: src.agentId,
            agentSlug: src.agentSlug,
            agentToken: src.agentToken,
            transactionIntent: selectedGoal || null,
            transactionIntentLabel: transactionIntentLabel() || null,
            transactionIntentOther: isOtherIntent() ? (otherIntentText() || null) : null,
            marketCity: marketCityText() || null,
            buyingMarketCity: needsBuyingMarket() ? (buyingMarketText() || null) : null,
            sellingMarketCity: needsSellingMarket() ? (sellingMarketText() || null) : null,
            buyingMarketState: needsBuyingMarket() ? (buyingStateText() || null) : null,
            sellingMarketState: needsSellingMarket() ? (sellingStateText() || null) : null,
            marketState: isOtherIntent() ? (otherStateText() || null) : null,
        };
        // Reuse a recent lead id for this email if we have one cached.
        try {
            const cached = JSON.parse(localStorage.getItem('requity_lead') || 'null');
            if (cached && cached.email === email && cached.leadId &&
                (Date.now() - (cached.ts || 0)) < 24 * 60 * 60 * 1000) {
                leadId = cached.leadId;
                return;
            }
        } catch (e) { /* ignore */ }

        Promise.resolve(window.RequityAPI.startAssessmentLead(payload))
            .then(res => {
                if (res && res.leadId) {
                    leadId = res.leadId;
                    try {
                        localStorage.setItem('requity_lead', JSON.stringify({
                            leadId: leadId, email: email, ts: Date.now()
                        }));
                    } catch (e) { /* ignore */ }
                }
            })
            .catch(err => console.warn('[REQUITY] startAssessmentLead error:', err));
    }

    function queueLeadProgress() {
        if (!window.RequityAPI || !leadId) return;
        if (leadProgressTimer) clearTimeout(leadProgressTimer);
        // Debounce so rapid answer changes do not spam the API.
        leadProgressTimer = setTimeout(() => {
            const partial = {};
            Object.keys(userAnswers).forEach(idx => { partial[Number(idx) + 1] = userAnswers[idx]; });
            let archetype = null;
            try {
                if (window.RequityAPI.calculateClientArchetype) {
                    archetype = window.RequityAPI.calculateClientArchetype(partial).archetype;
                }
            } catch (e) { /* ignore */ }
            Promise.resolve(window.RequityAPI.updateAssessmentLeadProgress({
                leadId: leadId,
                answeredCount: Object.keys(userAnswers).length,
                partialAnswers: partial,
                archetype: archetype,
            })).catch(() => { /* never block the assessment */ });
        }, 1200);
    }

    // --- Assessment Logic ---
    function renderQuestion(index) {
        const qData = consumerAssessmentQuestions[index];
        
        // Update Header
        qCounter.innerText = `Question ${index + 1} of ${consumerAssessmentQuestions.length}`;
        const progressPercent = ((index + 1) / consumerAssessmentQuestions.length) * 100;
        qProgress.style.width = `${progressPercent}%`;
        
        questionText.innerText = qData.question;

        // Optional clarifying note / disclaimer under the question (e.g. Q3, Q7).
        let noteEl = document.getElementById('questionNote');
        if (qData.note) {
            if (!noteEl) {
                noteEl = document.createElement('p');
                noteEl.id = 'questionNote';
                noteEl.className = 'subtitle';
                noteEl.style.marginTop = '0.5rem';
                questionText.insertAdjacentElement('afterend', noteEl);
            }
            noteEl.textContent = qData.note;
            noteEl.style.display = 'block';
        } else if (noteEl) {
            noteEl.style.display = 'none';
        }
        
        // Render Options
        questionOptionsContainer.innerHTML = '';
        qData.options.forEach(opt => {
            const card = document.createElement('div');
            card.className = 'option-card';
            card.dataset.value = opt.value;
            
            // Restore previous selection if exists
            if(userAnswers[index] === opt.value) {
                card.classList.add('selected');
            }
            
            card.innerHTML = `
                <span class="opt-title">${opt.text}</span>
                <span class="opt-desc">${opt.description}</span>
            `;
            
            card.addEventListener('click', () => selectAnswer(index, opt.value, card));
            questionOptionsContainer.appendChild(card);
        });

        // Toggle Buttons
        continueBtn.disabled = !userAnswers[index];
        backBtn.style.visibility = index === 0 ? 'visible' : 'visible'; // Always visible in assessment
    }

    function selectAnswer(qIndex, value, cardElement) {
        if(isDemoRunning) return;
        userAnswers[qIndex] = value;
        
        const allCards = questionOptionsContainer.querySelectorAll('.option-card');
        allCards.forEach(c => c.classList.remove('selected'));
        cardElement.classList.add('selected');
        
        continueBtn.disabled = false;
        queueLeadProgress();
    }

    function getSubmitErrorEl() {
        let el = document.getElementById('submitError');
        if (!el) {
            el = document.createElement('p');
            el.id = 'submitError';
            el.style.cssText = 'color:#B3261E;background:#FCE8E6;border-radius:8px;padding:0.7rem 0.85rem;margin-top:1rem;font-size:0.9rem;display:none;';
            const actions = document.querySelector('#step-assessment .actions-row');
            if (actions && actions.parentNode) actions.parentNode.insertBefore(el, actions);
        }
        return el;
    }
    function showSubmitError(err) {
        const el = getSubmitErrorEl();
        // Prefer the real backend message when the request reached the server and
        // returned a clear error. Only fall back to the connection message for a
        // genuine network failure (no status / no server error).
        let message = 'We couldn’t submit your assessment. Please check your connection and try again.';
        if (err && err.status === 401) {
            message = 'Your session expired. Please sign in again.';
        } else if (err && err.serverError) {
            message = err.serverError;
        } else if (err && err.status >= 400) {
            message = 'We couldn’t submit your assessment. Please try again.';
        }
        el.textContent = message;
        el.style.display = 'block';
        // Validation/submit error: bring the first (only) error into view.
        requestAnimationFrame(() => {
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ }
        });
    }
    function clearSubmitError() {
        const el = document.getElementById('submitError');
        if (el) el.style.display = 'none';
    }

    continueBtn.addEventListener('click', async () => {
        if(currentStepIndex < consumerAssessmentQuestions.length - 1) {
            currentStepIndex++;
            renderQuestion(currentStepIndex);
            scrollAssessmentToTop('next-question');
            return;
        }
        // Final step: the submission must succeed before we show the confirmation.
        // Never silently pretend success when the real API call fails.
        clearSubmitError();
        const originalLabel = continueBtn.innerHTML;
        continueBtn.disabled = true;
        continueBtn.textContent = 'Submitting…';
        try {
            await submitAssessment();
            currentStepIndex = consumerAssessmentQuestions.length;
            showWaitingPage();
        } catch (err) {
            console.warn('[REQUITY] Client assessment submission error:', {
                status: err && err.status,
                code: err && err.code,
                area: err && err.area,
                serverError: err && err.serverError,
            });
            showSubmitError(err);
            continueBtn.disabled = false;
            continueBtn.innerHTML = originalLabel;
        }
    });

    // --- Submit via the secure API (requires real config; no demo fallback) ---
    // Extract a branded agent slug from the clean URL path, e.g.
    //   /tussa-domingo-requityapp-relational-assessment
    // Falls back to a ?slug= query param (Vercel rewrite Option B). Returns null
    // for normal paths like /client/assessment.html with no slug.
    function getAgentSlugFromPath() {
        const seg = (window.location.pathname || '').split('/').filter(Boolean).pop() || '';
        if (/-requityapp-relational-assessment$/i.test(seg)) return seg;
        try {
            const qsSlug = new URLSearchParams(window.location.search).get('slug');
            if (qsSlug && /-requityapp-relational-assessment$/i.test(qsSlug)) return qsSlug;
        } catch (e) { /* ignore */ }
        return null;
    }

    function getClientSource() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || null;
        const agentToken = params.get('agent') || params.get('a') || params.get('agentToken') || null;
        const agentId = params.get('agentId') || null;
        const agentSlug = getAgentSlugFromPath();
        const explicit = (params.get('source') || '').toLowerCase();
        // Reviewer-created link: carries a pre-created assessment token.
        if (explicit === 'reviewer' || explicit === 'requity_reviewer') {
            return { source: 'reviewer', token: token, agentToken: null, agentId: null, agentSlug: null };
        }
        // Branded clean slug link (preferred). Defaults to source `agent_link`;
        // a `?source=qr` on the clean URL preserves QR attribution. The agent is
        // resolved server-side from the slug, no raw token in the URL.
        if (agentSlug) {
            // If the slug did not resolve to a real agent, fall back to the
            // reviewer queue so the submission is never orphaned.
            if (slugInvalid) {
                return { source: 'client', token: null, agentToken: null, agentId: null, agentSlug: null };
            }
            return {
                source: explicit === 'qr' ? 'qr' : 'agent_link',
                token: null,
                agentToken: null,
                agentId: null,
                agentSlug: agentSlug,
            };
        }
        // Agent QR / shareable link: attach the submission to that agent.
        if (agentToken || agentId || explicit === 'qr' || explicit === 'agent_link') {
            return {
                source: explicit === 'agent_link' ? 'agent_link' : 'qr',
                token: token,
                agentToken: agentToken,
                agentId: agentId,
                agentSlug: null,
            };
        }
        // Direct public client assessment: no agent, no token. Routes to the
        // REQUITY reviewer queue server-side. Must NOT default to 'reviewer'
        // (that path requires a pre-created assessment token).
        return { source: 'client', token: null, agentToken: null, agentId: null, agentSlug: null };
    }

    function submitAssessment() {
        if (!window.RequityAPI) return Promise.reject(new Error('REQUITY is not configured.'));
        const answers = {};
        Object.keys(userAnswers).forEach(idx => { answers[Number(idx) + 1] = userAnswers[idx]; });
        const src = getClientSource();
        const payload = {
            token: src.token,
            leadId: leadId,
            contact: {
                fullName: `${inputs[0].value.trim()} ${inputs[1].value.trim()}`.trim(),
                email: inputs[2].value.trim(),
                phone: (document.getElementById('phone') || {}).value || null,
                dateOfBirth: (document.getElementById('birthday') || {}).value || null,
            },
            goal: selectedGoal,
            transactionIntent: selectedGoal,
            transactionIntentLabel: transactionIntentLabel(),
            transactionIntentOther: isOtherIntent() ? otherIntentText() : null,
            marketCity: marketCityText(),
            buyingMarketCity: needsBuyingMarket() ? buyingMarketText() : null,
            sellingMarketCity: needsSellingMarket() ? sellingMarketText() : null,
            buyingMarketState: needsBuyingMarket() ? (buyingStateText() || null) : null,
            sellingMarketState: needsSellingMarket() ? (sellingStateText() || null) : null,
            marketState: isOtherIntent() ? (otherStateText() || null) : null,
            answers: answers,
            source: src.source,
            agentId: src.agentId,
            agentSlug: src.agentSlug,
            agentToken: src.agentToken,
        };
        // Return the promise so the caller only advances on a real success.
        return Promise.resolve(window.RequityAPI.submitClientAssessment(payload))
            .then(res => {
                console.log('[REQUITY] Client assessment submitted:', res);
                // Lead is now completed server-side; drop the cached lead id.
                try { localStorage.removeItem('requity_lead'); } catch (e) { /* ignore */ }
                return res;
            });
    }

    backBtn.addEventListener('click', () => {
        if(currentStepIndex > 0) {
            currentStepIndex--;
            renderQuestion(currentStepIndex);
            scrollAssessmentToTop('back-question');
        } else {
            // Go back to Contact
            currentStepIndex = -1;
            showView('contact');
        }
    });

    // --- Final Waiting Page Logic ---
    function showWaitingPage() {
        showView('waiting');
        animateTimeline();
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function animateTimeline() {
        const steps = [
            document.getElementById('tl-1'),
            document.getElementById('tl-2'),
            document.getElementById('tl-3'),
            document.getElementById('tl-4')
        ];
        
        steps.forEach(s => s.classList.remove('active'));

        // Play
        await sleep(500);
        steps[0].classList.add('active'); // Received
        await sleep(800);
        steps[1].classList.add('active'); // Review
        // The remaining steps stay inactive to indicate current status
    }


    // Demo automation has been removed. The form and assessment now work manually.
    // Scroll-based page animations are handled on the landing page.
    // The "start a new assessment" restart control was intentionally removed from
    // the completion screen, a submitted client assessment is final and the
    // completion view should not encourage starting over.


    // Animated triangle background pattern behind the assessment while preserving the current page background color.
    function initAssessmentPatternBackground() {
        const pattern = document.createElement('div');
        pattern.className = 'assessment-pattern-bg';
        document.body.prepend(pattern);

        const triangles = [];
        let seed = 41584;
        function random() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        }
        function triangleSVG() {
            return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 12 L88 82 L12 82 Z" /></svg>';
        }
        function buildPattern() {
            pattern.innerHTML = '';
            triangles.length = 0;
            seed = 41584;
            const width = window.innerWidth;
            const height = window.innerHeight;
            const cx = width / 2;
            const cy = height / 2;
            const maxSize = Math.min(34, Math.max(20, width / 42));
            const minSize = maxSize * 0.72;
            const movement = Math.max(10, maxSize * 0.48);
            const cell = maxSize * 2.55 + movement * 2;
            const cols = Math.ceil(width / cell) + 2;
            const rows = Math.ceil(height / cell) + 2;
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const size = minSize + random() * (maxSize - minSize);
                    const jitter = cell * 0.34;
                    const x = col * cell + cell * 0.5 + (random() - 0.5) * jitter - cell * 0.65;
                    const y = row * cell + cell * 0.5 + (random() - 0.5) * jitter - cell * 0.65;
                    const dist = Math.hypot(x - cx, y - cy);
                    const waveAngle = (col * 0.78 + row * 0.55) % (Math.PI * 2);
                    const moveX = Math.cos(waveAngle) * movement;
                    const moveY = Math.sin(waveAngle) * movement * 0.75;
                    const delay = -((col + row * 0.82) * 0.16) % 5.6;
                    const colorDelay = -((col + row * 0.82) * 0.24) % 6;
                    const tilt = random() * 360;
                    const el = document.createElement('div');
                    el.className = 'bg-triangle';
                    el.style.setProperty('--x', x + 'px');
                    el.style.setProperty('--y', y + 'px');
                    el.style.setProperty('--size', size + 'px');
                    el.style.setProperty('--color-delay', colorDelay + 's');
                    el.innerHTML = triangleSVG();
                    pattern.appendChild(el);
                    triangles.push({ el, moveX, moveY, delay, dist, col, row, tilt });
                }
            }
        }
        function values(state, tri, t) {
            let x = 0, y = 0, z = 0, s = 1, r = tri.tilt;
            let phase, ease;
            switch (state) {
                case 0:
                    phase = ((t + tri.delay) / 5.6) % 1.0;
                    ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                    x = tri.moveX * ease;
                    y = tri.moveY * ease;
                    z = 110 * ease;
                    r = tri.tilt - Math.cos(phase * Math.PI * 2) * 70;
                    break;
                case 1:
                    phase = ((t + tri.dist * -0.008) / 4.0) % 1.0;
                    ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                    x = tri.moveX * 0.45 * ease;
                    y = tri.moveY * -0.45 * ease;
                    z = 160 * ease;
                    s = 1 + 0.38 * ease;
                    r = tri.tilt + ease * 150;
                    break;
                case 2:
                    phase = ((t + tri.col * -0.2 + tri.row * -0.1) / 5.0) % 1.0;
                    ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                    z = -120 * ease;
                    s = 1 - 0.32 * ease;
                    r = tri.tilt + ease * 170;
                    break;
                default:
                    phase = ((t + tri.delay) / 12.0) % 1.0;
                    ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                    x = tri.moveX * 1.5 * ease;
                    y = tri.moveY * 1.5 * ease;
                    z = 90 * ease;
                    r = tri.tilt - ease * 160;
            }
            return { x, y, z, s, r };
        }
        let currentState = 0;
        let nextState = 0;
        let isTransitioning = false;
        let transitionStartTime = 0;
        const transitionDuration = 2.5;
        function animate(now) {
            const t = now / 1000;
            let blend = 0;
            if (isTransitioning) {
                blend = (t - transitionStartTime) / transitionDuration;
                if (blend >= 1) {
                    blend = 1;
                    currentState = nextState;
                    isTransitioning = false;
                }
            }
            const easedBlend = blend * blend * (3 - 2 * blend);
            for (const tri of triangles) {
                const v1 = values(currentState, tri, t);
                let v = v1;
                if (isTransitioning) {
                    const v2 = values(nextState, tri, t);
                    v = {
                        x: v1.x + (v2.x - v1.x) * easedBlend,
                        y: v1.y + (v2.y - v1.y) * easedBlend,
                        z: v1.z + (v2.z - v1.z) * easedBlend,
                        s: v1.s + (v2.s - v1.s) * easedBlend,
                        r: v1.r + (v2.r - v1.r) * easedBlend
                    };
                }
                tri.el.style.transform = `translate3d(${v.x}px, ${v.y}px, ${v.z}px) scale(${v.s}) rotate(${v.r}deg)`;
            }
            requestAnimationFrame(animate);
        }
        buildPattern();
        requestAnimationFrame(animate);
        setInterval(() => {
            nextState = (currentState + 1) % 4;
            isTransitioning = true;
            transitionStartTime = performance.now() / 1000;
        }, 9000);
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(buildPattern, 180);
        });
    }

    initAssessmentPatternBackground();

});
