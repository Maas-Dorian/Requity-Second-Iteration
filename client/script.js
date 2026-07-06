/* REQUITY Client Assessment Demo Logic */

document.addEventListener('DOMContentLoaded', () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- Single source of truth: every landing CTA opens the REAL assessment.
    // We preserve the agent token and source params so attribution survives.
    function buildAssessmentHref() {
        // Root-absolute so CTAs work whether this page is served at
        // /client/index.html or rewritten to the site root "/".
        const base = '/client/assessment.html';
        try {
            const current = new URLSearchParams(window.location.search);
            const keep = new URLSearchParams();
            ['agent', 'a', 'agentToken', 'agentId', 'source', 'token'].forEach((key) => {
                const v = current.get(key);
                if (v) keep.set(key, v);
            });
            const qs = keep.toString();
            return qs ? (base + '?' + qs) : base;
        } catch (e) {
            return base;
        }
    }

    const assessmentHref = buildAssessmentHref();

    (function wireAssessmentCtas() {
        const ctas = document.querySelectorAll('[data-assessment-cta]');
        ctas.forEach((el) => {
            if (el.tagName === 'A') {
                el.setAttribute('href', assessmentHref);
            } else {
                el.addEventListener('click', () => { window.location.href = assessmentHref; });
            }
        });
        if (typeof localStorage !== 'undefined' && localStorage.requity_debug === '1') {
            try {
                const params = new URLSearchParams(window.location.search);
                console.log('client-landing:assessment-link', {
                    href: assessmentHref,
                    hasAgentToken: Boolean(params.get('agent') || params.get('a') || params.get('agentToken') || params.get('agentId')),
                    source: params.get('source') || null
                });
            } catch (e) {}
        }
    })();

    // Carry the landing intake form forward so clients never enter info twice.
    // We stash the values in localStorage and the assessment page prefills them.
    const mockSubmitBtn = document.getElementById('mockSubmitBtn');
    if (mockSubmitBtn) {
        mockSubmitBtn.addEventListener('click', () => {
            const val = (id) => {
                const el = document.getElementById(id);
                return el ? el.value.trim() : '';
            };
            const city = val('lp-city');
            const state = val('lp-state');
            const market = [city, state].filter(Boolean).join(', ');
            const intentEl = document.querySelector('input[name="intent"]:checked');
            const prefill = {
                fname: val('lp-fname'),
                lname: val('lp-lname'),
                email: val('lp-email'),
                phone: val('lp-phone'),
                marketCity: market,
                intent: intentEl ? intentEl.value : null,
            };
            try {
                // Only store when the user actually provided something.
                const hasAny = Object.values(prefill).some((v) => v && String(v).trim() !== '');
                if (hasAny) localStorage.setItem('requity_prefill', JSON.stringify(prefill));
            } catch (e) { /* ignore */ }
            window.location.href = assessmentHref;
        });
    }

    const fadeElements = document.querySelectorAll('.fade-item');
    const fadeObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                fadeObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    fadeElements.forEach(el => fadeObserver.observe(el));

    function loopAnimationOnView(id, callback) {
        const el = document.getElementById(id);
        if (!el) return;

        let intervalId = null;
        let running = false;

        async function play() {
            if (running) return;
            running = true;
            try {
                await callback();
            } finally {
                running = false;
            }
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    play();
                    if (!intervalId) {
                        intervalId = setInterval(play, 15000);
                    }
                } else if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            });
        }, { threshold: 0.35 });

        observer.observe(el);
    }

    loopAnimationOnView('heroJourneyCard', animateHeroJourney);
    loopAnimationOnView('intake-preview', animateIntakeForm);
    loopAnimationOnView('assessment-preview', animateAssessment);
    loopAnimationOnView('review-preview', animateReviewTimeline);
    loopAnimationOnView('animated-journey', animateJourneyFlow);

    async function animateHeroJourney() {
        const items = ['hj-1', 'hj-2', 'hj-3', 'hj-4', 'hj-5'].map(id => document.getElementById(id)).filter(Boolean);
        items.forEach(i => i.classList.remove('active'));
        for (const item of items) {
            item.classList.add('active');
            await sleep(450);
        }
    }

    async function animateIntakeForm() {
        const inputs = ['in-fname', 'in-lname', 'in-email', 'in-phone', 'in-city', 'in-state', 'in-goal']
            .map(id => document.getElementById(id)).filter(Boolean);
        const firstRadio = document.querySelector('.radio-card');
        const submitBtn = document.getElementById('mockSubmitBtn');

        for (const input of inputs) {
            inputs.forEach(inp => inp.classList.remove('focused'));
            input.classList.add('focused');
            await sleep(280);
        }
        inputs.forEach(inp => inp.classList.remove('focused'));
        if (firstRadio) firstRadio.classList.add('demo-selected');
        await sleep(350);
        if (submitBtn) {
            submitBtn.style.transform = 'scale(0.98)';
            await sleep(180);
            submitBtn.style.transform = 'scale(1)';
        }
    }

    async function animateAssessment() {
        const options = Array.from(document.querySelectorAll('.opt-card'));
        const progress = document.getElementById('mockProgress');
        options.forEach(c => c.classList.remove('selected'));
        if (progress) progress.style.width = '25%';
        await sleep(350);
        if (options.length) {
            const randomOption = options[Math.floor(Math.random() * options.length)];
            randomOption.classList.add('selected');
        }
        await sleep(250);
        if (progress) progress.style.width = '33%';
    }

    async function animateReviewTimeline() {
        const tSteps = ['rt-1', 'rt-2', 'rt-3', 'rt-4'].map(id => document.getElementById(id)).filter(Boolean);
        const tLines = ['rtl-1', 'rtl-2', 'rtl-3'].map(id => document.getElementById(id)).filter(Boolean);
        tSteps.forEach((s, idx) => { if (idx > 0) s.classList.remove('active'); });
        tLines.forEach(l => l.classList.remove('filled'));

        for (let i = 0; i < tLines.length; i++) {
            await sleep(500);
            tLines[i].classList.add('filled');
            await sleep(650);
            if (tSteps[i + 1]) tSteps[i + 1].classList.add('active');
        }
    }

    async function animateJourneyFlow() {
        const nodes = ['jf-1', 'jf-2', 'jf-3', 'jf-4', 'jf-5'].map(id => document.getElementById(id)).filter(Boolean);
        const connectors = ['jfc-1', 'jfc-2', 'jfc-3', 'jfc-4'].map(id => document.getElementById(id)).filter(Boolean);
        nodes.forEach(n => n.classList.remove('active'));
        connectors.forEach(c => c.classList.remove('active'));
        if (nodes[0]) nodes[0].classList.add('active');
        for (let i = 0; i < connectors.length; i++) {
            await sleep(500);
            connectors[i].classList.add('active');
            await sleep(500);
            if (nodes[i + 1]) nodes[i + 1].classList.add('active');
        }
    }

    document.querySelectorAll('.opt-card').forEach(card => {
        card.addEventListener('click', (e) => {
            document.querySelectorAll('.opt-card').forEach(c => c.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            const progress = document.getElementById('mockProgress');
            if (progress) progress.style.width = '33%';
        });
    });

    // Animated triangle pattern backgrounds for selected landing sections.
    function initRequityPatternBackgrounds() {
        const sections = Array.from(document.querySelectorAll('.rq-pattern-section'));
        if (!sections.length) return;

        let seed = 41584;
        function random() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        }

        function triangleSVG() {
            return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 12 L88 82 L12 82 Z" /></svg>';
        }

        const triangles = [];

        function buildForSection(section) {
            const old = section.querySelector('.rq-triangle-pattern');
            if (old) old.remove();

            const pattern = document.createElement('div');
            pattern.className = 'rq-triangle-pattern';
            section.prepend(pattern);

            const rect = section.getBoundingClientRect();
            const width = Math.max(rect.width, section.offsetWidth, 320);
            const height = Math.max(rect.height, section.offsetHeight, 260);
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
                    el.className = 'rq-bg-triangle';
                    el.style.setProperty('--rq-x', x + 'px');
                    el.style.setProperty('--rq-y', y + 'px');
                    el.style.setProperty('--rq-size', size + 'px');
                    el.style.setProperty('--rq-color-delay', colorDelay + 's');
                    el.innerHTML = triangleSVG();
                    pattern.appendChild(el);
                    triangles.push({ el, moveX, moveY, delay, dist, col, row, tilt });
                }
            }
        }

        function rebuild() {
            triangles.length = 0;
            seed = 41584;
            sections.forEach(buildForSection);
        }

        function getTransformValues(state, tri, t) {
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
                const v1 = getTransformValues(currentState, tri, t);
                let v = v1;
                if (isTransitioning) {
                    const v2 = getTransformValues(nextState, tri, t);
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

        rebuild();
        requestAnimationFrame(animate);
        setInterval(() => {
            nextState = (currentState + 1) % 4;
            isTransitioning = true;
            transitionStartTime = performance.now() / 1000;
        }, 9000);

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(rebuild, 180);
        });
    }

    initRequityPatternBackgrounds();

});
