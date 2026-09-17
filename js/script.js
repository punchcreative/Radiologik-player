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
  fetchIntervalId,
  audio,
  userInitiatedPause = false;

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

let URL_STREAMING;
let correctPasswordHash = "default-hash-please-configure";
let correctPasswordHashPromise;

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
        // HIER ZIT DE MAGIC: Verhoogd van 400 naar 1500 (1.5 seconde)
        setTimeout(animateLetters, 1500);
        return;
      }
    } else {
      idx--;
      if (idx < 0) {
        direction = 1;
        idx = 0;
        // Tijd voordat hij weer opnieuw begint met indaden
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
    ? "⚠️ Cannot fetch live playlist data during localhost development. The displayed track information may be outdated."
    : "⚠️ Failed to fetch current playlist data. Track information may be outdated until connection is restored.";

  notification.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">Playlist Fetch Failed</div>
    <div style="font-size: 12px;">${message}</div>
    <div style="font-size: 11px; margin-top: 6px;">Click to dismiss</div>
  `;

  notification.style.cursor = "pointer";
  notification.onclick = () => notification.remove();

  setTimeout(() => {
    if (notification.parentNode) notification.remove();
  }, 8000);

  document.body.appendChild(notification);
}

window.addEventListener("load", async () => {
  registerServiceWorker();
  await loadAppVars();
});

window.addEventListener("DOMContentLoaded", showLoader);

async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration =
        await navigator.serviceWorker.register("service-worker.js");
      debugLog("Service Worker registered successfully:", registration);

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        debugLog("Service Worker update found");

        newWorker.addEventListener("statechange", () => {
          if (
            newWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            debugLog("New service worker available, showing update prompt");
            showUpdateNotification();
          }
        });
      });

      setInterval(
        () => {
          if (document.visibilityState === "visible") registration.update();
        },
        7 * 24 * 60 * 60 * 1000,
      );
    } catch (err) {
      debugLog("Service Worker registration failed:", err);
    }
  }
}

function checkForUpdates() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration)
        registration
          .update()
          .then(() => debugLog("Service worker update check completed"));
    });
  }
}

window.checkForUpdates = checkForUpdates;

function showUpdateNotification() {
  const updateDiv = document.createElement("div");
  updateDiv.id = "update-notification";
  updateDiv.innerHTML = `
    <div style="position: fixed; top: 10px; right: 10px; background: #031521; color: white; padding: 10px; border-radius: 5px; z-index: 10000; box-shadow: 0 2px 10px rgba(0,0,0,0.5);">
      <p style="margin: 0 0 10px 0;">App update available!</p>
      <button id="update-btn" style="background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Update Now</button>
      <button id="dismiss-btn" style="background: #6c757d; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 5px;">Later</button>
    </div>
  `;
  document.body.appendChild(updateDiv);

  document.getElementById("update-btn").addEventListener("click", () => {
    navigator.serviceWorker.getRegistration().then((registration) => {
      const waitingWorker = registration?.waiting;
      if (!waitingWorker) {
        window.location.reload();
        return;
      }
      navigator.serviceWorker.addEventListener("controllerchange", () =>
        window.location.reload(),
      );
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    });
  });

  document
    .getElementById("dismiss-btn")
    .addEventListener("click", () => updateDiv.remove());
}

let playlistData = "playlist.json";
const isPhone = /iPhone|Android.*Mobile|Windows Phone|iPod/i.test(
  navigator.userAgent,
);
let initialVol = DEFAULT_VOLUME || 100;

async function setStreamingUrl(url) {
  try {
    const response = await fetch(url, { method: "GET", mode: "cors" });
    if (response.ok) {
      URL_STREAMING = url;
      return;
    }
    debugLog.warn(`Stream URL ${url} returned status: ${response.status}`);
  } catch (error) {}
  alert("Streaming server is not reachable at the moment.");
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
  debugLog("Initializing player...");
  changeTitlePage();
  setCopyright();
  waitForServiceWorkerThenStart();
}

async function waitForServiceWorkerThenStart() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.ready;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  setTimeout(() => {
    if (isFirstLoad) {
      hideLoader();
      isFirstLoad = false;
    }
  }, 10000);

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const interval = isLocalhost ? 5000 : 1000;
  getStreamingData();
  fetchIntervalId = setInterval(getStreamingData, interval);
}

function loadConfigJS() {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "config.js";
    script.onload = () => {
      if (typeof CONFIG !== "undefined") resolve();
      else reject(new Error("config.js loaded but CONFIG not defined"));
    };
    script.onerror = () => reject(new Error("config.js not found"));
    document.head.appendChild(script);
  });
}

async function loadAppVars() {
  let envLoaded = false;
  if (window.envLoader) {
    envLoaded = await window.envLoader.loadEnv();
    if (envLoaded) {
      window.CONFIG = window.envLoader.createConfig();
      window.envLoader.validateConfig();
    } else {
      try {
        await loadConfigJS();
      } catch (error) {
        window.CONFIG = {
          PASSWORD_HASH: "default-hash-please-configure",
          ENABLE_PASSWORD_PROTECTION: false,
          APP_CONFIG: {
            scope: "/",
            background_color: "#031521",
            theme_color: "#031521",
            station_name: "Setup Required",
            stream_url: "https://example.com",
            app_url: "https://example.com",
            default_volume: 100,
            dim_volume_sleep_timer: 50,
            countdown_buffer_seconds: 8,
          },
        };
      }
    }
  }

  correctPasswordHash =
    CONFIG?.PASSWORD_HASH || "default-hash-please-configure";
  correctPasswordHashPromise = Promise.resolve(correctPasswordHash);

  if (CONFIG?.APP_CONFIG) {
    if (CONFIG.APP_CONFIG.station_name === "Your Radio Name")
      debugLog.warn("Using default APP_CONFIG values!");
  }

  Promise.all([
    fetch("app.json").then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    }),
    fetch("manifest.json").then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    }),
  ])
    .then(([appConfig, manifest]) => {
      APP_VERSION = appConfig.version;
      APP_NAME = appConfig.name;
      APP_DESCRIPTION = appConfig.description;
      APP_AUTHOR = appConfig.author;

      if (CONFIG?.APP_CONFIG) {
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
      } else {
        RADIO_NAME = manifest.custom_radio_config.station_name;
        STREAM_URL = manifest.custom_radio_config.stream_url;
        DEFAULT_VOLUME = manifest.custom_radio_config.default_volume;
        THEME_COLOR = manifest.custom_radio_config.theme_color;
        APP_URL = manifest.custom_radio_config.app_url;
      }

      if (APP_URL && !APP_URL.endsWith("/")) APP_URL = APP_URL + "/";

      PLAYLIST =
        CONFIG?.PLAYLIST_ENDPOINT ||
        manifest.api_endpoints.playlist ||
        "playlist.json";
      playlistData = PLAYLIST;

      if (typeof STREAM_URL === "string" && STREAM_URL.trim() !== "")
        setStreamingUrl(STREAM_URL);

      const existingLoader = document.getElementById("radioLoader");
      if (existingLoader) {
        const lettersContainer = existingLoader.querySelector(
          ".radio-loader-letters",
        );
        if (lettersContainer) {
          lettersContainer.innerHTML = "";
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

      if (CONFIG?.ENABLE_PASSWORD_PROTECTION === true) {
        checkPassword();
      } else {
        initializePlayer();
      }
    })
    .catch(() => {
      alert("Failed to load application configuration.");
    });
}

function checkPassword() {
  const storedHash = localStorage.getItem("passwordAccepted");

  if (
    storedHash &&
    storedHash.toLowerCase() === correctPasswordHash.trim().toLowerCase()
  ) {
    initializePlayer();
  } else {
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100vw";
    modal.style.height = "100vh";
    modal.style.background = "rgba(0,0,0,0.85)";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.zIndex = "99999";

    const box = document.createElement("div");
    box.style.background = "#fff";
    box.style.padding = "24px";
    box.style.borderRadius = "8px";
    box.style.textAlign = "center";
    box.style.minWidth = "280px";
    box.style.color = "#333";

    box.innerHTML = `
      <strong style="display:block; margin-bottom:10px; font-size:1.1em;">Private Stream</strong>
      <p style="margin-bottom:10px;">Please enter the password to access this content:</p>
      <input type="password" id="passwordInput" style="width: 80%; padding: 8px; font-size: 1em; border: 1px solid #ccc; border-radius: 4px;" autofocus autocomplete="off" />
      <p id="passwordError" style="color:red; font-size:0.9em; display:none; margin-top:8px;">Incorrect password.</p>
      <br>
      <label style="font-size:0.9em; cursor:pointer; display:inline-block; margin-top:10px;">
        <input type="checkbox" id="togglePassword" style="margin-right:4px;" /> Show password
      </label>
      <br><br>
      <button id="submitPassword" style="padding: 8px 20px; background: #031521; color: #fff; border: none; border-radius: 4px; cursor:pointer;">Submit</button>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const passwordInput = box.querySelector("#passwordInput");
    const togglePassword = box.querySelector("#togglePassword");
    const errorText = box.querySelector("#passwordError");

    passwordInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") box.querySelector("#submitPassword").click();
    });

    togglePassword.addEventListener("change", function () {
      passwordInput.type = this.checked ? "text" : "password";
    });

    box.querySelector("#submitPassword").onclick = function () {
      const password = passwordInput.value;
      errorText.style.display = "none";

      if (!window.crypto || !window.crypto.subtle) {
        errorText.textContent = "Error: Hashing requires HTTPS context.";
        errorText.style.display = "block";
        return;
      }

      sha256(password)
        .then((hash) => {
          correctPasswordHashPromise.then((correctHash) => {
            // Compare cleanly, avoiding space and capitalization mismatch issues
            if (hash.toLowerCase() === correctHash.trim().toLowerCase()) {
              localStorage.setItem("passwordAccepted", correctHash.trim());
              document.body.removeChild(modal);
              initializePlayer();
            } else {
              errorText.style.display = "block";
              passwordInput.value = "";
              passwordInput.focus();
            }
          });
        })
        .catch((err) => {
          console.error("Hashing failed:", err);
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

  if (
    song !== currentSong.textContent ||
    artist !== currentArtist.textContent
  ) {
    currentSong.classList.add("fade-out");
    currentArtist.classList.add("fade-out");

    setTimeout(function () {
      currentSong.textContent = song;
      currentArtist.textContent = artist;

      // Check title length and toggle the marquee class
      if (song.length > 25) {
        currentSong.classList.add("scroll-marquee");
      } else {
        currentSong.classList.remove("scroll-marquee");
      }

      displayTrackCountdown(song, duration, startTime, nextTrackStarttime);

      currentSong.classList.remove("fade-out");
      currentSong.classList.add("fade-in");
      currentArtist.classList.remove("fade-out");
      currentArtist.classList.add("fade-in");
      currentDuration.classList.remove("fade-out");
      currentDuration.classList.add("fade-in");

      if ("mediaSession" in navigator) {
        const cacheBuster = Date.now();
        const artworkUrl = `${APP_URL}albumart/art-00.jpg?cb=${cacheBuster}`;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song,
          artist: artist,
          album: RADIO_NAME,
          artwork: [{ src: artworkUrl, sizes: "200x200", type: "image/jpg" }],
        });
        navigator.mediaSession.setActionHandler("play", () => togglePlay());
        navigator.mediaSession.setActionHandler("pause", () => togglePlay());
        navigator.mediaSession.setActionHandler("stop", () => {
          if (isPlayerIconPaused()) {
            setPlayerIcon(false);
            document.getElementById("playerButton").style.textShadow =
              "0 0 5px black";
            audio.pause();
            audio.src = "";
          }
        });
      }
    }, 100);

    setTimeout(function () {
      currentSong.classList.remove("fade-in");
      currentArtist.classList.remove("fade-in");
      currentDuration.classList.remove("fade-in");
    }, 200);
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

    if (isFirstLoad) {
      hideLoader();
      isFirstLoad = false;
    }

    if (data) {
      if (jsonErrorRetryCount > 0) jsonErrorRetryCount = 0;

      var currentSong = data.Current.Title;
      var charsToplayTitle = 25;
      var charsPlayingTitle = 40;
      var nrToplay = 5;
      var nrHistory = 3;
      const currentArtistVal = data.Current.Artist;
      let currentDurationVal = data.Current.Duration;
      let currentStartTime = data.Current.Starttime;

      const safeCurrentSong = (currentSong || "")
        .replace(/'/g, "'")
        .replace(/&/g, "&")
        .trim();
      const safeCurrentArtist = (currentArtistVal || "")
        .replace(/'/g, "'")
        .replace(/&/g, "&")
        .trim();

      const cleanArtist = isPlaceholderValue(safeCurrentArtist)
        ? ""
        : safeCurrentArtist;
      const cleanSong = isPlaceholderValue(safeCurrentSong)
        ? ""
        : safeCurrentSong;

      if (isPlaceholderValue(currentDurationVal)) currentDurationVal = null;
      if (isPlaceholderValue(currentStartTime)) currentStartTime = null;

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
        if (!container) return;
        container.innerHTML = "";
        const section = document.querySelector(sectionSelector);
        if (section) section.style.display = list.length === 0 ? "none" : "";

        const maxItems = sectionName === "toplay" ? nrToplay : nrHistory;
        const limited = list.slice(Math.max(0, list.length - maxItems));

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

          if (!validArtist && !validTitle) return;

          let displayTitle = validTitle;
          if (displayTitle.length > charsToplayTitle)
            displayTitle = displayTitle.substring(0, charsToplayTitle) + "...";

          const songDisplay =
            validArtist && validTitle
              ? `${validArtist} - ${displayTitle}`
              : validArtist || displayTitle;

          article.innerHTML = `<div class="music-info text-center"><p class="song ${textSize}">${songDisplay}</p></div>`;
          container.appendChild(article);
        });
      }

      let nextTrackStarttime =
        data.Next && data.Next.length > 0 ? data.Next[0].Starttime : null;
      if (isPlaceholderValue(nextTrackStarttime)) nextTrackStarttime = null;

      if (cleanSong !== musicActual) {
        if (awaitingNextSong) {
          awaitingNextSong = false;
          const currentDuration = document.getElementById(
            "currentDurationDisplay",
          );
          if (currentDuration) {
            currentDuration.style.opacity = "1";
            currentDuration.style.animation = "";
          }
        }

        const hasDuration =
          !isPlaceholderValue(currentDurationVal) &&
          !isPlaceholderValue(currentStartTime);
        if (hasDuration) {
          if (fetchIntervalId) {
            clearInterval(fetchIntervalId);
            fetchIntervalId = null;
          }
        }

        musicActual = cleanSong;
        refreshCurrentSong(
          cleanSong,
          cleanArtist,
          currentDurationVal,
          currentStartTime,
          nextTrackStarttime,
        );
        document.title = `${RADIO_NAME} | ${cleanSong}${cleanArtist ? " - " + cleanArtist : ""}`;
      }

      renderTrackList("toplaySong", ".toplay", validToplay, "toplay");
      renderTrackList("historicSong", ".historic", validHistory, "historic");
    }
  } catch (error) {
    if (
      (error.message && error.message.includes("JSON")) ||
      error.name === "SyntaxError"
    ) {
      if (jsonErrorRetryCount < MAX_JSON_ERROR_RETRIES) {
        jsonErrorRetryCount++;
        setTimeout(() => getStreamingData(), 15000);
      } else {
        setTimeout(() => {
          jsonErrorRetryCount = 0;
        }, 300000);
      }
    }
  }
}

function displayTrackCountdown(song, duration, startTime, nextTrackStarttime) {
  const currentDurationElem = document.getElementById("currentDurationDisplay");
  let countdownInterval;
  const COUNTDOWN_BUFFER_SECONDS =
    CONFIG?.APP_CONFIG?.countdown_buffer_seconds || 8;

  if (!currentDurationElem) return;

  if (isPlaceholderValue(duration) || isPlaceholderValue(startTime)) {
    currentDurationElem.textContent = "";
    currentDurationElem.style.display = "none";
    return;
  }

  currentDurationElem.style.display = "";
  if (window.countdownInterval) {
    clearInterval(window.countdownInterval);
    window.countdownInterval = null;
  }

  function startCountdown(duration, startTime, nextTrackStarttime) {
    let totalSeconds = 0;

    if (typeof duration === "number") {
      totalSeconds = duration;
    } else if (
      typeof duration === "string" ||
      (typeof duration === "number" && duration.toString().includes(":"))
    ) {
      const durationStr = duration.toString();
      const parts = durationStr.split(":").map(Number);
      if (parts.length === 0 || parts.some(isNaN)) return;
      if (parts.length === 3)
        totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) totalSeconds = parts[0] * 60 + parts[1];
      else if (parts.length === 1) totalSeconds = parts[0];
    } else {
      totalSeconds = parseInt(duration, 10);
    }

    totalSeconds += COUNTDOWN_BUFFER_SECONDS;
    let elapsedSeconds = 0;
    let countdownStartTime = Date.now();

    if (startTime) {
      try {
        let isoStartTime = startTime;
        if (startTime.includes(" ") && !startTime.includes("T"))
          isoStartTime = startTime.replace(" ", "T");
        const songStartTime = new Date(isoStartTime).getTime();
        const now = Date.now();
        elapsedSeconds = Math.floor((now - songStartTime) / 1000);
        elapsedSeconds = Math.max(0, Math.min(elapsedSeconds, totalSeconds));
      } catch (error) {
        elapsedSeconds = 0;
      }
    }

    let remainingSeconds;
    let useNextTrackTiming = false;

    if (nextTrackStarttime) {
      try {
        let isoNextStartTime = nextTrackStarttime;
        if (
          nextTrackStarttime.includes(" ") &&
          !nextTrackStarttime.includes("T")
        )
          isoNextStartTime = nextTrackStarttime.replace(" ", "T");
        const nextTrackTime = new Date(isoNextStartTime).getTime();
        const now = Date.now();
        remainingSeconds = Math.floor((nextTrackTime - now) / 1000);

        if (remainingSeconds > 0 && remainingSeconds < totalSeconds + 30) {
          useNextTrackTiming = true;
        }
      } catch (error) {}
    }

    if (!useNextTrackTiming) remainingSeconds = totalSeconds - elapsedSeconds;

    let pollBeforeEnd;
    let pollDelay;

    if (useNextTrackTiming) {
      if (remainingSeconds <= 10) pollBeforeEnd = 1;
      else if (remainingSeconds <= 30)
        pollBeforeEnd = Math.max(1, Math.floor(remainingSeconds * 0.3));
      else pollBeforeEnd = 10;
      pollDelay = Math.max(1000, (remainingSeconds - pollBeforeEnd) * 1000);
    } else {
      if (totalSeconds < 10) pollBeforeEnd = 1;
      else if (totalSeconds < 30)
        pollBeforeEnd = Math.max(1, Math.floor(remainingSeconds * 0.5));
      else pollBeforeEnd = 30;
      pollDelay = Math.max(1000, (remainingSeconds - pollBeforeEnd) * 1000);
    }

    setTimeout(() => {
      if (fetchIntervalId) {
        clearInterval(fetchIntervalId);
        fetchIntervalId = null;
      }
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      const interval = isLocalhost ? 5000 : 1000;
      fetchIntervalId = setInterval(getStreamingData, interval);
    }, pollDelay);

    function updateCountdown() {
      const now = Date.now();
      const totalElapsed =
        elapsedSeconds + Math.floor((now - countdownStartTime) / 1000);
      const remaining = Math.max(totalSeconds - totalElapsed, 0);
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;

      if (remaining > 0 && remaining <= COUNTDOWN_BUFFER_SECONDS) {
        currentDurationElem.style.opacity = "0.8";
        currentDurationElem.style.color = "#ffd700";
      } else {
        currentDurationElem.style.opacity = "1";
        currentDurationElem.style.color = "";
      }

      if (remaining === 0 && !awaitingNextSong) {
        awaitingNextSong = true;
        currentDurationElem.textContent = "Next song...";
        currentDurationElem.style.opacity = "0.7";
        currentDurationElem.style.color = "";
        currentDurationElem.style.animation = "pulse 1.5s ease-in-out infinite";

        if (fetchIntervalId) {
          clearInterval(fetchIntervalId);
          fetchIntervalId = null;
        }

        fetchIntervalId = setInterval(getStreamingData, 500);
        getStreamingData();

        setTimeout(() => {
          if (awaitingNextSong) {
            awaitingNextSong = false;
            currentDurationElem.textContent = "0:00";
            currentDurationElem.style.opacity = "1";
            currentDurationElem.style.animation = "";
            getStreamingData();
          }
        }, 15000);
      } else if (remaining > 0) {
        currentDurationElem.textContent = `${min}:${sec.toString().padStart(2, "0")}`;
        currentDurationElem.style.opacity = "1";
        currentDurationElem.style.animation = "";
      }
    }

    updateCountdown();
    window.countdownInterval = setInterval(() => {
      updateCountdown();
    }, 1000);
  }

  if (currentDurationElem && song && duration)
    startCountdown(duration, startTime, nextTrackStarttime);
}

async function fetchStreamingData(apiUrl) {
  let actualUrl = apiUrl;
  try {
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (isLocalhost && !apiUrl.startsWith("http")) {
      const productionBaseUrl = CONFIG?.APP_CONFIG?.app_url;
      if (
        !productionBaseUrl ||
        productionBaseUrl === "https://your-domain.com/app/"
      ) {
        showPlaylistErrorNotification(
          "Configuration Error",
          "VITE_APP_URL is not configured.",
        );
        throw new Error("Missing VITE_APP_URL configuration");
      }
      actualUrl = new URL(apiUrl, productionBaseUrl).href;
    }

    const isExternalUrl =
      actualUrl.startsWith("http://") || actualUrl.startsWith("https://");
    let fetchUrl = actualUrl;
    let usingProxy = false;

    if (isLocalhost && isExternalUrl && !actualUrl.includes("localhost")) {
      if (
        actualUrl.includes("eajt.nl") &&
        actualUrl.includes("playlist.json")
      ) {
        const corsProxyUrl = actualUrl.replace(
          "playlist.json",
          "cors-playlist.php",
        );
        try {
          fetchUrl = corsProxyUrl;
          const response = await fetch(fetchUrl, {
            method: "GET",
            headers: { "Cache-Control": "no-cache" },
          });
          if (response.ok) {
            const text = await response.text();
            return JSON.parse(text);
          } else {
            throw new Error(`CORS proxy failed: ${response.status}`);
          }
        } catch (corsError) {}
      }

      const corsProxies = [
        `https://api.allorigins.win/get?url=${encodeURIComponent(actualUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(actualUrl)}`,
        `https://cors-anywhere.herokuapp.com/${actualUrl}`,
      ];

      for (let i = 0; i < corsProxies.length; i++) {
        try {
          fetchUrl = corsProxies[i];
          usingProxy = true;
          break;
        } catch (error) {
          if (i === corsProxies.length - 1) throw error;
        }
      }
    }

    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok)
      throw new Error(
        `Error fetching playlist: ${response.status} ${response.statusText}`,
      );

    const text = await response.text();
    let actualText = text;
    if (usingProxy) {
      try {
        if (fetchUrl.includes("allorigins.win")) {
          const proxyResponse = JSON.parse(text);
          actualText = proxyResponse.contents;
        } else if (
          fetchUrl.includes("corsproxy.io") ||
          fetchUrl.includes("cors-anywhere")
        ) {
          actualText = text;
        } else {
          try {
            const proxyResponse = JSON.parse(text);
            actualText = proxyResponse.contents || proxyResponse.data || text;
          } catch {
            actualText = text;
          }
        }
      } catch (error) {
        actualText = text;
      }
    } else {
      actualText = text;
    }
    return JSON.parse(actualText);
  } catch (error) {
    throw error;
  }
}

function setCopyright() {
  var appVersion = APP_VERSION;
  var appName = APP_NAME;
  var appAuthor = APP_AUTHOR;

  var copy = document.getElementById("copy");
  let jaar = new Date().getFullYear();
  if (copy)
    copy.textContent =
      appName + " " + appVersion + " | ©" + jaar + " " + appAuthor;

  const versionInfo = document.getElementById("version-info");
  if (versionInfo) versionInfo.textContent = `v${appVersion}`;

  setupAudioPlayer();
}

async function setupAudioPlayer() {
  audio = new Audio(URL_STREAMING);
  audio.crossOrigin = "anonymous";
  audio.preload = "metadata";
  audio.autoplay = false;
  audio.loop = false;
  audio.muted = false;

  if ("mozPreservesPitch" in audio) audio.mozPreservesPitch = false;
  if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = false;

  setupAudioEventListeners();

  const volumeSlider = document.getElementById("volume");
  if (volumeSlider) {
    volumeSlider.oninput = function () {
      changeVolumeLocalStorage(this.value);
      audio.volume = intToDecimal(this.value);
    };
  }

  const playerButton = document.getElementById("playerButton");
  if (playerButton) playerButton.addEventListener("click", togglePlay);
}

function setupAudioEventListeners() {
  if (!audio) return;

  let retryCount = 0;
  let retryTimer = null;
  let bufferingTimeout = null;
  let healthCheckInterval = null;

  function resetButtonState() {
    const playerButton = document.getElementById("playerButton");
    if (playerButton && isPlayerIconPaused()) setPlayerIcon(false);
  }

  function startHealthCheck() {
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(() => {
      const playerButton = document.getElementById("playerButton");
      if (playerButton && isPlayerIconPaused()) {
        if (audio.paused || audio.ended || audio.readyState < 2) {
          resetButtonState();
          audio.load();
          const playPromise = audio.play();
          if (playPromise !== undefined) playPromise.catch(() => {});
        }
      }
    }, 3000);
  }

  function stopHealthCheck() {
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
  }

  function handleStreamError(eventType = "unknown") {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (bufferingTimeout) {
      clearTimeout(bufferingTimeout);
      bufferingTimeout = null;
    }

    resetButtonState();

    if (retryCount < 3) {
      retryCount++;
      retryTimer = setTimeout(() => {
        const playPromise = audio.play();
        if (playPromise !== undefined) playPromise.catch((error) => {});
        retryTimer = null;
      }, 10000);
    } else {
      resetButtonState();
      retryCount = 0;
    }
  }

  audio.addEventListener("error", (e) => handleStreamError("error"));
  audio.addEventListener("stalled", () => {
    setTimeout(() => {
      if (audio.readyState < 2) handleStreamError("stalled");
    }, 10000);
  });

  let suspendCount = 0;
  audio.addEventListener("suspend", () => {
    suspendCount++;
    if (suspendCount > 3) {
      handleStreamError("suspend");
      suspendCount = 0;
    }
  });

  audio.addEventListener("abort", () => {});
  audio.addEventListener("emptied", () => {});

  audio.addEventListener("pause", () => {
    setPlayerIcon(false);
    const playerButton = document.getElementById("playerButton");
    if (playerButton) playerButton.style.textShadow = "0 0 5px black";
    stopHealthCheck();
  });

  audio.addEventListener("play", () => {
    setPlayerIcon(true);
    const playerButton = document.getElementById("playerButton");
    if (playerButton) playerButton.style.textShadow = "none";
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
    startHealthCheck();
  });

  audio.addEventListener("waiting", () => {
    if (bufferingTimeout) clearTimeout(bufferingTimeout);
    bufferingTimeout = setTimeout(() => {
      if (audio.readyState < 3 && !audio.paused)
        handleStreamError("buffering timeout");
    }, 15000);
  });

  audio.addEventListener("canplaythrough", () => {
    if (bufferingTimeout) {
      clearTimeout(bufferingTimeout);
      bufferingTimeout = null;
    }
  });

  audio.addEventListener("playing", () => {
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
    startHealthCheck();
  });
}

function togglePlay() {
  const playerButton = document.getElementById("playerButton");
  const isPlaying = isPlayerIconPaused();

  if (isPlaying) {
    setPlayerIcon(false);
    playerButton.style.textShadow = "0 0 5px black";

    if (audio) {
      userInitiatedPause = true;
      audio.pause();
      audio.currentTime = 0;
    }
  } else {
    setPlayerIcon(true);
    playerButton.style.textShadow = "0 0 5px black";

    if (!audio) {
      audio = new Audio(URL_STREAMING);
      audio.crossOrigin = "anonymous";
      audio.preload = "none";
      audio.autoplay = false;
      audio.loop = false;
      audio.muted = false;
      setupAudioEventListeners();
    } else if (audio.src !== URL_STREAMING) {
      audio.src = URL_STREAMING;
    }

    setVolume(initialVol);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        setPlayerIcon(false);
      });
    }
  }
}

function intToDecimal(vol) {
  return vol / 100;
}

(function () {
  function initNightshift() {
    const night = document.getElementById("nightshift");
    if (!night) return;

    try {
      const pref = localStorage.getItem("rl_lightmode");
      if (pref === "1") {
        document.body.classList.add("lightmode");
        night.src = "assets/icons/lightbulb-dark.svg";
        night.alt = "Light mode on";
      }
    } catch (e) {}

    night.addEventListener("click", function () {
      const isOn = document.body.classList.toggle("lightmode");
      try {
        if (isOn) {
          localStorage.setItem("rl_lightmode", "1");
          night.src = "assets/icons/lightbulb-dark.svg";
          night.alt = "Light mode on";
        } else {
          localStorage.removeItem("rl_lightmode");
          night.src = "assets/icons/lightbulb-light.svg";
          night.alt = "Light mode off";
        }
      } catch (e) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNightshift);
  } else {
    initNightshift();
  }
})();
