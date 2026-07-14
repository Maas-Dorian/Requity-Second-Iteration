/**
 * Market landing page config: the single source of truth for REQUITY
 * market-specific landing pages.
 *
 * Used by scripts/generate-market-pages.mjs, which renders one static HTML
 * page per market and also emits client/market-data.js (a small browser
 * config used by the homepage location prompt and the assessment market
 * prefill). Do not edit client/market-data.js by hand.
 *
 * Copy rules: no em dashes or en dashes, no guarantees about agent
 * availability or results, sentence case body copy, "Real Estate Agent"
 * title case only in titles and headings.
 */

function market({
  slug,
  name,
  stateLabel,
  stateCode,
  lat,
  lng,
  radiusMiles = 75,
  statewide = false,
  accent,
  soft,
  deep = "#16305C",
  overlay,
}) {
  const inPhrase = statewide ? `across ${name}` : `in ${name}`;
  return {
    slug,
    name,
    displayName: name,
    stateLabel,
    stateCode,
    statewide,
    lat,
    lng,
    radiusMiles,
    url: `/${slug}-real-estate-agent.html`,
    assessmentUrl: `/client/assessment.html?market=${slug}`,
    skylineImage: `/assets/markets/${slug}-skyline.jpg`,
    themeClass: `market-theme-${slug}`,
    theme: { accent, soft, deep, overlay: overlay || "rgba(255, 255, 255, 0.84)" },
    title: `Find a Real Estate Agent in ${name} | REQUITY`,
    metaDescription: `Find a real estate agent in ${name} who fits your communication style, goals, and buying or selling needs. Start your free REQUITY assessment.`,
    heroHeadline: `Find a real estate agent in ${name} who fits how you communicate.`,
    heroSubheadline: `REQUITY uses personality based assessments and relationship insights to help buyers and sellers ${inPhrase} connect with real estate agents whose working style fits their needs.`,
    // Client CTA labels are standardized: the market context stays in the
    // headline, SEO metadata, and assessmentUrl, never in the button label.
    primaryCta: "Find your agent",
    localTitle: `Real estate agent matching built around fit in ${name}`,
    localBody: `Choosing a real estate agent is not only about finding someone nearby. It is about finding someone whose communication style, pace, and guidance match how you make decisions. REQUITY helps buyers and sellers ${inPhrase} start with a short assessment, then uses human review to support a better agent match.`,
    localBullets: [
      `Buying or selling ${inPhrase}`,
      "Matched around communication style and needs",
      "Reviewed by REQUITY before connection",
    ],
    localAngle: `For buyers and sellers navigating the ${name} market, REQUITY helps match you with a real estate agent whose working style fits how you communicate.`,
  };
}

export const MARKETS = {
  dallas: market({
    slug: "dallas", name: "Dallas", stateLabel: "Texas", stateCode: "TX",
    lat: 32.7767, lng: -96.797,
    accent: "#D96C1F", soft: "#FBF3EA", overlay: "rgba(251, 243, 234, 0.84)",
  }),
  "kansas-city": market({
    slug: "kansas-city", name: "Kansas City", stateLabel: "Missouri", stateCode: "MO",
    lat: 39.0997, lng: -94.5786,
    accent: "#2F6FB2", soft: "#F0F5FB", overlay: "rgba(240, 245, 251, 0.84)",
  }),
  "washington-dc": market({
    slug: "washington-dc", name: "Washington DC", stateLabel: "District of Columbia", stateCode: "DC",
    lat: 38.9072, lng: -77.0369,
    accent: "#345C8F", soft: "#F2F5F9", overlay: "rgba(242, 245, 249, 0.84)",
  }),
  virginia: market({
    slug: "virginia", name: "Virginia", stateLabel: "Virginia", stateCode: "VA",
    lat: 37.4316, lng: -78.6569,
    // Statewide page: a wide radius from the state centroid approximates
    // "the user appears to be in Virginia" without any heavy geo lookup.
    radiusMiles: 180, statewide: true,
    accent: "#3A7A5E", soft: "#F1F7F3", overlay: "rgba(241, 247, 243, 0.84)",
  }),
  denver: market({
    slug: "denver", name: "Denver", stateLabel: "Colorado", stateCode: "CO",
    lat: 39.7392, lng: -104.9903,
    accent: "#4C7DBF", soft: "#F2F6FB", overlay: "rgba(242, 246, 251, 0.84)",
  }),
  seattle: market({
    slug: "seattle", name: "Seattle", stateLabel: "Washington", stateCode: "WA",
    lat: 47.6062, lng: -122.3321,
    accent: "#5B7E9F", soft: "#EEF3F7", overlay: "rgba(238, 243, 247, 0.86)",
  }),
  tampa: market({
    slug: "tampa", name: "Tampa", stateLabel: "Florida", stateCode: "FL",
    lat: 27.9506, lng: -82.4572,
    accent: "#1F8FB4", soft: "#FBF6EC", overlay: "rgba(251, 246, 236, 0.84)",
  }),
  atlanta: market({
    slug: "atlanta", name: "Atlanta", stateLabel: "Georgia", stateCode: "GA",
    lat: 33.749, lng: -84.388,
    accent: "#DA8A57", soft: "#FCF6F0", overlay: "rgba(252, 246, 240, 0.84)",
  }),
  chicago: market({
    slug: "chicago", name: "Chicago", stateLabel: "Illinois", stateCode: "IL",
    lat: 41.8781, lng: -87.6298,
    accent: "#4A7397", soft: "#EEF4F9", overlay: "rgba(238, 244, 249, 0.84)",
  }),
  portland: market({
    slug: "portland", name: "Portland", stateLabel: "Oregon", stateCode: "OR",
    lat: 45.5152, lng: -122.6784,
    accent: "#4E8A6A", soft: "#F0F6F1", overlay: "rgba(240, 246, 241, 0.84)",
  }),
  phoenix: market({
    slug: "phoenix", name: "Phoenix", stateLabel: "Arizona", stateCode: "AZ",
    lat: 33.4484, lng: -112.074,
    accent: "#D97B29", soft: "#FAF3E9", overlay: "rgba(250, 243, 233, 0.84)",
  }),
  "las-vegas": market({
    slug: "las-vegas", name: "Las Vegas", stateLabel: "Nevada", stateCode: "NV",
    lat: 36.1699, lng: -115.1398,
    accent: "#8A5FA8", soft: "#FAF1F0", overlay: "rgba(250, 241, 240, 0.84)",
  }),
  "san-diego": market({
    slug: "san-diego", name: "San Diego", stateLabel: "California", stateCode: "CA",
    lat: 32.7157, lng: -117.1611,
    accent: "#2E8FA3", soft: "#F0F7F8", overlay: "rgba(240, 247, 248, 0.84)",
  }),
  "salt-lake-city": market({
    slug: "salt-lake-city", name: "Salt Lake City", stateLabel: "Utah", stateCode: "UT",
    lat: 40.7608, lng: -111.891,
    accent: "#6D89B8", soft: "#F1F4FA", overlay: "rgba(241, 244, 250, 0.84)",
  }),
  cincinnati: market({
    slug: "cincinnati", name: "Cincinnati", stateLabel: "Ohio", stateCode: "OH",
    lat: 39.1031, lng: -84.512,
    accent: "#B85C4A", soft: "#F9F2F0", overlay: "rgba(249, 242, 240, 0.84)",
  }),
  boston: market({
    slug: "boston", name: "Boston", stateLabel: "Massachusetts", stateCode: "MA",
    lat: 42.3601, lng: -71.0589,
    accent: "#A34A4A", soft: "#F3F5F8", deep: "#142B52", overlay: "rgba(243, 245, 248, 0.84)",
  }),
  nashville: market({
    slug: "nashville", name: "Nashville", stateLabel: "Tennessee", stateCode: "TN",
    lat: 36.1627, lng: -86.7816,
    accent: "#C58A3A", soft: "#FAF5EC", overlay: "rgba(250, 245, 236, 0.84)",
  }),
  louisville: market({
    slug: "louisville", name: "Louisville", stateLabel: "Kentucky", stateCode: "KY",
    lat: 38.2527, lng: -85.7585,
    accent: "#55876B", soft: "#F1F6F2", overlay: "rgba(241, 246, 242, 0.84)",
  }),
  lexington: market({
    slug: "lexington", name: "Lexington", stateLabel: "Kentucky", stateCode: "KY",
    lat: 38.0406, lng: -84.5037,
    accent: "#4E7F95", soft: "#F0F5F6", overlay: "rgba(240, 245, 246, 0.84)",
  }),
};

export const MARKET_LIST = Object.values(MARKETS);
