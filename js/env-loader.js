// RL Player - Environment Variable Loader
// This loads environment variables for client-side applications

class EnvLoader {
  constructor() {
    this.env = {};
    this.loaded = false;
  }

  // Load environment variables from .env file
  async loadEnv() {
    try {
      console.log("🔧 Loading environment configuration...");

      const response = await fetch(".env");
      if (!response.ok) {
        console.warn("⚠️ .env file not found, falling back to config.js");
        return false;
      }

      const envContent = await response.text();
      this.parseEnvContent(envContent);
      this.loaded = true;

      console.log("✅ Environment variables loaded successfully");
      console.log("📊 Loaded variables:", Object.keys(this.env).length);

      return true;
    } catch (error) {
      console.warn("⚠️ Failed to load .env file:", error.message);
      console.warn("📋 Falling back to config.js method");
      return false;
    }
  }

  // Parse .env file content
  parseEnvContent(content) {
    const lines = content.split("\n");

    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Parse KEY=VALUE format
      const equalIndex = trimmed.indexOf("=");
      if (equalIndex === -1) continue;

      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();

      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, "");

      this.env[key] = cleanValue;
    }
  }

  // Get environment variable value
  get(key, defaultValue = null) {
    return this.env[key] || defaultValue;
  }

  // Get boolean environment variable
  getBool(key, defaultValue = false) {
    const value = this.get(key);
    if (!value) return defaultValue;

    return value.toLowerCase() === "true";
  }

  // Get number environment variable
  getNumber(key, defaultValue = 0) {
    const value = this.get(key);
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // Create CONFIG object from environment variables
  createConfig() {
    if (!this.loaded) {
      console.warn("⚠️ Environment not loaded, using empty config");
      return {};
    }

    return {
      PASSWORD_HASH: this.get(
        "VITE_PASSWORD_HASH",
        "default-hash-please-configure",
      ),

      // Security Settings
      ENABLE_PASSWORD_PROTECTION: this.getBool(
        "VITE_ENABLE_PASSWORD_PROTECTION",
        false,
      ),

      APP_CONFIG: {
        // PWA Settings
        scope: this.get("VITE_SCOPE", "/"),
        background_color: this.get("VITE_BACKGROUND_COLOR", "#031521"),
        theme_color: this.get("VITE_THEME_COLOR", "#031521"),

        // Radio Station Settings
        station_name: this.get("VITE_STATION_NAME", "Your Radio Name"),
        stream_url: this.get("VITE_STREAM_URL", "https://your-stream-url.com"),
        app_url: this.get("VITE_APP_URL", "https://your-domain.com/"),

        // Audio Settings
        default_volume: this.getNumber("VITE_DEFAULT_VOLUME", 100),

        // Timing Settings
        countdown_buffer_seconds: this.getNumber(
          "VITE_COUNTDOWN_BUFFER_SECONDS",
          8,
        ),
      },

      // Development settings
      DEBUG_MODE: this.getBool("VITE_DEBUG_MODE", false),
      PLAYLIST_ENDPOINT: this.get("VITE_PLAYLIST_ENDPOINT", "playlist.json"),
    };
  }

  // Check if all required variables are set
  validateConfig() {
    const required = ["VITE_STATION_NAME", "VITE_STREAM_URL", "VITE_APP_URL"];

    // Only require password hash if protection is enabled
    if (this.getBool("VITE_ENABLE_PASSWORD_PROTECTION", false)) {
      required.push("VITE_PASSWORD_HASH");
    }

    const missing = required.filter(
      (key) => !this.get(key) || this.get(key).includes("your-"),
    );

    if (missing.length > 0) {
      console.warn("⚠️ Missing or default environment variables:");
      missing.forEach((key) => console.warn(`   - ${key}`));
      console.warn("📋 Please update your .env file");
      return false;
    }

    console.log("✅ All required environment variables are configured");
    return true;
  }
}

// Create global env loader instance
window.envLoader = new EnvLoader();
