
/*
 * PI220 NETWORK — SENTIENT-001
 * Frontend Intelligence & Advisory Node
 * Build: 001
 *
 * Provider: Groq
 * Model: openai/gpt-oss-120b
 *
 * Security:
 * - Uses the authenticated APP-005 Supabase client.
 * - Requires the APP-005 administrator bridge.
 * - Never exposes service-role keys or provider credentials.
 * - Uses textContent for all user/model-generated content.
 * - One active task at a time.
 *
 * Persistence:
 * - Conversation messages are held in browser memory only.
 * - Task records and responses are retrieved through protected RPCs.
 */

(() => {
  "use strict";

  const CONFIG = window.PI220_NETWORK_CONFIG;

  const SETTINGS = Object.freeze({
    nodeKey: "sentient-001",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    pollIntervalMs: 2500,
    taskTimeoutMs: 600000,
    maximumPromptLength: 12000,
    maximumResponseLength: 32000
  });

  const STATUS = Object.freeze({
    PENDING: "pending",
    CLAIMED: "claimed",
    COMPLETED: "completed",
    FAILED: "failed"
  });

  const state = {
    initialized: false,
    active: false,
    taskId: null,
    startedAt: 0,
    pollTimer: null,
    timeoutTimer: null,
    messages: [],
    elements: null
  };

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

      if (!access || access.isAdmin !== true || !access.client) {
        return null;
      }

      return access;
    } catch (error) {
      console.error("[SENTIENT-001] Access verification failed:", error);
      return null;
    }
  }

  function getRpcNames() {
    const rpc = CONFIG?.supabase?.rpc;

    return {
      submit: rpc?.sentientSubmitTask || "app005_sentient_submit_task",
      get: rpc?.sentientGetTask || "app005_sentient_get_task"
    };
  }

  function getElements() {
    return {
      root: document.getElementById("view-sentient"),
      chat: document.getElementById("sentient-chat"),
      form: document.getElementById("sentient-form"),
      input: document.getElementById("sentient-input"),
      submit: document.getElementById("sentient-submit"),
      status: document.getElementById("sentient-status"),
      clear: document.getElementById("sentient-clear")
    };
  }

  function setStatus(message, type = "info") {
    if (!state.elements?.status) return;

    state.elements.status.textContent = message;
    state.elements.status.dataset.status = type;
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

  function appendMessage(role, content, metadata = {}) {
    const elements = state.elements;

    if (!elements?.chat) return;

    const message = document.createElement("article");
    message.className = `sentient-message sentient-message-${role}`;

    const label = document.createElement("div");
    label.className = "sentient-message-label";

    label.textContent =
      role === "user" ? "YOU" :
      role === "assistant" ? "SENTIENT-001" :
      "SYSTEM";

    const body = document.createElement("div");
    body.className = "sentient-message-content";
    body.textContent = String(content ?? "");

    message.append(label, body);

    if (metadata.provider || metadata.model) {
      const details = document.createElement("div");
      details.className = "sentient-message-metadata";

      const provider = metadata.provider || SETTINGS.provider;
      const model = metadata.model || SETTINGS.model;

      details.textContent = `${provider} • ${model}`;
      message.appendChild(details);
    }

    if (metadata.timestamp !== false) {
      const timestamp = document.createElement("time");
      timestamp.className = "sentient-message-time";
      timestamp.dateTime = new Date().toISOString();
      timestamp.textContent = new Date().toLocaleTimeString();
      message.appendChild(timestamp);
    }

    elements.chat.appendChild(message);
    elements.chat.scrollTop = elements.chat.scrollHeight;

    state.messages.push({
      role,
      content: String(content ?? ""),
      timestamp: Date.now()
    });
  }

  function normalizeTaskData(data) {
    if (Array.isArray(data)) {
      return data.length ? data[0] : null;
    }

    return data && typeof data === "object" ? data : null;
  }

  function normalizeSubmitResult(data) {
    if (typeof data === "string") {
      return data;
    }

    if (Array.isArray(data)) {
      const first = data[0];

      if (typeof first === "string") return first;
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
    return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function clearTimers() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }

    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = null;
    }
  }

  function finishTask() {
    clearTimers();

    state.active = false;
    state.taskId = null;
    state.startedAt = 0;

    setFormEnabled(Boolean(getAccess()));
  }

  function clearConversation() {
    finishTask();

    state.messages = [];

    if (state.elements?.chat) {
      state.elements.chat.replaceChildren();
    }

    if (state.elements?.input) {
      state.elements.input.value = "";
    }

    setStatus("TASK CHANNEL READY", "ready");
  }

  function revokeAccess() {
    finishTask();

    state.messages = [];

    if (state.elements?.chat) {
      state.elements.chat.replaceChildren();
    }

    if (state.elements?.input) {
      state.elements.input.value = "";
    }

    setFormEnabled(false);
    setStatus("ADMINISTRATOR ACCESS REQUIRED", "locked");
  }

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
        { p_prompt: cleanPrompt }
      );

      if (error) {
        throw error;
      }

      const taskId = normalizeSubmitResult(data);

      if (!isValidUuid(taskId)) {
        throw new Error("The task submission did not return a valid task ID.");
      }

      state.taskId = taskId;

      setStatus("TASK ACCEPTED — WAITING FOR NODE RESPONSE", "working");

      state.timeoutTimer = setTimeout(() => {
        if (!state.active) return;

        appendMessage(
          "system",
          "The task exceeded the configured waiting period. Check the node runtime and task status before submitting again."
        );

        setStatus("TASK TIMEOUT — CHECK NODE RUNTIME", "warning");
        finishTask();
      }, SETTINGS.taskTimeoutMs);

      await pollTask();

    } catch (error) {
      console.error("[SENTIENT-001] Submission failed:", error);

      appendMessage(
        "system",
        `TASK SUBMISSION FAILED: ${error?.message || "Unknown error"}`
      );

      setStatus("TASK SUBMISSION FAILED", "error");
      finishTask();
    }
  }

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
        { p_task_id: taskId }
      );

      if (error) {
        throw error;
      }

      const task = normalizeTaskData(data);

      if (!task) {
        throw new Error("Task status was not returned by the server.");
      }

      if (task.status === STATUS.PENDING) {
        setStatus("TASK QUEUED — WAITING FOR NODE", "working");
        schedulePoll();
        return;
      }

      if (task.status === STATUS.CLAIMED) {
        setStatus("SENTIENT-001 IS PROCESSING THE TASK", "working");
        schedulePoll();
        return;
      }

      if (task.status === STATUS.COMPLETED) {
        const response = String(task.response ?? "").trim();

        if (!response) {
          throw new Error("The completed task returned an empty response.");
        }

        if (response.length > SETTINGS.maximumResponseLength) {
          throw new Error("The returned response exceeds the configured limit.");
        }

        const providerMatches = task.provider === SETTINGS.provider;
        const modelMatches = task.model === SETTINGS.model;

        appendMessage("assistant", response, {
          provider: task.provider,
          model: task.model
        });

        if (!providerMatches || !modelMatches) {
          appendMessage(
            "system",
            "WARNING: The returned provider or model does not match the configured SENTIENT-001 inference target."
          );

          setStatus("RESPONSE RECEIVED — PROVIDER/MODEL MISMATCH", "warning");
        } else {
          setStatus("RESPONSE RECEIVED", "ready");
        }

        finishTask();
        return;
      }

      if (task.status === STATUS.FAILED) {
        const reason = task.last_error || "The task failed without a reported reason.";

        appendMessage("system", `TASK FAILED: ${reason}`);
        setStatus("TASK FAILED", "error");
        finishTask();
        return;
      }

      throw new Error(`Unexpected task status: ${String(task.status)}`);

    } catch (error) {
      console.error("[SENTIENT-001] Task polling failed:", error);

      appendMessage(
        "system",
        `TASK STATUS CHECK FAILED: ${error?.message || "Unknown error"}`
      );

      setStatus("TASK STATUS CHECK FAILED", "error");
      finishTask();
    }
  }

  function schedulePoll() {
    clearTimeout(state.pollTimer);

    state.pollTimer = setTimeout(() => {
      pollTask();
    }, SETTINGS.pollIntervalMs);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const input = state.elements?.input;
    if (!input) return;

    const prompt = input.value;
    input.value = "";

    submitTask(prompt);
  }

  function initializeEvents() {
    const elements = state.elements;

    if (elements.form) {
      elements.form.addEventListener("submit", handleSubmit);
    }

    if (elements.clear) {
      elements.clear.addEventListener("click", clearConversation);
    }

    window.addEventListener("pi220:admin-access", event => {
      const authorized = event?.detail?.isAdmin === true;

      if (!authorized) {
        revokeAccess();
      } else {
        setFormEnabled(!state.active);
        setStatus("TASK CHANNEL READY", "ready");
      }
    });
  }

  function initialize() {
    if (state.initialized) return;

    state.elements = getElements();

    if (!state.elements.root) {
      console.warn("[SENTIENT-001] Interface container not found.");
      return;
    }

    state.initialized = true;

    initializeEvents();

    if (!getAccess()) {
      revokeAccess();
      return;
    }

    setFormEnabled(true);
    setStatus("TASK CHANNEL READY", "ready");

    appendMessage(
      "system",
      "SENTIENT-001 interface initialized. Submit a task to begin an authenticated intelligence session."
    );

    console.info("[SENTIENT-001] Frontend module initialized.");
  }

  function start() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
      initialize();
    }
  }

  window.PI220_SENTIENT = Object.freeze({
    initialize,
    clearConversation,
    getStatus: () => ({
      initialized: state.initialized,
      active: state.active,
      taskId: state.taskId
    })
  });

  start();

})();
