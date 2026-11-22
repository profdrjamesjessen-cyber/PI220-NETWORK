
/*
 * PI220 — APP-005 NETWORK
 * MODULE: SENTIENT-001
 * FILE: js/sentient.js
 * BUILD: 002
 *
 * PROVIDER: GROQ
 * MODEL: openai/gpt-oss-120b
 *
 * BUILD 002 CORRECTIONS:
 * - Accepts the approved APP-005 bridge contract:
 *   { client, userId }
 * - Does not require an additional isAdmin property.
 * - Uses sentient-prompt as the primary input ID.
 * - Supports sentient-input as a compatibility fallback.
 * - Handles administrator access changes.
 * - Waits for the APP-005 bridge to become available.
 * - Prevents duplicate initialization and task submission.
 *
 * SECURITY:
 * - APP-005 remains the authority for administrator access.
 * - No service-role key is exposed.
 * - No Groq API key is exposed.
 * - All task operations use authenticated Supabase RPCs.
 * - User and model content is inserted using textContent.
 *
 * PERSISTENCE:
 * - Conversation display is browser-session memory only.
 * - Task and response records are retrieved through APP-005 RPCs.
 */

(() => {
  "use strict";

  if (window.PI220_SENTIENT?.build === "002") {
    return;
  }

  const CONFIG = window.PI220_NETWORK_CONFIG;

  const SETTINGS = Object.freeze({
    build: "002",
    nodeKey: "sentient-001",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    pollIntervalMs: 2500,
    taskTimeoutMs: 600000,
    maximumPromptLength: 12000,
    maximumResponseLength: 32000,
    bridgeRetryMs: 500
  });

  const TASK_STATUS = Object.freeze({
    PENDING: "pending",
    CLAIMED: "claimed",
    COMPLETED: "completed",
    FAILED: "failed"
  });

  const state = {
    initialized: false,
    eventsInitialized: false,
    active: false,
    taskId: null,
    startedAt: 0,
    pollTimer: null,
    timeoutTimer: null,
    bridgeTimer: null,
    messages: [],
    elements: null,
    accessReady: false
  };

  /* -------------------------------------------------------
     01. APP-005 ACCESS BRIDGE
  ------------------------------------------------------- */

  function getBridge() {
    return window.PI220_SENTIENT_BRIDGE || null;
  }

  function getAccess() {
    const bridge = getBridge();

    if (!bridge || typeof bridge.getAccess !== "function") {
      return null;
    }

    try {
      const access = bridge.getAccess();

      /*
       * The bridge itself is the administrator verification
       * boundary. It returns an access object only when the
       * APP-005 administrator session is verified.
       *
       * Approved contract:
       * { client, userId }
       */

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
        "[SENTIENT-001] Administrator bridge error:",
        error
      );

      return null;
    }
  }

  function hasAccess() {
    return Boolean(getAccess());
  }

  /* -------------------------------------------------------
     02. CONFIGURATION
  ------------------------------------------------------- */

  function getRpcNames() {
    const rpc = CONFIG?.supabase?.rpc || {};

    return {
      submit:
        rpc.sentientSubmitTask ||
        "app005_sentient_submit_task",

      get:
        rpc.sentientGetTask ||
        "app005_sentient_get_task"
    };
  }

  /* -------------------------------------------------------
     03. INTERFACE ELEMENTS
  ------------------------------------------------------- */

  function firstElement(ids) {
    for (const id of ids) {
      const node = document.getElementById(id);

      if (node) return node;
    }

    return null;
  }

  function getElements() {
    return {
      root: firstElement([
        "view-sentient"
      ]),

      lock: firstElement([
        "sentient-admin-lock"
      ]),

      content: firstElement([
        "sentient-admin-content"
      ]),

      chat: firstElement([
        "sentient-chat"
      ]),

      form: firstElement([
        "sentient-form"
      ]),

      input: firstElement([
        "sentient-prompt",
        "sentient-input"
      ]),

      submit: firstElement([
        "sentient-submit"
      ]),

      status: firstElement([
        "sentient-status"
      ]),

      clear: firstElement([
        "sentient-clear"
      ])
    };
  }

  function refreshElements() {
    state.elements = getElements();
    return state.elements;
  }

  /* -------------------------------------------------------
     04. INTERFACE STATE
  ------------------------------------------------------- */

  function setStatus(message, type = "info") {
    const target = state.elements?.status;

    if (!target) return;

    target.textContent = String(message);
    target.dataset.status = type;
  }

  function setVisible(target, visible) {
    if (!target) return;

    target.classList.toggle("hidden", !visible);
    target.setAttribute("aria-hidden", String(!visible));
  }

  function setFormEnabled(enabled) {
    const elements = state.elements;

    if (!elements) return;

    if (elements.input) {
      elements.input.disabled = !enabled;
    }

    if (elements.submit) {
      elements.submit.disabled = !enabled;
    }
  }

  function updateAccessInterface(authorized) {
    const elements = state.elements;

    if (!elements) return;

    setVisible(elements.lock, !authorized);
    setVisible(elements.content, authorized);

    setFormEnabled(authorized && !state.active);

    state.accessReady = authorized;

    if (authorized) {
      setStatus("TASK CHANNEL READY", "ready");
    } else {
      setStatus(
        "APP-005 ADMINISTRATOR VERIFICATION REQUIRED",
        "locked"
      );
    }
  }

  /* -------------------------------------------------------
     05. MESSAGE RENDERING
  ------------------------------------------------------- */

  function appendMessage(role, content, metadata = {}) {
    const chat = state.elements?.chat;

    if (!chat) return;

    const article = document.createElement("article");

    article.className =
      `sentient-message sentient-message-${role}`;

    const label = document.createElement("div");

    label.className = "sentient-message-label";

    if (role === "user") {
      label.textContent = "YOU";
    } else if (role === "assistant") {
      label.textContent = "SENTIENT-001";
    } else {
      label.textContent = "SYSTEM";
    }

    const body = document.createElement("div");

    body.className = "sentient-message-content";
    body.textContent = String(content ?? "");

    article.append(label, body);

    if (metadata.provider || metadata.model) {
      const details = document.createElement("div");

      details.className = "sentient-message-metadata";

      details.textContent =
        `${metadata.provider || SETTINGS.provider} • ` +
        `${metadata.model || SETTINGS.model}`;

      article.appendChild(details);
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

  /* -------------------------------------------------------
     06. RESPONSE NORMALIZATION
  ------------------------------------------------------- */

  function normalizeTaskData(data) {
    if (Array.isArray(data)) {
      return data.length ? data[0] : null;
    }

    if (data && typeof data === "object") {
      return data;
    }

    return null;
  }

  function normalizeSubmitResult(data) {
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

  function isValidUuid(value) {
    return (
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
  }

  /* -------------------------------------------------------
     07. TASK TIMER MANAGEMENT
  ------------------------------------------------------- */

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
    state.startedAt = 0;

    setFormEnabled(hasAccess());
  }

  /* -------------------------------------------------------
     08. ACCESS REVOCATION
  ------------------------------------------------------- */

  function revokeAccess() {
    finishTask();

    state.messages = [];
    state.accessReady = false;

    if (state.elements?.chat) {
      state.elements.chat.replaceChildren();
    }

    if (state.elements?.input) {
      state.elements.input.value = "";
    }

    updateAccessInterface(false);
  }

  function clearConversation() {
    if (!hasAccess()) {
      revokeAccess();
      return;
    }

    /*
     * Do not cancel a task on the server when clearing the
     * local conversation display.
     */
    if (state.active) {
      setStatus(
        "TASK RUNNING — CLEARING IS DISABLED",
        "warning"
      );
      return;
    }

    state.messages = [];

    if (state.elements?.chat) {
      state.elements.chat.replaceChildren();
    }

    if (state.elements?.input) {
      state.elements.input.value = "";
    }

    setStatus("TASK CHANNEL READY", "ready");
  }

  /* -------------------------------------------------------
     09. TASK SUBMISSION
  ------------------------------------------------------- */

  async function submitTask(prompt) {
    const access = getAccess();

    if (!access) {
      revokeAccess();
      return;
    }

    if (state.active) {
      setStatus("A TASK IS ALREADY RUNNING", "warning");
      return;
    }

    const cleanPrompt = String(prompt ?? "").trim();

    if (!cleanPrompt) {
      setStatus("ENTER A MESSAGE", "warning");
      return;
    }

    if (cleanPrompt.length > SETTINGS.maximumPromptLength) {
      setStatus(
        `MESSAGE LIMIT: ${SETTINGS.maximumPromptLength} CHARACTERS`,
        "warning"
      );
      return;
    }

    const rpcNames = getRpcNames();

    state.active = true;
    state.startedAt = Date.now();

    setFormEnabled(false);

    appendMessage("user", cleanPrompt);

    setStatus("SUBMITTING TASK", "working");

    try {
      const { data, error } = await access.client.rpc(
        rpcNames.submit,
        {
          p_prompt: cleanPrompt
        }
      );

      if (error) {
        throw error;
      }

      if (!hasAccess()) {
        revokeAccess();
        return;
      }

      const taskId = normalizeSubmitResult(data);

      if (!isValidUuid(taskId)) {
        throw new Error(
          "The server did not return a valid task identifier."
        );
      }

      state.taskId = taskId;

      setStatus(
        "TASK ACCEPTED — WAITING FOR SENTIENT-001",
        "working"
      );

      state.timeoutTimer = setTimeout(() => {
        if (!state.active) return;

        appendMessage(
          "system",
          "Task waiting period expired. The task may still exist on the backend. Check the node runtime and task status."
        );

        setStatus("TASK TIMEOUT — CHECK NODE RUNTIME", "warning");

        finishTask();

      }, SETTINGS.taskTimeoutMs);

      await pollTask();

    } catch (error) {
      console.error(
        "[SENTIENT-001] Task submission failed:",
        error
      );

      appendMessage(
        "system",
        `TASK SUBMISSION FAILED: ${error?.message || "Unknown error"}`
      );

      setStatus("TASK SUBMISSION FAILED", "error");

      finishTask();
    }
  }

  /* -------------------------------------------------------
     10. TASK STATUS POLLING
  ------------------------------------------------------- */

  async function pollTask() {
    if (!state.active || !state.taskId) return;

    const access = getAccess();

    if (!access) {
      revokeAccess();
      return;
    }

    const rpcNames = getRpcNames();
    const taskId = state.taskId;

    try {
      const { data, error } = await access.client.rpc(
        rpcNames.get,
        {
          p_task_id: taskId
        }
      );

      if (error) {
        throw error;
      }

      if (!hasAccess()) {
        revokeAccess();
        return;
      }

      const task = normalizeTaskData(data);

      if (!task) {
        throw new Error(
          "The server returned no task information."
        );
      }

      if (task.status === TASK_STATUS.PENDING) {
        setStatus("TASK QUEUED — WAITING FOR NODE", "working");
        schedulePoll();
        return;
      }

      if (task.status === TASK_STATUS.CLAIMED) {
        setStatus("SENTIENT-001 IS PROCESSING", "working");
        schedulePoll();
        return;
      }

      if (task.status === TASK_STATUS.COMPLETED) {
        const response = String(task.response ?? "").trim();

        if (!response) {
          throw new Error(
            "The completed task returned an empty response."
          );
        }

        if (response.length > SETTINGS.maximumResponseLength) {
          throw new Error(
            "The response exceeds the configured maximum length."
          );
        }

        appendMessage("assistant", response, {
          provider: task.provider,
          model: task.model
        });

        const providerMatches =
          task.provider === SETTINGS.provider;

        const modelMatches =
          task.model === SETTINGS.model;

        if (!providerMatches || !modelMatches) {
          appendMessage(
            "system",
            "Provider/model verification warning: the returned inference identity differs from the configured target."
          );

          setStatus(
            "RESPONSE RECEIVED — PROVIDER/MODEL MISMATCH",
            "warning"
          );

        } else {
          setStatus("RESPONSE RECEIVED", "ready");
        }

        finishTask();
        return;
      }

      if (task.status === TASK_STATUS.FAILED) {
        appendMessage(
          "system",
          `TASK FAILED: ${task.last_error || "No failure reason was returned."}`
        );

        setStatus("TASK FAILED", "error");

        finishTask();
        return;
      }

      throw new Error(
        `Unexpected task status: ${String(task.status)}`
      );

    } catch (error) {
      console.error(
        "[SENTIENT-001] Task polling failed:",
        error
      );

      appendMessage(
        "system",
        `TASK STATUS CHECK FAILED: ${error?.message || "Unknown error"}`
      );

      setStatus("TASK STATUS CHECK FAILED", "error");

      finishTask();
    }
  }

  function schedulePoll() {
    if (state.pollTimer !== null) {
      clearTimeout(state.pollTimer);
    }

    state.pollTimer = setTimeout(() => {
      state.pollTimer = null;
      pollTask();
    }, SETTINGS.pollIntervalMs);
  }

  /* -------------------------------------------------------
     11. FORM EVENTS
  ------------------------------------------------------- */

  function handleSubmit(event) {
    event.preventDefault();

    if (!hasAccess()) {
      revokeAccess();
      return;
    }

    const input = state.elements?.input;

    if (!input) {
      setStatus("PROMPT INPUT ELEMENT NOT FOUND", "error");
      return;
    }

    const prompt = input.value;

    input.value = "";

    submitTask(prompt);
  }

  function initializeEvents() {
    if (state.eventsInitialized) return;

    const elements = state.elements;

    if (elements.form) {
      elements.form.addEventListener(
        "submit",
        handleSubmit
      );
    }

    if (elements.clear) {
      elements.clear.addEventListener(
        "click",
        clearConversation
      );
    }

    /*
     * APP-005 dispatches this event when administrator
     * verification changes.
     */
    window.addEventListener(
      "pi220:admin-access",
      event => {
        const detail = event?.detail;

        const authorized =
          detail === true ||
          detail?.isAdmin === true ||
          Boolean(getAccess());

        if (authorized) {
          updateAccessInterface(true);

          if (state.elements?.chat && !state.messages.length) {
            appendMessage(
              "system",
              "SENTIENT-001 interface ready. Submit a task to begin."
            );
          }

        } else {
          revokeAccess();
        }
      }
    );

    window.addEventListener(
      "pi220:app-ready",
      () => {
        refreshElements();
        initializeEvents();

        if (hasAccess()) {
          updateAccessInterface(true);
        } else {
          updateAccessInterface(false);
        }
      }
    );

    window.addEventListener(
      "pagehide",
      clearTimers
    );

    state.eventsInitialized = true;
  }

  /* -------------------------------------------------------
     12. INITIALIZATION
  ------------------------------------------------------- */

  function initialize() {
    if (state.initialized) return;

    refreshElements();

    if (!state.elements.root) {
      console.warn(
        "[SENTIENT-001] view-sentient was not found. Initialization postponed."
      );
      return;
    }

    if (!state.elements.chat || !state.elements.form) {
      console.error(
        "[SENTIENT-001] Required chat/form elements are missing."
      );

      setStatus(
        "INTERFACE CONFIGURATION ERROR",
        "error"
      );

      return;
    }

    if (!state.elements.input) {
      console.error(
        "[SENTIENT-001] Neither sentient-prompt nor sentient-input exists."
      );

      setStatus(
        "PROMPT INPUT ELEMENT NOT FOUND",
        "error"
      );

      return;
    }

    state.initialized = true;

    initializeEvents();

    if (hasAccess()) {
      updateAccessInterface(true);

      appendMessage(
        "system",
        "SENTIENT-001 BUILD 002 initialized. APP-005 administrator access verified."
      );

      console.info(
        "[SENTIENT-001] BUILD 002 initialized with verified access."
      );

    } else {
      updateAccessInterface(false);

      console.info(
        "[SENTIENT-001] BUILD 002 initialized in locked state."
      );
    }
  }

  function start() {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        initialize,
        { once: true }
      );
    } else {
      initialize();
    }

    /*
     * If APP-005 initializes its bridge after this module,
     * retry briefly without creating duplicate listeners.
     */
    state.bridgeTimer = setInterval(() => {
      if (!state.initialized) {
        refreshElements();

        if (state.elements.root) {
          initialize();
        }

        return;
      }

      const authorized = hasAccess();

      if (authorized !== state.accessReady) {
        if (authorized) {
          updateAccessInterface(true);

          if (!state.messages.length) {
            appendMessage(
              "system",
              "SENTIENT-001 administrator session verified."
            );
          }
        } else {
          revokeAccess();
        }
      }

    }, SETTINGS.bridgeRetryMs);
  }

  /* -------------------------------------------------------
     13. PUBLIC MODULE INTERFACE
  ------------------------------------------------------- */

  window.PI220_SENTIENT = Object.freeze({
    build: SETTINGS.build,
    initialize,
    clearConversation,

    getStatus() {
      return Object.freeze({
        build: SETTINGS.build,
        initialized: state.initialized,
        active: state.active,
        taskId: state.taskId,
        accessReady: state.accessReady
      });
    }
  });

  start();

})();
