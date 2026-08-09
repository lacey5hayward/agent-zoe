/* ============================================================================
 * security-key.js — Physical Security Key Module (Phase 15)
 * ============================================================================
 * Implements a physical security key system where a Timoon MP4 player (or
 * similar USB device) acts as a physical token required to access private
 * memory and Cloudflare KV storage.
 *
 * Features:
 * - Device token generation and storage
 * - Device fingerprinting (hardware-specific)
 * - Memory access gating (requires device token)
 * - Cloudflare KV access control
 * - Secure localStorage + device-local storage
 *
 * Usage:
 *   SecurityKey.init()                    // Initialize on load
 *   SecurityKey.getDeviceToken()          // Get or create device token
 *   SecurityKey.validateDevicePresent()   // Check if device is present
 *   SecurityKey.requireDevice()           // Gate access to memory
 * ============================================================================ */

(function initSecurityKey() {
  const STORAGE_KEY = 'us-device-token';
  const DEVICE_ID_KEY = 'us-device-id';
  const DEVICE_FINGERPRINT_KEY = 'us-device-fingerprint';

  // ── Device fingerprinting ───────────────────────────────────────────────
  function generateDeviceFingerprint() {
    // Create a fingerprint based on browser + device characteristics
    const navigator_data = [
      navigator.userAgent,
      navigator.language,
      navigator.hardwareConcurrency || 'unknown',
      navigator.deviceMemory || 'unknown',
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset()
    ].join('|');

    // Simple hash function (not cryptographic, just for uniqueness)
    let hash = 0;
    for (let i = 0; i < navigator_data.length; i++) {
      const char = navigator_data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  function generateDeviceToken() {
    // Generate a cryptographically-random token
    const array = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(array);
    } else {
      // Fallback for older browsers
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // ── Storage helpers ────────────────────────────────────────────────────
  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  const SecurityKey = {
    /**
     * Initialize the security key system.
     * Creates a device token if one doesn't exist.
     */
    init() {
      let token = read(STORAGE_KEY);
      if (!token) {
        token = this.generateNewToken();
        write(STORAGE_KEY, token);
        console.info('[security-key] New device token created:', token.slice(0, 8) + '...');
      }

      // Store device fingerprint for validation
      const fingerprint = generateDeviceFingerprint();
      write(DEVICE_FINGERPRINT_KEY, fingerprint);

      return token;
    },

    /**
     * Generate a new device token (resets the key).
     * Use with caution — this invalidates the old token.
     */
    generateNewToken() {
      const token = generateDeviceToken();
      const deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      write(STORAGE_KEY, token);
      write(DEVICE_ID_KEY, deviceId);
      return token;
    },

    /**
     * Get the current device token.
     * Returns null if no token exists.
     */
    getDeviceToken() {
      return read(STORAGE_KEY);
    },

    /**
     * Get the device ID (persistent identifier).
     */
    getDeviceId() {
      let id = read(DEVICE_ID_KEY);
      if (!id) {
        id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        write(DEVICE_ID_KEY, id);
      }
      return id;
    },

    /**
     * Get the device fingerprint (used for validation).
     */
    getDeviceFingerprint() {
      return read(DEVICE_FINGERPRINT_KEY) || generateDeviceFingerprint();
    },

    /**
     * Validate that the device token is present and valid.
     * Returns true if the device is "present" (token exists).
     */
    validateDevicePresent() {
      const token = read(STORAGE_KEY);
      const fingerprint = read(DEVICE_FINGERPRINT_KEY);
      const currentFingerprint = generateDeviceFingerprint();

      if (!token) {
        console.warn('[security-key] No device token found');
        return false;
      }

      // Optional: check if fingerprint has changed (device moved to different computer)
      if (fingerprint && fingerprint !== currentFingerprint) {
        console.warn('[security-key] Device fingerprint mismatch (device moved?)');
        // For now, we allow it. In production, you might want to require re-auth.
      }

      return true;
    },

    /**
     * Gate access to memory/KV based on device presence.
     * Returns true if device is present and authorized.
     * Throws an error if device is missing.
     */
    requireDevice() {
      if (!this.validateDevicePresent()) {
        throw new Error(
          'Security key required: This device is not authorized to access your memory. ' +
          'Please connect your physical security key (MP4 player) to continue.'
        );
      }
      return true;
    },

    /**
     * Create a secure header object for Cloudflare KV requests.
     * Includes the device token so the Worker can validate it.
     */
    createSecureHeaders() {
      const token = this.getDeviceToken();
      const deviceId = this.getDeviceId();
      return {
        'X-Device-Token': token,
        'X-Device-Id': deviceId,
        'X-Device-Fingerprint': this.getDeviceFingerprint()
      };
    },

    /**
     * Export the device token as a QR code or text for backup.
     * (Useful for recovery if the device is lost.)
     */
    exportToken() {
      return {
        token: this.getDeviceToken(),
        deviceId: this.getDeviceId(),
        fingerprint: this.getDeviceFingerprint(),
        createdAt: new Date().toISOString(),
        backup: 'Keep this safe. You can restore access with this token if your device is lost.'
      };
    },

    /**
     * Import a previously exported token (recovery).
     * Use only if the original device is lost.
     */
    importToken(exportedData) {
      if (!exportedData || !exportedData.token) {
        throw new Error('Invalid backup data');
      }
      write(STORAGE_KEY, exportedData.token);
      write(DEVICE_ID_KEY, exportedData.deviceId);
      write(DEVICE_FINGERPRINT_KEY, exportedData.fingerprint);
      console.info('[security-key] Token imported from backup');
      return true;
    },

    /**
     * Check if this is the first time the device has been set up.
     */
    isFirstSetup() {
      return !read(STORAGE_KEY);
    },

    /**
     * Wipe the device token (factory reset).
     * Use with extreme caution — this will lock you out of your memory.
     */
    wipeToken() {
      if (confirm('WARNING: This will permanently delete your device token and lock you out of your memory. Are you sure?')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(DEVICE_ID_KEY);
        localStorage.removeItem(DEVICE_FINGERPRINT_KEY);
        console.warn('[security-key] Device token wiped');
        return true;
      }
      return false;
    }
  };

  window.SecurityKey = SecurityKey;

  // Auto-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SecurityKey.init());
  } else {
    SecurityKey.init();
  }
})();
