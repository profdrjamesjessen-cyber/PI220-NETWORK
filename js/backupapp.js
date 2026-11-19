
/* =========================================================
   PI220 — APP-005 NETWORK
   FILE: js/app.js
   BUILD: 006.3

   APPLICATION ENGINE

   SECURITY:
   - Authentication alone never grants administrator access.
   - Administrator access requires exact backend verification.
   - Protected inventory uses the node-manager Edge Function.
   - Protected history uses the authenticated history RPC.
   - Public telemetry never populates protected inventory.
   - No service-role key or private secret is stored here.
========================================================= */

(function () {
    "use strict";
  
    /* =======================================================
       01. CONFIGURATION AND STATE
    ======================================================= */
  
    const CONFIG = window.PI220_NETWORK_CONFIG;
  
    const state = {
      client: null,
      session: null,
      user: null,
      isAdmin: false,
      authReady: false,
  
      authSequence: 0,
      verificationSequence: 0,
      verificationToken: null,
      verificationPromise: null,
      verifiedAccessToken: null,
  
      nodes: [],
      history: [],
      events: [],
      selectedNode: null,
  
      nodesBusy: false,
      historyBusy: false,
      nodesRefreshQueued: false,
      historyRefreshQueued: false,
      monitoringBusy: false,
      telemetryBusy: false,
  
      telemetryData: null,
      telemetryLastSuccess: null,
      telemetryLastError: null,
      telemetrySourceState: {},
      trafficSamples: [],
      monitorLastResult: null,
  
      refreshTimer: null,
      initialized: false
    };
  
    const $ = (selector, root = document) =>
      root.querySelector(selector);
  
    const $$ = (selector, root = document) =>
      Array.from(root.querySelectorAll(selector));
  
    function element(id) {
      return document.getElementById(id);
    }
  
    function setText(id, value) {
      const target = element(id);
  
      if (target) {
        target.textContent =
          value === null || value === undefined || value === ""
            ? "—"
            : String(value);
      }
    }
  
    function setVisible(target, visible) {
      if (!target) return;
  
      target.classList.toggle("hidden", !visible);
      target.setAttribute("aria-hidden", String(!visible));
    }
  
    function setMessage(message, type = "info") {
      const target = element("app-message");
  
      if (!target) {
        console.info("[APP-005]", message);
        return;
      }
  
      target.replaceChildren();
      target.className = "app-message " + type;
      target.setAttribute("role", type === "error" ? "alert" : "status");

      const messageText = createElement(
        "span",
        "app-message-text",
        String(message)
      );
      const closeButton = createElement(
        "button",
        "app-message-close",
        "×"
      );
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", "Dismiss notification");
      closeButton.setAttribute("title", "Dismiss");
      closeButton.addEventListener("click", clearMessage);
      target.append(messageText, closeButton);
      target.classList.remove("hidden");
    }
  
    function clearMessage() {
      const target = element("app-message");
  
      if (!target) return;
  
      target.textContent = "";
      target.className = "app-message hidden";
    }
  
    function formatDate(value) {
      if (!value) return "—";
  
      const date = new Date(value);
  
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }
  
      return date.toLocaleString();
    }
  
    function formatDuration(value) {
      if (value === null || value === undefined || value === "") {
        return "—";
      }
  
      const number = Number(value);
  
      return Number.isFinite(number)
        ? Math.round(number) + " ms"
        : "—";
    }
  
    function safeNumber(value, fallback = 0) {
      const number = Number(value);
  
      return Number.isFinite(number) ? number : fallback;
    }
  
    function createElement(tag, className, text) {
      const node = document.createElement(tag);
  
      if (className) node.className = className;
  
      if (text !== undefined && text !== null) {
        node.textContent = String(text);
      }
  
      return node;
    }
  
    function clearElement(target) {
      if (!target) return;
  
      target.replaceChildren();
    }
  
    function createButton(text, className, callback) {
      const button = createElement(
        "button",
        className || "button",
        text
      );
  
      button.type = "button";
      button.addEventListener("click", callback);
  
      return button;
    }
  
    function isValidHttpUrl(value) {
      try {
        const url = new URL(value);
  
        return url.protocol === "https:" ||
          url.protocol === "http:";
      } catch (_) {
        return false;
      }
    }
  
    function getErrorMessage(error) {
      if (!error) return "Unknown error.";
  
      if (typeof error === "string") return error;
  
      return (
        error.message ||
        error.error_description ||
        error.details ||
        error.hint ||
        "Unknown error."
      );
    }
  
    function logError(context, error) {
      console.error("[APP-005] " + context + ":", error);
    }
  
    function addEvent(message, type = "info") {
      state.events.unshift({
        message: String(message),
        type,
        timestamp: new Date().toISOString()
      });
  
      if (state.events.length > 100) {
        state.events.length = 100;
      }
  
      renderEvents();
    }
  
    /* =======================================================
       02. APPLICATION AND CONNECTION STATUS
    ======================================================= */
  
    function updateApplicationStatus(status, detail) {
      setText("system-status-text", status);
      setText("system-build-value", CONFIG.build);
      setText("system-last-refresh", new Date().toLocaleString());
      setText("build-version", "BUILD " + CONFIG.build);
      setText("dashboard-last-update", new Date().toLocaleString());

      const dot = element("system-status-dot");

      if (dot) {
        dot.classList.remove(
          "status-online",
          "status-warning",
          "status-offline",
          "status-unknown"
        );

        dot.classList.add(
          status === "INITIALIZATION ERROR"
            ? "status-offline"
            : "status-warning"
        );
      }

      if (detail) {
        console.info("[APP-005 STATUS]", detail);
      }
    }
  
    function updateConnectionStatus(connected) {
      setText(
        "system-supabase-status",
        connected ? "CLIENT INITIALIZED" : "NOT INITIALIZED"
      );

      setText(
        "health-supabase",
        connected ? "CLIENT INITIALIZED" : "NOT INITIALIZED"
      );
    }
  
    /* =======================================================
       03. NAVIGATION
    ======================================================= */
  
    function navigate(viewName) {
      if (!viewName) return;
  
      const views = [
        "dashboard",
        "nodes",
        "monitoring",
        "telemetry",
        "events",
        "history",
        "analytics",
        "administration",
        "system"
      ];
  
      if (!views.includes(viewName)) return;
  
      views.forEach(function (name) {
        const section = element("view-" + name);
  
        if (section) {
          section.classList.toggle(
            "active",
            name === viewName
          );
  
          section.classList.toggle(
            "hidden",
            name !== viewName
          );
        }
      });
  
      $$(".nav-item[data-view]").forEach(function (item) {
        const active = item.dataset.view === viewName;
  
        item.classList.toggle("active", active);
        item.setAttribute("aria-current", active ? "page" : "false");
      });
  
      document.body.dataset.currentView = viewName;
  
      if (viewName === "nodes" && state.isAdmin) {
        loadAdminNodes();
      }
  
      if (viewName === "history" && state.isAdmin) {
        loadHistory();
      }
  
      if (viewName === "monitoring" && state.isAdmin) {
        updateMonitoringSummary();
      }
  
      if (viewName === "administration") {
        updateAdministratorInterface();
      }
    }
  
    function initializeNavigation() {
      $$(".nav-item[data-view]").forEach(function (item) {
        item.addEventListener("click", function () {
          navigate(item.dataset.view);
        });
      });
  
      $$("[data-navigate]").forEach(function (item) {
        item.addEventListener("click", function () {
          navigate(item.dataset.navigate);
        });
      });
  
      $$("[data-open-view]").forEach(function (item) {
        item.addEventListener("click", function () {
          navigate(item.dataset.openView);
        });
      });
    }
  
    /* =======================================================
       04. MODALS
    ======================================================= */
  
    function openModal(id) {
      const modal = element(id);
  
      if (!modal) return;
  
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }
  
    function closeModal(id) {
      const modal = element(id);
  
      if (!modal) return;
  
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
  
    function initializeModals() {
      $$("[data-open-login]").forEach(function (button) {
        button.addEventListener("click", function () {
          openModal("login-modal");
        });
      });
  
      const loginOpen = element("auth-open-button");
  
      if (loginOpen) {
        loginOpen.addEventListener("click", function () {
          openModal("login-modal");
        });
      }
  
      const loginClose = element("login-close-button");
  
      if (loginClose) {
        loginClose.addEventListener("click", function () {
          closeModal("login-modal");
        });
      }
  
      $$("[data-close-login]").forEach(function (button) {
        button.addEventListener("click", function () {
          closeModal("login-modal");
        });
      });
  
      $$("[data-close-node-modal]").forEach(function (button) {
        button.addEventListener("click", function () {
          closeModal("node-modal");
        });
      });
  
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          closeModal("login-modal");
          closeModal("node-modal");
        }
      });
    }
  
    /* =======================================================
       05. SUPABASE CLIENT
    ======================================================= */
  
    function initializeSupabase() {
      if (!CONFIG) {
        throw new Error(
          "PI220_NETWORK_CONFIG was not loaded."
        );
      }
  
      if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
      ) {
        throw new Error(
          "Supabase JavaScript library is unavailable."
        );
      }
  
      state.client = window.supabase.createClient(
        CONFIG.supabase.url,
        CONFIG.supabase.publishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
  
      updateConnectionStatus(true);
  
      setText(
        "system-app-url",
        window.location.origin + window.location.pathname
      );
    }
  
    /* =======================================================
       06. PROTECTED DATA AND ADMINISTRATOR INTERFACE
    ======================================================= */
  
    function clearProtectedData() {
      state.nodes = [];
      state.history = [];
      state.selectedNode = null;
      state.monitorLastResult = null;
      state.nodesRefreshQueued = false;
      state.historyRefreshQueued = false;

      renderNodes();
      renderHistory();
      updateDashboardNodeMetrics();
      updateMonitoringSummary();

      setText("node-details", "Administrator access required.");
      setText("monitor-last-status", "LOCKED");
      setText("health-monitoring", "ADMIN CHECK REQUIRED");
      setText("monitor-response-time", "—");
      setText(
        "monitor-check-result",
        "Administrator access required."
      );

      closeModal("node-modal");
    }
  
    function updateAdministratorInterface() {
      const admin = state.isAdmin;

      setVisible(element("nodes-admin-lock"), !admin);
      setVisible(element("nodes-admin-content"), admin);

      setVisible(element("monitoring-admin-lock"), !admin);
      setVisible(element("monitoring-admin-content"), admin);

      setVisible(element("history-admin-lock"), !admin);
      setVisible(element("history-admin-content"), admin);

      setVisible(element("auth-open-button"), !admin);
      setVisible(element("auth-logout-button"), admin);

      const addNodeButton = element("node-add-button");
      if (addNodeButton) {
        addNodeButton.disabled = !admin;
      }

      setText(
        "admin-auth-status",
        admin ? "AUTHENTICATED" : "NOT AUTHENTICATED"
      );

      setText(
        "admin-verification-status",
        admin ? "VERIFIED" : "NOT VERIFIED"
      );

      setText(
        "admin-identity",
        admin && state.user
          ? state.user.email
          : "PUBLIC ACCESS"
      );

      setText(
        "admin-protected-status",
        admin ? "PROTECTED ACCESS ACTIVE" : "PROTECTED ACCESS LOCKED"
      );

      setText(
        "system-admin-status",
        admin ? "VERIFIED ADMINISTRATOR" : "NOT VERIFIED"
      );

      setText(
        "health-monitoring",
        admin ? "READY — CHECK NOT RUN" : "ADMIN CHECK REQUIRED"
      );

      setText(
        "admin-user-label",
        admin && state.user ? state.user.email : "PUBLIC ACCESS"
      );

      if (!admin) {
        clearProtectedData();
      }
    }
  
    /* =======================================================
       07. ADMINISTRATOR VERIFICATION
    ======================================================= */
  
    async function verifyAdministrator(session) {
      if (
        !session ||
        !session.access_token ||
        !session.user ||
        !session.user.id
      ) {
        ++state.verificationSequence;
        state.verificationToken = null;
        state.verificationPromise = null;
        state.verifiedAccessToken = null;
        state.isAdmin = false;
        state.user = null;
        state.session = null;
        updateAdministratorInterface();
        return false;
      }

      const accessToken = session.access_token;

      // A token already accepted by the backend remains verified.
      if (state.verifiedAccessToken === accessToken) {
        state.session = session;
        state.user = session.user;
        state.isAdmin = true;
        updateAdministratorInterface();
        return true;
      }

      // Share one in-flight check between sign-in, auth events and getSession.
      if (
        state.verificationToken === accessToken &&
        state.verificationPromise
      ) {
        return state.verificationPromise;
      }

      const sequence = ++state.verificationSequence;
      state.verificationToken = accessToken;
      state.session = session;
      state.user = session.user;
      state.isAdmin = false;
      updateAdministratorInterface();

      const verificationPromise = (async function () {
        try {
          const result = await state.client.functions.invoke(
            CONFIG.supabase.functions.adminCheck,
            {
              body: {},
              headers: {
                Authorization: "Bearer " + accessToken
              }
            }
          );

          if (sequence !== state.verificationSequence) return false;
          if (result.error) throw result.error;

          const data = result.data;
          const authorized =
            data &&
            data.authorized === true &&
            data.role === "admin" &&
            data.user_id === session.user.id;

          if (!authorized) {
            state.isAdmin = false;
            state.verifiedAccessToken = null;
            updateAdministratorInterface();
            setMessage(
              "Administrator verification rejected by backend.",
              "warning"
            );
            return false;
          }

          state.isAdmin = true;
          state.verifiedAccessToken = accessToken;
          updateAdministratorInterface();
          setMessage(
            "Administrator verification successful.",
            "success"
          );
          addEvent(
            "Administrator identity verified by backend.",
            "success"
          );

          await Promise.all([loadAdminNodes(), loadHistory()]);
          return true;

        } catch (error) {
          if (sequence !== state.verificationSequence) return false;
          logError("Administrator verification", error);
          state.isAdmin = false;
          state.verifiedAccessToken = null;
          updateAdministratorInterface();
          setMessage(
            "Administrator verification failed: " +
            getErrorMessage(error),
            "error"
          );
          return false;
        }
      })();

      state.verificationPromise = verificationPromise;
      try {
        return await verificationPromise;
      } finally {
        if (state.verificationPromise === verificationPromise) {
          state.verificationPromise = null;
          if (!state.isAdmin) state.verificationToken = null;
        }
      }
    }

    /* =======================================================
       08. AUTHENTICATION
    ======================================================= */
  
    async function handleLogin(event) {
      event.preventDefault();
  
      if (!state.client) {
        setMessage("Supabase is not initialized.", "error");
        return;
      }
  
      const email = element("admin-email")?.value.trim();
      const password = element("admin-password")?.value;
  
      if (!email || !password) {
        setMessage(
          "Enter both administrator email and password.",
          "warning"
        );
        return;
      }
  
      const submitButton = element("admin-login-submit");
      const errorTarget = element("login-error");
  
      if (errorTarget) {
        errorTarget.textContent = "";
      }
  
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "VERIFYING...";
      }
  
      try {
        const result = await state.client.auth.signInWithPassword({
          email,
          password
        });
  
        if (result.error) {
          throw result.error;
        }
  
        if (!result.data.session) {
          throw new Error(
            "Authentication did not return a valid session."
          );
        }
  
        const verified = await verifyAdministrator(
          result.data.session
        );
  
        if (!verified) {
          await state.client.auth.signOut();
  
          throw new Error(
            "The account was not verified as an APP-005 administrator."
          );
        }
  
        closeModal("login-modal");
  
        const form = element("admin-login-form");
  
        if (form) form.reset();
  
        navigate("dashboard");
  
        addEvent(
          "Administrator login completed.",
          "success"
        );
  
      } catch (error) {
        logError("Administrator login", error);
  
        if (errorTarget) {
          errorTarget.textContent = getErrorMessage(error);
        }
  
        setMessage(
          "Login failed: " + getErrorMessage(error),
          "error"
        );
  
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "VERIFY ACCESS";
        }
      }
    }
  
    async function handleLogout() {
      if (!state.client) return;
  
      ++state.authSequence;
      ++state.verificationSequence;
      state.verificationToken = null;
      state.verificationPromise = null;
      state.verifiedAccessToken = null;
  
      state.isAdmin = false;
      state.session = null;
      state.user = null;
  
      updateAdministratorInterface();
  
      try {
        const result = await state.client.auth.signOut();
  
        if (result.error) {
          throw result.error;
        }
  
        setMessage(
          "Administrator session closed. Protected data locked.",
          "success"
        );
  
        addEvent(
          "Administrator signed out. Protected data cleared.",
          "info"
        );
  
      } catch (error) {
        logError("Sign out", error);
  
        setMessage(
          "Sign-out warning: " + getErrorMessage(error),
          "warning"
        );
      }
    }
  
    function initializeAuthentication() {
      const loginForm = element("admin-login-form");
  
      if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
      }
  
      [
        element("auth-logout-button"),
        element("admin-logout-action")
      ].filter(Boolean).forEach(function (button) {
        button.addEventListener("click", handleLogout);
      });
  
      state.client.auth.onAuthStateChange(
        function (event, session) {
          const sequence = ++state.authSequence;
  
          if (event === "SIGNED_OUT" || !session) {
            ++state.verificationSequence;
            state.verificationToken = null;
            state.verificationPromise = null;
            state.verifiedAccessToken = null;
  
            state.session = null;
            state.user = null;
            state.isAdmin = false;
  
            updateAdministratorInterface();
            return;
          }
  
          if (
            event === "INITIAL_SESSION" ||
            event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "USER_UPDATED"
          ) {
            state.session = session;
            state.user = session.user || null;
            state.isAdmin = false;
  
            updateAdministratorInterface();
  
            /*
             * Defer verification so an Edge Function call
             * is not executed inside the auth-state callback.
             */
            window.setTimeout(function () {
              if (sequence !== state.authSequence) return;
  
              verifyAdministrator(session);
            }, 0);
          }
        }
      );
  
      state.client.auth.getSession().then(
        async function (result) {
          if (result.error) {
            logError("Session restoration", result.error);
            state.authReady = true;
            return;
          }
  
          if (result.data.session) {
            await verifyAdministrator(result.data.session);
          } else {
            state.session = null;
            state.user = null;
            state.isAdmin = false;
  
            updateAdministratorInterface();
          }
  
          state.authReady = true;
        }
      ).catch(function (error) {
        logError("Session restoration", error);
        state.authReady = true;
      });
    }
  
    /* =======================================================
       09. NODE MANAGER API
    ======================================================= */
  
    async function nodeManagerRequest(action, payload = {}) {
      if (!state.isAdmin || !state.session) {
        throw new Error(
          "Administrator verification required."
        );
      }
  
      const result = await state.client.functions.invoke(
        CONFIG.supabase.functions.nodeManager,
        {
          body: {
            action,
            payload
          },
          headers: {
            Authorization: "Bearer " + state.session.access_token
          }
        }
      );
  
      if (result.error) {
        throw result.error;
      }
  
      if (
        !result.data ||
        result.data.success !== true
      ) {
        throw new Error(
          result.data?.error ||
          result.data?.message ||
          "Node manager rejected the request."
        );
      }
  
      return result.data;
    }
  
    /* =======================================================
       10. NODE INVENTORY
    ======================================================= */
  
    async function loadAdminNodes() {
      if (!state.isAdmin) return;

      if (state.nodesBusy) {
        state.nodesRefreshQueued = true;
        return;
      }

      state.nodesBusy = true;
      const requestUserId = state.user?.id;

      try {
        const data = await nodeManagerRequest(
          "list_nodes",
          {}
        );

        if (
          !state.isAdmin ||
          !requestUserId ||
          state.user?.id !== requestUserId
        ) {
          return;
        }

        if (!Array.isArray(data.nodes)) {
          throw new Error(
            "Node manager returned an invalid inventory."
          );
        }

        state.nodes = data.nodes;

        setText("system-node-manager-status", "RESPONDED");

        renderNodes();
        updateDashboardNodeMetrics();
        updateMonitoringSummary();

        renderNodeDetails(
          state.selectedNode
            ? state.nodes.find(function (node) {
                return node.id === state.selectedNode.id;
              }) || null
            : null
        );

        if (!state.selectedNode) {
          setText(
            "node-details",
            state.nodes.length +
              " protected node records loaded. Select DETAILS to inspect a record."
          );
        }

      } catch (error) {
        if (state.isAdmin && state.user?.id === requestUserId) {
          logError("Load node inventory", error);
          setText("system-node-manager-status", "REQUEST FAILED");

          setText(
            "node-details",
            "Node inventory unavailable."
          );

          setMessage(
            "Unable to load protected node inventory: " +
              getErrorMessage(error),
            "error"
          );
        }

      } finally {
        state.nodesBusy = false;

        if (state.nodesRefreshQueued && state.isAdmin) {
          state.nodesRefreshQueued = false;
          Promise.resolve().then(loadAdminNodes);
        }
      }
    }
  
    function updateDashboardNodeMetrics() {
      if (!state.isAdmin) {
        setText("metric-total-nodes", "—");
        setText("metric-connected-nodes", "—");
        setText(
          "metric-connected-detail",
          "Administrator verification required"
        );
        return;
      }

      const total = state.nodes.length;

      const online = state.nodes.filter(function (node) {
        return node.status === "online";
      }).length;

      const offline = state.nodes.filter(function (node) {
        return node.status === "offline";
      }).length;

      setText("metric-total-nodes", total);
      setText("metric-connected-nodes", online);
      setText(
        "metric-connected-detail",
        online + " online • " + offline + " offline"
      );
    }
  
    function statusClass(status) {
      const allowed = [
        "online",
        "offline",
        "warning",
        "pending",
        "maintenance",
        "unknown"
      ];
  
      const normalized = String(status || "unknown").toLowerCase();
  
      return allowed.includes(normalized)
        ? normalized
        : "unknown";
    }
  
    function createStatusBadge(status) {
      const normalized = statusClass(status);
  
      return createElement(
        "span",
        "table-status " + normalized,
        normalized.toUpperCase()
      );
    }
  
    function renderNodeDetails(node) {
      const target = element("node-details");
      if (!target) return;

      clearElement(target);

      if (!node || !state.isAdmin) {
        target.textContent = state.isAdmin
          ? "Select DETAILS on a registered node to inspect its record."
          : "Administrator access required.";
        return;
      }

      const fields = [
        ["NODE NAME", node.name],
        ["NODE KEY", node.node_key],
        ["CATEGORY", node.category],
        ["CONNECTION TYPE", node.connection_type],
        ["ENDPOINT", node.endpoint_url],
        ["HOST", node.host],
        ["PORT", node.port],
        ["STATUS", node.status],
        ["LAST CHECK", node.last_checked_at],
        ["LAST RESPONSE", node.last_response_ms === null || node.last_response_ms === undefined
          ? "—"
          : formatDuration(node.last_response_ms)],
        ["PUBLIC", node.is_public ? "YES" : "NO"],
        ["PUBLIC DESCRIPTION", node.public_description]
      ];

      const grid = createElement("div", "node-detail-grid");

      fields.forEach(function ([label, value]) {
        const item = createElement("div", "node-detail-item");
        item.appendChild(createElement("span", "node-detail-label", label));
        item.appendChild(
          createElement(
            "strong",
            "node-detail-value",
            value === null || value === undefined || value === ""
              ? "—"
              : value
          )
        );
        grid.appendChild(item);
      });

      target.appendChild(grid);
    }

    function renderNodes() {
      const target = element("node-table-body");

      if (!target) return;

      clearElement(target);

      if (!state.isAdmin) {
        renderNodeDetails(null);
        return;
      }

      if (state.nodes.length === 0) {
        renderNodeDetails(null);
        const row = createElement("tr");
        const cell = createElement(
          "td",
          "",
          "No nodes returned by the protected backend."
        );

        cell.colSpan = 8;
        row.appendChild(cell);
        target.appendChild(row);

        updateDashboardNodeMetrics();
        return;
      }

      state.nodes.forEach(function (node) {
        const row = createElement("tr");

        [
          node.name,
          node.node_key,
          node.category,
          node.connection_type,
          node.endpoint_url || node.host || "—"
        ].forEach(function (value) {
          row.appendChild(
            createElement("td", "", value || "—")
          );
        });

        const statusCell = createElement("td");
        statusCell.appendChild(createStatusBadge(node.status));
        row.appendChild(statusCell);

        row.appendChild(
          createElement("td", "", formatDate(node.last_checked_at))
        );

        const actionCell = createElement("td");

        actionCell.appendChild(
          createButton(
            "DETAILS",
            "button button-small",
            function () {
              state.selectedNode = node;
              renderNodeDetails(node);
            }
          )
        );

        actionCell.appendChild(
          createButton(
            "EDIT",
            "button button-small",
            function () {
              openNodeEditor(node);
            }
          )
        );

        if (node.node_key === CONFIG.monitoring.primaryNodeKey) {
          actionCell.appendChild(
            createButton(
              "CHECK",
              "button button-small",
              function () {
                checkNode(node.node_key);
              }
            )
          );
        } else {
          actionCell.appendChild(
            createElement(
              "span",
              "muted-inline",
              "MONITOR NOT CONFIGURED"
            )
          );
        }

        const statusSelect = document.createElement("select");
        statusSelect.className = "node-status-select";
        statusSelect.setAttribute("aria-label", "Node status");

        [
          "pending",
          "online",
          "offline",
          "maintenance",
          "unknown"
        ].forEach(function (status) {
          const option = document.createElement("option");

          option.value = status;
          option.textContent = status.toUpperCase();
          option.selected = status === node.status;

          statusSelect.appendChild(option);
        });

        actionCell.appendChild(statusSelect);

        actionCell.appendChild(
          createButton(
            "SET STATUS",
            "button button-small",
            function () {
              updateNodeStatus(node.id, statusSelect.value);
            }
          )
        );

        row.appendChild(actionCell);
        target.appendChild(row);
      });

      updateDashboardNodeMetrics();
    }
  
    /* =======================================================
       11. NODE CREATE / UPDATE
    ======================================================= */
  
    function setNodeFormValue(id, value) {
      const field = element(id);
  
      if (field) {
        field.value =
          value === null || value === undefined
            ? ""
            : String(value);
      }
    }
  
    function openNodeEditor(node = null) {
      if (!state.isAdmin) {
        setMessage(
          "Administrator verification required.",
          "warning"
        );
        return;
      }

      state.selectedNode = node;

      const form = element("node-form");
      if (form) form.reset();

      const errorTarget = element("node-form-error");
      if (errorTarget) {
        errorTarget.textContent = "";
        errorTarget.classList.add("hidden");
      }

      setText(
        "node-modal-title",
        node ? "EDIT NETWORK NODE" : "REGISTER NETWORK NODE"
      );

      setNodeFormValue("node-id", node?.id || "");
      setNodeFormValue("node-key", node?.node_key || "");
      setNodeFormValue("node-name", node?.name || "");
      setNodeFormValue("node-category", node?.category || "website");

      setNodeFormValue(
        "node-connection-type",
        node?.connection_type || "https"
      );

      setNodeFormValue(
        "node-endpoint",
        node?.endpoint_url || ""
      );

      setNodeFormValue("node-host", node?.host || "");
      setNodeFormValue("node-port", node?.port ?? "");

      setNodeFormValue(
        "node-description",
        node?.public_description || ""
      );

      const publicCheckbox = element("node-is-public");
      if (publicCheckbox) {
        publicCheckbox.checked = Boolean(node?.is_public);
      }

      const keyField = element("node-key");
      if (keyField) {
        keyField.disabled = false;
        keyField.readOnly = false;
      }
      
      const submit = element("node-save-button");
      if (submit) {
        submit.textContent = node
          ? "SAVE CHANGES"
          : "REGISTER NODE";
      }

      openModal("node-modal");
    }
  
    function readNodeForm() {
      const value = function (id) {
        return element(id)?.value.trim() || "";
      };
  
      return {
        id: value("node-id"),
        node_key: value("node-key"),
        name: value("node-name"),
        category: value("node-category"),
        connection_type: value("node-connection-type"),
        endpoint_url: value("node-endpoint"),
        host: value("node-host"),
        port: value("node-port"),
        public_description: value("node-description"),
        is_public: Boolean(
          element("node-is-public")?.checked
        )
      };
    }
  
    async function saveNode(event) {
      event.preventDefault();

      if (!state.isAdmin) {
        setMessage(
          "Administrator verification required.",
          "warning"
        );
        return;
      }

      const values = readNodeForm();
      const requestUserId = state.user?.id;
      const editing = Boolean(state.selectedNode);
      const submit = element("node-save-button");
      const errorTarget = element("node-form-error");

      function showFormError(message) {
        if (errorTarget) {
          errorTarget.textContent = message;
          errorTarget.classList.remove("hidden");
        }
        setMessage(message, "warning");
      }

      if (errorTarget) {
        errorTarget.textContent = "";
        errorTarget.classList.add("hidden");
      }

      if (!values.name) {
        showFormError("Node name is required.");
        return;
      }

      if (!editing && !/^[A-Za-z0-9_-]{3,64}$/.test(values.node_key)) {
        showFormError(
          "Node key must contain 3–64 letters, numbers, underscores or hyphens."
        );
        return;
      }

      if (
        values.endpoint_url &&
        !isValidHttpUrl(values.endpoint_url)
      ) {
        showFormError(
          "Endpoint URL must be a valid HTTP or HTTPS URL."
        );
        return;
      }

      if (
        values.port &&
        (
          !Number.isInteger(Number(values.port)) ||
          Number(values.port) < 1 ||
          Number(values.port) > 65535
        )
      ) {
        showFormError("Port must be between 1 and 65535.");
        return;
      }

      const payload = {
        name: values.name,
        category: values.category,
        connection_type: values.connection_type,
        endpoint_url: values.endpoint_url || "",
        host: values.host || "",
        port: values.port ? Number(values.port) : "",
        is_public: values.is_public,
        public_description: values.public_description || ""
      };

      if (editing) {
        payload.id = state.selectedNode.id;
      } else {
        payload.node_key = values.node_key;
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = "SAVING...";
      }

      try {
        await nodeManagerRequest(
          editing ? "update_node" : "create_node",
          payload
        );

        if (
          !state.isAdmin ||
          !requestUserId ||
          state.user?.id !== requestUserId
        ) {
          return;
        }

        closeModal("node-modal");

        setMessage(
          editing
            ? "Node updated successfully."
            : "Node registered successfully.",
          "success"
        );

        addEvent(
          editing ? "Node updated." : "New node registered.",
          "success"
        );

        await loadAdminNodes();

      } catch (error) {
        if (!state.isAdmin || state.user?.id !== requestUserId) {
          return;
        }

        logError("Save node", error);

        if (errorTarget) {
          errorTarget.textContent = getErrorMessage(error);
          errorTarget.classList.remove("hidden");
        }

        setMessage(
          "Node operation failed: " + getErrorMessage(error),
          "error"
        );

      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = editing
            ? "SAVE CHANGES"
            : "REGISTER NODE";
        }
      }
    }
  
    async function updateNodeStatus(id, status) {
      if (!state.isAdmin) return;
  
      if (!id) {
        setMessage("Node ID is missing.", "error");
        return;
      }
  
      const allowed = [
        "pending",
        "online",
        "offline",
        "maintenance",
        "unknown"
      ];
  
      if (!allowed.includes(status)) {
        setMessage("Invalid node status.", "warning");
        return;
      }
  
      try {
        await nodeManagerRequest(
          "set_node_status",
          { id, status }
        );
  
        setMessage("Node status updated.", "success");
  
        addEvent("Node status changed to " + status + ".", "info");
  
        await loadAdminNodes();
  
      } catch (error) {
        logError("Update node status", error);
  
        setMessage(
          "Status update failed: " + getErrorMessage(error),
          "error"
        );
      }
    }
  
    function initializeNodeManager() {
      const addButton = element("node-add-button");
  
      if (addButton) {
        addButton.addEventListener("click", function () {
          openNodeEditor(null);
        });
      }
  
      const form = element("node-form");
  
      if (form) {
        form.addEventListener("submit", saveNode);
      }
  
      const refreshButton = element("node-refresh-button");
  
      if (refreshButton) {
        refreshButton.addEventListener("click", loadAdminNodes);
      }
    }
  
  
    
    // =========================================================
    // 12. NODE MONITORING
    // BUILD 002 — VERIFIED RESPONSE CONTRACT
    // =========================================================

    async function checkNode(nodeKey) {
      if (!state.isAdmin || state.monitoringBusy) return;

      // -------------------------------------------------------
      // 12.1 EXPECTED NODE AND MONITOR CONFIGURATION
      // -------------------------------------------------------

      const expectedNodeKey =
        CONFIG.monitoring.primaryNodeKey;

      const expectedMonitorBuild =
        "APP-005 NODE MONITOR BUILD 002";

      if (nodeKey !== expectedNodeKey) {
        setMessage(
          "Only the approved primary node is configured for active monitoring.",
          "warning"
        );
        return;
      }

      if (
        !state.session?.access_token ||
        !state.user?.id
      ) {
        setMessage(
          "Administrator session is unavailable. Please sign in again.",
          "error"
        );
        return;
      }

      // Capture the current authenticated session.
      const requestUserId = state.user.id;
      const accessToken = state.session.access_token;

      state.monitoringBusy = true;

      setText("monitor-last-status", "CHECK IN PROGRESS");
      setText("monitor-check-result", "Checking primary node...");

      const button = element("check-node-button");

      if (button) {
        button.disabled = true;
      }

      try {
        // -----------------------------------------------------
        // 12.2 REQUEST NODE MONITORING
        // -----------------------------------------------------

        const result = await state.client.functions.invoke(
          CONFIG.supabase.functions.nodeMonitor,
          {
            body: {
              action: "check_node",
              payload: {
                node_key: expectedNodeKey
              }
            },
            headers: {
              Authorization: "Bearer " + accessToken
            }
          }
        );

        if (result.error) {
          throw result.error;
        }

        // -----------------------------------------------------
        // 12.3 VERIFY ADMINISTRATOR SESSION
        // -----------------------------------------------------

        if (
          !state.isAdmin ||
          state.user?.id !== requestUserId
        ) {
          return;
        }

        // -----------------------------------------------------
        // 12.4 VALIDATE BUILD 002 RESPONSE
        // -----------------------------------------------------

        const data = result.data;
        const monitored = data?.result;
        const database = data?.database;

        const monitoredStatus =
          String(monitored?.status || "").toLowerCase();

        if (
          !data ||
          data.success !== true ||
          data.monitor !== expectedMonitorBuild ||
          data.node_monitor_name !== expectedNodeKey ||
          data.node_key !== expectedNodeKey ||
          !monitored ||
          !["online", "offline", "unknown"].includes(
            monitoredStatus
          ) ||
          typeof monitored.response_ms !== "number" ||
          !Number.isFinite(monitored.response_ms) ||
          monitored.response_ms < 0 ||
          !database ||
          database.success !== true ||
          database.node_key !== expectedNodeKey
        ) {
          throw new Error(
            "Monitoring response did not match the verified BUILD 002 contract."
          );
        }

        // -----------------------------------------------------
        // 12.5 STORE VERIFIED MONITORING RESULT
        // -----------------------------------------------------

        state.monitorLastResult = {
          ...monitored,
          received_at: new Date().toISOString()
        };

        // -----------------------------------------------------
        // 12.6 UPDATE MONITORING INTERFACE
        // -----------------------------------------------------

        setText(
          "system-node-monitor-status",
          "RESPONDED"
        );

        setText(
          "monitor-last-status",
          monitoredStatus.toUpperCase()
        );

        setText(
          "monitor-response-time",
          formatDuration(monitored.response_ms)
        );

        setText(
          "monitor-check-result",
          "Recorded result received. HTTP " +
            (monitored.http_status ?? "—") +
            " · Error " +
            (monitored.error_code || "None")
        );

        setText(
          "health-monitoring",
          monitoredStatus.toUpperCase()
        );

        // -----------------------------------------------------
        // 12.7 CONFIRM SUCCESS
        // -----------------------------------------------------

        setMessage(
          "Node check completed and BUILD 002 confirmed the monitoring result and database recording.",
          "success"
        );

        addEvent(
          "Primary node monitoring check completed.",
          "success"
        );

        // -----------------------------------------------------
        // 12.8 REFRESH NODE HISTORY AND INVENTORY
        // -----------------------------------------------------

        await Promise.all([
          loadHistory(),
          loadAdminNodes()
        ]);

      } catch (error) {
        if (
          !state.isAdmin ||
          state.user?.id !== requestUserId
        ) {
          return;
        }

        logError("Node monitoring", error);

        setText(
          "monitor-last-status",
          "CHECK FAILED"
        );

        setText(
          "monitor-check-result",
          getErrorMessage(error)
        );

        setText(
          "health-monitoring",
          "UNAVAILABLE"
        );

        setText(
          "system-node-monitor-status",
          "REQUEST FAILED"
        );

        setMessage(
          "Node check failed: " + getErrorMessage(error),
          "error"
        );

      } finally {
        // -----------------------------------------------------
        // 12.9 RELEASE MONITORING LOCK
        // -----------------------------------------------------

        state.monitoringBusy = false;

        if (button) {
          button.disabled = !state.isAdmin;
        }
      }
    }

    // =========================================================
    // 12.10 INITIALIZE MONITORING CONTROLS
    // =========================================================

    function initializeMonitoring() {
      const checkButton = element("check-node-button");

      if (checkButton) {
        checkButton.addEventListener("click", function () {
          checkNode(CONFIG.monitoring.primaryNodeKey);
        });
      }

      const refreshButton = element("refresh-history-button");

      if (refreshButton) {
        refreshButton.addEventListener("click", loadHistory);
      }
    }

    // =========================================================
    // 12.11 UPDATE MONITORING SUMMARY
    // =========================================================

    function updateMonitoringSummary() {
      if (!CONFIG || !CONFIG.monitoring) return;

      setText(
        "monitor-node-name",
        CONFIG.monitoring.primaryNodeName
      );

      const node = state.nodes.find(function (item) {
        return item.node_key === CONFIG.monitoring.primaryNodeKey;
      });

      if (node) {
        setText(
          "monitor-last-status",
          node.status || "UNKNOWN"
        );

      } else if (!state.isAdmin) {
        setText(
          "monitor-last-status",
          "LOCKED"
        );

      } else {
        setText(
          "monitor-last-status",
          "NOT LOADED"
        );
      }
    }

  
    /* =======================================================
       13. PROTECTED MONITORING HISTORY
    ======================================================= */
  
    async function loadHistory() {
      if (!state.isAdmin) return;

      if (state.historyBusy) {
        state.historyRefreshQueued = true;
        return;
      }

      state.historyBusy = true;
      const requestUserId = state.user?.id;

      try {
        const result = await state.client.rpc(
          CONFIG.supabase.rpc.nodeHistory,
          {
            p_node_key: CONFIG.monitoring.primaryNodeKey,
            p_limit: CONFIG.monitoring.historyLimit
          }
        );

        if (
          !state.isAdmin ||
          !requestUserId ||
          state.user?.id !== requestUserId
        ) {
          return;
        }

        if (result.error) {
          throw result.error;
        }

        const data = result.data;

        const validEnvelope =
          data &&
          data.success === true &&
          data.node &&
          data.node.node_key === CONFIG.monitoring.primaryNodeKey &&
          Array.isArray(data.history) &&
          Number.isInteger(data.history_count) &&
          data.history_count === data.history.length;

        const validRecords = validEnvelope && data.history.every(function (record) {
          return (
            record &&
            typeof record === "object" &&
            ["online", "offline", "unknown", "maintenance"].includes(
              String(record.status || "").toLowerCase()
            ) &&
            typeof record.checked_at === "string" &&
            Number.isFinite(new Date(record.checked_at).getTime())
          );
        });

        if (!validRecords) {
          throw new Error(
            "History RPC response did not match the verified protected-history contract."
          );
        }

        state.history = data.history;
        renderHistory();

        setMessage(
          state.history.length + " protected monitoring records loaded.",
          "success"
        );

      } catch (error) {
        if (state.isAdmin && state.user?.id === requestUserId) {
          logError("Load monitoring history", error);

          state.history = [];
          renderHistory();

          setMessage(
            "Unable to retrieve protected history: " +
              getErrorMessage(error),
            "error"
          );
        }

      } finally {
        state.historyBusy = false;

        if (state.historyRefreshQueued && state.isAdmin) {
          state.historyRefreshQueued = false;
          Promise.resolve().then(loadHistory);
        }
      }
    }
  
    function renderHistory() {
      const monitorTarget = element("monitor-history-body");
      const historyTarget = element("network-history-body");

      [monitorTarget, historyTarget].forEach(clearElement);

      if (!state.isAdmin) return;

      function appendEmpty(target, columns) {
        if (!target) return;

        const row = createElement("tr");
        const cell = createElement(
          "td",
          "empty-cell",
          "No monitoring records available."
        );
        cell.colSpan = columns;
        row.appendChild(cell);
        target.appendChild(row);
      }

      if (state.history.length === 0) {
        appendEmpty(monitorTarget, 6);
        appendEmpty(historyTarget, 5);
        return;
      }

      state.history.forEach(function (record) {
        const status = String(record.status || "unknown").toLowerCase();
        const checked = formatDate(record.checked_at);
        const http = record.http_status ?? "—";
        const response = formatDuration(record.response_ms);
        const error = record.error_code || "—";

        if (monitorTarget) {
          const row = createElement("tr");

          [
            checked,
            CONFIG.monitoring.primaryNodeKey
          ].forEach(function (value) {
            row.appendChild(createElement("td", "", value));
          });

          const statusCell = createElement("td");
          statusCell.appendChild(createStatusBadge(status));
          row.appendChild(statusCell);

          [
            http,
            response,
            error
          ].forEach(function (value) {
            row.appendChild(createElement("td", "", value));
          });

          monitorTarget.appendChild(row);
        }

        if (historyTarget) {
          const row = createElement("tr");
          row.appendChild(createElement("td", "", checked));

          const statusCell = createElement("td");
          statusCell.appendChild(createStatusBadge(status));
          row.appendChild(statusCell);

          [
            http,
            response,
            error
          ].forEach(function (value) {
            row.appendChild(createElement("td", "", value));
          });

          historyTarget.appendChild(row);
        }
      });
    }
  
    function initializeHistory() {
      const refreshButton = element("history-refresh-button");
  
      if (refreshButton) {
        refreshButton.addEventListener("click", loadHistory);
      }
    }
  
    /* =======================================================
       14. PUBLIC TELEMETRY
    ======================================================= */
  
    function telemetrySources() {
      return [
        {
          name: "OVERVIEW",
          url: CONFIG.endpoints.overview
        },
        {
          name: "VISITORS",
          url: CONFIG.endpoints.visitors
        },
        {
          name: "TRAFFIC",
          url: CONFIG.endpoints.traffic
        },
        {
          name: "INDEXING",
          url: CONFIG.endpoints.indexing
        }
      ];
    }
  
    function updateTelemetrySourceRows(sources) {
      const target = element("telemetry-source-body");

      if (!target) return;

      clearElement(target);

      sources.forEach(function (source) {
        const row = createElement("tr");
        const sourceState = state.telemetrySourceState[source.name] || {};

        const status = !source.url
          ? "NOT CONFIGURED"
          : sourceState.status || "PENDING";

        const received = sourceState.receivedAt
          ? formatDate(sourceState.receivedAt)
          : "—";

        [
          source.name,
          source.url ? "CONFIGURED" : "NOT CONFIGURED",
          status,
          received
        ].forEach(function (value) {
          row.appendChild(createElement("td", "", value));
        });

        target.appendChild(row);
      });
    }
  
    async function fetchTelemetrySource(source) {
      if (!source.url) return null;
  
      if (!isValidHttpUrl(source.url)) {
        throw new Error(
          source.name + " endpoint is not a valid HTTP URL."
        );
      }
  
      const controller = new AbortController();
  
      const timeout = window.setTimeout(function () {
        controller.abort();
      }, CONFIG.requestTimeoutMs);
  
      try {
        const response = await fetch(source.url, {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          cache: "no-store",
          signal: controller.signal
        });
  
        if (!response.ok) {
          throw new Error(
            source.name + " returned HTTP " + response.status
          );
        }
  
        const contentType =
          response.headers.get("content-type") || "";
  
        if (!contentType.includes("application/json")) {
          throw new Error(
            source.name + " did not return JSON."
          );
        }
  
        const data = await response.json();
  
        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data)
        ) {
          throw new Error(
            source.name + " returned an invalid data structure."
          );
        }
  
        return data;
  
      } finally {
        window.clearTimeout(timeout);
      }
    }
  
    function renderPublicNodeSummary(nodes) {
      const target = element("dashboard-node-table");
      if (!target) return;

      clearElement(target);

      if (!Array.isArray(nodes) || nodes.length === 0) {
        const row = createElement("tr");
        const cell = createElement(
          "td",
          "empty-cell",
          "No public node summary supplied by the overview source."
        );
        cell.colSpan = 4;
        row.appendChild(cell);
        target.appendChild(row);
        return;
      }

      nodes.slice(0, 50).forEach(function (node) {
        if (!node || typeof node !== "object" || Array.isArray(node)) {
          return;
        }

        const row = createElement("tr");
        const name = typeof node.name === "string" ? node.name : "Unnamed node";
        const category =
          typeof node.category === "string"
            ? node.category
            : typeof node.type === "string"
              ? node.type
              : "—";
        const status = typeof node.status === "string"
          ? node.status.toLowerCase()
          : "unknown";
        const lastSeen = node.last_checked_at || node.lastSeen;

        row.appendChild(createElement("td", "", name));
        row.appendChild(createElement("td", "", category));

        const statusCell = createElement("td");
        statusCell.appendChild(createStatusBadge(status));
        row.appendChild(statusCell);

        row.appendChild(
          createElement("td", "", formatDate(lastSeen))
        );

        target.appendChild(row);
      });

      if (!target.children.length) {
        const row = createElement("tr");
        const cell = createElement(
          "td",
          "empty-cell",
          "Overview source returned no valid public node records."
        );
        cell.colSpan = 4;
        row.appendChild(cell);
        target.appendChild(row);
      }
    }

    function applyPublicTelemetry(data, sourceName) {
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
      ) {
        return;
      }

      /*
       * Public telemetry is deliberately isolated.
       * It must never update protected node inventory or history.
       */
      state.telemetryData = data;

      const metrics = data.metrics &&
        typeof data.metrics === "object" &&
        !Array.isArray(data.metrics)
          ? data.metrics
          : data;

      function setNumeric(id, value) {
        if (
          value !== null &&
          value !== undefined &&
          value !== "" &&
          Number.isFinite(Number(value)) &&
          Number(value) >= 0
        ) {
          setText(id, Number(value).toLocaleString());
        }
      }

      function applyVisitors() {
        setNumeric("metric-visitors", metrics.visitors);
        setNumeric("metric-sessions", metrics.sessions);
      }

      function applyTraffic() {
        setNumeric(
          "metric-requests",
          metrics.requestsPerMinute
        );

        const incoming = metrics.incomingBytesPerSecond;
        const outgoing = metrics.outgoingBytesPerSecond;

        if (
          incoming !== null &&
          incoming !== undefined &&
          Number.isFinite(Number(incoming))
        ) {
          setText(
            "telemetry-incoming",
            formatBytes(Number(incoming))
          );
        }

        if (
          outgoing !== null &&
          outgoing !== undefined &&
          Number.isFinite(Number(outgoing))
        ) {
          setText(
            "telemetry-outgoing",
            formatBytes(Number(outgoing))
          );
        }

        if (metrics.sampledAt) {
          setText(
            "traffic-source-status",
            "LIVE DATA · " + formatDate(metrics.sampledAt)
          );
        }

        updateTrafficSamples(metrics);
      }

      function applyIndexing() {
        setNumeric("metric-indexed-pages", metrics.indexedPages);

        if (metrics.crawlStatus) {
          setText(
            "telemetry-crawl-status",
            String(metrics.crawlStatus).slice(0, 80)
          );
        }
      }

      if (sourceName === "OVERVIEW") {
        applyVisitors();
        applyTraffic();
        applyIndexing();

        if (!state.isAdmin) {
          setNumeric(
            "metric-connected-nodes",
            metrics.connectedNodes
          );
          setNumeric(
            "metric-total-nodes",
            metrics.totalNodes
          );

          if (
            metrics.connectedNodes !== undefined ||
            metrics.totalNodes !== undefined
          ) {
            setText(
              "metric-connected-detail",
              "External overview telemetry"
            );
          }
        }

        const publicNodes = Array.isArray(metrics.nodes)
          ? metrics.nodes
          : data.nodes;

        if (Array.isArray(publicNodes)) {
          renderPublicNodeSummary(publicNodes);
        } else {
          renderPublicNodeSummary([]);
        }
      } else if (sourceName === "VISITORS") {
        applyVisitors();
      } else if (sourceName === "TRAFFIC") {
        applyTraffic();
      } else if (sourceName === "INDEXING") {
        applyIndexing();
      }
    }

    function formatBytes(value) {
      const number = Number(value);

      if (!Number.isFinite(number) || number < 0) {
        return "—";
      }

      const units = ["B/s", "KB/s", "MB/s", "GB/s"];
      let scaled = number;
      let unit = 0;

      while (scaled >= 1024 && unit < units.length - 1) {
        scaled /= 1024;
        unit++;
      }

      return scaled.toFixed(unit === 0 ? 0 : 1) + " " + units[unit];
    }

    function updateTrafficSamples(metrics) {
      const history = Array.isArray(metrics.history)
        ? metrics.history.slice(-60)
        : [];
      const seenTimestamps = new Set(
        state.trafficSamples.map(function (sample) {
          return sample.timestamp;
        })
      );

      history.forEach(function (sample) {
        const incoming =
          sample.incomingBytesPerSecond === null ||
          sample.incomingBytesPerSecond === undefined ||
          sample.incomingBytesPerSecond === ""
            ? NaN
            : Number(sample.incomingBytesPerSecond);

        const outgoing =
          sample.outgoingBytesPerSecond === null ||
          sample.outgoingBytesPerSecond === undefined ||
          sample.outgoingBytesPerSecond === ""
            ? NaN
            : Number(sample.outgoingBytesPerSecond);

        const validIncoming = Number.isFinite(incoming) && incoming >= 0;
        const validOutgoing = Number.isFinite(outgoing) && outgoing >= 0;

        if (!validIncoming && !validOutgoing) {
          return;
        }

        const timestamp = sample.sampledAt || new Date().toISOString();

        if (seenTimestamps.has(timestamp)) {
          return;
        }

        seenTimestamps.add(timestamp);

        state.trafficSamples.push({
          timestamp,
          incoming: validIncoming ? incoming : null,
          outgoing: validOutgoing ? outgoing : null
        });
      });

      {
        const incoming =
          metrics.incomingBytesPerSecond === null ||
          metrics.incomingBytesPerSecond === undefined ||
          metrics.incomingBytesPerSecond === ""
            ? NaN
            : Number(metrics.incomingBytesPerSecond);

        const outgoing =
          metrics.outgoingBytesPerSecond === null ||
          metrics.outgoingBytesPerSecond === undefined ||
          metrics.outgoingBytesPerSecond === ""
            ? NaN
            : Number(metrics.outgoingBytesPerSecond);

        const validIncoming = Number.isFinite(incoming) && incoming >= 0;
        const validOutgoing = Number.isFinite(outgoing) && outgoing >= 0;

        if (validIncoming || validOutgoing) {
          const timestamp = metrics.sampledAt || new Date().toISOString();

          if (!seenTimestamps.has(timestamp)) {
            state.trafficSamples.push({
              timestamp,
              incoming: validIncoming ? incoming : null,
              outgoing: validOutgoing ? outgoing : null
            });
          }
        }
      }

      state.trafficSamples = state.trafficSamples.slice(-60);
      drawTrafficChart();
    }

    function drawTrafficChart() {
      const canvas = element("traffic-chart");
      const empty = element("traffic-chart-empty");

      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 600));
      const height = 190;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = height + "px";

      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      context.strokeStyle = "rgba(116, 147, 170, 0.18)";
      context.lineWidth = 1;

      for (let index = 1; index <= 4; index++) {
        const y = index * height / 5;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const samples = state.trafficSamples;

      if (samples.length === 0) {
        if (empty) empty.classList.remove("hidden");
        setText("traffic-source-status", "NO MEASURED DATA");
        return;
      }

      if (empty) empty.classList.add("hidden");

      const values = samples
        .flatMap(function (sample) {
          return [sample.incoming, sample.outgoing];
        })
        .filter(function (value) {
          return value !== null && Number.isFinite(value);
        });

      const maximum = Math.max(1, ...values);

      [
        { key: "incoming", color: "#4ca5ff" },
        { key: "outgoing", color: "#39c98a" }
      ].forEach(function (series) {
        context.beginPath();

        let started = false;

        samples.forEach(function (sample, index) {
          const value = sample[series.key];

          if (value === null || !Number.isFinite(value)) {
            started = false;
            return;
          }

          const x = samples.length === 1
            ? width / 2
            : index / (samples.length - 1) * width;

          const y = height - 12 - (value / maximum) * (height - 25);

          if (!started) {
            context.moveTo(x, y);
            started = true;
          } else {
            context.lineTo(x, y);
          }
        });

        context.strokeStyle = series.color;
        context.lineWidth = 2;
        context.stroke();
      });

      setText("traffic-source-status", "MEASURED DATA");
    }
  
    async function refreshTelemetry() {
      if (state.telemetryBusy) return;

      state.telemetryBusy = true;

      const sources = telemetrySources();
      const configured = sources.filter(function (source) {
        return Boolean(source.url);
      });

      if (configured.length === 0) {
        state.telemetryLastError =
          "No external telemetry endpoints configured.";

        updateTelemetrySourceRows(sources);

        setText("health-telemetry", "NOT CONFIGURED");
        setText("system-telemetry-status", "NOT CONFIGURED");
        setText("telemetry-crawl-status", "NOT CONFIGURED");
        setText("telemetry-incoming", "—");
        setText("telemetry-outgoing", "—");
        setText("traffic-source-status", "NOT CONFIGURED");

        state.trafficSamples = [];
        drawTrafficChart();

        state.telemetryBusy = false;
        return;
      }

      try {
        const results = await Promise.allSettled(
          configured.map(fetchTelemetrySource)
        );

        let successCount = 0;

        results.forEach(function (result, index) {
          const source = configured[index];

          if (
            result.status === "fulfilled" &&
            result.value
          ) {
            successCount++;

            state.telemetrySourceState[source.name] = {
              status: "ONLINE",
              receivedAt: new Date().toISOString()
            };

            applyPublicTelemetry(result.value, source.name);

          } else {
            state.telemetrySourceState[source.name] = {
              status: "OFFLINE",
              receivedAt:
                state.telemetrySourceState[source.name]?.receivedAt || null
            };

            if (result.status === "rejected") {
              logError(
                "Telemetry source " + source.name,
                result.reason
              );
            }
          }
        });

        updateTelemetrySourceRows(sources);

        if (successCount > 0) {
          state.telemetryLastSuccess = new Date();
          state.telemetryLastError = null;

          setText(
            "health-telemetry",
            successCount === configured.length
              ? "CONNECTED"
              : "PARTIAL"
          );

          setText(
            "system-telemetry-status",
            successCount + " / " + configured.length + " SOURCES ONLINE"
          );

        } else {
          throw new Error(
            "No configured telemetry source returned valid data."
          );
        }

      } catch (error) {
        state.telemetryLastError = getErrorMessage(error);

        logError("Telemetry refresh", error);

        updateTelemetrySourceRows(sources);
        setText("health-telemetry", "SOURCE UNAVAILABLE");
        setText("system-telemetry-status", "SOURCE UNAVAILABLE");

      } finally {
        state.telemetryBusy = false;
      }
    }
  
    function initializeTelemetry() {
      updateTelemetrySourceRows(telemetrySources());

      setText(
        "health-telemetry",
        "NOT CONFIGURED"
      );

      setText(
        "health-analytics",
        "REPORTING NOT CONNECTED"
      );

      drawTrafficChart();
      window.addEventListener("resize", drawTrafficChart);

      /*
       * No telemetry endpoints are configured in the
       * supplied config. No external source is invented.
       */
      if (
        telemetrySources().some(function (source) {
          return Boolean(source.url);
        })
      ) {
        refreshTelemetry();
      }
    }
  
    /* =======================================================
       15. LOCAL EVENT MANAGER
    ======================================================= */
  
    function renderEvents() {
      const target = element("event-list");
  
      if (!target) return;
  
      clearElement(target);
  
      if (state.events.length === 0) {
        target.appendChild(
          createElement(
            "div",
            "event-item",
            "No local events recorded in this session."
          )
        );
  
        return;
      }
  
      state.events.forEach(function (event) {
        const item = createElement("div", "event-item");
  
        item.appendChild(
          createElement(
            "strong",
            "",
            event.type.toUpperCase()
          )
        );
  
        item.appendChild(
          createElement("p", "", event.message)
        );
  
        item.appendChild(
          createElement(
            "small",
            "",
            formatDate(event.timestamp)
          )
        );
  
        target.appendChild(item);
      });
    }
  
    function initializeEvents() {
      const clearButton = element("clear-local-events-button");
  
      if (clearButton) {
        clearButton.addEventListener("click", function () {
          state.events = [];
          renderEvents();
  
          addEvent(
            "Local event list cleared.",
            "info"
          );
        });
      }
  
      addEvent(
        "APP-005 NETWORK application initialized.",
        "success"
      );
    }
  
    /* =======================================================
       16. ANALYTICS STATUS
    ======================================================= */
  
    function initializeAnalytics() {
      setText(
        "analytics-measurement-id",
        CONFIG.analytics.measurementId || "NOT CONFIGURED"
      );
  
      setText(
        "analytics-connection-status",
        "REPORTING NOT CONNECTED"
      );
  
      setText(
        "analytics-last-report",
        "NOT AVAILABLE"
      );
  
      setText(
        "analytics-tag-status",
        CONFIG.analytics.measurementId
          ? "MEASUREMENT ID CONFIGURED"
          : "NOT CONFIGURED"
      );
  
      setText(
        "health-analytics",
        "REPORTING NOT CONNECTED"
      );
    }
  
    /* =======================================================
       17. SYSTEM CONTROL
    ======================================================= */
  
    function initializeSystemControl() {
      setText(
        "system-build-value",
        CONFIG.build
      );

      setText(
        "system-browser",
        navigator.userAgent
      );

      setText(
        "system-secure-context",
        window.isSecureContext ? "SECURE CONTEXT" : "NOT SECURE"
      );

      setText(
        "system-last-refresh",
        new Date().toLocaleString()
      );

      setText(
        "system-sw-status",
        "CHECKING"
      );

      setText(
        "system-node-manager-status",
        "CONFIGURED — NOT PROBED"
      );

      setText(
        "system-node-monitor-status",
        "CONFIGURED — NOT PROBED"
      );

      setText(
        "health-monitoring",
        "ADMIN CHECK REQUIRED"
      );

      setText(
        "system-telemetry-status",
        "NOT CONFIGURED"
      );

      setText(
        "system-ga4-status",
        "REPORTING NOT CONNECTED"
      );

      window.addEventListener("online", function () {
        setText("system-status-text", "BROWSER ONLINE");
      });

      window.addEventListener("offline", function () {
        setText("system-status-text", "BROWSER OFFLINE");
      });
    }
  
    /* =======================================================
       18. DASHBOARD REFRESH
    ======================================================= */
  
    function refreshDashboard() {
      setText(
        "dashboard-last-update",
        new Date().toLocaleString()
      );
  
      setText(
        "system-last-refresh",
        new Date().toLocaleString()
      );
  
      if (state.isAdmin) {
        loadAdminNodes();
        loadHistory();
      }
  
      refreshTelemetry();
    }
  
    function initializeRefreshControls() {
      const refreshButton = element("refresh-all-button");
  
      if (refreshButton) {
        refreshButton.addEventListener(
          "click",
          refreshDashboard
        );
      }
  
      state.refreshTimer = window.setInterval(
        function () {
          if (document.hidden) return;
  
          if (state.isAdmin) {
            loadAdminNodes();
          }
  
          refreshTelemetry();
        },
        CONFIG.refreshIntervalMs
      );
  
      document.addEventListener(
        "visibilitychange",
        function () {
          if (!document.hidden) {
            refreshDashboard();
          }
        }
      );
    }
  
    /* =======================================================
       19. PWA / SERVICE WORKER
    ======================================================= */
  
    function initializePWA() {
      if (
        !CONFIG.installation.serviceWorkerEnabled ||
        !("serviceWorker" in navigator)
      ) {
        setText(
          "system-sw-status",
          "NOT AVAILABLE"
        );
  
        return;
      }
  
      window.addEventListener("load", function () {
        navigator.serviceWorker.register(
          CONFIG.installation.serviceWorker
        ).then(function () {
          setText(
            "system-sw-status",
            "REGISTERED"
          );
        }).catch(function (error) {
          logError("Service worker registration", error);
  
          setText(
            "system-sw-status",
            "REGISTRATION FAILED"
          );
        });
      });
    }
  
    /* =======================================================
       20. APPLICATION INITIALIZATION
    ======================================================= */
  
    function initializeApplication() {
      if (state.initialized) return;
  
      state.initialized = true;
  
      try {
        if (!CONFIG) {
          throw new Error(
            "PI220_NETWORK_CONFIG was not loaded."
          );
        }
  
        updateApplicationStatus(
          "INITIALIZING",
          "Loading PI220 network services."
        );
  
        initializeSupabase();
  
        initializeNavigation();
        initializeModals();
  
        initializeNodeManager();
        initializeMonitoring();
        initializeHistory();
  
        initializeEvents();
        initializeAnalytics();
        initializeSystemControl();
  
        initializeRefreshControls();
        initializePWA();
  
        updateAdministratorInterface();
  
        initializeAuthentication();
        initializeTelemetry();
  
        navigate("dashboard");
  
        updateApplicationStatus(
          "READY",
          "Interface initialized. Backend authorization, monitoring and telemetry are reported separately."
        );
  
        console.info(
          "[APP-005] NETWORK APPLICATION ENGINE READY",
          CONFIG.build
        );
  
      } catch (error) {
        logError("Application initialization", error);
  
        updateApplicationStatus(
          "INITIALIZATION ERROR",
          getErrorMessage(error)
        );
  
        setMessage(
          "APP-005 initialization failed: " +
          getErrorMessage(error),
          "error"
        );
      }
    }
  
    /* =======================================================
       21. START APPLICATION
    ======================================================= */
  
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        initializeApplication,
        { once: true }
      );
    } else {
      initializeApplication();
    }
  
  })();
  