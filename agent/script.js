document.addEventListener('DOMContentLoaded', () => {
    const header = document.getElementById('header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if(targetId === '#') return;
            const targetEl = document.querySelector(targetId);
            if(targetEl) {
                const headerOffset = 80;
                const elementPosition = targetEl.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                window.scrollTo({ top: offsetPosition, behavior: "smooth" });
            }
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
    }, { threshold: 0.1 });

    document.querySelectorAll('.why-card, .soft-card, .demo-card').forEach(el => observer.observe(el));

    function runAnimationCycle() {
        for(let i=1; i<=4; i++) {
            document.getElementById(`hero-step-${i}`)?.classList.remove('active');
            if(i<4) document.getElementById(`hero-conn-${i}`)?.classList.remove('active');
        }
        document.querySelectorAll('.why-card').forEach(c => c.classList.remove('active'));
        document.getElementById('demo-archetype')?.classList.remove('active');
        for(let i=1; i<=4; i++) document.getElementById(`trait-${i}`)?.classList.remove('active');
        for(let i=1; i<=5; i++) document.getElementById(`strat-${i}`)?.classList.remove('active');
        document.getElementById('demo-status')?.classList.remove('active');
        document.querySelectorAll('.step-item').forEach(s => s.classList.remove('active'));
        const stepProgress = document.getElementById('steps-progress-bar');
        if(stepProgress) {
            if(window.innerWidth > 768) { stepProgress.style.width = '0%'; stepProgress.style.height = '100%'; }
            else { stepProgress.style.height = '0%'; stepProgress.style.width = '100%'; }
        }
        document.querySelectorAll('.lead-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.mock-option').forEach(o => o.classList.remove('selected'));
        const mockProgress = document.getElementById('mock-progress');
        if(mockProgress) mockProgress.style.width = '30%';
        document.getElementById('mock-btn-continue')?.classList.remove('active');
        document.getElementById('mock-result-overlay')?.classList.remove('active');

        setTimeout(() => document.getElementById('hero-step-1')?.classList.add('active'), 500);
        setTimeout(() => document.getElementById('hero-conn-1')?.classList.add('active'), 1500);
        setTimeout(() => document.getElementById('hero-step-2')?.classList.add('active'), 2000);
        setTimeout(() => document.getElementById('hero-conn-2')?.classList.add('active'), 3000);
        setTimeout(() => document.getElementById('hero-step-3')?.classList.add('active'), 3500);
        setTimeout(() => document.getElementById('hero-conn-3')?.classList.add('active'), 4500);
        setTimeout(() => document.getElementById('hero-step-4')?.classList.add('active'), 5000);

        setTimeout(() => document.getElementById('why-card-1')?.classList.add('active'), 1000);
        setTimeout(() => { document.getElementById('why-card-1')?.classList.remove('active'); document.getElementById('why-card-2')?.classList.add('active'); }, 4000);
        setTimeout(() => { document.getElementById('why-card-2')?.classList.remove('active'); document.getElementById('why-card-3')?.classList.add('active'); }, 7000);
        setTimeout(() => document.getElementById('why-card-3')?.classList.remove('active'), 10000);

        setTimeout(() => document.getElementById('trait-1')?.classList.add('active'), 1000);
        setTimeout(() => document.getElementById('trait-2')?.classList.add('active'), 1500);
        setTimeout(() => document.getElementById('trait-3')?.classList.add('active'), 2000);
        setTimeout(() => document.getElementById('trait-4')?.classList.add('active'), 2500);
        setTimeout(() => document.getElementById('demo-archetype')?.classList.add('active'), 3000);
        setTimeout(() => document.getElementById('strat-1')?.classList.add('active'), 4000);
        setTimeout(() => document.getElementById('strat-2')?.classList.add('active'), 4500);
        setTimeout(() => document.getElementById('strat-3')?.classList.add('active'), 5000);
        setTimeout(() => document.getElementById('strat-4')?.classList.add('active'), 5500);
        setTimeout(() => document.getElementById('strat-5')?.classList.add('active'), 6000);
        setTimeout(() => document.getElementById('demo-status')?.classList.add('active'), 6500);

        setTimeout(() => document.getElementById('hw-step-1')?.classList.add('active'), 1000);
        setTimeout(() => { if(stepProgress) { if(window.innerWidth > 768) stepProgress.style.width = '33%'; else stepProgress.style.height = '33%'; } document.getElementById('hw-step-2')?.classList.add('active'); }, 3000);
        setTimeout(() => { if(stepProgress) { if(window.innerWidth > 768) stepProgress.style.width = '66%'; else stepProgress.style.height = '66%'; } document.getElementById('hw-step-3')?.classList.add('active'); }, 5000);
        setTimeout(() => { if(stepProgress) { if(window.innerWidth > 768) stepProgress.style.width = '100%'; else stepProgress.style.height = '100%'; } document.getElementById('hw-step-4')?.classList.add('active'); }, 7000);

        setTimeout(() => document.getElementById('lead-card-1')?.classList.add('active'), 2000);
        setTimeout(() => { document.getElementById('lead-card-1')?.classList.remove('active'); document.getElementById('lead-card-2')?.classList.add('active'); }, 5000);
        setTimeout(() => { document.getElementById('lead-card-2')?.classList.remove('active'); document.getElementById('lead-card-3')?.classList.add('active'); }, 8000);
        setTimeout(() => document.getElementById('lead-card-3')?.classList.remove('active'), 11000);

        setTimeout(() => {
            const options = document.querySelectorAll('.mock-option');
            if(options.length > 0) {
                const randomIdx = Math.floor(Math.random() * options.length);
                options[randomIdx].classList.add('selected');
                setTimeout(() => { if(mockProgress) mockProgress.style.width = '50%'; document.getElementById('mock-btn-continue')?.classList.add('active'); }, 800);
                setTimeout(() => document.getElementById('mock-result-overlay')?.classList.add('active'), 2000);
            }
        }, 2000);
    }

    runAnimationCycle();
    setInterval(runAnimationCycle, 15000);
});

// Decorative looping circle background patterns
(() => {
    const patternEls = Array.from(document.querySelectorAll('.circle-pattern'));
    if (!patternEls.length) return;

    const patternState = patternEls.map((container, index) => ({
        container,
        circles: [],
        currentState: 0,
        nextState: 0,
        isTransitioning: false,
        transitionStartTime: 0,
        seed: 41584 + index * 997
    }));

    const transitionDuration = 2.5;

    function random(state) {
        state.seed = (state.seed * 9301 + 49297) % 233280;
        return state.seed / 233280;
    }

    function circleSVG() {
        return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" /></svg>';
    }

    function createCircle(state, config) {
        const circle = document.createElement('div');
        circle.className = 'patterned-circle';
        circle.style.setProperty('--x', `${config.x}px`);
        circle.style.setProperty('--y', `${config.y}px`);
        circle.style.setProperty('--size', `${config.size}px`);
        circle.style.setProperty('--color-delay', `${config.colorDelay}s`);
        circle.innerHTML = circleSVG();
        state.container.appendChild(circle);
        state.circles.push({ el: circle, ...config });
    }

    function buildPattern(state) {
        state.container.innerHTML = '';
        state.circles.length = 0;

        const width = state.container.clientWidth || state.container.parentElement.clientWidth;
        const height = state.container.clientHeight || state.container.parentElement.clientHeight;
        const cx = width / 2;
        const cy = height / 2;

        const maxSize = Math.min(38, Math.max(24, width / 38));
        const minSize = maxSize * 0.72;
        const movement = Math.max(12, maxSize * 0.5);
        const cell = maxSize * 2.35 + movement * 2;
        const cols = Math.ceil(width / cell) + 2;
        const rows = Math.ceil(height / cell) + 2;
        const points = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                points.push({ row, col, sort: random(state) });
            }
        }

        points.sort((a, b) => a.sort - b.sort);

        points.forEach(({ row, col }) => {
            const size = minSize + random(state) * (maxSize - minSize);
            const jitter = cell * 0.34;
            const x = col * cell + cell * 0.5 + (random(state) - 0.5) * jitter - cell * 0.65;
            const y = row * cell + cell * 0.5 + (random(state) - 0.5) * jitter - cell * 0.65;
            const dist = Math.hypot(x - cx, y - cy);
            const waveAngle = (col * 0.78 + row * 0.55) % (Math.PI * 2);
            const moveX = Math.cos(waveAngle) * movement;
            const moveY = Math.sin(waveAngle) * movement * 0.75;
            const waveIndex = col + row * 0.82;
            const delay = -(waveIndex * 0.16) % 5.6;
            const colorDelay = -(waveIndex * 0.24) % 6;
            const tilt = random(state) * 360;
            createCircle(state, { x, y, size, dist, row, col, delay, colorDelay, moveX, moveY, tilt });
        });
    }

    function getTransformValues(animationState, circ, t) {
        let x = 0, y = 0, z = 0, s = 1, r = circ.tilt;
        let phase, ease;

        switch(animationState) {
            case 0:
                phase = ((t + circ.delay) / 5.6) % 1.0;
                ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                x = circ.moveX * ease;
                y = circ.moveY * ease;
                z = 150 * ease;
                r = circ.tilt - Math.cos(phase * Math.PI * 2) * 90;
                break;
            case 1:
                phase = ((t + circ.dist * -0.008) / 4.0) % 1.0;
                ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                x = circ.moveX * 0.5 * ease;
                y = circ.moveY * -0.5 * ease;
                z = 250 * ease;
                s = 1 + 0.6 * ease;
                r = circ.tilt + ease * 180;
                break;
            case 2:
                phase = ((t + circ.col * -0.2 + circ.row * -0.1) / 5.0) % 1.0;
                ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                z = -200 * ease;
                s = 1 - 0.6 * ease;
                r = circ.tilt + ease * 180;
                break;
            case 3:
                phase = ((t + circ.delay) / 12.0) % 1.0;
                ease = (1 - Math.cos(phase * Math.PI * 2)) / 2;
                x = circ.moveX * 2 * ease;
                y = circ.moveY * 2 * ease;
                z = 100 * ease;
                r = circ.tilt - ease * 180;
                break;
        }
        return { x, y, z, s, r };
    }

    function animate(now) {
        const t = now / 1000;

        patternState.forEach((state) => {
            let blend = 0;
            if (state.isTransitioning) {
                blend = (t - state.transitionStartTime) / transitionDuration;
                if (blend >= 1) {
                    blend = 1;
                    state.currentState = state.nextState;
                    state.isTransitioning = false;
                }
            }

            const easedBlend = blend * blend * (3 - 2 * blend);

            state.circles.forEach((circ) => {
                const v1 = getTransformValues(state.currentState, circ, t);
                let x = v1.x, y = v1.y, z = v1.z, s = v1.s, r = v1.r;

                if (state.isTransitioning) {
                    const v2 = getTransformValues(state.nextState, circ, t);
                    x = v1.x + (v2.x - v1.x) * easedBlend;
                    y = v1.y + (v2.y - v1.y) * easedBlend;
                    z = v1.z + (v2.z - v1.z) * easedBlend;
                    s = v1.s + (v2.s - v1.s) * easedBlend;
                    r = v1.r + (v2.r - v1.r) * easedBlend;
                }

                circ.el.style.transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${s}) rotate(${r}deg)`;
            });
        });

        requestAnimationFrame(animate);
    }

    patternState.forEach(buildPattern);
    requestAnimationFrame(animate);

    setInterval(() => {
        patternState.forEach((state) => {
            state.nextState = (state.currentState + 1) % 4;
            state.isTransitioning = true;
            state.transitionStartTime = performance.now() / 1000;
        });
    }, 9000);

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            patternState.forEach((state, index) => {
                state.seed = 41584 + index * 997;
                buildPattern(state);
            });
        }, 150);
    });
})();

// New REQUITY agent assessment implementation
window.addEventListener('DOMContentLoaded', () => {
    const agentSurveyQuestions = [
        { question: "Your approach to client relationships is:", options: [
            { value: "A", text: "Leading with vision and decisive action" },
            { value: "B", text: "Facilitating collaborative decision-making" },
            { value: "C", text: "Prioritizing emotional connection" },
            { value: "D", text: "Focusing on practical outcomes" }
        ]},
        { question: "When presenting a property, you emphasize:", options: [
            { value: "A", text: "Design aesthetics and wow factor" },
            { value: "B", text: "Investment potential and ROI data" },
            { value: "C", text: "Storytelling about lifestyle" },
            { value: "D", text: "Functional features and cost analysis" }
        ]},
        { question: "Under negotiation pressure, you:", options: [
            { value: "A", text: "Seek step-by-step guidance" },
            { value: "B", text: "Push for immediate solutions" },
            { value: "C", text: "Withdraw to reassess" },
            { value: "D", text: "Prioritize harmony" }
        ]},
        { question: "Your clients describe you as:", options: [
            { value: "A", text: "A visionary who inspires action" },
            { value: "B", text: "A trusted advisor who listens" },
            { value: "C", text: "A creative problem-solver" },
            { value: "D", text: "A results-driven strategist" }
        ]},
        { question: "When a deal stalls, you first:", options: [
            { value: "A", text: "Analyze all options methodically" },
            { value: "B", text: "Challenge objections head-on" },
            { value: "C", text: "Suggest pausing to rethink" },
            { value: "D", text: "Offer concessions to rebuild rapport" }
        ]},
        { question: "Colleagues say your superpower is:", options: [
            { value: "A", text: "Breakthrough ideas" }, { value: "B", text: "Energizing others" }, { value: "C", text: "Commanding authority" }, { value: "D", text: "Upholding excellence" }, { value: "E", text: "Building trust" }, { value: "F", text: "Intriguing insights" }, { value: "G", text: "Risk mitigation" }
        ]},
        { question: "Clients hire you because you:", options: [
            { value: "A", text: "Turn complexity into opportunity" }, { value: "B", text: "Make transactions exciting" }, { value: "C", text: "Exude confidence in high-stakes deals" }, { value: "D", text: "Deliver flawless execution" }, { value: "E", text: "Build security" }, { value: "F", text: "Reveal unexpected insights" }, { value: "G", text: "Anticipate pitfalls" }
        ]},
        { question: "Your natural negotiation approach is:", options: [
            { value: "A", text: "Competitive: Win the best terms" }, { value: "B", text: "Collaborative: Find mutual wins" }, { value: "C", text: "Accommodating: Preserve relationships" }, { value: "D", text: "Avoiding: Delay for more data" }, { value: "E", text: "Compromising: Split differences" }, { value: "F", text: "Analytical: Leverage data" }, { value: "G", text: "Directive: Take charge" }, { value: "H", text: "Emotive: Appeal emotionally" }
        ]},
        { question: "During tough negotiations, you:", options: [
            { value: "A", text: "Hold firm on core demands" }, { value: "B", text: "Brainstorm creative solutions" }, { value: "C", text: "Yield to maintain trust" }, { value: "D", text: "Table the discussion" }, { value: "E", text: "Propose middle-ground offers" }, { value: "F", text: "Present data-driven arguments" }, { value: "G", text: "Control the conversation" }, { value: "H", text: "Share stories to build rapport" }
        ]},
        { question: "When overwhelmed, you:", options: [
            { value: "A", text: "Freeze until priorities are clear" }, { value: "B", text: "Ruthlessly prioritize tasks" }, { value: "C", text: "Delegate and step back" }, { value: "D", text: "Check on others' stress levels" }
        ]},
        { question: "Your marketing strength is:", options: [
            { value: "A", text: "Stunning visuals and storytelling" }, { value: "B", text: "ROI charts and analytics" }, { value: "C", text: "Innovative concepts" }, { value: "D", text: "Practical feature highlights" }
        ]},
        { question: "You justify pricing with:", options: [
            { value: "A", text: "Design uniqueness" }, { value: "B", text: "Comparable sales data" }, { value: "C", text: "Emotional appeal" }, { value: "D", text: "Investment potential" }
        ]},
        { question: "Your open houses emphasize:", options: [
            { value: "A", text: "Staging and ambiance" }, { value: "B", text: "Inspection reports" }, { value: "C", text: "Themed experiences" }, { value: "D", text: "Utility cost savings" }
        ]},
        { question: "You build trust by:", options: [
            { value: "A", text: "Personal connection" }, { value: "B", text: "Consistent results" }, { value: "C", text: "Vulnerability" }, { value: "D", text: "Data transparency" }
        ]},
        { question: "Under stress, your communication becomes:", options: [
            { value: "A", text: "More structured" }, { value: "B", text: "More assertive" }, { value: "C", text: "More withdrawn" }, { value: "D", text: "More reassuring" }
        ]},
        { question: "Your negotiation strength is:", options: [
            { value: "A", text: "Applying pressure" }, { value: "B", text: "Finding win-wins" }, { value: "C", text: "Making concessions" }, { value: "D", text: "Information gathering" }, { value: "E", text: "Quick compromises" }, { value: "F", text: "Fact-based arguments" }, { value: "G", text: "Decisive action" }, { value: "H", text: "Emotional connection" }
        ]},
        { question: "When receiving feedback, you prefer:", options: [
            { value: "A", text: "Direct actionable steps" }, { value: "B", text: "Encouraging reinforcement" }, { value: "C", text: "Detailed written reports" }, { value: "D", text: "Private discussions" }
        ]},
        { question: "Your value proposition is:", options: [
            { value: "A", text: "I inspire decisive action" }, { value: "B", text: "I build collaborative solutions" }, { value: "C", text: "I create memorable experiences" }, { value: "D", text: "I deliver measurable results" }
        ]}
    ];

    const mapping = {
        1:{A:{interactionStyle:'Motivator',focus:'Aesthetic'},B:{interactionStyle:'Facilitator',focus:'Pragmatic'},C:{interactionStyle:'Facilitator',focus:'Aesthetic'},D:{interactionStyle:'Motivator',focus:'Pragmatic'}},
        2:{A:{focus:'Aesthetic'},B:{focus:'Pragmatic'},C:{focus:'Aesthetic'},D:{focus:'Pragmatic'}},
        3:{A:{stressResponse:'Freeze'},B:{stressResponse:'Fight'},C:{stressResponse:'Flight'},D:{stressResponse:'Fawn'}},
        4:{A:{interactionStyle:'Motivator',focus:'Aesthetic'},B:{interactionStyle:'Facilitator',focus:'Pragmatic'},C:{interactionStyle:'Facilitator',focus:'Aesthetic'},D:{interactionStyle:'Motivator',focus:'Pragmatic'}},
        5:{A:{stressResponse:'Freeze'},B:{stressResponse:'Fight'},C:{stressResponse:'Flight'},D:{stressResponse:'Fawn'}},
        6:{A:{perceivedValue:'Innovation'},B:{perceivedValue:'Energy'},C:{perceivedValue:'Authority'},D:{perceivedValue:'Excellence'},E:{perceivedValue:'Trust'},F:{perceivedValue:'Insights'},G:{perceivedValue:'Security'}},
        7:{A:{perceivedValue:'Innovation'},B:{perceivedValue:'Energy'},C:{perceivedValue:'Authority'},D:{perceivedValue:'Excellence'},E:{perceivedValue:'Trust'},F:{perceivedValue:'Insights'},G:{perceivedValue:'Security'}},
        8:{A:{negotiationStyle:'Competitive'},B:{negotiationStyle:'Collaborative'},C:{negotiationStyle:'Accommodating'},D:{negotiationStyle:'Avoiding'},E:{negotiationStyle:'Compromising'},F:{negotiationStyle:'Analytical'},G:{negotiationStyle:'Directive'},H:{negotiationStyle:'Emotive'}},
        9:{A:{negotiationStyle:'Competitive'},B:{negotiationStyle:'Collaborative'},C:{negotiationStyle:'Accommodating'},D:{negotiationStyle:'Avoiding'},E:{negotiationStyle:'Compromising'},F:{negotiationStyle:'Analytical'},G:{negotiationStyle:'Directive'},H:{negotiationStyle:'Emotive'}},
        10:{A:{stressResponse:'Freeze'},B:{stressResponse:'Fight'},C:{stressResponse:'Flight'},D:{stressResponse:'Fawn'}},
        11:{A:{focus:'Aesthetic'},B:{focus:'Pragmatic'},C:{focus:'Aesthetic'},D:{focus:'Pragmatic'}},
        12:{A:{focus:'Aesthetic'},B:{focus:'Pragmatic'},C:{focus:'Aesthetic'},D:{focus:'Pragmatic'}},
        13:{A:{focus:'Aesthetic'},B:{focus:'Pragmatic'},C:{focus:'Aesthetic'},D:{focus:'Pragmatic'}},
        14:{A:{focus:'Aesthetic'},B:{focus:'Pragmatic'},C:{focus:'Aesthetic'},D:{focus:'Pragmatic'}},
        15:{A:{stressResponse:'Freeze'},B:{stressResponse:'Fight'},C:{stressResponse:'Flight'},D:{stressResponse:'Fawn'}},
        16:{A:{negotiationStyle:'Competitive'},B:{negotiationStyle:'Collaborative'},C:{negotiationStyle:'Accommodating'},D:{negotiationStyle:'Avoiding'},E:{negotiationStyle:'Compromising'},F:{negotiationStyle:'Analytical'},G:{negotiationStyle:'Directive'},H:{negotiationStyle:'Emotive'}},
        17:{A:{interactionStyle:'Motivator'},B:{interactionStyle:'Facilitator'},C:{interactionStyle:'Facilitator'},D:{interactionStyle:'Facilitator'}},
        18:{A:{interactionStyle:'Motivator',focus:'Aesthetic'},B:{interactionStyle:'Facilitator',focus:'Pragmatic'},C:{interactionStyle:'Facilitator',focus:'Aesthetic'},D:{interactionStyle:'Motivator',focus:'Pragmatic'}}
    };
    const archetypes = {
        'Motivator-Aesthetic-Freeze':'The Creative Guide','Motivator-Aesthetic-Fight':'The Trendsetter','Motivator-Aesthetic-Flight':'The Stylist','Motivator-Aesthetic-Fawn':'The Cheerleader','Motivator-Pragmatic-Freeze':'The Analyst','Motivator-Pragmatic-Fight':'The Deal Maker','Motivator-Pragmatic-Flight':'The Adapter','Motivator-Pragmatic-Fawn':'The Supporter','Facilitator-Aesthetic-Freeze':'The Refiner','Facilitator-Aesthetic-Fight':'The Catalyst','Facilitator-Aesthetic-Flight':'The Observer','Facilitator-Aesthetic-Fawn':'The Encourager','Facilitator-Pragmatic-Freeze':'The Coordinator','Facilitator-Pragmatic-Fight':'The Producer','Facilitator-Pragmatic-Flight':'The Adjuster','Facilitator-Pragmatic-Fawn':'The Collaborator'
    };
    let current = 0;
    let marketCity = '';
    const answers = {};
    const questionCount = document.getElementById('agent-question-count');
    const questionText = document.getElementById('agent-question-text');
    const optionsWrap = document.getElementById('agent-options');
    const progress = document.getElementById('agent-progress-fill');
    const back = document.getElementById('agent-back');
    const next = document.getElementById('agent-next');
    const card = document.getElementById('agent-assessment-card') || document.querySelector('.agent-assessment-card');
    const resultCard = document.getElementById('agent-result-card');
    const errorCard = document.getElementById('agent-error-card');
    const marketCard = document.getElementById('agent-market-card');
    const marketInput = document.getElementById('agent-market-city');
    const marketContinue = document.getElementById('agent-market-continue');
    const marketError = document.getElementById('agent-market-error');
    if (!questionCount || !questionText || !optionsWrap || !back || !next) return;

    // The agent is already authenticated (enforced by the page auth gate) and we
    // have their account details, so we start directly with the questions, no
    // duplicate name/email/phone/DOB collection. We first ask the required
    // city/market question (metadata only, it never affects archetype scoring),
    // then reveal the question card.
    function startQuestions() {
        if (marketCard) marketCard.hidden = true;
        if (card) card.hidden = false;
        renderQuestion();
    }
    if (marketCard && marketInput && marketContinue) {
        marketContinue.addEventListener('click', () => {
            marketCity = (marketInput.value || '').trim();
            if (marketCity.length < 2 || marketCity.length > 120) {
                if (marketError) marketError.style.display = 'block';
                marketInput.focus();
                return;
            }
            if (marketError) marketError.style.display = 'none';
            startQuestions();
        });
        marketInput.addEventListener('input', () => {
            if (marketError) marketError.style.display = 'none';
        });
        marketInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); marketContinue.click(); }
        });
        marketInput.focus();
    } else {
        // Fallback: if the market card is missing for any reason, don't block the
        // assessment, go straight to the questions as before.
        startQuestions();
    }

    function renderQuestion() {
        const q = agentSurveyQuestions[current];
        questionCount.textContent = `Question ${current + 1} of ${agentSurveyQuestions.length}`;
        questionText.textContent = q.question;
        progress.style.width = `${((current + 1) / agentSurveyQuestions.length) * 100}%`;
        optionsWrap.innerHTML = q.options.map(opt => `
            <button class="agent-answer ${answers[current + 1] === opt.value ? 'selected' : ''}" type="button" data-value="${opt.value}">
                <span class="agent-answer-letter">${opt.value}</span>
                <span>${opt.text}</span>
            </button>
        `).join('');
        back.disabled = current === 0;
        next.textContent = current === agentSurveyQuestions.length - 1 ? 'Submit Assessment' : 'Continue';
        next.disabled = !answers[current + 1];
        optionsWrap.querySelectorAll('.agent-answer').forEach(button => {
            button.addEventListener('click', () => {
                answers[current + 1] = button.dataset.value;
                renderQuestion();
            });
        });
    }
    function firstOccurrence(dimension, value) {
        for (let i = 1; i <= agentSurveyQuestions.length; i++) {
            const m = mapping[i]?.[answers[i]];
            if (m && m[dimension] === value) return i;
        }
        return 999;
    }
    function calculateResult() {
        const counts = { interactionStyle:{}, focus:{}, stressResponse:{}, perceivedValue:{}, negotiationStyle:{} };
        Object.entries(answers).forEach(([num, answer]) => {
            const m = mapping[num]?.[answer];
            if (!m) return;
            Object.entries(m).forEach(([dimension, value]) => {
                counts[dimension][value] = (counts[dimension][value] || 0) + 1;
            });
        });
        const result = {};
        Object.entries(counts).forEach(([dimension, values]) => {
            const sorted = Object.entries(values).sort((a,b) => b[1] !== a[1] ? b[1]-a[1] : firstOccurrence(dimension,a[0])-firstOccurrence(dimension,b[0]));
            result[dimension] = sorted[0]?.[0] || 'Flexible';
        });
        const key = `${result.interactionStyle}-${result.focus}-${result.stressResponse}`;
        result.archetype = archetypes[key] || 'The Collaborator';
        return result;
    }
    async function showResult() {
        const result = calculateResult();
        next.disabled = true;
        next.textContent = 'Saving...';
        // #region agent log
        try { window.RequityAPI && window.RequityAPI.__debug && window.RequityAPI.__debug('agent/script.js:showResult', 'submitting agent assessment', { answersCount: Object.keys(answers).length, totalQuestions: agentSurveyQuestions.length, archetype: result.archetype, hasSession: !!(window.RequityAPI && window.RequityAPI.hasSession && window.RequityAPI.hasSession()) }); } catch (e) {}
        // #endregion
        try {
            await submitAgentAssessment(result);
            // #region agent log
            try { window.RequityAPI && window.RequityAPI.__debug && window.RequityAPI.__debug('agent/script.js:showResult', 'submit succeeded', { archetype: result.archetype }); } catch (e) {}
            // #endregion
            if (errorCard) errorCard.hidden = true;
            card.hidden = true;
            resultCard.hidden = false;
            const heading = document.getElementById('agent-result-heading');
            if (heading && result.archetype) {
                heading.textContent = `Your agent profile is ready: ${result.archetype}.`;
            }
            resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // The save succeeded and the archetype is now on the agent row, so the
            // dashboard will recognize the assessment as complete. Briefly show the
            // result, then redirect to the dashboard. The result card also keeps a
            // manual "Go to your dashboard" link as a fallback.
            setTimeout(function () { window.location.href = 'dashboard.html'; }, 2200);
        } catch (err) {
            console.warn('[REQUITY] Agent assessment submission error:', err);
            // #region agent log
            try { window.RequityAPI && window.RequityAPI.__debug && window.RequityAPI.__debug('agent/script.js:showResult', 'submit failed', { status: err && err.status, code: err && err.code, serverError: err && err.serverError, area: err && err.area }); } catch (e) {}
            // #endregion
            // Never pretend success: keep the result hidden and show a real error.
            card.hidden = true;
            resultCard.hidden = true;
            if (errorCard) {
                errorCard.hidden = false;
                // Surface the real, user-friendly cause instead of a generic message.
                var detail = document.getElementById('agent-error-summary');
                if (detail) {
                    if (err && err.status === 401) detail.textContent = 'Your session expired. Please sign in again.';
                    else if (err && err.serverError) detail.textContent = err.serverError;
                    else detail.textContent = 'We couldn’t save your assessment. Please try again.';
                }
                errorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            next.disabled = false;
            next.textContent = 'Submit Assessment';
        }
    }
    // Submit via the secure API. The agent is authenticated, so identity is
    // resolved server-side from the session, we only send the answers.
    function submitAgentAssessment(result) {
        if (!window.RequityAPI) return Promise.reject(new Error('REQUITY is not configured.'));
        return window.RequityAPI.submitAgentAssessment({ answers: answers, result: result, marketCity: marketCity });
    }
    const retryBtn = document.getElementById('agent-retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            if (errorCard) errorCard.hidden = true;
            showResult();
        });
    }
    back.addEventListener('click', () => { if (current > 0) { current -= 1; renderQuestion(); } });
    next.addEventListener('click', () => {
        if (!answers[current + 1]) return;
        if (current < agentSurveyQuestions.length - 1) { current += 1; renderQuestion(); }
        else showResult();
    });
});
