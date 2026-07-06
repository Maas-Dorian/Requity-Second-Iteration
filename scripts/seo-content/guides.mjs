/**
 * Guide pages: interviewing, comparing, communication, red flags,
 * compatibility, and assessments. Rendered by scripts/generate-seo-pages.mjs.
 */
export const GUIDE_PAGES = [
  {
    path: "questions-to-ask-a-real-estate-agent.html",
    title: "Questions to Ask a Real Estate Agent Before You Choose One | Requity",
    description:
      "The questions to ask a real estate agent before hiring: experience, communication, comps, offer strategy, buyer and seller support, plus the red flags to listen for.",
    h1: "Questions to ask a real estate agent before you choose one",
    breadcrumb: "Questions to ask an agent",
    intro: [
      "Before choosing a real estate agent, ask about their experience in your area, how they communicate, how they run comps, and what their offer strategy looks like. The answers, and how clearly they are explained, tell you more than any profile page.",
      "Use this list in your interviews. You do not need every question; pick the ones that match your situation and listen for specific, confident answers. Vague answers are data too: an agent who cannot explain their process while trying to win your business will not explain it better once they have it.",
    ],
    sections: [
      {
        h2: "Questions about experience",
        list: [
          "How many transactions did you close in the last twelve months, and how many were in my target area?",
          "What price range do you work in most often?",
          "Do you work with buyers, sellers, or both?",
          "How long have you worked in this market?",
          "Will I work with you directly or with a team member?",
        ],
      },
      {
        h2: "Questions about communication",
        list: [
          "How often will I hear from you during an active search or listing?",
          "Do you prefer calls, texts, or email, and can you match my preference?",
          "How quickly do you typically respond during a live deal?",
          "How do you deliver bad news, like a rejected offer or a failed inspection?",
          "Who covers for you when you are unavailable?",
        ],
        after:
          'Communication mismatches are the most common source of frustration with agents. If this is your priority, read <a href="/find-a-realtor-who-communicates-well.html">how to find a Realtor who communicates well</a>.',
      },
      {
        h2: "Questions about comps",
        list: [
          "How do you choose comparable sales for a property?",
          "How do you adjust for condition, lot, and location differences?",
          "Can you walk me through a recent comp analysis you did?",
          "What do you do when comps are thin or the market is shifting?",
        ],
      },
      {
        h2: "Questions about offer strategy",
        list: [
          "How do you decide what to offer, or what to counter, in this market?",
          "When do you recommend escalation clauses or waiving contingencies, and when do you advise against it?",
          "How do you evaluate offer strength beyond the price?",
          "Tell me about a negotiation that got difficult. What did you do?",
        ],
      },
      {
        h2: "Questions about buyer support",
        list: [
          "How do you help a buyer prioritize when they cannot get everything on their list?",
          "How do you handle a buyer who needs more explanation, or more time, than average?",
          "What does your process look like from first showing to closing?",
        ],
      },
      {
        h2: "Questions about seller support",
        list: [
          "What is your pricing methodology for a listing like mine?",
          "What does your preparation and marketing plan include?",
          "How will you report showing feedback and market response to me?",
          "How do you advise on choosing between multiple offers?",
        ],
      },
      {
        h2: "Red flags in answers",
        paras: [
          'Watch for vagueness on comps, pressure to sign quickly, promises that sound too good, dismissiveness about your questions, and any unwillingness to explain reasoning. An agent who cannot communicate clearly in an interview will not communicate clearly during a transaction. The full list is in <a href="/real-estate-agent-red-flags.html">real estate agent red flags</a>.',
          "One more signal worth noting: the best answers often include something you did not want to hear, like a realistic assessment of your budget or timeline. An agent willing to disagree with you politely in the interview is showing you honest representation. An agent who agrees with everything is showing you a sales process.",
        ],
      },
    ],
    faqs: [
      {
        q: "What questions should I ask a Realtor before hiring them?",
        a: "Cover four areas: experience in your market, communication habits, how they run comps, and offer strategy. Add buyer or seller specific questions depending on your side of the transaction, and compare answers across at least three agents.",
      },
      {
        q: "What is the single most revealing question?",
        a: "Ask them to walk you through a recent comp analysis or negotiation. Specific, detailed stories signal real experience. Vague generalities signal the opposite.",
      },
      {
        q: "Should I ask about communication style directly?",
        a: "Yes. Ask how often they update clients, in what format, and how fast they respond during live deals. Then compare that honestly against what you need.",
      },
      {
        q: "How does Requity use these topics?",
        a: "Requity's relationship style assessment captures your communication preferences and support needs up front, so the matching process already accounts for the fit questions before you ever interview an agent.",
      },
    ],
    related: [
      { href: "/how-to-compare-real-estate-agents.html", label: "How to compare real estate agents" },
      { href: "/how-to-find-a-good-realtor.html", label: "How to find a good Realtor" },
      { href: "/real-estate-agent-red-flags.html", label: "Real estate agent red flags" },
      { href: "/find-a-realtor-who-communicates-well.html", label: "Find a Realtor who communicates well" },
    ],
  },
  {
    path: "how-to-compare-real-estate-agents.html",
    title: "How to Compare Real Estate Agents | Requity",
    description:
      "How to compare real estate agents: local experience, recent sales, communication style, process, and fit. A practical framework plus how Requity helps organize fit.",
    h1: "How to compare real estate agents",
    breadcrumb: "Compare real estate agents",
    intro: [
      "To compare real estate agents, evaluate them on five dimensions: local experience, recent sales history, communication style, process and strategy, and overall fit with how you work. Comparing on price range and personality, not just credentials, is what separates a good choice from a lucky one.",
      "Here is a practical framework you can apply to any shortlist of agents. It works best when you interview all your candidates within the same week, ask each one the same core questions, and take brief notes immediately afterward while the differences are still fresh.",
    ],
    sections: [
      {
        h2: "Compare local experience",
        paras: [
          "Local experience is neighborhood level, not city level. An agent can be excellent two zip codes away and average in yours. Ask each candidate how many transactions they closed in your specific area recently, what they know about the streets and school zones you care about, and how inventory has moved there in the last six months. Rank your candidates on the specificity of their answers.",
        ],
      },
      {
        h2: "Compare recent sales history",
        paras: [
          "Recency matters more than career totals. A market shifts quickly, and an agent active in it this year knows things an agent coasting on a decade old reputation does not. Compare how many deals each agent closed in the last twelve months, whether those deals match your price range and property type, and whether they represented buyers, sellers, or both.",
          "For sellers, two extra numbers are worth requesting: the ratio of final sale price to original list price on their recent listings, and average days on market. Together they show whether the agent prices accurately or wins listings with flattering numbers that later get cut.",
        ],
      },
      {
        h2: "Compare communication style",
        paras: [
          "During your interviews, notice the differences: who answered your questions directly, who explained reasoning without being asked, who listened more than they talked, and who responded fastest between meetings. These differences are the transaction experience in miniature. An agent's interview behavior is the best free preview you will get.",
        ],
      },
      {
        h2: "Compare process and strategy",
        paras: [
          "Ask each agent to describe their process end to end: for buyers, from first showing to closing; for sellers, from pricing to offer selection. Strong agents have a clear, repeatable process they can articulate immediately. Compare the clarity and completeness of each answer, and how well each process would handle your specific complications.",
        ],
      },
      {
        h2: "Compare fit, not just credentials",
        paras: [
          "After the objective comparisons, ask the subjective question: which of these people do you actually want to talk to several times a week for the next few months? Credentials being roughly equal, fit should break the tie. A slightly less decorated agent whose style matches yours will usually deliver a better experience, and often a better outcome, than a top producer you dread calling.",
        ],
      },
      {
        h2: "How Requity helps organize fit",
        paras: [
          'Requity turns the fit comparison from a gut feeling into structured information. Your <a href="/real-estate-personality-assessment.html">relationship style assessment</a> captures what you need; agent archetypes describe how each agent works; and matching considers <a href="/agent-client-compatibility.html">compatibility</a> alongside transaction needs and location, with human review. It gives the fit dimension the same rigor most people only apply to sales numbers.',
        ],
      },
    ],
    faqs: [
      {
        q: "How do I compare real estate agents?",
        a: "Score each candidate on local experience, recent sales history, communication style, process and strategy, and personal fit. Interview at least three so the comparisons are real rather than theoretical.",
      },
      {
        q: "What matters more: experience or fit?",
        a: "You need a baseline of both. Between competent agents, fit usually determines the quality of the experience, because most of a transaction is communication.",
      },
      {
        q: "Should I compare agents from the same brokerage?",
        a: "Yes, agents within one brokerage vary as much as agents across brokerages. Compare individuals, not brands.",
      },
      {
        q: "Can Requity replace comparing agents myself?",
        a: "Requity narrows the field using compatibility, transaction needs, and location, with human review. You should still talk with a matched agent and confirm the fit yourself before moving forward.",
      },
    ],
    related: [
      { href: "/questions-to-ask-a-real-estate-agent.html", label: "Questions to ask a real estate agent" },
      { href: "/how-to-find-a-good-realtor.html", label: "How to find a good Realtor" },
      { href: "/real-estate-agent-red-flags.html", label: "Real estate agent red flags" },
      { href: "/real-estate-agent-matching.html", label: "Real estate agent matching" },
    ],
  },
  {
    path: "find-a-realtor-who-communicates-well.html",
    title: "Find a Realtor Who Communicates Well | Requity",
    description:
      "How to find a Realtor who communicates well: the signs of good communication, questions to ask, what poor communication looks like, and how Requity matches on style.",
    h1: "Find a Realtor who communicates well",
    breadcrumb: "Find a Realtor who communicates well",
    intro: [
      "To find a Realtor who communicates well, test communication before you commit: notice response speed during the interview stage, ask direct questions about update frequency and format, and pay attention to whether the agent listens more than they talk. Communication is the single most common complaint clients have about agents, and it is testable in advance.",
      "This guide covers why communication matters so much in a transaction, the specific signs of a strong communicator, the questions that surface communication habits in an interview, and how Requity makes communication style a measured part of agent matching rather than a gamble.",
    ],
    sections: [
      {
        h2: "Why communication matters",
        paras: [
          "A real estate transaction is a months long stream of updates, questions, documents, and decisions, many of them time sensitive. When communication works, you always know where things stand and what happens next. When it does not, you chase your own agent for basic answers while deadlines slip. The financial stakes make the difference feel enormous: silence around an offer deadline is not a minor annoyance, it is real risk.",
          "Communication quality is also personal. Some clients want a daily digest; others want to hear only when something needs a decision. Neither is wrong, which means a well reviewed agent can still be a poor communicator for you specifically. The goal is not finding the most talkative agent, it is finding the one whose natural rhythm matches yours.",
        ],
      },
      {
        h2: "Signs of good communication",
        list: [
          "Responds promptly even during the no obligation interview stage",
          "Explains reasoning without being asked, especially on pricing and strategy",
          "Asks about your preferred channel and update frequency, then follows it",
          "Summarizes next steps at the end of every conversation",
          "Delivers bad news directly, with options, instead of going quiet",
          "Listens and asks follow up questions about your goals",
        ],
      },
      {
        h2: "Questions to ask",
        list: [
          "How often will I hear from you when things are active, and when they are slow?",
          "What is your typical response time during a live negotiation?",
          "Do you adapt to a client's preferred channel: call, text, or email?",
          "How do you keep clients informed after showings or open houses?",
          "Who communicates with me when you are unavailable?",
        ],
        after:
          'The full interview checklist is in <a href="/questions-to-ask-a-real-estate-agent.html">questions to ask a real estate agent</a>.',
      },
      {
        h2: "What poor communication looks like",
        paras: [
          'Slow replies during the courtship phase, vague answers to direct questions, unexplained silence after showings, surprises about deadlines, and updates that only arrive when you ask for them. If any of these appear before you have signed anything, expect them to get worse afterward. Poor communication is also the top entry in <a href="/real-estate-agent-red-flags.html">real estate agent red flags</a>.',
        ],
      },
      {
        h2: "How Requity uses communication style in matching",
        paras: [
          'Requity treats communication style as a primary matching input, not a nice to have. Your <a href="/real-estate-personality-assessment.html">relationship style assessment</a> captures the frequency, depth, and tone of communication that works for you. Agents complete their own assessment describing how they naturally work. Requity then supports matches where the styles are compatible from day one, with human review before anything is finalized.',
        ],
      },
    ],
    faqs: [
      {
        q: "How do I find a Realtor who communicates well?",
        a: "Test it before committing: notice interview stage response times, ask about update frequency and channels, and watch whether they listen and summarize next steps. Requity also matches specifically on communication style.",
      },
      {
        q: "What should I do if my Realtor does not communicate?",
        a: "Raise it directly once, with specifics about what you need. If nothing changes, review your agreement and consider switching. Poor communication rarely improves on its own mid transaction.",
      },
      {
        q: "How fast should a Realtor respond?",
        a: "It depends on market pace, but during a live deal, same day responses are a reasonable expectation, and time sensitive items like offers deserve faster. Ask each agent their standard and hold them to it.",
      },
      {
        q: "Does Requity really match on communication style?",
        a: "Yes. Both clients and agents complete relationship style assessments, and communication compatibility is a core input to Requity matching alongside transaction needs and location.",
      },
    ],
    related: [
      { href: "/agent-client-compatibility.html", label: "Agent client compatibility in real estate" },
      { href: "/real-estate-agent-red-flags.html", label: "Real estate agent red flags" },
      { href: "/questions-to-ask-a-real-estate-agent.html", label: "Questions to ask a real estate agent" },
      { href: "/real-estate-agent-matching.html", label: "Real estate agent matching" },
    ],
  },
  {
    path: "real-estate-agent-red-flags.html",
    title: "Real Estate Agent Red Flags to Watch For | Requity",
    description:
      "Real estate agent red flags: poor communication, pressure tactics, weak comps, vague local knowledge, no clear process, and not listening. Plus how to switch agents.",
    h1: "Real estate agent red flags to watch for",
    breadcrumb: "Real estate agent red flags",
    intro: [
      "The biggest real estate agent red flags are poor communication, pressure without explanation, weak or vague comps, thin local knowledge, no clear process, and an agent who talks more than they listen. Most of these are visible before you sign anything, if you know what to look for.",
    ],
    sections: [
      {
        h2: "Poor communication",
        paras: [
          "Slow replies, unanswered questions, and radio silence after showings are the most common and most predictive red flag. An agent courting your business should be at their most responsive; whatever you experience during the interview stage is the ceiling, not the floor. If you are chasing them before you have committed, do not commit.",
        ],
      },
      {
        h2: "Pressure without explanation",
        paras: [
          "Urgency is sometimes real in fast markets, but a good agent explains why: comparable homes are going in five days, this seller already has offers, rates move Thursday. Pressure without reasoning, such as pushing you to sign a representation agreement immediately or to waive an inspection with no discussion of risk, is a sign the agent's timeline matters more to them than your outcome.",
        ],
      },
      {
        h2: "Weak comps",
        paras: [
          "If an agent proposes a price and cannot walk you through the comparable sales behind it, treat the number as a guess. Comps that are stale, geographically wrong, or cherry picked to flatter a seller are how homes get overpriced into stagnation or underpriced into lost equity. Ask to see the analysis; a good agent is glad to show it.",
        ],
      },
      {
        h2: "Vague local knowledge",
        paras: [
          "An agent who cannot speak specifically about your target neighborhoods, recent nearby sales, inventory trends, and street level differences is working outside their real coverage area. General market commentary is not a substitute. You are paying for local expertise; verify it exists.",
        ],
      },
      {
        h2: "No clear process",
        paras: [
          "Ask any agent to describe their process from engagement to closing. Strong agents answer immediately because they run the same playbook constantly. Hesitation, vagueness, or winging it means you will be the process manager on your own transaction.",
        ],
      },
      {
        h2: "Not listening to your goals",
        paras: [
          "If you say you need three bedrooms under a certain budget and the showings keep coming back bigger and pricier, your goals are not driving the search. The same applies to sellers pushed toward a listing price that serves the agent's timeline. An agent who overrides your stated goals early will keep doing it under pressure.",
        ],
      },
      {
        h2: "How to switch agents if needed",
        paras: [
          "First, raise the problem directly and specifically; some issues are fixable with one honest conversation. If nothing changes, review any representation or listing agreement for its term and cancellation provisions, put your decision in writing, and ask the brokerage about releasing you if the agreement has time remaining. Then take what you learned about your needs into the next search.",
          'A structured way to restart: the <a href="/how-to-compare-real-estate-agents.html">comparison framework</a>, the <a href="/questions-to-ask-a-real-estate-agent.html">interview questions</a>, or a <a href="/real-estate-agent-matching.html">matching approach</a> that accounts for fit from the start.',
        ],
      },
    ],
    faqs: [
      {
        q: "What are the biggest red flags in a real estate agent?",
        a: "Poor communication, pressure without explanation, comps they cannot defend, vague local knowledge, no articulated process, and not listening to your goals. Most show up before you sign if you interview carefully.",
      },
      {
        q: "My Realtor only sends me listings I could find myself. Is that a red flag?",
        a: "By itself, no; portals surface most inventory now. The real question is what they add: local insight, early information, honest evaluation of each home, and offer strategy. If nothing is added beyond forwarding links, raise it.",
      },
      {
        q: "Should I fire my Realtor?",
        a: "Try one direct conversation with specifics first. If the problems continue, review your agreement terms, communicate the decision in writing, and involve the brokerage if needed. You deserve representation that works.",
      },
      {
        q: "How does Requity help me avoid these red flags?",
        a: "Requity's assessment based matching screens for fit up front, especially communication style, and a human reviews every match. It cannot guarantee an agent's behavior, but it makes style mismatches far less likely.",
      },
    ],
    related: [
      { href: "/find-a-realtor-who-communicates-well.html", label: "Find a Realtor who communicates well" },
      { href: "/questions-to-ask-a-real-estate-agent.html", label: "Questions to ask a real estate agent" },
      { href: "/how-to-compare-real-estate-agents.html", label: "How to compare real estate agents" },
      { href: "/how-to-find-a-good-realtor.html", label: "How to find a good Realtor" },
    ],
  },
  {
    path: "agent-client-compatibility.html",
    title: "Agent Client Compatibility in Real Estate | Requity",
    description:
      "What agent client compatibility means in real estate: communication style, decision making, and support needs, and how Requity uses compatibility in agent matching.",
    h1: "Agent client compatibility in real estate",
    breadcrumb: "Agent client compatibility",
    intro: [
      "Agent client compatibility is how well a real estate agent's communication style, pace, and working approach fit a specific client's preferences and needs. Two clients can work with the same competent agent and have opposite experiences, because compatibility, not competence, determines how the relationship feels.",
      "This page breaks compatibility into its three main dimensions: communication style, decision making style, and support needs, and explains how Requity measures each one as part of agent matching.",
    ],
    sections: [
      {
        h2: "What agent client compatibility means",
        paras: [
          "Compatibility covers the human dimensions of the working relationship: how often and how directly the agent communicates, how much explanation they give, how they handle stress and setbacks, how they guide decisions, and how much autonomy versus hand holding they offer. It is distinct from credentials. A compatibility mismatch does not mean either person is bad; it means the pairing is wrong.",
          "The concept will be familiar from any other long working relationship: a therapist, a financial advisor, a personal trainer. Skill matters, and so does the way that skill is delivered. Real estate is unusual only in how rarely anyone evaluates the delivery before committing.",
        ],
      },
      {
        h2: "Why fit matters",
        paras: [
          "A transaction is dozens of interactions under financial and emotional pressure. With a compatible agent, those interactions build confidence: you get information in the form you absorb best, at the pace you need. With an incompatible one, every interaction adds friction, and friction compounds: missed nuances, second guessing, and eventually distrust. Fit is why some clients rave about an agent that others quietly regret hiring.",
        ],
      },
      {
        h2: "Communication style",
        paras: [
          'The most visible compatibility dimension. Frequency: daily updates or milestone summaries? Depth: full reasoning or the bottom line? Channel: calls, texts, or email? Tone: direct or diplomatic? None of these have a right answer, which is exactly why matching on them matters. See <a href="/find-a-realtor-who-communicates-well.html">finding a Realtor who communicates well</a> for how to evaluate this in interviews.',
        ],
      },
      {
        h2: "Decision making style",
        paras: [
          "Some clients decide fast and want an agent who keeps up. Others need time, data, and space, and want an agent who protects them from being rushed. Some want a recommendation; others want options laid out neutrally. An agent whose guidance style matches your decision style makes every choice, from offer price to inspection response, dramatically less stressful.",
          "Mismatches here are subtle but corrosive: a deliberate client feels railroaded by a decisive agent, while a decisive client feels abandoned by an agent who only presents options. Both agents are doing their job; neither is doing it for the right person.",
        ],
      },
      {
        h2: "Support needs",
        paras: [
          "First time buyers often need education and reassurance. Experienced investors want speed and efficiency. Sellers under time pressure need proactive project management. Compatibility means the agent naturally provides the kind and amount of support you actually need, rather than a one size fits all service level.",
        ],
      },
      {
        h2: "How Requity uses compatibility",
        paras: [
          'Requity measures compatibility explicitly. Clients complete a <a href="/real-estate-personality-assessment.html">relationship style assessment</a> covering communication, decision making, and support needs. Agents complete their own assessment and receive an archetype describing their working style. Requity then supports matching that weighs compatibility alongside transaction needs and location, with a human reviewer confirming every match. The goal is a pairing that works on the human level, not just on paper.',
        ],
      },
    ],
    faqs: [
      {
        q: "What is agent client compatibility?",
        a: "It is how well an agent's communication style, pace, decision guidance, and support approach fit a specific client's preferences and needs during a transaction.",
      },
      {
        q: "Is compatibility more important than experience?",
        a: "You need both. Experience sets the floor for competent representation; compatibility determines the quality of the experience. Between two competent agents, choose the compatible one.",
      },
      {
        q: "How can I judge compatibility before hiring an agent?",
        a: "Interview with fit focused questions, notice their listening and response habits, and be honest about what you need. Or use an approach like Requity that measures compatibility with structured assessments on both sides.",
      },
      {
        q: "Does Requity guarantee compatibility?",
        a: "No. Requity uses assessments, communication insights, and human review to make compatible matches much more likely, but no platform can guarantee how two people will work together.",
      },
    ],
    related: [
      { href: "/real-estate-personality-assessment.html", label: "Real estate personality assessment" },
      { href: "/real-estate-agent-matching.html", label: "Real estate agent matching" },
      { href: "/find-a-realtor-who-communicates-well.html", label: "Find a Realtor who communicates well" },
      { href: "/how-it-works.html", label: "How Requity works" },
    ],
  },
  {
    path: "real-estate-personality-assessment.html",
    title: "Real Estate Personality Assessment for Better Agent Matching | Requity",
    description:
      "What a real estate personality assessment is, how buyers, sellers, and agents use it, why it improves communication, and how Requity builds matching around it.",
    h1: "Real estate personality assessment for better agent matching",
    breadcrumb: "Real estate personality assessment",
    intro: [
      "A real estate personality assessment is a short set of questions about how you communicate, make decisions, and handle stress during a transaction. Its purpose is practical: to identify what kind of agent relationship will actually work for you, before you commit to one.",
      "This page explains what the assessment measures, how buyers, sellers, and agents each use it, and why surfacing communication expectations up front prevents the most common problems in agent client relationships.",
    ],
    sections: [
      {
        h2: "What a real estate personality assessment is",
        paras: [
          "Unlike a general personality test, a real estate assessment focuses on the behaviors that matter in a transaction: how much explanation you want, how quickly you decide, how you react when a deal hits turbulence, what kind of reassurance or directness helps you, and how you prefer to receive updates. The output is a relationship style profile that describes you as a client, not a label that boxes you in.",
          "The premise is simple: these preferences already exist, and they will shape your transaction whether anyone measures them or not. Measuring them just means they can inform the match instead of surfacing as friction three weeks into a contract.",
        ],
      },
      {
        h2: "How buyers and sellers use it",
        paras: [
          "Buyers and sellers complete the assessment before being matched. The profile shapes what kind of agent fits: a first time buyer who wants education and patience gets matched differently than an investor who wants speed and bottom line answers. Sellers who want a direct strategist are distinguished from sellers who want a collaborative guide. The assessment also adapts to your transaction, including buying and selling at the same time.",
          "There are no wrong answers and no score to optimize. The assessment works best when you answer honestly about how you actually behave under pressure, not how you would like to behave; the match is only as good as the self portrait behind it.",
        ],
      },
      {
        h2: "How agents use it",
        paras: [
          "Agents on Requity complete their own assessment and receive an agent archetype describing their natural working and communication style. Agents also use client relationship insights to adapt: knowing a client needs detailed explanations, or hates phone calls, or decides slowly under pressure, lets a good agent serve that client the way they want to be served from the first conversation.",
        ],
      },
      {
        h2: "Why it helps communication",
        paras: [
          "Most communication problems between agents and clients are style mismatches, not effort failures. The agent thinks a weekly summary is attentive; the client experiences it as neglect. The assessment surfaces those expectations explicitly, on both sides, before the relationship starts. When expectations are visible, they can be matched, and matched expectations are the foundation of a relationship that feels easy.",
        ],
      },
      {
        h2: "How Requity approaches assessment based matching",
        paras: [
          'Requity puts the assessment at the center of matching rather than treating it as a marketing quiz. Client profiles and agent archetypes feed a matching process that also weighs transaction needs and location, and a human reviewer looks at every proposed match. The result is a considered introduction based on <a href="/agent-client-compatibility.html">compatibility</a>, described in full on the <a href="/how-it-works.html">how it works</a> page.',
        ],
      },
    ],
    faqs: [
      {
        q: "What is a real estate personality assessment?",
        a: "A short set of questions about how you communicate, make decisions, and handle stress during a real estate transaction, used to identify what kind of agent relationship fits you.",
      },
      {
        q: "How long does the Requity assessment take?",
        a: "A few minutes. It is designed to be completed in one sitting, and the questions adapt to whether you are buying, selling, or both.",
      },
      {
        q: "Do agents take an assessment too?",
        a: "Yes. Agents on Requity complete their own assessment and receive an agent archetype describing their working and communication style, so matching uses insight from both sides.",
      },
      {
        q: "Is my assessment information private?",
        a: "Your information is reviewed privately as part of the matching process. Requity does not expose your assessment publicly, and reviewer notes are not shared with clients or other agents.",
      },
    ],
    related: [
      { href: "/agent-client-compatibility.html", label: "Agent client compatibility in real estate" },
      { href: "/real-estate-agent-matching.html", label: "Real estate agent matching" },
      { href: "/how-it-works.html", label: "How Requity works" },
      { href: "/find-a-real-estate-agent.html", label: "Find a real estate agent who fits how you communicate" },
    ],
  },
];
