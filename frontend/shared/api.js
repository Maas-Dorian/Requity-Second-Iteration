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

  // --- Config -------------------------------------------------------------
  function getSupabaseConfig() {
    var cfg = global.REQUITY_CONFIG || {};
    return {
      supabaseUrl: cfg.supabaseUrl || "",
      supabaseAnonKey: cfg.supabaseAnonKey || "",
      apiBaseUrl: cfg.apiBaseUrl || "",
      frontendUrl: cfg.frontendUrl || global.location.origin,
    };
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
  var SESSION_KEY = "requity_session";

  function getSession() {
    try { return JSON.parse(global.localStorage.getItem(SESSION_KEY) || "null"); }
    catch (e) { return null; }
  }
  function setSession(s) {
    try {
      if (s) global.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else global.localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }
  function hasSession() {
    var s = getSession();
    return !!(s && s.access_token);
  }

  function supabaseAuthHeaders() {
    var c = getSupabaseConfig();
    return { "Content-Type": "application/json", apikey: c.supabaseAnonKey };
  }

  // Returns a valid access token, refreshing it if expired. null when none.
  async function getAccessToken() {
    var s = getSession();
    if (!s || !s.access_token) return null;
    var nowSec = Math.floor(Date.now() / 1000);
    if (s.expires_at && s.expires_at - 30 > nowSec) return s.access_token;
    // Try a refresh if we have a refresh token.
    var c = getSupabaseConfig();
    if (s.refresh_token && c.supabaseUrl) {
      try {
        var res = await fetch(c.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          headers: supabaseAuthHeaders(),
          body: JSON.stringify({ refresh_token: s.refresh_token }),
        });
        if (res.ok) {
          var data = await res.json();
          storeSessionFromAuth(data);
          return data.access_token;
        }
      } catch (e) { /* fall through */ }
    }
    return s.access_token; // best-effort: return possibly-stale token
  }

  function storeSessionFromAuth(data) {
    if (!data || !data.access_token) return null;
    var nowSec = Math.floor(Date.now() / 1000);
    var session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: data.expires_at || (data.expires_in ? nowSec + data.expires_in : null),
      user: data.user || (data.session && data.session.user) || null,
    };
    setSession(session);
    return session;
  }

  // --- Low-level transport ------------------------------------------------

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
    var res = await fetch(c.apiBaseUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("API " + path + " failed: " + res.status);
    return res.json();
  }

  async function apiGet(path) {
    var c = requireApi();
    var headers = await withAuthHeaders({});
    var res = await fetch(c.apiBaseUrl.replace(/\/$/, "") + path, { method: "GET", headers: headers });
    if (!res.ok) throw new Error("API " + path + " failed: " + res.status);
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
   * Submit a client assessment via the secure API. Throws on failure so the
   * caller can show a real error state.
   * payload: { token?, contact:{fullName,email,phone,dateOfBirth}, answers:{}, source, agentId, agentToken, leadId? }
   * Returns: { archetype, orientation, style, stressResponse, source, status, ... }
   */
  async function submitClientAssessment(payload) {
    var source = payload.source || "reviewer";
    var result = calculateClientArchetype(payload.answers || {});
    return apiPost("/client-assessment/submit", Object.assign({ result: result, source: source }, payload));
  }

  /**
   * Submit an agent assessment via the secure API. Throws on failure.
   * payload: { contact:{name,email,phone,dateOfBirth}, answers:{}, result:{archetype,...} }
   */
  async function submitAgentAssessment(payload) {
    return apiPost("/agent-assessment/submit", payload);
  }

  /** Full dashboard payload for an agent. Throws on failure. */
  async function fetchAgentDashboard(agentId) {
    if (!agentId) return null;
    return apiGet("/dashboard/agent?agentId=" + encodeURIComponent(agentId));
  }

  /** Client assessments assigned to an agent. Returns an array. Throws on failure. */
  async function fetchClientAssessments(agentId) {
    if (!agentId) return [];
    var dash = await apiGet("/dashboard/agent?agentId=" + encodeURIComponent(agentId));
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
    var data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.error_description || data.error || "Sign up failed.");
    // When email confirmation is disabled, signup returns a session immediately.
    var session = storeSessionFromAuth(data.access_token ? data : (data.session || {}));
    var result = { user: data.user || (data.session && data.session.user) || null, session: session };
    if (session && session.access_token) {
      try { result.bootstrap = await bootstrapAgentProfile(profile); } catch (e) { result.bootstrapError = e.message; }
    } else {
      result.needsEmailConfirmation = true;
    }
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
    var data = await res.json();
    if (!res.ok) throw new Error(data.msg || data.error_description || data.error || "Sign in failed.");
    var session = storeSessionFromAuth(data);
    return { user: data.user || null, session: session };
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
    setSession(null);
    return true;
  }

  /** Returns { user, role, profile, agent, needsBootstrap } from /api/auth/me, or null. */
  async function getCurrentUser() {
    if (!hasSession()) return null;
    try { return await apiGet("/auth/me"); }
    catch (e) { return null; }
  }

  /** Create/refresh the caller's profile + agent row. Requires a session + API. */
  async function bootstrapAgentProfile(profile) {
    var c = requireApi();
    var meta = profile || {};
    return apiPost("/auth/bootstrap-agent", {
      fullName: meta.fullName || null,
      phone: meta.phone || null,
      frontendUrl: c.frontendUrl,
    });
  }

  /**
   * Resolve the current session for an agent page.
   * Returns { ok, me } — { ok:false, reason } means redirect to sign-in.
   */
  async function requireAgentSession() {
    if (!hasSession()) return { ok: false, reason: "no_session" };
    var me = await getCurrentUser();
    if (!me) return { ok: false, reason: "no_session" };
    if (me.needsBootstrap) {
      try { await bootstrapAgentProfile(null); me = await getCurrentUser(); } catch (e) { /* ignore */ }
    }
    if (me && (me.role === "agent" || me.role === "admin")) return { ok: true, me: me };
    return { ok: false, reason: "role_mismatch", me: me };
  }

  /**
   * Resolve the current session for the reviewer page.
   * Returns { ok, me } — { ok:false, reason } drives access-denied UI.
   */
  async function requireReviewerSession() {
    if (!hasSession()) return { ok: false, reason: "no_session" };
    var me = await getCurrentUser();
    if (!me) return { ok: false, reason: "no_session" };
    if (me.role === "reviewer" || me.role === "admin") return { ok: true, me: me };
    return { ok: false, reason: "role_mismatch", me: me };
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
    getAccessToken: getAccessToken,
    signUpAgent: signUpAgent,
    signIn: signIn,
    signOut: signOut,
    getCurrentUser: getCurrentUser,
    bootstrapAgentProfile: bootstrapAgentProfile,
    requireAgentSession: requireAgentSession,
    requireReviewerSession: requireReviewerSession,
    calculateClientArchetype: calculateClientArchetype,
    createClientAssessmentLink: createClientAssessmentLink,
    submitClientAssessment: submitClientAssessment,
    submitAgentAssessment: submitAgentAssessment,
    fetchAgentDashboard: fetchAgentDashboard,
    fetchClientAssessments: fetchClientAssessments,
    fetchMessages: fetchMessages,
    markNotificationRead: markNotificationRead,
    startAssessmentLead: startAssessmentLead,
    updateAssessmentLeadProgress: updateAssessmentLeadProgress,
    completeAssessmentLead: completeAssessmentLead,
    fetchReviewerAssessmentLeads: fetchReviewerAssessmentLeads,
    updateReviewerAssessmentLead: updateReviewerAssessmentLead,
    copyAssessmentLink: copyAssessmentLink,
  };
})(window);
