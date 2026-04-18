let APP_VERSION,
  APP_NAME,
  APP_DESCRIPTION,
  APP_AUTHOR,
  RADIO_NAME,
  STREAM_URL,
  DEFAULT_VOLUME,
  THEME_COLOR,
  PLAYLIST,
  APP_URL,
  DIM_VOLUME_SLEEP_TIMER,
  fetchIntervalId,
  audio,
  userInitiatedPause = false; // Flag to track user-initiated pauses

// Helper function to hash a string using SHA-256 and return a hex string
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Initialize the streaming URL
let URL_STREAMING;

// These will be set after CONFIG is loaded in loadAppVars()
let correctPasswordHash = "default-hash-please-configure";
let correctPasswordHashPromise;

// Debug logging wrapper - respects DEBUG_MODE setting
function debugLog(...args) {
  if (typeof CONFIG !== "undefined" && CONFIG?.DEBUG_MODE === true) {
    console.log(...args);
  }
}

debugLog.warn = (...args) => {
  if (typeof CONFIG !== "undefined" && CONFIG?.DEBUG_MODE === true) {
    console.warn(...args);
  }
};

debugLog.error = (...args) => {
  console.error(...args);
};

function isPlaceholderValue(value) {
  if (value === null || value === undefined) return true;
  const trimmed = value.toString().trim();
  return trimmed === "" || trimmed === "-" || trimmed.startsWith("<rl-");
}
// SVG Icon helper functions
function setPlayerIcon(isPlaying) {
  const playerButton = document.getElementById("playerButton");
  if (playerButton) {
    playerButton.src = isPlaying
      ? "assets/icons/circle-pause.svg"
      : "assets/icons/circle-play.svg";
    playerButton.alt = isPlaying ? "Pause" : "Play";
  }
}

function isPlayerIconPaused() {
  const playerButton = document.getElementById("playerButton");
  return playerButton && playerButton.src.includes("circle-pause.svg");
}

function showLoader() {
  var nameToSplit = RADIO_NAME || "LOADING";
  const player = document.getElementById("player");
  if (player) player.style.display = "none";

  let existing = document.getElementById("radioLoader");
  if (existing) existing.remove();

  const loader = document.createElement("div");
  loader.id = "radioLoader";
  loader.className = "radio-loader";
  loader.style.position = "fixed";
  loader.style.top = "0";
  loader.style.left = "0";
  loader.style.width = "100vw";
  loader.style.height = "100vh";
  loader.style.display = "flex";
  loader.style.alignItems = "center";
  loader.style.justifyContent = "center";
  loader.style.background = "rgba(0,0,0,0.8)";
  loader.style.zIndex = "99999";

  const lettersContainer = document.createElement("div");
  lettersContainer.className = "radio-loader-letters";
  lettersContainer.style.display = "flex";
  lettersContainer.style.gap = "0.2em";
  lettersContainer.style.fontSize = "2em";
  lettersContainer.style.fontWeight = "light";
  lettersContainer.style.color = "#fff";
  lettersContainer.style.letterSpacing = "0.15em";

  for (let i = 0; i < nameToSplit.length; i++) {
    const span = document.createElement("span");
    span.textContent = nameToSplit[i];
    span.className = "radio-loader-letter";
    span.style.opacity = "0";
    span.style.transition = "opacity 0.5s";
    lettersContainer.appendChild(span);
  }

  loader.appendChild(lettersContainer);
  document.body.appendChild(loader);

  let idx = 0;
  let direction = 1;
  const spans = lettersContainer.querySelectorAll(".radio-loader-letter");
  function animateLetters() {
    spans.forEach((span, i) => {
      span.style.opacity =
        i === idx && direction === 1
          ? "1"
          : i === idx && direction === -1
            ? "0"
            : span.style.opacity;
    });
    if (direction === 1) {
      idx++;
      if (idx >= spans.length) {
        direction = -1;
        idx = spans.length - 1;
        setTimeout(animateLetters, 400);
        return;
      }
    } else {
      idx--;
      if (idx < 0) {
        direction = 1;
        idx = 0;
        setTimeout(animateLetters, 400);
        return;
      }
    }
    setTimeout(animateLetters, 200);
  }
  animateLetters();
}

function hideLoader() {
  const loader = document.getElementById("radioLoader");
  if (loader) loader.remove();
  const player = document.getElementById("player");
  if (player) player.style.display = "";
}

function showPlaylistErrorNotification(url, error) {
  const existingNotification = document.getElementById(
    "playlistErrorNotification",
  );
  if (existingNotification) existingNotification.remove();

  const notification = document.createElement("div");
  notification.id = "playlistErrorNotification";
  notification.style.position = "fixed";
  notification.style.top = "100px";
  notification.style.right = "20px";
  notification.style.background = "#ff4444";
  notification.style.color = "white";
  notification.style.padding = "12px 16px";
  notification.style.borderRadius = "6px";
  notification.style.zIndex = "10000";
  notification.style.maxWidth = "300px";
  notification.style.fontSize = "14px";
  notification.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const message = isLocalhost
    ? "⚠️ Cannot fetch live playlist data during localhost development."
    : "⚠️ Failed to fetch current playlist data.";

  notification.innerHTML = `<strong>Playlist Fetch Failed</strong><br><div style="font-size: 12px;">${message}</div>`;
  notification.style.cursor = "pointer";
  notification.onclick = () => notification.remove();
  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 8000);
  document.body.appendChild(notification);
}

window.addEventListener("load", () => {
  registerServiceWorker();
  loadAppVars();
});

window.addEventListener("DOMContentLoaded", showLoader);

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("service-worker.js");
    } catch (err) {
      debugLog("Service Worker registration failed:", err);
    }
  }
}

let playlistData = "playlist.json";
const isPhone = /iPhone|Android.*Mobile|Windows Phone|iPod/i.test(
  navigator.userAgent,
);
let initialVol = 100;
window.__rlplayerAudioContext = window.__rlplayerAudioContext || null;

async function setStreamingUrl(url) {
  URL_STREAMING = url;
}

function setVolume(volume) {
  if (!audio) return;
  if (typeof Storage !== "undefined" && !isPhone) {
    const volumeLocalStorage =
      parseInt(localStorage.getItem("volume"), 10) || 100;
    const volumeElement = document.getElementById("volume");
    if (volumeElement) volumeElement.value = volumeLocalStorage;
    audio.volume = intToDecimal(volumeLocalStorage);
  } else {
    audio.volume = intToDecimal(volume);
  }
}

function changeVolumeLocalStorage(volume) {
  if (typeof Storage !== "undefined" && !isPhone) {
    localStorage.setItem("volume", volume);
  }
}

function initializePlayer() {
  changeTitlePage();
  setCopyright();
  waitForServiceWorkerThenStart();
}

async function waitForServiceWorkerThenStart() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.ready;
    } catch (error) {
      /* ignore */
    }
  }
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const interval = isLocalhost ? 5000 : 1000;
  getStreamingData();
  fetchIntervalId = setInterval(getStreamingData, interval);
}

async function loadAppVars() {
  if (window.envLoader) {
    const envLoaded = await window.envLoader.loadEnv();
    if (envLoaded) {
      window.CONFIG = window.envLoader.createConfig();
    }
  }

  correctPasswordHash =
    CONFIG?.PASSWORD_HASH || "default-hash-please-configure";
  correctPasswordHashPromise = Promise.resolve(correctPasswordHash);

  fetch("app.json")
    .then((r) => r.json())
    .then((appConfig) => {
      APP_VERSION = appConfig.version;
      APP_NAME = appConfig.name;
      APP_AUTHOR = appConfig.author;

      // Override with CONFIG values if available, otherwise use manifest defaults
      if (CONFIG?.APP_CONFIG) {
        debugLog("Overriding manifest values with CONFIG.APP_CONFIG...");
        RADIO_NAME =
          CONFIG.APP_CONFIG.station_name ||
          manifest.custom_radio_config.station_name;
        STREAM_URL =
          CONFIG.APP_CONFIG.stream_url ||
          manifest.custom_radio_config.stream_url;
        DEFAULT_VOLUME =
          CONFIG.APP_CONFIG.default_volume ||
          manifest.custom_radio_config.default_volume;
        THEME_COLOR =
          CONFIG.APP_CONFIG.theme_color ||
          manifest.custom_radio_config.theme_color;
        APP_URL =
          CONFIG.APP_CONFIG.app_url || manifest.custom_radio_config.app_url;
        DIM_VOLUME_SLEEP_TIMER =
          CONFIG.APP_CONFIG.dim_volume_sleep_timer ||
          manifest.custom_radio_config.dim_volume_sleep_timer;
      } else {
        debugLog("Using manifest values (CONFIG.APP_CONFIG not found)...");
        RADIO_NAME = manifest.custom_radio_config.station_name;
        STREAM_URL = manifest.custom_radio_config.stream_url;
        DEFAULT_VOLUME = manifest.custom_radio_config.default_volume;
        THEME_COLOR = manifest.custom_radio_config.theme_color;
        APP_URL = manifest.custom_radio_config.app_url;
        DIM_VOLUME_SLEEP_TIMER =
          manifest.custom_radio_config.dim_volume_sleep_timer;
      }

      // Ensure APP_URL has a trailing slash for proper URL construction
      if (APP_URL && !APP_URL.endsWith("/")) {
        APP_URL = APP_URL + "/";
        debugLog("Normalized APP_URL to ensure trailing slash:", APP_URL);
      }

      // Use .env PLAYLIST_ENDPOINT if configured, otherwise fall back to manifest
      PLAYLIST =
        CONFIG?.PLAYLIST_ENDPOINT ||
        manifest.api_endpoints.playlist ||
        "playlist.json";

      // Set playlistData after PLAYLIST is loaded
      playlistData = PLAYLIST;
      debugLog(
        "Playlist endpoint source:",
        CONFIG?.PLAYLIST_ENDPOINT
          ? ".env (VITE_PLAYLIST_ENDPOINT)"
          : "manifest.json",
      );
      debugLog("playlistData set to:", playlistData);

      // Log all key variables to console for debugging
      debugLog("APP_VERSION:", APP_VERSION);
      debugLog("APP_NAME:", APP_NAME);
      debugLog("APP_DESCRIPTION:", APP_DESCRIPTION);
      debugLog("APP_AUTHOR:", APP_AUTHOR);
      debugLog("RADIO_NAME:", RADIO_NAME);
      debugLog("STREAM_URL:", STREAM_URL);
      debugLog("DEFAULT_VOLUME:", DEFAULT_VOLUME);
      debugLog("THEME_COLOR:", THEME_COLOR);
      debugLog("PLAYLIST:", PLAYLIST);
      debugLog("APP_URL:", APP_URL);
      debugLog("DIM_VOLUME_SLEEP_TIMER:", DIM_VOLUME_SLEEP_TIMER);

      // Set up streaming URL after loading from manifest
      if (typeof STREAM_URL === "string" && STREAM_URL.trim() !== "") {
        setStreamingUrl(STREAM_URL);
      } else {
        debugLog.warn(
          "STREAM_URL is undefined or empty. Skipping setStreamingUrl.",
        );
      }

      // Update the loader with the correct radio name if it's currently showing
      const existingLoader = document.getElementById("radioLoader");
      if (existingLoader) {
        const lettersContainer = existingLoader.querySelector(
          ".radio-loader-letters",
        );
        if (lettersContainer) {
          // Clear existing letters
          lettersContainer.innerHTML = "";

          // Add new letters with the correct radio name
          for (let i = 0; i < RADIO_NAME.length; i++) {
            const span = document.createElement("span");
            span.textContent = RADIO_NAME[i];
            span.className = "radio-loader-letter";
            span.style.opacity = "0";
            span.style.transition = "opacity 0.5s";
            lettersContainer.appendChild(span);
          }
        }
      }

      // After loading app variables, check if password protection is enabled
      if (CONFIG?.ENABLE_PASSWORD_PROTECTION === true) {
        checkPassword();
      } else {
        initializePlayer();
      }
    })
    .catch((err) => debugLog.error("Error loading config:", err));
}

function checkPassword() {
  if (localStorage.getItem("passwordAccepted") === correctPasswordHash) {
    initializePlayer();
  } else {
    const modal = document.createElement("div");
    modal.id = "passwordModal";
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100vw";
    modal.style.height = "100vh";
    modal.style.background = "rgba(0,0,0,0.8)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "99999";

    const box = document.createElement("div");
    box.style.background = "#fff";
    box.style.padding = "24px";
    box.style.borderRadius = "8px";
    box.style.textAlign = "center";
    box.style.color = "#333";
    box.style.minWidth = "280px";

    box.innerHTML = `
      <strong>Private Stream</strong>
      <p>Please enter password:</p>
      <input type="password" id="passwordInput" style="width: 80%; padding: 8px; margin-bottom:10px;" autofocus />
      <br>
      <label style="font-size:0.9em;cursor:pointer;"><input type="checkbox" id="togglePassword" /> Show password</label>
      <br><br>
      <button id="submitPassword" style="padding: 8px 20px; background: #031521; color: #fff; border: none; border-radius: 4px;">Submit</button>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const passwordInput = box.querySelector("#passwordInput");
    const togglePassword = box.querySelector("#togglePassword");

    passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") box.querySelector("#submitPassword").click();
    });
    togglePassword.addEventListener("change", function () {
      passwordInput.type = this.checked ? "text" : "password";
    });

    box.querySelector("#submitPassword").onclick = function () {
      const password = passwordInput.value;
      sha256(password).then((hash) => {
        if (hash === correctPasswordHash) {
          localStorage.setItem("passwordAccepted", correctPasswordHash);
          document.body.removeChild(modal);
          initializePlayer();
        } else {
          alert("Incorrect password.");
        }
      });
    };
  }
}

function changeTitlePage(title = RADIO_NAME) {
  document.title = title;
}

function refreshCurrentSong(
  song,
  artist,
  duration,
  startTime,
  nextTrackStarttime,
) {
  const currentSong = document.getElementById("currentSongDisplay");
  const currentArtist = document.getElementById("currentArtistDisplay");
  const currentDuration = document.getElementById("currentDurationDisplay");
  const currentContainer =
    document.getElementById("currentTrackContainer") ||
    currentSong?.parentElement;

  // If the track is a placeholder, hide the section and stop
  if (isPlaceholderValue(song)) {
    if (currentContainer) currentContainer.style.display = "none";
    return;
  } else {
    if (currentContainer) currentContainer.style.display = "";
  }

  if (
    song !== currentSong.textContent ||
    artist !== currentArtist.textContent
  ) {
    currentSong.classList.add("fade-out");
    currentArtist.classList.add("fade-out");

    setTimeout(function () {
      currentSong.textContent = song;
      currentArtist.textContent = artist;
      displayTrackCountdown(song, duration, startTime, nextTrackStarttime);

      currentSong.classList.remove("fade-out");
      currentSong.classList.add("fade-in");
      currentArtist.classList.remove("fade-out");
      currentArtist.classList.add("fade-in");

      if ("mediaSession" in navigator) {
        const cacheBuster = Date.now();
        const artworkUrl = `${APP_URL}albumart/art-00.jpg?cb=${cacheBuster}`;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song,
          artist: artist,
          album: RADIO_NAME,
          artwork: [{ src: artworkUrl, sizes: "200x200", type: "image/jpg" }],
        });
      }
    }, 100);
  }
}

let musicActual = null;
let isFirstLoad = true;
let jsonErrorRetryCount = 0;
const MAX_JSON_ERROR_RETRIES = 3;
let awaitingNextSong = false;

async function getStreamingData() {
  try {
    let data = await fetchStreamingData(playlistData);

    debugLog("Received data:", data);

    // Move this outside the "if (data)" block.
    // This ensures that even if the playlist is offline, the "Loading" overlay disappears
    // so the user can at least see the player and hit the Play button.
    if (isFirstLoad) {
      hideLoader();
      isFirstLoad = false;
    }

    if (data) {
      // Reset JSON error retry counter on successful data fetch
      if (jsonErrorRetryCount > 0) {
        debugLog(
          "Playlist fetched successfully - resetting JSON error retry counter",
        );
        jsonErrorRetryCount = 0;
      }
      var currentSong = data.Current.Title;
      var charsToplayTitle = 25;
      var charsPlayingTitle = 40;
      var nrToplay = 5;
      var nrHistory = 3;
      const currentArtistVal = data.Current.Artist;
      let currentDurationVal = data.Current.Duration;
      let currentStartTime = data.Current.Starttime;

      if (currentSong.length > charsPlayingTitle) {
        var string = currentSong;
        var length = charsPlayingTitle;
        var trimmedString = string.substring(0, length) + "...";
        currentSong = trimmedString;
      }

      const safeCurrentSong = (currentSong || "")
        .replace(/'/g, "'")
        .replace(/&/g, "&")
        .trim();
      const safeCurrentArtist = (currentArtistVal || "")
        .replace(/'/g, "'")
        .replace(/&/g, "&")
        .trim();

      // Handle Current Track visibility - hide if it's a placeholder
      const currentContainer = document.getElementById("currentTrackContainer");
      const isCurrentPlaceholder = isPlaceholderValue(safeCurrentSong);

      if (currentContainer) {
        currentContainer.style.display = isCurrentPlaceholder ? "none" : "";
      }

      // Clean up placeholder dashes and template values created by template when no data available
      const cleanArtist = isPlaceholderValue(safeCurrentArtist)
        ? ""
        : safeCurrentArtist;
      const cleanSong = isPlaceholderValue(safeCurrentSong)
        ? ""
        : safeCurrentSong;

      if (isPlaceholderValue(currentDurationVal)) {
        currentDurationVal = null;
      }
      if (isPlaceholderValue(currentStartTime)) {
        currentStartTime = null;
      }

      const toplayArray = data.Next
        ? data.Next.map((item) => ({
            Title: (item.Title || "").trim(),
            Artist: (item.Artist || "").trim(),
          }))
        : [];

      const historyArray = data.Last
        ? data.Last.map((item) => ({
            Title: (item.Title || "").trim(),
            Artist: (item.Artist || "").trim(),
          }))
        : [];

      const validToplay = toplayArray.filter(
        (item) =>
          !isPlaceholderValue(item.Title) || !isPlaceholderValue(item.Artist),
      );
      const validHistory = historyArray.filter(
        (item) =>
          !isPlaceholderValue(item.Title) || !isPlaceholderValue(item.Artist),
      );

      function renderTrackList(
        containerId,
        sectionSelector,
        list,
        sectionName,
      ) {
        const container = document.getElementById(containerId);
        if (!container) {
          debugLog.error(`${containerId} element not found in DOM`);
          return;
        }
        container.innerHTML = "";

        const section = document.querySelector(sectionSelector);
        if (section) {
          if (list.length === 0) {
            section.style.display = "none";
            debugLog(`Hiding ${sectionName} section - no valid songs`);
          } else {
            section.style.display = "";
            debugLog(`Showing ${sectionName} section - songs available`);
          }
        }

        const maxItems = sectionName === "toplay" ? nrToplay : nrHistory;
        const limited = list.slice(Math.max(0, list.length - maxItems));

        debugLog(`Limited ${sectionName}:`, limited);

        limited.forEach((songInfo, index) => {
          const textSize = `text-size-${index}`;
          const article = document.createElement("article");
          article.classList.add("col-12");

          const validArtist = !isPlaceholderValue(songInfo.Artist)
            ? songInfo.Artist
            : "";
          const validTitle = !isPlaceholderValue(songInfo.Title)
            ? songInfo.Title
            : "";

          if (!validArtist && !validTitle) {
            debugLog(`Skipping invalid entry in ${sectionName}`);
            return;
          }

          let displayTitle = validTitle;
          if (displayTitle.length > charsToplayTitle) {
            displayTitle = displayTitle.substring(0, charsToplayTitle) + "...";
          }

          const songDisplay =
            validArtist && validTitle
              ? `${validArtist} - ${displayTitle}`
              : validArtist || displayTitle;

          article.innerHTML = `
            <div class="music-info text-center">
              <p class="song ${textSize}">${songDisplay}</p>
            </div>
          `;
          container.appendChild(article);
        });
      }

      let nextTrackStarttime =
        data.Next && data.Next.length > 0 ? data.Next[0].Starttime : null;
      if (isPlaceholderValue(nextTrackStarttime)) {
        nextTrackStarttime = null;
      }

      if (cleanSong !== musicActual && !isCurrentPlaceholder) {
        debugLog("New song detected:", cleanSong);

        if (awaitingNextSong) {
          debugLog("New song detected - clearing awaiting next song state");
          awaitingNextSong = false;

          const currentDuration = document.getElementById(
            "currentDurationDisplay",
          );
          if (currentDuration) {
            currentDuration.style.opacity = "1";
            currentDuration.style.animation = "";
          }
        }

        if (fetchIntervalId) {
          clearInterval(fetchIntervalId);
          fetchIntervalId = null;
          debugLog(
            "Cleared polling interval - new song detected, switching to smart polling",
          );
        }

        musicActual = cleanSong;

        refreshCurrentSong(
          cleanSong,
          cleanArtist,
          currentDurationVal,
          currentStartTime,
          nextTrackStarttime,
        );

        document.title = `${RADIO_NAME} | ${cleanSong}${
          cleanArtist ? " - " + cleanArtist : ""
        }`;
      }

      renderTrackList("toplaySong", ".toplay", validToplay, "toplay");
      renderTrackList("historicSong", ".historic", validHistory, "historic");
    }
  } catch (error) {
    debugLog.error("Error in getStreamingData:", error);
    debugLog("playlistData value:", playlistData);
    debugLog("Playlist endpoint:", PLAYLIST);

    // If this is a JSON format error, schedule a retry with limit
    if (
      (error.message && error.message.includes("JSON")) ||
      error.name === "SyntaxError"
    ) {
      if (jsonErrorRetryCount < MAX_JSON_ERROR_RETRIES) {
        jsonErrorRetryCount++;
        debugLog(
          `JSON format error detected - retry ${jsonErrorRetryCount}/${MAX_JSON_ERROR_RETRIES} in 15 seconds`,
        );
        setTimeout(() => {
          debugLog(
            `Retrying playlist fetch after JSON format error (attempt ${jsonErrorRetryCount}/${MAX_JSON_ERROR_RETRIES})...`,
          );
          getStreamingData();
        }, 15000);
      } else {
        debugLog.error(
          "Maximum JSON error retries reached. Please check the playlist.json format.",
        );
        // Reset counter for future potential fixes
        setTimeout(() => {
          jsonErrorRetryCount = 0;
          debugLog(
            "Reset JSON error retry counter - will try again if new errors occur",
          );
        }, 300000); // Reset after 5 minutes
      }
    }
  }
}

function displayTrackCountdown(song, duration, startTime, nextTrackStarttime) {
  const currentDurationElem = document.getElementById("currentDurationDisplay");
  if (!currentDurationElem) return;

  if (window.countdownInterval) clearInterval(window.countdownInterval);

  let totalSeconds = 0;
  if (typeof duration === "string" && duration.includes(":")) {
    const parts = duration.split(":").map(Number);
    totalSeconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
  } else {
    totalSeconds = parseInt(duration, 10) || 0;
  }

  const COUNTDOWN_BUFFER = CONFIG?.APP_CONFIG?.countdown_buffer_seconds || 8;
  totalSeconds += COUNTDOWN_BUFFER;

  window.countdownInterval = setInterval(() => {
    const songStartTime = new Date(startTime.replace(" ", "T")).getTime();
    const elapsed = Math.floor((Date.now() - songStartTime) / 1000);
    const remaining = Math.max(totalSeconds - elapsed, 0);

    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    currentDurationElem.textContent = `${min}:${sec.toString().padStart(2, "0")}`;

    if (remaining === 0) {
      clearInterval(window.countdownInterval);
      getStreamingData();
    }
  }, 1000);
}

async function fetchStreamingData(apiUrl) {
  let actualUrl = apiUrl; // Declare outside try block to avoid reference errors
  try {
    debugLog("Attempting to fetch from URL:", apiUrl);

    // Detect if we're running on localhost
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    // If we're on localhost and have a relative URL, convert to production URL
    if (isLocalhost && !apiUrl.startsWith("http")) {
      // Check if app_url is configured
      const productionBaseUrl = CONFIG?.APP_CONFIG?.app_url;

      if (
        !productionBaseUrl ||
        productionBaseUrl === "https://your-domain.com/app/"
      ) {
        debugLog.error("❌ VITE_APP_URL is not configured in .env file");
        showPlaylistErrorNotification(
          "Configuration Error",
          "VITE_APP_URL is not configured. Please set it in your .env file.",
        );
        throw new Error("Missing VITE_APP_URL configuration");
      }

      actualUrl = new URL(apiUrl, productionBaseUrl).href;
      debugLog(
        `Localhost detected: Converting relative URL "${apiUrl}" to production URL: ${actualUrl}`,
      );
    }

    const isExternalUrl =
      actualUrl.startsWith("http://") || actualUrl.startsWith("https://");

    let fetchUrl = actualUrl;
    let usingProxy = false;

    // If we're on localhost and trying to fetch external data, use CORS proxy
    if (isLocalhost && isExternalUrl && !actualUrl.includes("localhost")) {
      debugLog("Using CORS proxy for localhost development");

      // For eajt.nl, try the CORS-enabled PHP script first
      if (
        actualUrl.includes("eajt.nl") &&
        actualUrl.includes("playlist.json")
      ) {
        const corsProxyUrl = actualUrl.replace(
          "playlist.json",
          "cors-playlist.php",
        );
        debugLog("Trying CORS-enabled playlist proxy:", corsProxyUrl);

        try {
          fetchUrl = corsProxyUrl;
          const response = await fetch(fetchUrl, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache",
            },
          });

          if (response.ok) {
            debugLog("Successfully using cors-playlist.php");
            const text = await response.text();
            debugLog("CORS proxy response length:", text.length);
            debugLog("Raw response (first 100 chars):", text.substring(0, 100));

            const data = JSON.parse(text);
            debugLog(
              "Successfully fetched and parsed streaming data via CORS proxy",
            );
            return data;
          } else {
            debugLog.warn(
              "cors-playlist.php failed, falling back to generic CORS proxy",
            );
            throw new Error(`CORS proxy failed: ${response.status}`);
          }
        } catch (corsError) {
          debugLog.warn(
            "CORS proxy failed, trying generic proxies:",
            corsError.message,
          );
        }
      }

      // Try multiple generic CORS proxy services for better reliability
      const corsProxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(actualUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(actualUrl)}`,
        `https://cors-anywhere.herokuapp.com/${actualUrl}`,
      ];

      // Try each proxy until one works
      for (let i = 0; i < corsProxies.length; i++) {
        try {
          fetchUrl = corsProxies[i];
          usingProxy = true;
          debugLog(`Trying CORS proxy ${i + 1}:`, fetchUrl);
          break;
        } catch (error) {
          debugLog.warn(`CORS proxy ${i + 1} failed, trying next...`);
          if (i === corsProxies.length - 1) {
            throw error;
          }
        }
      }
    }

    // Fetch the data (either direct or via generic CORS proxy)
    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Error fetching playlist: ${response.status} ${response.statusText}`,
      );
    }

    debugLog("Response status:", response.status);
    debugLog("Response content-type:", response.headers.get("content-type"));

    // Get the raw text first to inspect it
    const text = await response.text();

    // If we used generic CORS proxy, extract the actual content
    let actualText = text;
    if (usingProxy) {
      try {
        // Handle different proxy response formats
        if (fetchUrl.includes("allorigins.win")) {
          const proxyResponse = JSON.parse(text);
          actualText = proxyResponse.contents;
          debugLog("Extracted content from allorigins.win proxy");
        } else if (fetchUrl.includes("corsproxy.io")) {
          // corsproxy.io returns the content directly
          actualText = text;
          debugLog("Using content from corsproxy.io proxy");
        } else if (fetchUrl.includes("cors-anywhere")) {
          // cors-anywhere returns the content directly
          actualText = text;
          debugLog("Using content from cors-anywhere proxy");
        } else {
          // Fallback: try to parse as proxy response, otherwise use raw
          try {
            const proxyResponse = JSON.parse(text);
            actualText = proxyResponse.contents || proxyResponse.data || text;
          } catch {
            actualText = text;
          }
          debugLog("Extracted content from generic CORS proxy");
        }
      } catch (error) {
        debugLog.warn("Failed to parse CORS proxy response, using raw text");
        actualText = text;
      }
    } else {
      // Direct fetch or CORS-enabled PHP script
      actualText = text;
    }

    debugLog("Raw response length:", actualText.length);
    debugLog("Raw response (first 100 chars):", actualText.substring(0, 100));
    debugLog(
      "Raw response (last 100 chars):",
      actualText.substring(actualText.length - 100),
    );

    // Try to parse the JSON
    const data = JSON.parse(actualText);
    debugLog("Successfully fetched and parsed streaming data");
    return data;
  } catch (error) {
    console.error("fetchStreamingData error:", error);
    console.error("Failed URL:", actualUrl || apiUrl);

    // Log error but continue polling - playlist data will be fetched when available
    debugLog.warn(
      "Playlist fetch failed, will retry on next poll:",
      error.message,
    );

    if (error instanceof SyntaxError) {
      console.error(
        "JSON parsing failed - the playlist.json file appears to be malformed or truncated",
      );
    }

    // Re-throw so getStreamingData's catch block can trigger the UI notification
    throw error;
  }
}

function setCopyright() {
  var appVersion = APP_VERSION;
  var appName = APP_NAME;
  var appAuthor = APP_AUTHOR;

  var copy = document.getElementById("copy");
  let jaar = new Date().getFullYear();
  copy.textContent =
    appName + " " + appVersion + " | ©" + jaar + " " + appAuthor;

  const versionInfo = document.getElementById("version-info");
  if (versionInfo) {
    versionInfo.textContent = `v${appVersion}`;
  }

  setupAudioPlayer();
}

function setupAudioPlayer() {
  audio = new Audio(URL_STREAMING);
  audio.crossOrigin = "anonymous";
  audio.preload = "metadata";
  setVolume(DEFAULT_VOLUME || 100);

  setupAudioEventListeners();

  const volSlider = document.getElementById("volume");
  if (volSlider) {
    volSlider.oninput = function () {
      changeVolumeLocalStorage(this.value);
      audio.volume = intToDecimal(this.value);
    };
  }

  const playerButton = document.getElementById("playerButton");
  if (playerButton) playerButton.addEventListener("click", togglePlay);
}

function setupAudioEventListeners() {
  audio.addEventListener("pause", () => {
    setPlayerIcon(false);
    const btn = document.getElementById("playerButton");
    if (btn) btn.style.textShadow = "0 0 5px black";
  });

  audio.addEventListener("play", () => {
    setPlayerIcon(true);
    // You might also want to remove the text shadow here
    const playerButton = document.getElementById("playerButton");
    if (playerButton) {
      playerButton.style.textShadow = "none";
    }
    retryCount = 0;
    suspendCount = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (bufferingTimeout) {
      clearTimeout(bufferingTimeout);
      bufferingTimeout = null;
    }
    startHealthCheck(); // Start monitoring stream health
  });

  // Monitor buffering state with shorter timeout for faster recovery
  audio.addEventListener("waiting", () => {
    debugLog.log("Stream buffering...");
    // Only set timeout if not already buffering
    if (bufferingTimeout) clearTimeout(bufferingTimeout);
    bufferingTimeout = setTimeout(() => {
      // Only attempt recovery if still buffering and not paused by user
      if (audio.readyState < 3 && !audio.paused) {
        debugLog.warn("Buffering timeout - stream may be having issues");
        handleStreamError("buffering timeout");
      }
    }, 15000); // Increased to 15 seconds to avoid false positives
  });

  audio.addEventListener("canplaythrough", () => {
    debugLog.log("Stream ready to play through");
    if (bufferingTimeout) {
      clearTimeout(bufferingTimeout);
      bufferingTimeout = null;
    }
  });

  // Button state is now managed by togglePlay() function only
  // Removed onplay and onpause handlers to prevent race conditions

  // The 'playing' event is triggered when playback has begun, while 'play' is triggered when the request to play is initiated. 'play' is a more reliable event to use for updating the button state.
  audio.addEventListener("playing", () => {
    debugLog.log("Stream playing successfully");
    retryCount = 0;
    suspendCount = 0; // Reset suspend counter when playing successfully
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (bufferingTimeout) {
      clearTimeout(bufferingTimeout);
      bufferingTimeout = null;
    }
    startHealthCheck(); // Start monitoring stream health
  });
}

function togglePlay() {
  const isPlaying = isPlayerIconPaused();
  if (isPlaying) {
    setPlayerIcon(false);
    if (audio) {
      userInitiatedPause = true;
      audio.pause();
      audio.currentTime = 0;
    }
  } else {
    setPlayerIcon(true);
    if (!audio) setupAudioPlayer();
    audio.src = URL_STREAMING;
    setVolume(initialVol);
    audio.load();
    audio.play().catch((e) => debugLog.warn("Play failed", e));
  }
}

function intToDecimal(vol) {
  return vol / 100;
}

// Nightshift / lightmode toggle
// Clicking the #nightshift image will toggle the class 'lightmode' on the <body>
// The choice is persisted in localStorage under key 'rl_lightmode'
(function () {
  function initNightshift() {
    const night = document.getElementById("nightshift");
    if (!night) return;

  const pref = localStorage.getItem("rl_lightmode");
  if (pref === "1") {
    document.body.classList.add("lightmode");
    night.src = "assets/icons/lightbulb-dark.svg";
  }

  night.addEventListener("click", function () {
    const isOn = document.body.classList.toggle("lightmode");
    if (isOn) {
      localStorage.setItem("rl_lightmode", "1");
      night.src = "assets/icons/lightbulb-dark.svg";
    } else {
      localStorage.removeItem("rl_lightmode");
      night.src = "assets/icons/lightbulb-light.svg";
    }
  });
}

document.addEventListener("DOMContentLoaded", initNightshift);
