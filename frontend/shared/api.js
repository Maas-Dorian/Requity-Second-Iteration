/*
 * REQUITY frontend API helper (plain JS, no build step).
 *
 * Exposes `window.RequityAPI`. Every function talks to the secure backend:
 *  - public assessment flows POST to the /api routes (service role stays server-side),
 *  - agent/reviewer auth uses Supabase Auth (browser anon key) + the /api/auth routes.
 *
 * Real Supabase/API config is REQUIRED. There is no demo mode: when config is
 * missing a clear setup error is thrown, and when a request fails the caller is
 * expected to surface a real error/empty state (never synthetic sample data).
 *
 * Source rules mirrored from the backend:
 *  - QR / agent-link clients (source 'qr') attach to the agent, no reviewer queue.
 *  - REQUITY reviewer clients (source 'requity_reviewer') enter the reviewer queue.
 */
(function (global) {
  "use strict";

  // Current Terms of Service version recorded on agent account creation.
  var TERMS_VERSION = "2026-06";

  // --- Config -------------------------------------------------------------
  function getSupabaseConfig() {
    var cfg = global.REQUITY_CONFIG || {};
    return {
      supabaseUrl: cfg.supabaseUrl || "",
      supabaseAnonKey: cfg.supabaseAnonKey || "",
      apiBaseUrl: cfg.apiBaseUrl || "",
      frontendUrl: cfg.frontendUrl || global.location.origin,
      authEmailConfirmationExpected: cfg.authEmailConfirmationExpected === true,
    };
  }

  // Whether the deployment expects Supabase email confirmation to be ON.
  function authEmailConfirmationExpected() {
    return (global.REQUITY_CONFIG || {}).authEmailConfirmationExpected === true;
  }

  // Resolutions agents (email ends in @resolutions.realtor) skip the agent
  // assessment entirely. This is NOT an auth failure: they are fully valid agents
  // who simply do not take the archetype assessment.
  function isResolutionsAgentEmail(email) {
    return Boolean(email && String(email).toLowerCase().trim().endsWith("@resolutions.realtor"));
  }

  // Detect a Supabase Auth EMAIL rate limit (HTTP 429 or known messages/codes),
  // so the UI can show a calm "wait a few minutes" note instead of retrying.
  function isAuthRateLimit(status, dataObj) {
    if (status === 429) return true;
    var d = dataObj || {};
    var code = String(d.error_code || d.code || d.error || "").toLowerCase();
    if (code.indexOf("rate") !== -1 && code.indexOf("limit") !== -1) return true;
    if (code === "over_email_send_rate_limit") return true;
    var msg = String(d.msg || d.error_description || d.error || d.message || "").toLowerCase();
    return (
      msg.indexOf("rate limit") !== -1 ||
      msg.indexOf("over email send rate limit") !== -1 ||
      msg.indexOf("email rate limit exceeded") !== -1 ||
      msg.indexOf("you can only request this after") !== -1 // Supabase security throttle
    );
  }

  // Build a clean, user-safe rate-limit error (never auto-retried by callers).
  function makeRateLimitError(flow) {
    var e = new Error(
      "Too many auth emails were requested. Please wait a few minutes before trying again."
    );
    e.code = "RATE_LIMITED";
    e.rateLimited = true;
    e.status = 429;
    // #region agent log, observed client-side (auth emails go browser→Supabase).
    try { console.warn("AUTH_RATE_LIMIT_DETECTED", { flow: flow || "auth" }); } catch (x) {}
    // #endregion
    return e;
  }

  // Throws a clear setup error when the secure API base URL is not configured.
  function requireApi() {
    var c = getSupabaseConfig();
    if (!c.apiBaseUrl) {
      throw new Error(
        "REQUITY is not configured. Set apiBaseUrl (usually \"/api\") in frontend/shared/config.js."
      );
    }
    return c;
  }

  // --- Supabase Auth session ---------------------------------------------
  // ONE localStorage key, used consistently across every page.
  var SESSION_KEY = "requity_session";

  function authDebugEnabled() {
    try {
      var cfg = global.REQUITY_CONFIG || {};
      if (cfg.debugAuth) return true;
      return global.localStorage.getItem("requity_auth_debug") === "1";
    } catch (e) { return false; }
  }
  // Safe auth debug. NEVER logs the access token, refresh token, password,
  // service role key, or the full user object, only booleans/status/role.
  function authDebug(label, data) {
    if (!authDebugEnabled()) return;
    try { console.debug("[auth] " + label, data || {}); } catch (e) { /* ignore */ }
  }

  function getStoredSession() {
    try { return JSON.parse(global.localStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }
  function setStoredSession(s) {
    try {
      if (s && s.access_token) global.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else global.localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }
  function clearStoredSession() {
    try { global.localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }
  function hasStoredSession() {
    var s = getStoredSession();
    return !!(s && s.access_token);
  }
  // Back-compat aliases (existing call sites use these names).
  var getSession = getStoredSession;
  var setSession = setStoredSession;
  var hasSession = hasStoredSession;

  function supabaseAuthHeaders() {
    var c = getSupabaseConfig();
    return { "Content-Type": "application/json", apikey: c.supabaseAnonKey };
  }

  function storeSessionFromAuth(data) {
    if (!data || !data.access_token) return null;
    var nowSec = Math.floor(Date.now() / 1000);
    var existing = getStoredSession();
    var session = {
      access_token: data.access_token,
      // Supabase returns a fresh refresh_token on refresh; keep the prior one if absent.
      refresh_token: data.refresh_token || (existing && existing.refresh_token) || null,
      expires_at: data.expires_at || (data.expires_in ? nowSec + data.expires_in : null),
      user: data.user || (data.session && data.session.user) || (existing && existing.user) || null,
    };
    setStoredSession(session);
    return session;
  }

  // Refresh the access token using the Supabase refresh token endpoint.
  //  - invalid/expired refresh token (HTTP error) → clear session, return null
  //  - network error → keep session (could be transient), return null
  async function refreshAccessToken() {
    var s = getStoredSession();
    var c = getSupabaseConfig();
    if (!s || !s.refresh_token || !c.supabaseUrl) { clearStoredSession(); return null; }
    authDebug("refreshAttempted", { hasRefreshToken: true });
    try {
      var res = await fetch(c.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: supabaseAuthHeaders(),
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!res.ok) { clearStoredSession(); return null; }
      var data = await res.json();
      var stored = storeSessionFromAuth(data);
      return stored ? stored.access_token : null;
    } catch (e) {
      authDebug("refreshError", { network: true });
      return null;
    }
  }

  // Returns a valid access token, refreshing when near/after expiry.
  // Returns null when there is no usable token (caller treats that as signed-out).
  async function getAccessToken() {
    var s = getStoredSession();
    if (!s || !s.access_token) return null;
    var nowSec = Math.floor(Date.now() / 1000);
    var trulyExpired = s.expires_at ? s.expires_at <= nowSec : false;
    var nearExpiry = s.expires_at ? s.expires_at - 60 <= nowSec : false;
    authDebug("getAccessToken", { hasStoredSession: true, tokenExpired: trulyExpired, nearExpiry: nearExpiry });
    if (!nearExpiry) return s.access_token;
    var refreshed = await refreshAccessToken();
    if (refreshed) return refreshed;
    // Refresh failed: use the still-valid token if it hasn't truly expired yet.
    return trulyExpired ? null : s.access_token;
  }

  // --- Low-level transport ------------------------------------------------

  // Safe debug logger. Toggle with: localStorage.setItem('requity_debug','1').
  // Logs ONLY to the browser console (no network calls) and ONLY safe metadata:
  // current page, has-session/has-token booleans, API route, response status,
  // role, has-agent-row, and payload SHAPE (counts/keys), never tokens,
  // passwords, refresh tokens, service role keys, Brevo keys, or raw PII.
  function reqDebugEnabled() {
    try { return global.localStorage.getItem("requity_debug") === "1"; }
    catch (e) { return false; }
  }
  function reqDebug(location, message, data) {
    if (!reqDebugEnabled()) return;
    var safe = {};
    try {
      var d = data || {};
      // Shallow copy; callers only ever pass safe primitives/shape info.
      for (var k in d) { if (Object.prototype.hasOwnProperty.call(d, k)) safe[k] = d[k]; }
      if (global.location && safe.page === undefined) safe.page = global.location.pathname;
      if (safe.hasSession === undefined) safe.hasSession = hasStoredSession();
    } catch (e) { /* ignore */ }
    try { console.debug("[requity]", location, message, safe); } catch (e) {}
  }

  // Error that carries the HTTP status so callers can tell 401 (auth) apart
  // from transient/server errors (and avoid logging users out on a 500).
  // Also carries the backend's JSON { error, code } so the UI can show the
  // real cause instead of a generic message.
  function makeApiError(path, status, bodyText) {
    var parsed = null;
    try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch (e) { parsed = null; }
    var serverMsg = parsed && (parsed.error || parsed.message);
    var e = new Error(serverMsg || "API " + path + " failed: " + status);
    e.name = "ApiError";
    e.status = status;
    e.code = parsed && parsed.code ? parsed.code : null;
    e.serverError = serverMsg || null;
    e.area = parsed && parsed.area ? parsed.area : null;
    e.detail = parsed && parsed.detail ? parsed.detail : null;
    return e;
  }

  // Attaches Authorization: Bearer <token> when a Supabase session exists.
  async function withAuthHeaders(headers) {
    var h = headers || {};
    var token = await getAccessToken();
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  async function apiPost(path, body) {
    var c = requireApi();
    var headers = await withAuthHeaders({ "Content-Type": "application/json" });
    var hasAuth = !!headers.Authorization;
    var res = await fetch(c.apiBaseUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var text = "";
      try { text = await res.text(); } catch (e) {}
      var err = makeApiError(path, res.status, text);
      // #region agent log
      reqDebug("api.js:apiPost", "POST failed", { path: path, status: res.status, hasAuth: hasAuth, code: err.code, area: err.area, serverError: err.serverError });
      // #endregion
      throw err;
    }
    // #region agent log
    reqDebug("api.js:apiPost", "POST ok", { path: path, status: res.status, hasAuth: hasAuth });
    // #endregion
    return res.json();
  }

  async function apiPatch(path, body) {
    var c = requireApi();
    var headers = await withAuthHeaders({ "Content-Type": "application/json" });
    var hasAuth = !!headers.Authorization;
    var res = await fetch(c.apiBaseUrl.replace(/\/$/, "") + path, {
      method: "PATCH",
      headers: headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      var ptext = "";
      try { ptext = await res.text(); } catch (e) {}
      var perr = makeApiError(path, res.status, ptext);
      reqDebug("api.js:apiPatch", "PATCH failed", { path: path, status: res.status, hasAuth: hasAuth, code: perr.code, area: perr.area, serverError: perr.serverError });
      throw perr;
    }
    reqDebug("api.js:apiPatch", "PATCH ok", { path: path, status: res.status, hasAuth: hasAuth });
    return res.json();
  }

  async function apiGet(path) {
    var c = requireApi();
    var headers = await withAuthHeaders({});
    var res = await fetch(c.apiBaseUrl.replace(/\/$/, "") + path, { method: "GET", headers: headers });
    if (!res.ok) {
      var gtext = "";
      try { gtext = await res.text(); } catch (e) {}
      var gerr = makeApiError(path, res.status, gtext);
      // #region agent log
      reqDebug("api.js:apiGet", "GET failed", { path: path, status: res.status, code: gerr.code, area: gerr.area, serverError: gerr.serverError });
      // #endregion
      throw gerr;
    }
    return res.json();
  }

  async function apiDelete(path) {
    var c = requireApi();
    var headers = await withAuthHeaders({});
    var hasAuth = !!headers.Authorization;
    var res = await fetch(c.apiBaseUrl.replace(/\/$/, "") + path, { method: "DELETE", headers: headers });
    if (!res.ok) {
      var dtext = "";
      try { dtext = await res.text(); } catch (e) {}
      var derr = makeApiError(path, res.status, dtext);
      // #region agent log
      reqDebug("api.js:apiDelete", "DELETE failed", { path: path, status: res.status, hasAuth: hasAuth, code: derr.code, area: derr.area, serverError: derr.serverError });
      // #endregion
      throw derr;
    }
    return res.json();
  }

  // --- Client archetype scoring (mirrors backend/lib/clientAssessments) ----
  var ORIENTATION_VOTES = {
    decide_quickly: "Driver", lead_process: "Driver", direct_assertive: "Driver",
    take_charge: "Driver", trust_instincts: "Driver", in_control: "Driver",
    asap: "Driver", achieved_goals: "Driver",
    discuss_options: "Collaborator", collaborate_team: "Collaborator",
    collaborative_winwin: "Collaborator", work_together: "Collaborator",
    seek_advice: "Collaborator", team_support: "Collaborator",
    positive_experience: "Collaborator", someone_guide: "Collaborator",
    guided_expert: "Collaborator", trusted_guidance: "Collaborator",
    agent_handle: "Collaborator", need_reassurance: "Collaborator",
  };
  var STYLE_VOTES = {
    design_aesthetics: "Design-Focused", visual_appeal: "Design-Focused",
    emotional_connection: "Design-Focused", space_layout: "Design-Focused",
    visual_materials: "Design-Focused",
    practical_features: "Practical", affordability: "Practical", location: "Practical",
    practical_aspects: "Practical", investment_value: "Practical",
    financial_aspects: "Practical", research_thoroughly: "Practical",
    well_informed: "Practical", detailed_explanations: "Practical",
    careful_strategic: "Practical",
  };
  var STRESS_VOTES = {
    clear_guidance: "Freeze", clear_plan: "Freeze", information_clarity: "Freeze",
    space_time: "Freeze", space_process: "Freeze",
    quick_solutions: "Fight",
    distraction_humor: "Flight", avoid_postpone: "Flight", no_rush: "Flight",
    flexible_timing: "Flight", step_back: "Flight",
    extra_reassurance: "Fawn", encouragement: "Fawn", relationship_conflicts: "Fawn",
  };
  var CLIENT_ARCHETYPES = {
    "Driver|Design-Focused|Freeze": "The Visionary",
    "Driver|Design-Focused|Fight": "The Trailblazer",
    "Driver|Design-Focused|Flight": "The Dreamchaser",
    "Driver|Design-Focused|Fawn": "The Inspirer",
    "Driver|Practical|Freeze": "The Strategist",
    "Driver|Practical|Fight": "The Closer",
    "Driver|Practical|Flight": "The Pathfinder",
    "Driver|Practical|Fawn": "The Advocate",
    "Collaborator|Design-Focused|Freeze": "The Curator",
    "Collaborator|Design-Focused|Fight": "The Spark",
    "Collaborator|Design-Focused|Flight": "The Explorer",
    "Collaborator|Design-Focused|Fawn": "The Harmonizer",
    "Collaborator|Practical|Freeze": "The Organizer",
    "Collaborator|Practical|Fight": "The Producer",
    "Collaborator|Practical|Flight": "The Navigator",
    "Collaborator|Practical|Fawn": "The Supporter",
  };

  function tally(answers, votes, fallback, ordered) {
    var counts = {};
    Object.keys(answers).forEach(function (k) {
      var v = votes[answers[k]];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    var winner = fallback, best = -1;
    ordered.forEach(function (c) {
      var n = counts[c] || 0;
      if (n > best) { best = n; winner = c; }
    });
    return winner;
  }

  function calculateClientArchetype(answers) {
    var orientation = tally(answers, ORIENTATION_VOTES, "Collaborator", ["Driver", "Collaborator"]);
    var style = tally(answers, STYLE_VOTES, "Practical", ["Design-Focused", "Practical"]);
    var stressResponse = tally(answers, STRESS_VOTES, "Freeze", ["Freeze", "Fight", "Flight", "Fawn"]);
    var archetype = CLIENT_ARCHETYPES[orientation + "|" + style + "|" + stressResponse] || "The Supporter";
    return { archetype: archetype, orientation: orientation, style: style, stressResponse: stressResponse };
  }

  // --- Public API ---------------------------------------------------------

  /**
   * Create a shareable client assessment link/token for an agent or reviewer flow.
   * payload: { source:"qr"|"agent_link"|"reviewer", agentId?, agentToken?, frontendUrl? }
   * Returns the API response: { token, surveyUrl, source, agentId }
   */
  async function createClientAssessmentLink(payload) {
    return apiPost("/client-assessment/create", payload);
  }

  /**
   * Resolve a branded agent slug (or legacy token) to safe public agent info for
   * attribution on the client assessment page. Never throws, returns
   * { ok:false } when the link is invalid/expired so the page can show a clean
   * message. ref: { slug?, token? }
   */
  async function fetchAgentPublicLink(ref) {
    ref = ref || {};
    var qs = ref.slug
      ? "?slug=" + encodeURIComponent(ref.slug)
      : ref.token
        ? "?agent=" + encodeURIComponent(ref.token)
        : "";
    if (!qs) return { ok: false };
    try {
      return await apiGet("/agent/public-link" + qs);
    } catch (err) {
      console.warn("[RequityAPI] fetchAgentPublicLink failed:", err && err.message);
      return { ok: false };
    }
  }

  /**
   * Submit a client assessment via the secure API. Throws on failure so the
   * caller can show a real error state.
   * payload: { token?, contact:{fullName,email,phone,dateOfBirth}, answers:{}, source, agentId, agentToken, leadId? }
   * Returns: { archetype, orientation, style, stressResponse, source, status, ... }
   */
  async function submitClientAssessment(payload) {
    // Direct public clients have no agent + no token; they route to the REQUITY
    // reviewer queue server-side. Never default to "reviewer" (that path needs a
    // pre-created assessment token and would reject a normal client submission).
    var source = payload.source || "client";
    var result = calculateClientArchetype(payload.answers || {});
    // #region agent log
    reqDebug("api.js:submitClientAssessment", "submit", {
      submitSource: source,
      hasToken: !!payload.token,
      hasAgentToken: !!payload.agentToken,
      hasAgentId: !!payload.agentId,
      hasLeadId: !!payload.leadId,
      answersCount: payload.answers ? Object.keys(payload.answers).length : 0,
    });
    // #endregion
    return apiPost("/client-assessment/submit", Object.assign({ result: result, source: source }, payload));
  }

  /**
   * Submit an agent assessment via the secure API. Throws on failure.
   * payload: { contact:{name,email,phone,dateOfBirth}, answers:{}, result:{archetype,...} }
   */
  async function submitAgentAssessment(payload) {
    return apiPost("/agent-assessment/submit", payload);
  }

  /**
   * Save an agent's market profile (city/state/service radius) without the full
   * archetype assessment. Used by the dashboard "Complete your market profile"
   * card for assessment-exempt agents. payload: { marketCity, marketState?, serviceRadiusMiles? }
   */
  async function updateAgentMarketProfile(payload) {
    return apiPost("/agent/market-profile", payload || {});
  }

  /**
   * Full dashboard payload for the authenticated agent. The API derives the
   * agent from the session, so agentId is OPTIONAL (admins may pass one to view
   * another agent). Throws on failure.
   */
  async function fetchAgentDashboard(agentId) {
    return apiGet("/dashboard/agent" + (agentId ? "?agentId=" + encodeURIComponent(agentId) : ""));
  }

  /**
   * Update one client's agent-controlled pipeline status. Throws on failure so
   * the caller can revert the dropdown. Returns { clientId, status }.
   * status must be one of: potential | active | under_contract | closed.
   */
  async function updateClientStatus(clientId, status) {
    return apiPost("/dashboard/client-status", { clientId: clientId, status: status });
  }

  /**
   * Agent QR code for the signed-in agent's public assessment link.
   * Returns { qrCodeDataUrl, assessmentLink, qrLink }. Throws on failure so the
   * caller can show a real error/empty state. The data URL is a PNG, usable for
   * both an <img> preview and a download link.
   */
  async function fetchAgentQr() {
    return apiGet("/agent/qr?format=dataUrl");
  }

  /** Client assessments assigned to an agent. Returns an array. Throws on failure. */
  async function fetchClientAssessments(agentId) {
    var dash = await apiGet("/dashboard/agent" + (agentId ? "?agentId=" + encodeURIComponent(agentId) : ""));
    return (dash && dash.clientAssessmentDetail) || [];
  }

  /** Agent notifications. Returns an array. Throws on failure. */
  async function fetchMessages(agentId) {
    if (!agentId) return [];
    var data = await apiGet("/messages/list?agentId=" + encodeURIComponent(agentId));
    return (data && data.messages) || [];
  }

  /** Mark a single notification read. Throws on failure. */
  async function markNotificationRead(messageId) {
    return apiPost("/messages/mark-read", { messageId: messageId });
  }

  // --- Incomplete assessment lead capture ---------------------------------

  /**
   * Start (or reuse) an incomplete lead when the client begins the assessment.
   * payload: { source, fullName, email, phone?, agentId?, agentToken?, reviewerId? }
   * Best-effort: returns { leadId } or null on failure (must not block the flow).
   */
  async function startAssessmentLead(payload) {
    try {
      return await apiPost("/assessment-leads/start", payload);
    } catch (err) {
      console.warn("[RequityAPI] startAssessmentLead failed:", err.message);
      return null;
    }
  }

  /**
   * Update incomplete-lead progress. Best-effort; ignores missing leadId and errors.
   * payload: { leadId, answeredCount?, partialAnswers?, archetype? }
   */
  async function updateAssessmentLeadProgress(payload) {
    if (!payload || !payload.leadId) return null;
    try {
      return await apiPost("/assessment-leads/progress", payload);
    } catch (err) {
      console.warn("[RequityAPI] updateAssessmentLeadProgress failed:", err.message);
      return null;
    }
  }

  /**
   * Mark an incomplete lead completed. Usually handled server-side by submit,
   * but exposed for direct use. Best-effort.
   */
  async function completeAssessmentLead(payload) {
    try {
      return await apiPost("/assessment-leads/complete", payload);
    } catch (err) {
      console.warn("[RequityAPI] completeAssessmentLead failed:", err.message);
      return null;
    }
  }

  /**
   * Reviewer: list incomplete/assessment leads. Returns an array. Throws on failure.
   * filters: { status?, source?, search?, limit? }
   */
  async function fetchReviewerAssessmentLeads(filters) {
    var f = filters || {};
    var qs = [];
    if (f.status) qs.push("status=" + encodeURIComponent(f.status));
    if (f.source) qs.push("source=" + encodeURIComponent(f.source));
    if (f.search) qs.push("search=" + encodeURIComponent(f.search));
    if (f.limit) qs.push("limit=" + encodeURIComponent(f.limit));
    var data = await apiGet("/reviewer/assessment-leads" + (qs.length ? "?" + qs.join("&") : ""));
    return (data && data.leads) || [];
  }

  /**
   * Reviewer: update a lead's follow-up status and/or notes. Throws on failure.
   * payload: { leadId, status?, notes? }
   */
  async function updateReviewerAssessmentLead(payload) {
    return apiPost("/reviewer/assessment-leads/update", payload);
  }

  /**
   * Reviewer: permanently delete an assessment lead by id. Reviewer/admin auth
   * is enforced server-side. Resolves { ok: true, deletedId }. Throws on failure.
   */
  async function deleteReviewerAssessmentLead(leadId) {
    return apiDelete("/reviewer/assessment-leads/delete?id=" + encodeURIComponent(leadId));
  }

  /**
   * Reviewer: live matching queue. Returns an array of { client, rankings }.
   * Throws on failure so the caller can show a real error state (never sample data).
   */
  async function fetchReviewerMatches() {
    var data = await apiGet("/reviewer/matches");
    return (data && data.queue) || [];
  }

  /**
   * Reviewer: full queue payload. Returns { queue, upForReview, pairedClients }.
   * Throws on failure so the caller can show a real error state.
   */
  async function fetchReviewerQueue() {
    var data = (await apiGet("/reviewer/matches")) || {};
    var queue = data.queue || data.upForReview || [];
    return {
      queue: queue,
      upForReview: data.upForReview || queue,
      pairedClients: data.pairedClients || [],
    };
  }

  /**
   * Reviewer: location grouping + search. All heavy filtering is server-side.
   * filters: { q?, city?, state?, status?, transaction?, limit?, offset? }
   * Returns { ok, markets, clients, agents, total }.
   */
  async function fetchReviewerLocations(filters) {
    var f = filters || {};
    var qs = [];
    if (f.q) qs.push("q=" + encodeURIComponent(f.q));
    if (f.city) qs.push("city=" + encodeURIComponent(f.city));
    if (f.state) qs.push("state=" + encodeURIComponent(f.state));
    if (f.status) qs.push("status=" + encodeURIComponent(f.status));
    if (f.transaction) qs.push("transaction=" + encodeURIComponent(f.transaction));
    if (f.eligibility) qs.push("eligibility=" + encodeURIComponent(f.eligibility));
    if (f.limit) qs.push("limit=" + encodeURIComponent(f.limit));
    if (f.offset) qs.push("offset=" + encodeURIComponent(f.offset));
    var data = (await apiGet("/reviewer/locations" + (qs.length ? "?" + qs.join("&") : ""))) || {};
    return {
      markets: data.markets || [],
      clients: data.clients || [],
      agents: data.agents || [],
      total: data.total || {
        marketCount: 0, clientCount: 0, agentCount: 0,
        agentsMissingLocation: 0, clientsMissingLocation: 0, noLocalMatch: 0,
      },
    };
  }

  /**
   * Reviewer: location-aware agent suggestions for a queued client/lead.
   * params: { clientId?, leadId?, limit? }. Returns the full eligibility result:
   * { clientLocationStatus, eligibleAgents, suggestions, excludedAgents,
   *   message, suggestedActions }. Only location-eligible agents are returned;
   * agents with missing location or out of range are summarized as counts only.
   */
  async function fetchReviewerMatchSuggestions(params) {
    var p = params || {};
    var qs = [];
    if (p.clientId) qs.push("clientId=" + encodeURIComponent(p.clientId));
    if (p.leadId) qs.push("leadId=" + encodeURIComponent(p.leadId));
    if (p.limit) qs.push("limit=" + encodeURIComponent(p.limit));
    var data = (await apiGet("/reviewer/match-suggestions" + (qs.length ? "?" + qs.join("&") : ""))) || {};
    var eligible = data.eligibleAgents || data.suggestions || [];
    return {
      clientLocationStatus: data.clientLocationStatus || "missing",
      eligibleAgents: eligible,
      suggestions: eligible,
      excludedAgents: data.excludedAgents || { missingLocation: 0, outOfRange: 0, incompleteProfile: 0 },
      message: data.message || null,
      suggestedActions: data.suggestedActions || [],
    };
  }

  /**
   * Reviewer: canonical archetype reference (16 client + 16 agent).
   * Returns { clientArchetypes: [], agentArchetypes: [] }. Throws on failure.
   */
  async function fetchReviewerArchetypeReference() {
    var data = (await apiGet("/reviewer/archetype-reference")) || {};
    return {
      clientArchetypes: data.clientArchetypes || [],
      agentArchetypes: data.agentArchetypes || [],
    };
  }

  /**
   * Reviewer: approve + assign a queued client to an agent. Throws on failure.
   * payload: { clientId, agentId, score?, reason? }
   */
  async function approveReviewerMatch(payload) {
    return apiPost("/reviewer/approve-match", payload);
  }

  /**
   * Reviewer: set a matched/paired client's pipeline status. Requires reviewer
   * auth. payload: { clientId?, leadId?, status }. Returns { ok, status, label }.
   */
  async function updateReviewerClientStatus(payload) {
    return apiPatch("/reviewer/client-status", payload);
  }

  // --- Auth (Supabase Auth via REST) -------------------------------------
  function requireSupabaseAuth() {
    var c = getSupabaseConfig();
    if (!c.supabaseUrl || !c.supabaseAnonKey) {
      throw new Error("Supabase auth is not configured. Set supabaseUrl and supabaseAnonKey in config.js.");
    }
    return c;
  }

  /** Create an agent auth account, then bootstrap the profile + agent row. */
  async function signUpAgent(email, password, profile) {
    var c = requireSupabaseAuth();
    var meta = profile || {};
    var res = await fetch(c.supabaseUrl + "/auth/v1/signup", {
      method: "POST",
      headers: supabaseAuthHeaders(),
      body: JSON.stringify({
        email: email,
        password: password,
        data: {
          full_name: meta.fullName || null,
          phone: meta.phone || null,
        },
      }),
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      // Auth email rate limit → calm, terminal error (caller must NOT retry).
      if (isAuthRateLimit(res.status, data)) throw makeRateLimitError("signup");
      throw new Error(data.msg || data.error_description || data.error || "Sign up failed.");
    }
    // When email confirmation is disabled, signup returns a session immediately.
    var session = storeSessionFromAuth(data.access_token ? data : (data.session || {}));
    var result = { user: data.user || (data.session && data.session.user) || null, session: session };
    if (session && session.access_token) {
      // Persist the profile + agent row BEFORE we ever route. Retry a couple of
      // times so a transient blip can't leave the account half-created (the
      // exact state that used to bounce new agents back to the sign-in page).
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          result.bootstrap = await bootstrapAgentProfile(profile);
          if (result.bootstrap && result.bootstrap.ok && result.bootstrap.profile) break;
        } catch (e) {
          result.bootstrapError = e.message;
          // A ToS rejection is terminal (caller must re-accept); stop retrying.
          if (e && e.code === "TERMS_REQUIRED") break;
        }
        await new Promise(function (resolve) { setTimeout(resolve, 200); });
      }
    } else {
      // No session returned (Supabase "Confirm email" is ON, or signup did not
      // mint a session). We NEVER resend or retry, the UI shows a clear message.
      result.needsEmailConfirmation = true;
      result.confirmationExpected = authEmailConfirmationExpected();
    }
    // #region agent log
    reqDebug("api.js:signUpAgent", "auth:signup-result", {
      hasUser: !!result.user,
      hasSession: !!(session && session.access_token),
      rateLimited: false,
      nextStep: result.needsEmailConfirmation ? "confirm_email" : "dashboard",
    });
    // #endregion
    return result;
  }

  /** Sign in with email + password. Stores the session. */
  async function signIn(email, password) {
    var c = requireSupabaseAuth();
    var res = await fetch(c.supabaseUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: supabaseAuthHeaders(),
      body: JSON.stringify({ email: email, password: password }),
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      // Rate limit first, never let the UI hammer sign-in and make it worse.
      if (isAuthRateLimit(res.status, data)) throw makeRateLimitError("signin");
      var raw = (data.msg || data.error_description || data.error || "").toString();
      var err;
      if (/confirm/i.test(raw)) {
        err = new Error("Please confirm your email or ask an admin to confirm the account in Supabase.");
        err.code = "EMAIL_NOT_CONFIRMED";
      } else {
        err = new Error("Invalid email or password, or this account has not been confirmed.");
        err.code = "INVALID_CREDENTIALS";
      }
      err.status = res.status;
      throw err;
    }
    var session = storeSessionFromAuth(data);
    // Note: profile/agent self-heal happens in requireAgentSession() (agent-only,
    // role-aware) which the caller invokes right after sign-in. We deliberately
    // do NOT blanket-bootstrap here so reviewer/admin accounts never get an
    // unnecessary agents row.
    // #region agent log
    reqDebug("api.js:signIn", "auth:signin-result", {
      hasUser: !!(data && data.user),
      hasSession: !!(session && session.access_token),
      rateLimited: false,
      nextStep: "dashboard",
    });
    // #endregion
    return { user: data.user || null, session: session };
  }

  /**
   * Send a Supabase password-recovery email to the given address. Real action
   * (uses the public anon key). Throws on failure so the UI can show a real result.
   * `redirectTo` is the URL the recovery link returns to (must be allow-listed in
   * Supabase Auth URL settings). The recovery link appends the session tokens to
   * the URL hash, which the reset page reads via consumeRecoverySession().
   */
  async function sendPasswordReset(email, redirectTo) {
    var c = requireSupabaseAuth();
    if (!email) throw new Error("An account email is required.");
    var url = c.supabaseUrl + "/auth/v1/recover";
    if (redirectTo) url += "?redirect_to=" + encodeURIComponent(redirectTo);
    var res = await fetch(url, {
      method: "POST",
      headers: supabaseAuthHeaders(),
      body: JSON.stringify({ email: email }),
    });
    if (!res.ok) {
      var data = {};
      try { data = await res.json(); } catch (e) { /* ignore */ }
      if (isAuthRateLimit(res.status, data)) throw makeRateLimitError("recover");
      throw new Error(data.msg || data.error_description || data.error || "Could not send the reset email.");
    }
    return true;
  }

  /**
   * Read the recovery tokens Supabase appended to the URL hash after the user
   * clicks a password-reset link (#access_token=...&type=recovery&...). When a
   * recovery session is present it is stored so updatePassword() can authenticate,
   * and the hash is cleared from the address bar. Returns true when a recovery
   * session was consumed. Never throws.
   */
  function consumeRecoverySession() {
    try {
      var hash = (global.location && global.location.hash) ? global.location.hash.replace(/^#/, "") : "";
      if (!hash) return false;
      var params = new URLSearchParams(hash);
      var type = params.get("type");
      var accessToken = params.get("access_token");
      if (!accessToken || type !== "recovery") return false;
      var nowSec = Math.floor(Date.now() / 1000);
      var expiresIn = parseInt(params.get("expires_in") || "0", 10);
      setStoredSession({
        access_token: accessToken,
        refresh_token: params.get("refresh_token") || null,
        expires_at: expiresIn ? nowSec + expiresIn : null,
        user: null,
      });
      // Strip the tokens from the URL so they aren't left in history/screenshots.
      try {
        var clean = global.location.pathname + global.location.search;
        global.history.replaceState(null, "", clean);
      } catch (e) { /* ignore */ }
      return true;
    } catch (e) { return false; }
  }

  /**
   * Set a new password for the currently authenticated (or recovery) session.
   * Calls Supabase PUT /auth/v1/user. Throws a clean error on failure; surfaces a
   * calm rate-limit message when Supabase throttles the request.
   */
  async function updatePassword(newPassword) {
    var c = requireSupabaseAuth();
    if (!newPassword || String(newPassword).length < 8) {
      throw new Error("Choose a password with at least 8 characters.");
    }
    var token = await getAccessToken();
    if (!token) {
      throw new Error("Your reset link has expired. Request a new password reset email and try again.");
    }
    var res = await fetch(c.supabaseUrl + "/auth/v1/user", {
      method: "PUT",
      headers: { "Content-Type": "application/json", apikey: c.supabaseAnonKey, Authorization: "Bearer " + token },
      body: JSON.stringify({ password: newPassword }),
    });
    var data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
      if (isAuthRateLimit(res.status, data)) throw makeRateLimitError("update_user");
      throw new Error(data.msg || data.error_description || data.error || "Could not update your password.");
    }
    return true;
  }

  /** Sign out: clear local session and best-effort revoke on Supabase. */
  async function signOut() {
    var c = getSupabaseConfig();
    var token = await getAccessToken();
    if (c.supabaseUrl && token) {
      try {
        await fetch(c.supabaseUrl + "/auth/v1/logout", {
          method: "POST",
          headers: { apikey: c.supabaseAnonKey, Authorization: "Bearer " + token },
        });
      } catch (e) { /* ignore */ }
    }
    clearStoredSession();
    return true;
  }

  // Calls /api/auth/me and normalizes the response shape.
  // me.ts returns { user, profile, role, agent, needsBootstrap }. We make sure
  // `role` is always present (falling back to profile.role) and surface the
  // agent's archetype completion fields the routing logic depends on.
  async function fetchMe() {
    var me = await apiGet("/auth/me");
    if (me && !me.role && me.profile) me.role = me.profile.role || null;
    authDebug("authMe", {
      authMeStatus: 200,
      role: me ? me.role || null : null,
      hasAgentRow: !!(me && me.agent),
    });
    return me;
  }

  /**
   * Returns { user, role, profile, agent, needsBootstrap } from /api/auth/me, or null.
   * On a 401 the stale session is cleared. Transient/server errors also return
   * null here (callers that must distinguish use require*Session instead).
   */
  async function getCurrentUser() {
    if (!hasStoredSession()) return null;
    try { return await fetchMe(); }
    catch (e) {
      if (e && e.status === 401) clearStoredSession();
      return null;
    }
  }

  /** Create/refresh the caller's profile + agent row. Requires a session + API. */
  async function bootstrapAgentProfile(profile) {
    var c = requireApi();
    var meta = profile || {};
    var body = {
      fullName: meta.fullName || null,
      phone: meta.phone || null,
      frontendUrl: c.frontendUrl,
    };
    // Only the account-creation flow passes ToS acceptance. The sign-in
    // auto-bootstrap path passes no profile, so existing users are never asked
    // to re-accept (the server only enforces this when creating a NEW profile).
    if (meta.termsAccepted === true) {
      body.termsAccepted = true;
      body.termsVersion = meta.termsVersion || TERMS_VERSION;
    }
    var result = await apiPost("/auth/bootstrap-agent", body);
    // #region agent log
    reqDebug("api.js:bootstrapAgentProfile", "auth:bootstrap-agent-result", {
      ok: !!(result && result.ok),
      hasProfile: !!(result && result.profile),
      hasAgent: !!(result && result.agent),
      role: result && result.profile ? result.profile.role || null : null,
    });
    // #endregion
    return result;
  }

  // Wait until /api/auth/me is readable as a real account, retrying briefly so a
  // freshly-minted session/profile (still propagating) is never mistaken for a
  // signed-out user. Returns the `me` payload, or null if it never resolves.
  // attempts*delayMs ~= 3s by default (per the auth retry requirement).
  async function waitForAuthMe(options) {
    var opts = options || {};
    var attempts = opts.attempts || 15;
    var delayMs = opts.delayMs || 200;
    for (var i = 0; i < attempts; i++) {
      try {
        var me = await fetchMe();
        if (me && (me.role || me.profile || me.agent || me.user)) return me;
      } catch (e) {
        // A definitive 401 means there is genuinely no session, stop early.
        if (e && e.status === 401) return null;
        // Transient/server error: keep trying within the window.
      }
      await new Promise(function (resolve) { setTimeout(resolve, delayMs); });
    }
    return null;
  }

  // Return a session whose access token is actually usable, retrying briefly to
  // absorb the gap between storing a session and it becoming readable. Returns
  // { access_token } or null. Never throws.
  async function getReadableSessionWithRetry(options) {
    var opts = options || {};
    var attempts = opts.attempts || 15;
    var delayMs = opts.delayMs || 200;
    for (var i = 0; i < attempts; i++) {
      try {
        var token = await getAccessToken();
        if (token) {
          var s = getStoredSession() || {};
          return { access_token: token, refresh_token: s.refresh_token || null, user: s.user || null };
        }
      } catch (e) { /* keep polling briefly */ }
      // No stored session at all → nothing to wait for.
      if (!hasStoredSession()) return null;
      await new Promise(function (resolve) { setTimeout(resolve, delayMs); });
    }
    return null;
  }

  /**
   * Resolve the current session for an agent page.
   * Returns { ok:true, me } or { ok:false, reason, me? } where reason is:
   *   - "no_session": no/invalid session → redirect to sign-in
   *   - "error": transient/server error → show error, DO NOT redirect (no loop)
   *   - "role_mismatch": signed in but wrong role → access-denied / switch panel
   */
  async function requireAgentSession() {
    if (!hasStoredSession()) return { ok: false, reason: "no_session" };

    // Read /auth/me with brief retries so a server/network blip never logs out a
    // genuinely signed-in agent. A definitive 401 is the ONLY signed-out signal.
    var me = null;
    var lastError = null;
    for (var i = 0; i < 5; i++) {
      try { me = await fetchMe(); lastError = null; break; }
      catch (e) {
        lastError = e;
        if (e && e.status === 401) { clearStoredSession(); return { ok: false, reason: "no_session" }; }
        await new Promise(function (resolve) { setTimeout(resolve, 200); });
      }
    }
    if (lastError) return { ok: false, reason: "error", error: lastError };
    if (!me) return { ok: false, reason: "no_session" };

    // Self-heal: create/upgrade the profile + agent row when the account isn't
    // fully provisioned yet (missing profile, missing agent row, or a role that
    // hasn't been promoted to agent). This is what stops the new-agent bounce.
    var needsHeal =
      me.needsBootstrap ||
      !me.profile ||
      ((me.role === "agent" || me.role === "admin") && !(me.agent && me.agent.id)) ||
      !me.role ||
      me.role === "client";
    if (needsHeal) {
      try {
        var boot = await bootstrapAgentProfile(null);
        me = (await waitForAuthMe({ attempts: 5, delayMs: 200 })) || me;
        // Profile/agent still couldn't be provisioned despite a valid session →
        // this is a setup problem, NOT an auth failure. Never bounce to login.
        if (!boot || !boot.ok) {
          if (!me || !me.profile) return { ok: false, reason: "needs_setup", me: me };
        }
      } catch (e) {
        // The session is valid; we just couldn't provision. Surface as setup.
        if (!me || !me.profile) return { ok: false, reason: "needs_setup", me: me, error: e };
      }
    }

    if (me && (me.role === "agent" || me.role === "admin")) return { ok: true, me: me };
    // Valid session, real profile, but a non-agent role (reviewer, etc).
    return { ok: false, reason: "role_mismatch", me: me };
  }

  /**
   * Resolve the current session for the reviewer page. Same reason codes as
   * requireAgentSession (no_session / error / role_mismatch).
   */
  async function requireReviewerSession() {
    if (!hasStoredSession()) return { ok: false, reason: "no_session" };
    var me;
    try { me = await fetchMe(); }
    catch (e) {
      if (e && e.status === 401) { clearStoredSession(); return { ok: false, reason: "no_session" }; }
      return { ok: false, reason: "error", error: e };
    }
    if (!me) return { ok: false, reason: "no_session" };
    if (me.role === "reviewer" || me.role === "admin") return { ok: true, me: me };
    return { ok: false, reason: "role_mismatch", me: me };
  }

  /** True when the agent's archetype assessment has been completed. */
  function agentHasCompletedAssessment(me) {
    var a = me && me.agent;
    return !!(a && a.archetype && a.archetypeCompletedAt);
  }

  /** Copy an assessment link to the clipboard. Resolves true on success. */
  async function copyAssessmentLink(text) {
    try {
      if (global.navigator && global.navigator.clipboard) {
        await global.navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn("[RequityAPI] clipboard failed:", err.message);
    }
    return false;
  }

  global.RequityAPI = {
    getSupabaseConfig: getSupabaseConfig,
    hasSession: hasSession,
    hasStoredSession: hasStoredSession,
    getStoredSession: getStoredSession,
    setStoredSession: setStoredSession,
    clearStoredSession: clearStoredSession,
    getAccessToken: getAccessToken,
    waitForAuthMe: waitForAuthMe,
    getReadableSessionWithRetry: getReadableSessionWithRetry,
    authEmailConfirmationExpected: authEmailConfirmationExpected,
    TERMS_VERSION: TERMS_VERSION,
    signUpAgent: signUpAgent,
    signIn: signIn,
    signOut: signOut,
    sendPasswordReset: sendPasswordReset,
    consumeRecoverySession: consumeRecoverySession,
    updatePassword: updatePassword,
    isResolutionsAgentEmail: isResolutionsAgentEmail,
    getCurrentUser: getCurrentUser,
    agentHasCompletedAssessment: agentHasCompletedAssessment,
    bootstrapAgentProfile: bootstrapAgentProfile,
    requireAgentSession: requireAgentSession,
    requireReviewerSession: requireReviewerSession,
    calculateClientArchetype: calculateClientArchetype,
    createClientAssessmentLink: createClientAssessmentLink,
    fetchAgentPublicLink: fetchAgentPublicLink,
    submitClientAssessment: submitClientAssessment,
    submitAgentAssessment: submitAgentAssessment,
    updateAgentMarketProfile: updateAgentMarketProfile,
    __debug: reqDebug,
    fetchAgentDashboard: fetchAgentDashboard,
    updateClientStatus: updateClientStatus,
    fetchAgentQr: fetchAgentQr,
    fetchClientAssessments: fetchClientAssessments,
    fetchMessages: fetchMessages,
    markNotificationRead: markNotificationRead,
    startAssessmentLead: startAssessmentLead,
    updateAssessmentLeadProgress: updateAssessmentLeadProgress,
    completeAssessmentLead: completeAssessmentLead,
    fetchReviewerAssessmentLeads: fetchReviewerAssessmentLeads,
    updateReviewerAssessmentLead: updateReviewerAssessmentLead,
    deleteReviewerAssessmentLead: deleteReviewerAssessmentLead,
    fetchReviewerMatches: fetchReviewerMatches,
    fetchReviewerQueue: fetchReviewerQueue,
    fetchReviewerArchetypeReference: fetchReviewerArchetypeReference,
    fetchReviewerLocations: fetchReviewerLocations,
    fetchReviewerMatchSuggestions: fetchReviewerMatchSuggestions,
    approveReviewerMatch: approveReviewerMatch,
    updateReviewerClientStatus: updateReviewerClientStatus,
    copyAssessmentLink: copyAssessmentLink,
  };
})(window);
