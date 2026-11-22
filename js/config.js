
/* =========================================================
   PI220 — APP-005 NETWORK
   BUILD 006.3
   PUBLIC APPLICATION CONFIGURATION

   SECURITY:
   - Browser-safe publishable key only.
   - NEVER place service-role keys or private secrets here.
   - Backend functions remain responsible for authorization.
========================================================= */

(function () {
    "use strict";
  
    const CONFIG = {
  
      /* APPLICATION IDENTITY */
      appName: "APP-NETWORK",
      appId: "APP-005",
      build: "006.3",
  
      /* APPLICATION BEHAVIOUR */
      refreshIntervalMs: 15000,
      requestTimeoutMs: 8000,
      maximumHistoryRecords: 100,
  
      /* SUPABASE PROJECT */
      supabase: {
        url: "https://ronspasnfgqbxcggxyid.supabase.co",
  
        publishableKey:
          "sb_publishable_ZvzLM_gjFqqTyYRIP8jwcQ_dfZTz_5w",
  
        functions: {
          adminCheck: "app005-admin-check",
          nodeManager: "app005-node-manager",
          nodeMonitor: "app005-node-monitor"
        },
  
        rpc: {
  nodeHistory: "app005_get_node_check_history",
  sentientSubmitTask: "app005_sentient_submit_task",
  sentientGetTask: "app005_sentient_get_task"
},

sentient: {
  nodeKey: "sentient-001",
  provider: "groq",
  model: "openai/gpt-oss-120b",
  pollIntervalMs: 2500,
  taskTimeoutMs: 600000,
  maximumPromptLength: 12000
}
      },
  
      /* APPROVED NETWORK NODE */
      monitoring: {
        primaryNodeKey: "pi220-website",
  
        primaryNodeName: "PI220 WEBSITE",
  
        websiteEndpoint:
          "https://profdrjamesjessen-cyber.github.io/PI220/",
  
        historyLimit: 50
      },
  
      /* EXTERNAL TELEMETRY
         Leave empty until real, approved endpoints exist.
  
         Expected response contracts:
  
         OVERVIEW:
         {
           connectedNodes: number,
           totalNodes: number,
           visitors: number,
           sessions: number,
           requestsPerMinute: number,
           incomingBytesPerSecond: number,
           outgoingBytesPerSecond: number,
           indexedPages: number,
           crawlStatus: string,
           sampledAt: string,
           nodes: []
         }
  
         VISITORS:
         {
           visitors: number,
           sessions: number,
           period: string,
           sampledAt: string
         }
  
         TRAFFIC:
         {
           requestsPerMinute: number,
           incomingBytesPerSecond: number,
           outgoingBytesPerSecond: number,
           sampledAt: string,
           history: [
             {
               sampledAt: string,
               incomingBytesPerSecond: number,
               outgoingBytesPerSecond: number
             }
           ]
         }
  
         INDEXING:
         {
           indexedPages: number,
           crawlStatus: string,
           sampledAt: string,
           detail: string
         }
      */
      endpoints: {
        overview: "",
        visitors: "",
        traffic: "",
        indexing: ""
      },
  
      /* WEBSITE ANALYTICS
         Existing PI220 website measurement ID.
         This does not provide GA4 reporting API access.
      */
      analytics: {
        measurementId: "G-S1S7HJCFWV",
        reportingEndpoint: "",
        reportingConfigured: false
      },
  
      /* NETWORK INTERFACE */
      interface: {
        mission:
          "MISSION • UNITY • FUTURE • UNSTOPPABLE",
  
        organization:
          "PARALLEL INDUSTRIES 220",
  
        administratorVerificationRequired: true,
  
        protectedInventoryRequiresAdmin: true,
  
        protectedHistoryRequiresAdmin: true
      },
  
      /* INSTALLATION */
      installation: {
        manifest: "./manifest.webmanifest",
        serviceWorker: "./sw.js",
  
        serviceWorkerEnabled: true
      }
  
    };
  
    /* =======================================================
       CONFIGURATION VALIDATION
    ======================================================== */
  
    function validateConfiguration(config) {
      const errors = [];

      let supabaseUrlValid = false;

      try {
        const parsed = new URL(config.supabase.url);
        supabaseUrlValid = parsed.protocol === "https:";
      } catch (_) {
        supabaseUrlValid = false;
      }

      if (!supabaseUrlValid) {
        errors.push("Supabase URL must be a valid HTTPS URL.");
      }

      if (
        typeof config.supabase.publishableKey !== "string" ||
        !config.supabase.publishableKey.startsWith("sb_publishable_")
      ) {
        errors.push("A browser-safe Supabase publishable key is required.");
      }

      Object.entries(config.endpoints).forEach(function ([name, endpoint]) {
        if (!endpoint) return;

        try {
          const parsed = new URL(endpoint);
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            errors.push(name + " telemetry endpoint must use HTTP or HTTPS.");
          }
        } catch (_) {
          errors.push(name + " telemetry endpoint is not a valid URL.");
        }
      });

      if (
        config.analytics.reportingConfigured &&
        !config.analytics.reportingEndpoint
      ) {
        errors.push(
          "Analytics reporting cannot be marked configured without a reporting endpoint."
        );
      }

      if (
        config.refreshIntervalMs < 5000 ||
        config.refreshIntervalMs > 300000
      ) {
        errors.push(
          "Refresh interval must be between 5000 and 300000 ms."
        );
      }

      if (
        config.requestTimeoutMs < 1000 ||
        config.requestTimeoutMs > 60000
      ) {
        errors.push(
          "Request timeout must be between 1000 and 60000 ms."
        );
      }

      if (
        !Number.isInteger(config.monitoring.historyLimit) ||
        config.monitoring.historyLimit < 1 ||
        config.monitoring.historyLimit > 100
      ) {
        errors.push(
          "Monitoring history limit must be an integer between 1 and 100."
        );
      }

      return errors;
    }

    /* =======================================================
       CONFIGURATION FREEZE
    ======================================================== */
  
    const validationErrors = validateConfiguration(CONFIG);
  
    if (validationErrors.length > 0) {
      console.error(
        "[APP-005] Configuration validation failed:",
        validationErrors
      );
  
      throw new Error(
        "APP-005 configuration is invalid."
      );
    }
  
    /* Freeze configuration to prevent accidental mutation. */
  
    function deepFreeze(object) {
      Object.freeze(object);
  
      Object.keys(object).forEach(function (key) {
        const value = object[key];
  
        if (
          value &&
          typeof value === "object" &&
          !Object.isFrozen(value)
        ) {
          deepFreeze(value);
        }
      });
  
      return object;
    }
  
    window.PI220_NETWORK_CONFIG = deepFreeze(CONFIG);
  
    console.info(
      "[APP-005] NETWORK CONFIGURATION LOADED",
      CONFIG.build
    );
  
  })();
  
