const activeCacheVersion = 1700;
const activeCacheName = `rlplayer-${activeCacheVersion}`;

console.log(`Service Worker: Using cache version ${activeCacheVersion}`);

// files and folders to cache
const cacheAssets = [
  "",
  "index.html",
  "offline.html",
  "css/style.css",
  "css/bootstrap.min.css",
  "css/fontawesome.min.css",
  "css/regular.min.css",
  "css/solid.min.css",
  "css/thin.min.css",
  "css/animate.css",
  "js/script.js",
  "js/bootstrap.min.js",
  "js/env-loader.js",
  "img/cover.png",
  "img/app-icon.png",
  "manifest.json",
  "assets/icons/circle-play.svg",
  "assets/icons/circle-pause.svg",
  "assets/icons/timer.svg",
];

// Service workers can't directly listen for FTP uploads or external file changes.
// The fetch event only triggers when a client requests the file.
// To detect a change after FTP upload, you must rely on clients requesting "playlist.json".
// This code ensures the latest version is fetched and cached when requested.

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    console.log(
      "Service Worker: Ignoring external request:",
      event.request.url,
    );
    return;
  }

  // Handle album artwork specifically: use a Network-First strategy
  if (
    url.pathname === "/albumart/art-00.jpg" ||
    url.pathname.endsWith("/albumart/art-00.jpg") ||
    event.request.url.includes("art-00.jpg")
  ) {
    console.log(
      "Service Worker: Handling album art request with Network-First strategy:",
      event.request.url,
    );
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            // Update the cache with the new image
            const cache = await caches.open(activeCacheName);
            await cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          console.error(
            "Service Worker: Failed to fetch album art from network, falling back to cache:",
            error,
          );
          // Fall back to the cached version if network fails
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || Response.error();
        }
      })(),
    );
    return;
  }

  // Existing special handling for local playlist.json - always fetch fresh
  if (
    url.pathname === "/playlist.json" ||
    url.pathname.endsWith("/playlist.json") ||
    event.request.url.includes("playlist.json")
  ) {
    console.log(
      "Service Worker: Handling local playlist.json request:",
      event.request.url,
    );
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request, {
            cache: "no-cache",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          });
          if (!networkResponse.ok) {
            throw new Error(
              `Network response not ok: ${networkResponse.status}`,
            );
          }
          console.log("Service Worker: Successfully fetched playlist.json");
          return networkResponse;
        } catch (error) {
          console.error(
            "Service Worker: Failed to fetch playlist.json from network:",
            error,
          );
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Default Cache-First strategy for other static assets
  if (
    event.request.destination === "style" ||
    event.request.destination === "image" ||
    event.request.destination === "font" ||
    event.request.url.includes(".css") ||
    event.request.url.includes(".png") ||
    event.request.url.includes(".jpg")
  ) {
    event.respondWith(
      caches.open(activeCacheName).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return Response.error();
        }
      }),
    );
    return;
  }

  // Network-first strategy for navigation and HTML (already in your code)
  if (
    event.request.mode === "navigate" ||
    event.request.destination === "script" ||
    event.request.url.includes(".js") ||
    event.request.destination === "document"
  ) {
    event.respondWith(
      caches.open(activeCacheName).then(async (cache) => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedResponse = await cache.match(event.request);
          return (
            cachedResponse ||
            (await cache.match("/offline.html")) ||
            Response.error()
          );
        }
      }),
    );
  }
});

self.addEventListener("error", (event) => {
  console.error("Service Worker error:", event);
});

// Service worker installation
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");

  // Precache critical assets only
  event.waitUntil(
    caches.open(activeCacheName).then(async (cache) => {
      // Only cache critical assets that we know exist
      const criticalAssets = [
        "index.html",
        "offline.html",
        "css/style.css",
        "css/bootstrap.min.css",
        "css/fontawesome.min.css",
        "js/script.js",
        "js/bootstrap.min.js",
        "js/env-loader.js",
        "img/app-icon.png",
        "img/cover.png",
        "manifest.json",
      ];

      console.log("Service Worker: Caching critical assets...");

      try {
        await cache.addAll(criticalAssets);
        console.log("Service Worker: Critical assets cached successfully");
      } catch (error) {
        console.warn("Service Worker: Some assets failed to cache:", error);
        // Don't fail installation if some assets can't be cached
      }
    }),
  );

  // Don't force immediate activation - let it happen naturally
  console.log("Service Worker: Installation complete");
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");

  // Specify allowed cache keys
  const cacheAllowList = [activeCacheName];

  // Get all the currently active `Cache` instances.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // Delete all caches that aren't in the allow list:
        return Promise.all(
          keys.map((key) => {
            if (!cacheAllowList.includes(key)) {
              console.log(`Service Worker: Removing old cache: ${key}`);
              return caches.delete(key);
            }
          }),
        );
      })
      .then(() => {
        console.log("Service Worker: Activation complete, taking control");
        return self.clients.claim();
      }),
  );
});
