/*
 * REQUITY frontend API helper (plain JS, no build step).
 *
 * Exposes `window.RequityAPI`. Every function tries the configured backend
 * (Supabase REST or an apiBaseUrl) and gracefully falls back to DEMO MODE when
 * config is missing or a request fails, so the static demo pages always work.
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
      demoMode: cfg.demoMode === true,
    };
  }

  // True only when no backend is configured at all (pure static demo).
  function isDemoMode() {
    var c = getSupabaseConfig();
    return !c.apiBaseUrl && (!c.supabaseUrl || !c.supabaseAnonKey);
  }

  // True when demo fallback is explicitly allowed, or no backend is configured.
  function isDemoAllowed() {
    return getSupabaseConfig().demoMode || isDemoMode();
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
  function restHeaders(extra) {
    var c = getSupabaseConfig();
    var headers = {
      "Content-Type": "application/json",
      apikey: c.supabaseAnonKey,
      Authorization: "Bearer " + c.supabaseAnonKey,
    };
    if (extra) Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
    return headers;
  }

  async function restInsert(table, row) {
    var c = getSupabaseConfig();
    var res = await fetch(c.supabaseUrl + "/rest/v1/" + table, {
      method: "POST",
      headers: restHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) throw new Error("Supabase insert " + table + " failed: " + res.status);
    var data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function restSelect(table, query) {
    var c = getSupabaseConfig();
    var res = await fetch(c.supabaseUrl + "/rest/v1/" + table + "?" + (query || ""), {
      method: "GET",
      headers: restHeaders(),
    });
    if (!res.ok) throw new Error("Supabase select " + table + " failed: " + res.status);
    return res.json();
  }

  // Attaches Authorization: Bearer <token> when a Supabase session exists.
  async function withAuthHeaders(headers) {
    var h = headers || {};
    var token = await getAccessToken();
    if (token) h.Authorization = "Bearer " + token;
    return h;
  }

  async function apiPost(path, body) {
    var c = getSupabaseConfig();
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
    var c = getSupabaseConfig();
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
   * Returns: { demo, token, surveyUrl, source, agentId }
   */
  async function createClientAssessmentLink(payload) {
    var c = getSupabaseConfig();
    if (c.apiBaseUrl) {
      try {
        return Object.assign({ demo: false }, await apiPost("/client-assessment/create", payload));
      } catch (err) {
        console.warn("[RequityAPI] createClientAssessmentLink failed:", err.message);
      }
    }
    // Demo / fallback: build a best-effort local link.
    var base = (c.frontendUrl || global.location.origin).replace(/\/$/, "");
    var token = "demo-" + Math.random().toString(36).slice(2, 10);
    var qp = payload.agentToken ? "agent=" + encodeURIComponent(payload.agentToken) : "token=" + token;
    return {
      demo: true,
      token: token,
      surveyUrl: base + "/client/assessment.html?" + qp + "&source=" + (payload.source || "reviewer"),
      source: payload.source || "reviewer",
      agentId: payload.agentId || null,
    };
  }

  // Map an API-style source to the database client_source enum.
  function dbSourceOf(source) {
    return source === "reviewer" ? "requity_reviewer" : "qr";
  }

  /**
   * Submit a client assessment. Prefers /api routes, then Supabase REST, then demo.
   * payload: { token?, contact:{fullName,email,phone,dateOfBirth}, answers:{}, source, agentId, agentToken }
   * Returns: { demo, archetype, orientation, style, stressResponse, source, status }
   */
  async function submitClientAssessment(payload) {
    var source = payload.source || "reviewer";
    var result = calculateClientArchetype(payload.answers || {});
    var base = {
      archetype: result.archetype,
      orientation: result.orientation,
      style: result.style,
      stressResponse: result.stressResponse,
      source: source,
      status: source === "reviewer" ? "reviewer_matching" : "assigned",
    };

    if (isDemoMode()) return Object.assign({ demo: true }, base);

    var c = getSupabaseConfig();
    // Preferred path: secure API route (service role stays on the server).
    if (c.apiBaseUrl) {
      try {
        return Object.assign({ demo: false }, await apiPost("/client-assessment/submit",
          Object.assign({ result: result }, payload)));
      } catch (err) {
        console.warn("[RequityAPI] submitClientAssessment API failed, trying REST:", err.message);
      }
    }
    // Fallback: direct Supabase REST (local demo / no API configured).
    try {
      var dbSource = dbSourceOf(source);
      var assignedAgentId = source !== "reviewer" ? (payload.agentId || null) : null;
      var client = await restInsert("clients", {
        assigned_agent_id: assignedAgentId,
        source: dbSource,
        full_name: payload.contact.fullName,
        email: payload.contact.email || null,
        phone: payload.contact.phone || null,
        date_of_birth: payload.contact.dateOfBirth || null,
        archetype: result.archetype,
        orientation: result.orientation,
        style: result.style,
        stress_response: result.stressResponse,
        status: base.status,
      });
      await restInsert("assessments", {
        client_id: client.id,
        agent_id: assignedAgentId,
        assessment_type: "client",
        answers: payload.answers || {},
        result: result,
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      return Object.assign({ demo: false, clientId: client.id }, base);
    } catch (err) {
      console.warn("[RequityAPI] submitClientAssessment fell back to demo:", err.message);
      return Object.assign({ demo: true, error: err.message }, base);
    }
  }

  /**
   * Submit an agent assessment.
   * payload: { contact:{name,email,phone,dateOfBirth}, answers:{}, result:{archetype,...} }
   */
  async function submitAgentAssessment(payload) {
    var result = payload.result || {};
    var base = { archetype: result.archetype || "Relationship-Fit Agent" };

    if (isDemoMode()) return Object.assign({ demo: true }, base);

    var c = getSupabaseConfig();
    if (c.apiBaseUrl) {
      try {
        return Object.assign({ demo: false }, await apiPost("/agent-assessment/submit", payload));
      } catch (err) {
        console.warn("[RequityAPI] submitAgentAssessment API failed, trying REST:", err.message);
      }
    }
    try {
      var agent = await restInsert("agents", {
        display_name: payload.contact.name,
        email: payload.contact.email,
        phone: payload.contact.phone || null,
        archetype: result.archetype || null,
        interaction_style: result.interactionStyle || null,
        focus: result.focus || null,
        stress_response: result.stressResponse || null,
        perceived_value: result.perceivedValue || null,
        negotiation_style: result.negotiationStyle || null,
      });
      await restInsert("assessments", {
        agent_id: agent.id,
        assessment_type: "agent",
        answers: payload.answers || {},
        result: result,
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      return Object.assign({ demo: false, agentId: agent.id }, base);
    } catch (err) {
      console.warn("[RequityAPI] submitAgentAssessment fell back to demo:", err.message);
      return Object.assign({ demo: true, error: err.message }, base);
    }
  }

  /** Full dashboard payload. Returns null in demo mode (keep existing UI). */
  async function fetchAgentDashboard(agentId) {
    if (isDemoMode() || !agentId) return null;
    var c = getSupabaseConfig();
    try {
      if (c.apiBaseUrl) return await apiGet("/dashboard/agent?agentId=" + encodeURIComponent(agentId));
      var clients = await restSelect(
        "clients",
        "assigned_agent_id=eq." + agentId + "&select=id,status,source"
      );
      return { clientAssessmentDetail: clients };
    } catch (err) {
      console.warn("[RequityAPI] fetchAgentDashboard demo fallback:", err.message);
      return null;
    }
  }

  /** Client assessments assigned to an agent. Returns array or null (demo). */
  async function fetchClientAssessments(agentId) {
    if (isDemoMode() || !agentId) return null;
    var c = getSupabaseConfig();
    try {
      if (c.apiBaseUrl) {
        var dash = await apiGet("/dashboard/agent?agentId=" + encodeURIComponent(agentId));
        return (dash && dash.clientAssessmentDetail) || [];
      }
      return await restSelect(
        "clients",
        "assigned_agent_id=eq." + agentId +
          "&select=*,assessments(*)&order=created_at.desc"
      );
    } catch (err) {
      console.warn("[RequityAPI] fetchClientAssessments demo fallback:", err.message);
      return null;
    }
  }

  /** Agent notifications. Returns array or null (demo). */
  async function fetchMessages(agentId) {
    if (isDemoMode() || !agentId) return null;
    var c = getSupabaseConfig();
    try {
      if (c.apiBaseUrl) {
        var data = await apiGet("/messages/list?agentId=" + encodeURIComponent(agentId));
        return (data && data.messages) || [];
      }
      return await restSelect(
        "messages",
        "agent_id=eq." + agentId + "&select=*&order=created_at.desc"
      );
    } catch (err) {
      console.warn("[RequityAPI] fetchMessages demo fallback:", err.message);
      return null;
    }
  }

  /** Mark a single notification read. Prefers the API route. */
  async function markNotificationRead(messageId) {
    var c = getSupabaseConfig();
    if (c.apiBaseUrl) {
      try {
        return await apiPost("/messages/mark-read", { messageId: messageId });
      } catch (err) {
        console.warn("[RequityAPI] markNotificationRead API failed:", err.message);
      }
    }
    return { demo: true, messageId: messageId };
  }

  // --- Incomplete assessment lead capture ---------------------------------

  /**
   * Start (or reuse) an incomplete lead when the client begins the assessment.
   * payload: { source, fullName, email, phone?, agentId?, agentToken?, reviewerId? }
   * Returns: { demo, leadId } — never throws (lead capture must not block the flow).
   */
  async function startAssessmentLead(payload) {
    var c = getSupabaseConfig();
    if (c.apiBaseUrl) {
      try {
        var data = await apiPost("/assessment-leads/start", payload);
        return Object.assign({ demo: false }, data);
      } catch (err) {
        console.warn("[RequityAPI] startAssessmentLead failed:", err.message);
      }
    }
    return { demo: true, leadId: "demo-lead-" + Math.random().toString(36).slice(2, 10) };
  }

  /**
   * Update incomplete-lead progress. Best-effort; ignores demo leads and errors.
   * payload: { leadId, answeredCount?, partialAnswers?, archetype? }
   */
  async function updateAssessmentLeadProgress(payload) {
    var c = getSupabaseConfig();
    if (!payload || !payload.leadId || String(payload.leadId).indexOf("demo-lead-") === 0) {
      return { demo: true };
    }
    if (c.apiBaseUrl) {
      try {
        return await apiPost("/assessment-leads/progress", payload);
      } catch (err) {
        console.warn("[RequityAPI] updateAssessmentLeadProgress failed:", err.message);
      }
    }
    return { demo: true };
  }

  /**
   * Mark an incomplete lead completed. Usually handled server-side by submit,
   * but exposed for direct use. Best-effort.
   */
  async function completeAssessmentLead(payload) {
    var c = getSupabaseConfig();
    if (c.apiBaseUrl) {
      try {
        return await apiPost("/assessment-leads/complete", payload);
      } catch (err) {
        console.warn("[RequityAPI] completeAssessmentLead failed:", err.message);
      }
    }
    return { demo: true };
  }

  /**
   * Reviewer: list incomplete/assessment leads. Returns array or null (demo).
   * filters: { status?, source?, search?, limit? }
   */
  async function fetchReviewerAssessmentLeads(filters) {
    if (isDemoMode()) return null;
    var c = getSupabaseConfig();
    var f = filters || {};
    var qs = [];
    if (f.status) qs.push("status=" + encodeURIComponent(f.status));
    if (f.source) qs.push("source=" + encodeURIComponent(f.source));
    if (f.search) qs.push("search=" + encodeURIComponent(f.search));
    if (f.limit) qs.push("limit=" + encodeURIComponent(f.limit));
    try {
      if (c.apiBaseUrl) {
        var data = await apiGet("/reviewer/assessment-leads" + (qs.length ? "?" + qs.join("&") : ""));
        return (data && data.leads) || [];
      }
      return await restSelect(
        "assessment_leads",
        "select=*&order=last_activity_at.desc" +
          (f.status ? "&status=eq." + encodeURIComponent(f.status) : "") +
          (f.source ? "&source=eq." + encodeURIComponent(f.source) : "")
      );
    } catch (err) {
      console.warn("[RequityAPI] fetchReviewerAssessmentLeads demo fallback:", err.message);
      return null;
    }
  }

  /**
   * Reviewer: update a lead's follow-up status and/or notes.
   * payload: { leadId, status?, notes? }
   */
  async function updateReviewerAssessmentLead(payload) {
    var c = getSupabaseConfig();
    if (c.apiBaseUrl) {
      try {
        return await apiPost("/reviewer/assessment-leads/update", payload);
      } catch (err) {
        console.warn("[RequityAPI] updateReviewerAssessmentLead failed:", err.message);
      }
    }
    return { demo: true };
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
          brokerage: meta.brokerage || null,
          license_number: meta.licenseNumber || null,
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

  /** Returns { user, role, profile, agent, needsBootstrap } from /api/auth/me. */
  async function getCurrentUser() {
    if (!hasSession()) return null;
    var c = getSupabaseConfig();
    if (c.apiBaseUrl) {
      try { return await apiGet("/api/auth/me"); }
      catch (e) { return null; }
    }
    // No API configured: fall back to the locally stored user (no role known).
    var s = getSession();
    return s ? { user: s.user, role: null, profile: null, agent: null, needsBootstrap: true } : null;
  }

  /** Create/refresh the caller's profile + agent row. Requires a session. */
  async function bootstrapAgentProfile(profile) {
    var c = getSupabaseConfig();
    if (!c.apiBaseUrl) return { demo: true };
    var meta = profile || {};
    return apiPost("/api/auth/bootstrap-agent", {
      fullName: meta.fullName || null,
      phone: meta.phone || null,
      brokerage: meta.brokerage || null,
      licenseNumber: meta.licenseNumber || null,
      frontendUrl: c.frontendUrl,
    });
  }

  /**
   * Resolve the current session for an agent page.
   * Returns { ok, demo, me } — { ok:false } means redirect to sign-in.
   */
  async function requireAgentSession() {
    if (!hasSession()) {
      return isDemoAllowed() ? { ok: true, demo: true, me: null } : { ok: false, reason: "no_session" };
    }
    var me = await getCurrentUser();
    if (!me) return isDemoAllowed() ? { ok: true, demo: true, me: null } : { ok: false, reason: "no_session" };
    if (me.needsBootstrap) {
      try { await bootstrapAgentProfile(null); me = await getCurrentUser(); } catch (e) { /* ignore */ }
    }
    if (me && (me.role === "agent" || me.role === "admin")) return { ok: true, demo: false, me: me };
    return { ok: false, reason: "role_mismatch", me: me };
  }

  /**
   * Resolve the current session for the reviewer page.
   * Returns { ok, demo, me } — { ok:false, reason } drives access-denied UI.
   */
  async function requireReviewerSession() {
    if (!hasSession()) {
      return isDemoAllowed() ? { ok: true, demo: true, me: null } : { ok: false, reason: "no_session" };
    }
    var me = await getCurrentUser();
    if (!me) return isDemoAllowed() ? { ok: true, demo: true, me: null } : { ok: false, reason: "no_session" };
    if (me.role === "reviewer" || me.role === "admin") return { ok: true, demo: false, me: me };
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
    isDemoMode: isDemoMode,
    isDemoAllowed: isDemoAllowed,
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
