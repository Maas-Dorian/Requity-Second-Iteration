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
    question: "When you picture your dream home, what's most important?",
    options: [
      { value: "design_aesthetics", text: "Design/aesthetics", description: "Beautiful, stylish design matters most" },
      { value: "practical_features", text: "Practical features/functionality", description: "Function over form" },
      { value: "space_layout", text: "Space/layout", description: "How the space flows and works" },
      { value: "affordability", text: "Affordability", description: "Getting the best value for money" },
      { value: "location", text: "Location", description: "The right neighborhood and area" }
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
    question: "In your ideal experience, you would:",
    options: [
      { value: "lead_process", text: "Lead the process and make quick decisions", description: "I want to drive the timeline" },
      { value: "collaborate_team", text: "Collaborate closely with your agent and others", description: "Teamwork makes it better" },
      { value: "guided_expert", text: "Be guided by an expert you trust", description: "I want expert real estate guidance" },
      { value: "thorough_research", text: "Do thorough research before each step", description: "Knowledge is power" }
    ]
  },
  {
    id: 7,
    question: "When viewing properties, you focus on:",
    options: [
      { value: "visual_appeal", text: "Visual appeal and design elements", description: "Beauty and style catch my eye" },
      { value: "practical_aspects", text: "Practical aspects and functionality", description: "How well does it work for my needs" },
      { value: "investment_value", text: "Investment potential and value", description: "Will this be a good financial decision" },
      { value: "emotional_connection", text: "How the space makes you feel", description: "Does it feel like home" }
    ]
  },
  {
    id: 8,
    question: "Your communication preference is:",
    options: [
      { value: "frequent_updates", text: "Frequent updates and quick responses", description: "Keep me in the loop constantly" },
      { value: "scheduled_checkins", text: "Scheduled check-ins at key milestones", description: "Regular but structured communication" },
      { value: "as_needed", text: "Communication only when needed", description: "Don't over-communicate with me" },
      { value: "detailed_explanations", text: "Detailed explanations of each step", description: "Help me understand everything" }
    ]
  },
  {
    id: 9,
    question: "When facing a difficult decision, you:",
    options: [
      { value: "trust_instincts", text: "Trust your instincts and decide", description: "My gut usually knows" },
      { value: "seek_advice", text: "Seek advice from trusted people", description: "Others help me see clearly" },
      { value: "research_thoroughly", text: "Research thoroughly before deciding", description: "I need all the facts" },
      { value: "avoid_postpone", text: "Sometimes avoid or postpone the decision", description: "Tough choices are stressful" }
    ]
  },
  {
    id: 10,
    question: "Your biggest concern in a transaction is:",
    options: [
      { value: "making_mistake", text: "Making the wrong choice", description: "What if I regret this decision" },
      { value: "process_delays", text: "Delays in the process", description: "I want things to move smoothly" },
      { value: "financial_aspects", text: "The financial aspects", description: "Money matters are stressful" },
      { value: "relationship_conflicts", text: "Conflicts with others involved", description: "I want everyone to get along" }
    ]
  },
  {
    id: 11,
    question: "You feel most confident when:",
    options: [
      { value: "in_control", text: "You're in control of the situation", description: "I lead, things go well" },
      { value: "team_support", text: "You have a strong team supporting you", description: "Together we're stronger" },
      { value: "well_informed", text: "You're well-informed about all options", description: "Knowledge gives me confidence" },
      { value: "trusted_guidance", text: "You have trusted guidance", description: "Expert advice reassures me" }
    ]
  },
  {
    id: 12,
    question: "In negotiations, you prefer to:",
    options: [
      { value: "direct_assertive", text: "Be direct and assertive", description: "Say what I want clearly" },
      { value: "collaborative_winwin", text: "Find collaborative win-win solutions", description: "Everyone should benefit" },
      { value: "agent_handle", text: "Let your agent handle most of it", description: "That's what real estate agents are for" },
      { value: "careful_strategic", text: "Be careful and strategic", description: "Think through every move" }
    ]
  },
  {
    id: 13,
    question: "When things don't go as planned, you:",
    options: [
      { value: "take_charge", text: "Take charge and find solutions", description: "I'll fix this myself" },
      { value: "work_together", text: "Work with others to adjust the plan", description: "Let's solve this together" },
      { value: "need_reassurance", text: "Need reassurance that it will work out", description: "Tell me it's going to be okay" },
      { value: "step_back", text: "Step back and reassess", description: "I need to process this change" }
    ]
  },
  {
    id: 14,
    question: "Your timeline preference is:",
    options: [
      { value: "asap", text: "As soon as possible", description: "Speed is important to me" },
      { value: "steady_pace", text: "A steady, predictable pace", description: "Consistent progress works best" },
      { value: "flexible_timing", text: "Flexible timing based on circumstances", description: "Let's adapt as we go" },
      { value: "no_rush", text: "No rush - take the time needed", description: "Good things take time" }
    ]
  },
  {
    id: 15,
    question: "You learn best through:",
    options: [
      { value: "doing_experiencing", text: "Doing and experiencing", description: "Hands-on learning works for me" },
      { value: "visual_materials", text: "Visual materials and examples", description: "Show me what you mean" },
      { value: "detailed_explanations", text: "Detailed explanations and data", description: "Give me the full picture" },
      { value: "personal_stories", text: "Personal stories and examples", description: "Real experiences help me understand" }
    ]
  },
  {
    id: 16,
    question: "At the end of the process, success means:",
    options: [
      { value: "achieved_goals", text: "You achieved your goals efficiently", description: "I got what I wanted quickly" },
      { value: "positive_experience", text: "Everyone had a positive experience", description: "The journey was as important as the destination" },
      { value: "right_choice", text: "You made the right choice", description: "This decision will serve me well" },
      { value: "stress_free", text: "The process was stress-free", description: "I felt supported throughout" }
    ]
  }
];

document.addEventListener('DOMContentLoaded', () => {

    // --- State ---
    let currentStepIndex = -1; // -1 = Contact Info, 0-15 = Questions, 16 = Final Page
    let selectedGoal = null;
    let userAnswers = {};
    let isDemoRunning = false;
    let leadId = null; // incomplete-assessment lead id (for follow-up capture)
    let leadProgressTimer = null;

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
    
    // Assessment Elements
    const qCounter = document.getElementById('qCounter');
    const qProgress = document.getElementById('qProgress');
    const questionText = document.getElementById('questionText');
    const questionOptionsContainer = document.getElementById('questionOptions');
    const backBtn = document.getElementById('backBtn');
    const continueBtn = document.getElementById('continueBtn');

    // Utility Elements
    const mainCard = document.getElementById('mainCard');
    const restartDemoBtn = document.getElementById('restartDemoBtn');


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
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Contact Logic ---
    function checkContactValid() {
        const hasText = inputs.every(inp => inp.value.trim() !== '');
        const hasGoal = selectedGoal !== null;
        startAssessmentBtn.disabled = !(hasText && hasGoal);
    }

    inputs.forEach(inp => inp.addEventListener('input', checkContactValid));

    goalOptions.forEach(card => {
        card.addEventListener('click', () => {
            if(isDemoRunning) return;
            goalOptions.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedGoal = card.getAttribute('data-goal');
            checkContactValid();
        });
    });

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
            agentToken: src.agentToken,
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
    }
    function clearSubmitError() {
        const el = document.getElementById('submitError');
        if (el) el.style.display = 'none';
    }

    continueBtn.addEventListener('click', async () => {
        if(currentStepIndex < consumerAssessmentQuestions.length - 1) {
            currentStepIndex++;
            renderQuestion(currentStepIndex);
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
    function getClientSource() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token') || null;
        const agentToken = params.get('agent') || params.get('a') || params.get('agentToken') || null;
        const explicit = (params.get('source') || '').toLowerCase();
        if (explicit === 'reviewer' || explicit === 'requity_reviewer') {
            return { source: 'reviewer', token: token, agentToken: null, agentId: null };
        }
        if (agentToken || explicit === 'qr' || explicit === 'agent_link') {
            return {
                source: explicit === 'agent_link' ? 'agent_link' : 'qr',
                token: token,
                agentToken: agentToken,
                agentId: params.get('agentId') || null,
            };
        }
        return { source: 'reviewer', token: token, agentToken: null, agentId: null };
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
            answers: answers,
            source: src.source,
            agentId: src.agentId,
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

    restartDemoBtn.addEventListener('click', () => {
        currentStepIndex = -1;
        selectedGoal = null;
        userAnswers = {};
        leadId = null;
        try { localStorage.removeItem('requity_lead'); } catch (e) { /* ignore */ }
        inputs.forEach(i => i.value = '');
        goalOptions.forEach(c => c.classList.remove('selected'));
        startAssessmentBtn.disabled = true;
        showView('contact');
    });


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
