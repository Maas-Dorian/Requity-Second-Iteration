/**
 * Resources hub (CollectionPage) and FAQ index page.
 * Rendered by scripts/generate-seo-pages.mjs.
 */
export const HUB_PAGES = [
  {
    path: "resources.html",
    title: "Real Estate Agent Matching Resources | Requity",
    description:
      "Free guides on finding, comparing, and matching with real estate agents: buyer agents, listing agents, questions to ask, red flags, communication fit, and more.",
    h1: "Real Estate Agent matching resources",
    breadcrumb: "Resources",
    collection: true,
    ctaTitle: "Prefer to skip the research?",
    ctaCopy:
      "Complete a short relationship style assessment and let Requity support a match with a real estate agent who fits how you communicate, what you need, and where you are moving.",
    intro: [
      "This is the Requity library of guides for anyone trying to find, compare, or get matched with a real estate agent. Every page here is free, practical, and written to answer the questions people actually search: how to find a good real estate agent, where to look, what to ask, what to avoid, and how communication fit changes the experience of buying or selling a home.",
      "Use the sections below to jump to the topic that matches where you are in the process. If you would rather start with your match, the client assessment takes a few minutes and a Requity team member reviews every profile before a match is proposed.",
    ],
    linkGroups: [
      {
        h2: "Find a Real Estate Agent",
        intro:
          "Start here if you are at the beginning of the search. These guides cover where to look, how to evaluate what you find, and how to tell a good agent from a merely visible one.",
        links: [
          {
            href: "/how-to-find-a-good-real-estate-agent.html",
            label: "How to find a good Real Estate Agent",
            desc: "the full step by step search process, from referrals to interviews",
          },
          {
            href: "/where-to-find-good-real-estate-agents.html",
            label: "Where to find good Real Estate Agents",
            desc: "every major source compared, with the blind spots of each",
          },
          {
            href: "/find-a-real-estate-agent.html",
            label: "Find a Real Estate Agent who fits how you communicate",
            desc: "what agent fit means and why it matters as much as credentials",
          },
        ],
      },
      {
        h2: "Agent matching and compatibility",
        intro:
          "Matching platforms can shortcut the search, but they differ enormously in what they measure. These guides explain how matching works and what compatibility really means.",
        links: [
          {
            href: "/real-estate-agent-matching.html",
            label: "Real Estate Agent matching",
            desc: "how matching platforms work and why sales history is not the whole picture",
          },
          {
            href: "/can-you-get-matched-with-a-real-estate-agent.html",
            label: "Can you get matched with a Real Estate Agent?",
            desc: "yes, and here is what to check before accepting any match",
          },
          {
            href: "/agent-client-compatibility.html",
            label: "Agent client compatibility",
            desc: "the human dimensions of the agent relationship, explained",
          },
          {
            href: "/real-estate-personality-assessment.html",
            label: "Real estate personality assessment",
            desc: "what the assessment measures and how it improves matching",
          },
          {
            href: "/how-it-works.html",
            label: "How Requity works",
            desc: "the Requity matching process from assessment to introduction",
          },
        ],
      },
      {
        h2: "Buyer agent guides",
        intro:
          "Buying a home means dozens of decisions under time pressure. These guides help you find and choose a buyer agent who understands your needs.",
        links: [
          {
            href: "/buyers/find-buyers-agent.html",
            label: "Find a buyer agent",
            desc: "what a buyer agent should do for you, from comps to closing",
          },
          {
            href: "/buyers/how-to-choose-a-buyers-agent.html",
            label: "How to choose a buyer agent",
            desc: "the six criteria that separate candidates on a shortlist",
          },
          {
            href: "/buyers/first-time-home-buyer-agent.html",
            label: "First time home buyer agent guide",
            desc: "how to find an agent who teaches as they go",
          },
        ],
      },
      {
        h2: "Listing agent and seller guides",
        intro:
          "Your listing agent's recommendations touch your equity directly. These guides cover pricing, marketing, negotiation, and how to choose the right person.",
        links: [
          {
            href: "/sellers/find-listing-agent.html",
            label: "Find a listing agent",
            desc: "what a listing agent should do and how fit affects your sale",
          },
          {
            href: "/sellers/how-to-choose-a-listing-agent.html",
            label: "How to choose a listing agent",
            desc: "pricing strategy, marketing plans, and the red flags that cost sellers",
          },
          {
            href: "/sellers/find-agent-to-sell-my-house.html",
            label: "Find an agent to sell your house",
            desc: "building a shortlist and comparing listing agents side by side",
          },
        ],
      },
      {
        h2: "Questions, comparison, and red flags",
        intro:
          "Interviewing agents well is a skill. These guides give you the questions to ask, a framework for comparing answers, and the warning signs to walk away from.",
        links: [
          {
            href: "/questions-to-ask-a-real-estate-agent.html",
            label: "Questions to ask a Real Estate Agent",
            desc: "the full interview checklist, organized by topic",
          },
          {
            href: "/how-to-compare-real-estate-agents.html",
            label: "How to compare Real Estate Agents",
            desc: "a five dimension framework for scoring your shortlist",
          },
          {
            href: "/real-estate-agent-red-flags.html",
            label: "Real Estate Agent red flags",
            desc: "the warning signs visible before you sign, and how to switch if needed",
          },
        ],
      },
      {
        h2: "Communication and relationship fit",
        intro:
          "Communication problems are the most common complaint clients have about agents, and the most preventable. These guides show you how to get fit right from the start.",
        links: [
          {
            href: "/find-a-real-estate-agent-who-communicates-well.html",
            label: "Find a Real Estate Agent who communicates well",
            desc: "the signs of good communication and how to test them in advance",
          },
          {
            href: "/real-estate-agent-faq.html",
            label: "Real Estate Agent FAQ",
            desc: "short answers to dozens of common agent search questions",
          },
        ],
      },
    ],
    related: [],
    // External references live here on the resources hub only, never in the
    // global footer or on client-facing app pages.
    additionalReading: [
      {
        href: "https://www.nar.realtor/",
        label: "National Association of Realtors",
        desc: "industry association information about real estate agents and standards of practice",
      },
      {
        href: "https://www.consumerfinance.gov/owning-a-home/",
        label: "CFPB home buying resources",
        desc: "official consumer guidance on mortgages and the home buying process",
      },
    ],
  },
  {
    path: "real-estate-agent-faq.html",
    title: "Real Estate Agent FAQ | Requity",
    description:
      "Short, direct answers to common real estate agent questions: finding an agent, matching, buyer agents, listing agents, comparing candidates, communication, and red flags.",
    h1: "Real Estate Agent FAQ",
    breadcrumb: "Real Estate Agent FAQ",
    intro: [
      "Short, direct answers to the questions people ask most when finding, comparing, and working with real estate agents. Each answer links to a longer guide when there is more to say. For the full library, visit the <a href=\"/resources.html\">Requity resources hub</a>.",
    ],
    faqGroups: [
      {
        h2: "Finding an agent",
        faqs: [
          {
            q: "How do I find a good real estate agent?",
            a: 'Combine sources: referrals from recent buyers or sellers, local brokerage research, and directories to build a shortlist, then interview at least three agents. Compare their local knowledge, communication, and strategy before deciding. The full process is in <a href="/how-to-find-a-good-real-estate-agent.html">how to find a good real estate agent</a>.',
          },
          {
            q: "Where do most people find their real estate agent?",
            a: "Most people use a referral from someone they know, and many others find agents through directories, marketplaces, open houses, or matching platforms. Referrals are a strong start but reflect one transaction and one personality pairing, so an interview is still worthwhile.",
          },
          {
            q: "How many real estate agents should I interview?",
            a: "Three is a practical minimum. The differences between agents in communication, local knowledge, and strategy usually become obvious by the second or third conversation, and you cannot see those differences with a single candidate.",
          },
          {
            q: "Should I hire a friend or family member as my agent?",
            a: "Only if they would win the job on merit against other candidates. Mixing a major financial transaction with a personal relationship makes honest feedback and hard conversations harder in both directions. At minimum, interview others for comparison.",
          },
          {
            q: "How do I check if an agent is licensed?",
            a: "Every state has a license lookup through its real estate commission or licensing board, and many directories display license status. Confirm the license is active and check for disciplinary history.",
          },
          {
            q: "What does it cost to use a real estate agent?",
            a: "Agent compensation is commission based, negotiable, and has evolved in recent years, so ask each candidate to explain their fee and what it covers. Starting the Requity client assessment is free for buyers and sellers.",
          },
        ],
      },
      {
        h2: "Matching with an agent",
        faqs: [
          {
            q: "Is there a way to get matched with a real estate agent?",
            a: 'Yes. Agent matching services pair you with agents based on your answers about the transaction, and some also consider fit. Requity matches on communication style, transaction needs, and location, with human review. See <a href="/can-you-get-matched-with-a-real-estate-agent.html">the full answer</a>.',
          },
          {
            q: "How do agent matching platforms decide who to match me with?",
            a: 'Most rank agents on production data: recent sales volume, location coverage, and response speed. Requity adds relationship style assessments from both the client and the agent, so communication fit is part of the match. More in <a href="/real-estate-agent-matching.html">real estate agent matching</a>.',
          },
          {
            q: "Do matching services sell my contact information?",
            a: "Some lead referral services do send your information to multiple paying agents. Before using any service, ask how it is compensated and how many agents will receive your details. Requity does not sell your information to lists of agents.",
          },
          {
            q: "Am I obligated to work with a matched agent?",
            a: "No. A match is an introduction. Interview the matched agent the way you would any candidate, and move forward only if the fit feels right.",
          },
          {
            q: "What makes Requity different from other matching platforms?",
            a: "Requity matches on relationship fit, not just sales data. Clients and agents both complete relationship style assessments, agents receive working style archetypes, and a human reviewer looks at every profile before a match is finalized.",
          },
          {
            q: "Does Requity guarantee a perfect match?",
            a: "No. Requity does not guarantee outcomes. It is designed to make fit a measured part of the search, using assessments, communication insights, and human review.",
          },
        ],
      },
      {
        h2: "Buyer agents",
        faqs: [
          {
            q: "What does a buyer agent actually do?",
            a: 'A buyer agent finds and evaluates homes against your goals, runs comparable sales so you offer with evidence, designs offer strategy, and coordinates inspections, appraisal, and closing. The full picture is in <a href="/buyers/find-buyers-agent.html">find a buyer agent</a>.',
          },
          {
            q: "How do I choose a buyer agent?",
            a: 'Compare candidates on local knowledge, availability, offer strategy, communication style, patience, and fit with your goals. Interview at least three. The checklist is in <a href="/buyers/how-to-choose-a-buyers-agent.html">how to choose a buyer agent</a>.',
          },
          {
            q: "Do first time home buyers need a different kind of agent?",
            a: 'Not a different license, but a different style: someone patient, clear, and willing to teach each step as it happens. See the <a href="/buyers/first-time-home-buyer-agent.html">first time home buyer agent guide</a>.',
          },
          {
            q: "Can I work with more than one buyer agent at once?",
            a: "Practically and ethically, no, especially if you have signed a buyer representation agreement. Choose carefully up front instead; it is better for you and fairer to the agents.",
          },
          {
            q: "My agent only sends me listings I already saw online. Is that normal?",
            a: "Portals surface most inventory now, so overlap is normal. What your agent should add is judgment: local insight, honest evaluation of each home, early information, and offer strategy. If nothing is added beyond links, raise it directly.",
          },
        ],
      },
      {
        h2: "Listing agents",
        faqs: [
          {
            q: "How do I find an agent to sell my house?",
            a: 'Build a shortlist from referrals and local research, then interview at least three listing agents about pricing methodology, marketing plans, and communication. The process is detailed in <a href="/sellers/find-agent-to-sell-my-house.html">find an agent to sell your house</a>.',
          },
          {
            q: "Should I pick the agent who suggests the highest listing price?",
            a: "Usually not. Some agents win listings with flattering prices, then walk them down after weeks of stagnation, which typically nets less than pricing correctly at launch. Choose the best defended price, not the highest one.",
          },
          {
            q: "What should a listing agent's marketing plan include?",
            a: 'Preparation and staging advice, professional photography, listing copy, syndication, open house strategy, and a plan for what changes if showings are slow. Specifics are in <a href="/sellers/how-to-choose-a-listing-agent.html">how to choose a listing agent</a>.',
          },
          {
            q: "How long is a typical listing agreement?",
            a: "Three to six months is common. Ask about cancellation provisions before signing, and be cautious of unusually long terms with no exit.",
          },
          {
            q: "What if I need to sell and buy at the same time?",
            a: "Tell every candidate agent up front, because sequencing two transactions changes strategy. The Requity assessment adapts when you are doing both, and matching considers coverage of both markets.",
          },
        ],
      },
      {
        h2: "Comparing agents",
        faqs: [
          {
            q: "How do I compare real estate agents?",
            a: 'Score each candidate on five dimensions: local experience, recent sales history, communication style, process and strategy, and personal fit. The framework is in <a href="/how-to-compare-real-estate-agents.html">how to compare real estate agents</a>.',
          },
          {
            q: "What matters more: sales volume or fit?",
            a: "You need baseline competence, and beyond that, fit usually determines the quality of your experience. A high volume agent who communicates in a way that frustrates you is a bad trade for a slightly smaller producer who fits.",
          },
          {
            q: "Are online agent reviews trustworthy?",
            a: "Directionally useful, but they skew positive and rarely describe communication style or fit. Use reviews to screen out consistent problems, not to make the final choice; interviews tell you more.",
          },
          {
            q: "What questions reveal the most in an agent interview?",
            a: 'Ask them to walk you through a recent comp analysis and a difficult negotiation. Specific, story backed answers signal real experience. The full list is in <a href="/questions-to-ask-a-real-estate-agent.html">questions to ask a real estate agent</a>.',
          },
          {
            q: "Should I compare agents from different brokerages?",
            a: "Compare individuals, not brands. Agents within one brokerage vary as much as agents across brokerages, so build your shortlist around people whose recent work matches your area and price range.",
          },
        ],
      },
      {
        h2: "Communication and fit",
        faqs: [
          {
            q: "Why does communication style matter in choosing an agent?",
            a: "A transaction is months of updates, questions, and decisions under pressure. When the agent's style matches yours, every interaction builds confidence; when it does not, friction compounds into distrust. It is the most common reason agent relationships break down.",
          },
          {
            q: "How can I tell if an agent communicates well before hiring them?",
            a: 'Watch response speed during the interview stage, ask about update frequency and channels, and notice whether they listen and summarize next steps. Details in <a href="/find-a-real-estate-agent-who-communicates-well.html">find a real estate agent who communicates well</a>.',
          },
          {
            q: "What is agent client compatibility?",
            a: 'It is how well an agent\'s communication style, pace, decision guidance, and support approach fit a specific client. Two clients can have opposite experiences with the same agent. More in <a href="/agent-client-compatibility.html">agent client compatibility</a>.',
          },
          {
            q: "What is a real estate personality assessment?",
            a: 'A short set of questions about how you communicate, decide, and handle stress during a transaction, used to identify what kind of agent relationship fits you. See <a href="/real-estate-personality-assessment.html">real estate personality assessment</a>.',
          },
          {
            q: "Can I find an agent who fits my communication style?",
            a: "Yes. You can test for it in interviews with direct questions about update frequency and responsiveness, or use Requity, which measures communication style on both sides and makes it a core matching input.",
          },
        ],
      },
      {
        h2: "Red flags and switching",
        faqs: [
          {
            q: "What are the biggest red flags in a real estate agent?",
            a: 'Poor communication, pressure without explanation, comps they cannot defend, vague local knowledge, no clear process, and not listening to your goals. The full list is in <a href="/real-estate-agent-red-flags.html">real estate agent red flags</a>.',
          },
          {
            q: "My real estate agent does not communicate. What should I do?",
            a: "Raise it once, directly and specifically: what you need, how often, and through which channel. If nothing changes, review your agreement terms and consider switching. Communication rarely improves on its own mid transaction.",
          },
          {
            q: "Should I fire my real estate agent?",
            a: "Try one honest conversation first; some problems are fixable. If they persist, check your representation or listing agreement for term and cancellation provisions, put your decision in writing, and involve the brokerage if needed.",
          },
          {
            q: "How do I switch real estate agents?",
            a: "Review any signed agreement, communicate your decision in writing, and ask the brokerage about a release if time remains on the term. Then take what you learned about your needs into the next search so the same mismatch does not repeat.",
          },
          {
            q: "Is it a red flag if an agent pressures me to sign quickly?",
            a: "Pressure without explanation is. Real urgency exists in fast markets, but a good agent explains the reason. An agent rushing you into a representation agreement before answering your questions is prioritizing their timeline over your outcome.",
          },
        ],
      },
      {
        h2: "About Requity",
        faqs: [
          {
            q: "What is Requity?",
            a: "Requity is a real estate brokerage and referral based agent matching platform. It helps home buyers and sellers find agents who fit their communication style, needs, and market, and helps agents work with clients more effectively through relationship insights.",
          },
          {
            q: "How does Requity matching work?",
            a: 'You complete a short relationship style assessment, share your goals and market, and a Requity team member reviews your profile, typically within 24 to 48 hours. Matching considers compatibility, transaction needs, and location. The full flow is on <a href="/how-it-works.html">how Requity works</a>.',
          },
          {
            q: "Is Requity free for buyers and sellers?",
            a: "Starting with the client assessment is free for buyers and sellers.",
          },
          {
            q: "Does Requity choose the agent for me?",
            a: "REQUITY supports a reviewed matching process. The assessment helps identify the client's needs, market, communication style, and transaction type. REQUITY then helps connect the client with an agent who may be a fit for that market and client profile. You are never obligated to work with a proposed agent.",
          },
          {
            q: "What happens if I am buying and selling?",
            a: "If you are buying and selling, REQUITY may review each side of the move separately. You may be matched with an agent in the market where you want to buy, an agent in the market where you want to sell, or one agent if the same agent is appropriate for both sides.",
          },
          {
            q: "Is REQUITY a real estate brokerage?",
            a: "Yes. REQUITY operates as a real estate brokerage and referral based matching platform. REQUITY helps buyers and sellers complete an assessment, reviews their needs and market, and connects them with agents in the appropriate market. When a referred transaction closes, REQUITY receives a referral fee according to the applicable agent or broker agreement.",
          },
          {
            q: "How does REQUITY make money?",
            a: "REQUITY may earn revenue through agent network participation, referral fee agreements, and future partner relationships connected to the real estate transaction process. For referred real estate transactions, the workflow is based on a referral fee agreement with the participating agent or broker.",
          },
          {
            q: "How do agents join Requity?",
            a: 'Agents create an account, join the REQUITY network under the current participation terms, complete their own assessment, and receive an agent archetype describing their working style. Before being connected with a REQUITY client, the agent or broker signs the applicable referral fee agreement. Details are on the <a href="/agent/index.html">Requity for agents</a> page.',
          },
          {
            q: "What referral fee applies to REQUITY referrals?",
            a: "Participating agents or brokers may sign a referral fee agreement before being connected with a REQUITY client. The applicable referral fee is governed by that agreement.",
          },
        ],
      },
    ],
    related: [
      { href: "/how-to-find-a-good-real-estate-agent.html", label: "How to find a good Real Estate Agent" },
      { href: "/real-estate-agent-matching.html", label: "Real Estate Agent matching" },
      { href: "/questions-to-ask-a-real-estate-agent.html", label: "Questions to ask a Real Estate Agent" },
      { href: "/how-it-works.html", label: "How Requity works" },
    ],
  },
];
