/* =========================================================
   PI220 — APP-005 NETWORK
   FILE: sw.js
   BUILD: 006.3

   SERVICE WORKER

   SECURITY:
   - Cache application shell only.
   - Never cache Supabase requests.
   - Never cache authenticated or protected responses.
   - Never cache POST requests.
========================================================= */

"use strict";

const CACHE_PREFIX = "pi220-app005-network-";
const CACHE_NAME = CACHE_PREFIX + "0063";

const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg"
];

/* =======================================================
   01. INSTALL
======================================================= */

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* =======================================================
   02. ACTIVATE
======================================================= */

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          /*
           * Delete only caches owned by this APP-005 service worker.
           * Other PI220 applications may share the same origin.
           */
          if (
            cacheName.startsWith(CACHE_PREFIX) &&
            cacheName !== CACHE_NAME
          ) {
            return caches.delete(cacheName);
          }

          return Promise.resolve(false);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* =======================================================
   03. REQUEST CLASSIFICATION
======================================================= */

function isSupabaseRequest(url) {
  return url.hostname.endsWith(".supabase.co");
}

function isExternalRequest(url) {
  return url.origin !== self.location.origin;
}

function isProtectedPath(url) {
  const path = url.pathname.toLowerCase();

  return (
    path.includes("/functions/") ||
    path.includes("/rest/v1/") ||
    path.includes("/auth/") ||
    path.includes("/storage/") ||
    path.includes("/realtime/")
  );
}

function isCacheableShellRequest(request, url) {
  if (request.method !== "GET") {
    return false;
  }

  if (isExternalRequest(url)) {
    return false;
  }

  if (isSupabaseRequest(url)) {
    return false;
  }

  if (isProtectedPath(url)) {
    return false;
  }

  return true;
}

/* =======================================================
   04. FETCH
======================================================= */

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
   * Supabase, external services and protected endpoints
   * always bypass the application cache.
   */

  if (
    isSupabaseRequest(url) ||
    isExternalRequest(url) ||
    isProtectedPath(url)
  ) {
    return;
  }

  if (!isCacheableShellRequest(request, url)) {
    return;
  }

  event.respondWith(
    fetch(request).then(function (response) {
      if (
        !response ||
        !response.ok ||
        response.type === "opaque"
      ) {
        return response;
      }

      const responseClone = response.clone();

      event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
          return cache.put(request, responseClone);
        }).catch(function (error) {
          console.warn("[APP-005] Shell cache write failed:", error);
        })
      );

      return response;

    }).catch(async function () {
      const cached = await caches.match(request);

      if (cached) {
        return cached;
      }

      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");

        if (fallback) {
          return fallback;
        }
      }

      return new Response(
        "APP-005 NETWORK is unavailable offline.",
        {
          status: 503,
          statusText: "Service Unavailable",
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        }
      );
    })
  );
});

/* =======================================================
   05. MESSAGE HANDLER
======================================================= */

self.addEventListener("message", function (event) {
  if (!event.data || typeof event.data !== "object") {
    return;
  }

  if (event.data.action === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* =======================================================
   06. STATUS
======================================================= */

console.info(
  "[APP-005] SERVICE WORKER ACTIVE — BUILD 006.3"
);