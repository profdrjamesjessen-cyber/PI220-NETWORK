
/*
 * ============================================================
 * PI220 — APP-005 NETWORK
 * MODULE: SENTIENT-001
 * FILE: js/sentient.js
 * BUILD: 003 — ISOLATED RECOVERY VERSION
 * ============================================================
 *
 * PROVIDER: GROQ
 * MODEL: openai/gpt-oss-120b
 *
 * DESIGN:
 * - Isolated frontend module.
 * - No changes to APP-005 core state.
 * - No changes to APP-005 navigation.
 * - No global polling.
 * - No direct authentication manipulation.
 * - No service-role or provider secrets.
 *
 * DEPENDENCY:
 * window.PI220_SENTIENT_BRIDGE.getAccess()
 *
 * Approved bridge contract:
 * {
 *   client: authenticatedSupabaseClient,
 *   userId: verifiedAdministratorUserId
 * }
 *
 * The bridge must only return access after APP-005 has
 * completed its existing backend administrator verification.
 *
 * RPC:
 * app005_sentient_submit_task
 * app005_sentient_get_task
 * ============================================================
 */

(() => {
  "use strict";

  const BUILD = "003";

  /*
   * Prevent duplicate module registration.
   * Do not overwrite an existing module.
   */

  if (window.PI220_SENTIENT?.build === BUILD) {
    return;
  }

  const SETTINGS = Object.freeze({
    provider: "groq",
    model: "openai/gpt-oss-120b",

    submitRpc: "app005_sentient_submit_task",
    getRpc: "app005_sentient_get_task",

    pollInterval: 2500,
    timeout: 600000,

    maxPromptLength: 12000,
    maxResponseLength: 32000
  });

  const state = {
    initialized: false,
    active: false,
    taskId: null,
    pollTimer: null,
    timeoutTimer: null,
    root: null,
    elements: null,
    messages: []
  };

  /* =========================================================
     01. SAFE ACCESS
  ========================================================= */

  function getAccess() {
    try {
      const bridge = window.PI220_SENTIENT_BRIDGE;

      if (
        !bridge ||
        typeof bridge.getAccess !== "function"
      ) {
        return null;
      }

      const access = bridge.getAccess();

      if (
        !access ||
        !access.client ||
        typeof access.client.rpc !== "function" ||
        typeof access.userId !== "string" ||
        !access.userId.trim()
      ) {
        return null;
      }

      return access;

    } catch (error) {
      console.error(
        "[SENTIENT-001] Access bridge unavailable:",
        error
      );

      return null;
    }
  }

  function hasAccess() {
    return Boolean(getAccess());
  }

  /* =========================================================
     02. DOM DISCOVERY
  ========================================================= */

  function findElement(ids, root = document) {
    for (const id of ids) {
      const element = root.querySelector("#" + id);

      if (element) return element;
    }

    return null;
  }

  function discoverInterface() {
    const root = document.getElementById("view-sentient");

    if (!root) return null;

    const elements = {
      root,

      lock: findElement(
        ["sentient-admin-lock"],
        root
      ),

      content: findElement(
        ["sentient-admin-content"],
        root
      ),

      chat: findElement(
        ["sentient-chat"],
        root
      ),

      form: findElement(
        ["sentient-form"],
        root
      ),

      input: findElement(
        ["sentient-prompt", "sentient-input"],
        root
      ),

      submit: findElement(
        ["sentient-submit"],
        root
      ),

      status: findElement(
        ["sentient-status"],
        root
      ),

      clear: findElement(
        ["sentient-clear"],
        root
      )
    };

    if (
      !elements.chat ||
      !elements.form ||
      !elements.input
    ) {
      console.error(
        "[SENTIENT-001] Required interface elements are missing."
      );

      return null;
    }

    return elements;
  }

  /* =========================================================
     03. INTERFACE CONTROL
  ========================================================= */

  function setStatus(message, type = "info") {
    if (!state.elements?.status) return;

    state.elements.status.textContent = String(message);
    state.elements.status.dataset.status = type;
  }

  function setEnabled(enabled) {
    const elements = state.elements;

    if (!elements) return;

    if (elements.input) {
      elements.input.disabled = !enabled;
    }

    if (elements.submit) {
      elements.submit.disabled = !enabled;
    }
  }

  function showAccessState(authorized) {
    const elements = state.elements;

    if (!elements) return;

    if (elements.lock) {
      elements.lock.classList.toggle(
        "hidden",
        authorized
      );
    }

    if (elements.content) {
      elements.content.classList.toggle(
        "hidden",
        !authorized
      );
    }

    setEnabled(authorized && !state.active);

    setStatus(
      authorized
        ? "TASK CHANNEL READY"
        : "ADMINISTRATOR ACCESS REQUIRED",
      authorized ? "ready" : "locked"
    );
  }

  /* =========================================================
     04. SAFE MESSAGE RENDERING
  ========================================================= */

  function addMessage(role, content, metadata = {}) {
    const chat = state.elements?.chat;

    if (!chat) return;

    const article = document.createElement("article");

    article.className =
      "sentient-message sentient-message-" + role;

    const heading = document.createElement("div");

    heading.className = "sentient-message-label";

    heading.textContent =
      role === "user"
        ? "YOU"
        : role === "assistant"
          ? "SENTIENT-001"
          : "SYSTEM";

    const body = document.createElement("div");

    body.className = "sentient-message-content";

    /*
     * Never interpret user prompts or model responses as HTML.
     */

    body.textContent = String(content ?? "");

    article.append(heading, body);

    if (metadata.provider || metadata.model) {
      const info = document.createElement("div");

      info.className = "sentient-message-metadata";

      info.textContent =
        `${metadata.provider || SETTINGS.provider} • ` +
        `${metadata.model || SETTINGS.model}`;

      article.appendChild(info);
    }

    const timestamp = document.createElement("time");

    timestamp.className = "sentient-message-time";
    timestamp.dateTime = new Date().toISOString();
    timestamp.textContent = new Date().toLocaleTimeString();

    article.appendChild(timestamp);

    chat.appendChild(article);

    chat.scrollTop = chat.scrollHeight;

    state.messages.push({
      role,
      content: String(content ?? ""),
      timestamp: Date.now()
    });
  }

  /* =========================================================
     05. RESULT NORMALIZATION
  ========================================================= */

  function normalizeTask(data) {
    if (Array.isArray(data)) {
      return data[0] || null;
    }

    if (data && typeof data === "object") {
      return data;
    }

    return null;
  }

  function normalizeTaskId(data) {
    if (typeof data === "string") {
      return data;
    }

    if (Array.isArray(data)) {
      const first = data[0];

      if (typeof first === "string") {
        return first;
      }

      if (first && typeof first === "object") {
        return first.task_id || first.id || null;
      }
    }

    if (data && typeof data === "object") {
      return data.task_id || data.id || null;
    }

    return null;
  }

  function validUuid(value) {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
  }

  /* =========================================================
     06. TIMER CONTROL
  ========================================================= */

  function clearTimers() {
    if (state.pollTimer !== null) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }

    if (state.timeoutTimer !== null) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
    }
  }

  function finishTask() {
    clearTimers();

    state.active = false;
    state.taskId = null;

    setEnabled(hasAccess());
  }

  /* =========================================================
     07. ACCESS REVOCATION
  ========================================================= */

  function revokeAccess() {
    finishTask();

    state.messages = [];

    if (state.elements?.chat) {
      state.elements.chat.replaceChildren();
    }

    if (state.elements?.input) {
      state.elements.input.value = "";
    }

    showAccessState(false);
  }

  /* =========================================================
     08. TASK SUBMISSION
  ========================================================= */

  async function submit(prompt) {
    if (state.active) {
      setStatus("TASK ALREADY RUNNING", "warning");
      return;
    }

    const access = getAccess();

    if (!access) {
      revokeAccess();
      return;
    }

    const cleanPrompt = String(prompt ?? "").trim();

    if (!cleanPrompt) {
      setStatus("ENTER A MESSAGE", "warning");
      return;
    }

    if (cleanPrompt.length > SETTINGS.maxPromptLength) {
      setStatus(
        "PROMPT LIMIT: " + SETTINGS.maxPromptLength,
        "warning"
      );
      return;
    }

    state.active = true;

    setEnabled(false);

    addMessage("user", cleanPrompt);

    setStatus("SUBMITTING TASK", "working");

    try {
      const { data, error } = await access.client.rpc(
        SETTINGS.submitRpc,
        {
          p_prompt: cleanPrompt
        }
      );

      if (error) throw error;

      if (!hasAccess()) {
        revokeAccess();
        return;
      }

      const taskId = normalizeTaskId(data);

      if (!validUuid(taskId)) {
        throw new Error("Invalid task identifier returned.");
      }

      state.taskId = taskId;

      setStatus(
        "TASK ACCEPTED — WAITING FOR SENTIENT-001",
        "working"
      );

      state.timeoutTimer = setTimeout(() => {
        if (!state.active) return;

        addMessage(
          "system",
          "Task waiting period expired. Check the node runtime and backend task status."
        );

        setStatus("TASK TIMEOUT", "warning");

        finishTask();

      }, SETTINGS.timeout);

      await poll();

    } catch (error) {
      console.error(
        "[SENTIENT-001] Submission error:",
        error
      );

      addMessage(
        "system",
        "SUBMISSION FAILED: " +
          (error?.message || "Unknown error")
      );

      setStatus("SUBMISSION FAILED", "error");

      finishTask();
    }
  }

  /* =========================================================
     09. TASK POLLING
  ========================================================= */

  async function poll() {
    if (!state.active || !state.taskId) return;

    const access = getAccess();

    if (!access) {
      revokeAccess();
      return;
    }

    try {
      const { data, error } = await access.client.rpc(
        SETTINGS.getRpc,
        {
          p_task_id: state.taskId
        }
      );

      if (error) throw error;

      if (!hasAccess()) {
        revokeAccess();
        return;
      }

      const task = normalizeTask(data);

      if (!task) {
        throw new Error("Task information unavailable.");
      }

      switch (task.status) {

        case "pending":
          setStatus("TASK QUEUED", "working");
          schedulePoll();
          return;

        case "claimed":
          setStatus("SENTIENT-001 PROCESSING", "working");
          schedulePoll();
          return;

        case "completed": {
          const response = String(
            task.response ?? ""
          ).trim();

          if (!response) {
            throw new Error("Empty task response.");
          }

          if (response.length > SETTINGS.maxResponseLength) {
            throw new Error("Response exceeds configured limit.");
          }

          addMessage("assistant", response, {
            provider: task.provider,
            model: task.model
          });

          if (
            task.provider !== SETTINGS.provider ||
            task.model !== SETTINGS.model
          ) {
            setStatus(
              "RESPONSE RECEIVED — PROVIDER CHECK REQUIRED",
              "warning"
            );
          } else {
            setStatus("RESPONSE RECEIVED", "ready");
          }

          finishTask();
          return;
        }

        case "failed":
          addMessage(
            "system",
            "TASK FAILED: " +
              (task.last_error || "No failure details available.")
          );

          setStatus("TASK FAILED", "error");

          finishTask();
          return;

        default:
          throw new Error(
            "Unknown task status: " + String(task.status)
          );
      }

    } catch (error) {
      console.error(
        "[SENTIENT-001] Polling error:",
        error
      );

      addMessage(
        "system",
        "TASK CHECK FAILED: " +
          (error?.message || "Unknown error")
      );

      setStatus("TASK CHECK FAILED", "error");

      finishTask();
    }
  }

  function schedulePoll() {
    if (state.pollTimer !== null) {
      clearTimeout(state.pollTimer);
    }

    state.pollTimer = setTimeout(() => {
      state.pollTimer = null;
      poll();
    }, SETTINGS.pollInterval);
  }

  /* =========================================================
     10. LOCAL INTERFACE EVENTS
  ========================================================= */

  function handleSubmit(event) {
    event.preventDefault();

    if (!hasAccess()) {
      revokeAccess();
      return;
    }

    const input = state.elements?.input;

    if (!input) return;

    const prompt = input.value;

    input.value = "";

    submit(prompt);
  }

  function handleClear() {
    if (!hasAccess()) {
      revokeAccess();
      return;
    }

    if (state.active) {
      setStatus(
        "CANNOT CLEAR WHILE TASK IS RUNNING",
        "warning"
      );

      return;
    }

    state.messages = [];

    state.elements.chat.replaceChildren();

    setStatus("TASK CHANNEL READY", "ready");
  }

  function initializeEvents() {
    const elements = state.elements;

    elements.form.addEventListener(
      "submit",
      handleSubmit
    );

    if (elements.clear) {
      elements.clear.addEventListener(
        "click",
        handleClear
      );
    }

    /*
     * Listen only for APP-005 administrator access changes.
     * No APP-005 state is modified.
     */

    window.addEventListener(
      "pi220:admin-access",
      () => {
        if (hasAccess()) {
          showAccessState(true);
        } else {
          revokeAccess();
        }
      }
    );
  }

  /* =========================================================
     11. INITIALIZATION
  ========================================================= */

  function initialize() {
    if (state.initialized) return false;

    /*
     * If the SENTIENT section is absent, exit quietly.
     * APP-005 continues normally.
     */

    const elements = discoverInterface();

    if (!elements) {
      return false;
    }

    state.root = elements.root;
    state.elements = elements;

    initializeEvents();

    state.initialized = true;

    if (hasAccess()) {
      showAccessState(true);

      addMessage(
        "system",
        "SENTIENT-001 BUILD 003 initialized. Administrator access verified by APP-005."
      );

    } else {
      showAccessState(false);
    }

    console.info(
      "[SENTIENT-001] BUILD 003 initialized."
    );

    return true;
  }

  /* =========================================================
     12. SAFE PUBLIC INTERFACE
  ========================================================= */

  window.PI220_SENTIENT = Object.freeze({
    build: BUILD,

    initialize,

    getStatus() {
      return Object.freeze({
        build: BUILD,
        initialized: state.initialized,
        active: state.active,
        taskId: state.taskId
      });
    },

    revokeAccess
  });

  /*
   * No automatic timers.
   * No background polling.
   * No changes to APP-005.
   *
   * APP-005 may explicitly call:
   * window.PI220_SENTIENT.initialize()
   */

  console.info(
    "[SENTIENT-001] BUILD 003 module loaded — awaiting explicit initialization."
  );

})();
