console.log('[Google Auth] Module loaded');

let cachedToken = null;

// OAuth configuration from manifest
const CLIENT_ID = '919088017561-injqmtk5dmkugt69blagoutuuhg19qse.apps.googleusercontent.com';
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

// Log redirect URI for debugging (should match OAuth client redirect URI)
console.log('[Google Auth] Using redirect URI:', REDIRECT_URI);

/**
 * Load cached token from Chrome storage
 */
async function loadCachedToken() {
  try {
    const result = await chrome.storage.local.get(['googleAuthToken']);
    if (result.googleAuthToken) {
      cachedToken = result.googleAuthToken;
      console.log('[Google Auth] Loaded token from storage');
      return true;
    }
  } catch (error) {
    console.log('[Google Auth] No cached token in storage');
  }
  return false;
}

/**
 * Save token to Chrome storage
 */
async function saveToken(token) {
  try {
    await chrome.storage.local.set({ googleAuthToken: token });
    cachedToken = token;
    console.log('[Google Auth] Saved token to storage');
  } catch (error) {
    console.error('[Google Auth] Failed to save token:', error);
    cachedToken = token; // Still cache in memory as fallback
  }
}

/**
 * Clear token from Chrome storage
 */
async function clearSavedToken() {
  try {
    await chrome.storage.local.remove(['googleAuthToken']);
    cachedToken = null;
    console.log('[Google Auth] Cleared token from storage');
  } catch (error) {
    console.error('[Google Auth] Failed to clear saved token:', error);
    cachedToken = null;
  }
}

/**
 * Get OAuth token using Chrome Identity WebAuthFlow (for Web Application clients)
 * @param {boolean} interactive - Whether to show sign-in UI if needed
 * @returns {Promise<string>} OAuth token
 */
export async function getAuthToken(interactive = true) {
  // Load from storage first if not in memory
  if (!cachedToken) {
    await loadCachedToken();
  }
  
  // Check if we have a cached token first (if non-interactive)
  if (!interactive && cachedToken) {
    // Verify token is still valid by trying a simple API call
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${cachedToken}` }
      });
      if (response.ok) {
        return cachedToken;
      }
      // Token invalid, clear cache
      await clearSavedToken();
    } catch (error) {
      await clearSavedToken();
    }
  }

  // Build OAuth URL - use prompt=select_account instead of consent to avoid re-prompting
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(CLIENT_ID)}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `response_type=token&` +
    `scope=${encodeURIComponent(SCOPES)}&` +
    `include_granted_scopes=true&` +
    `prompt=select_account`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive
    }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError;
        const message = error.message || 'Unknown error';
        
        // Handle user cancellation gracefully
        if (error.message?.includes('canceled') || error.message?.includes('denied')) {
          console.log('[Google Auth] User cancelled sign-in');
          reject(new Error('USER_CANCELLED'));
        } else {
          console.error('[Google Auth] ✗ Failed to get token:', message);
          reject(new Error(message));
        }
      } else if (responseUrl) {
        // Extract access_token from URL fragment
        const url = new URL(responseUrl);
        const params = new URLSearchParams(url.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
          console.log('[Google Auth] ✓ Token obtained successfully');
          // Save to storage and memory
          saveToken(token);
          resolve(token);
        } else {
          const error = params.get('error') || 'No token in response';
          console.error('[Google Auth] ✗ OAuth error:', error);
          reject(new Error(`OAuth error: ${error}`));
        }
      } else {
        console.error('[Google Auth] ✗ No response URL');
        reject(new Error('No response URL'));
      }
    });
  });
}

/**
 * Get authorization headers for API requests
 * @param {boolean} interactive - Whether to show sign-in UI if token is missing
 * @returns {Promise<{Authorization: string}>} Headers object
 */
export async function getAuthHeaders(interactive = false) {
  try {
    const token = await getAuthToken(interactive);
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  } catch (error) {
    // If token fetch fails, return empty headers and let caller handle it
    console.warn('[Google Auth] Could not get auth headers:', error.message);
    return {
      'Content-Type': 'application/json'
    };
  }
}

/**
 * Remove cached token and revoke on Google servers
 */
export async function revokeToken() {
  const token = cachedToken;
  if (token) {
    console.log('[Google Auth] Revoking token...');
    
    // Clear from storage first
    await clearSavedToken();

    try {
      // Revoke on Google servers
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
      console.log('[Google Auth] ✓ Token revoked on Google servers');
    } catch (error) {
      // Even if revoke fails, we've cleared local cache
      console.warn('[Google Auth] Failed to revoke on server (cache cleared):', error);
    }
  } else {
    console.log('[Google Auth] No token to revoke');
  }
}

/**
 * Check if user is signed in
 * @returns {Promise<boolean>}
 */
export async function isSignedIn() {
  try {
    const token = await getAuthToken(false);
    return !!token;
  } catch (error) {
    return false;
  }
}

/**
 * Get user email from Google
 * @returns {Promise<string|null>}
 */
export async function getUserEmail() {
  try {
    const token = await getAuthToken(false);
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error('[Google Auth] Failed to fetch user info, status:', response.status);
      // If token is invalid/expired, clear cached token
      if (response.status === 401 && token) {
        chrome.identity.removeCachedAuthToken({ token });
        cachedToken = null;
      }
      return null;
    }

    const data = await response.json();
    console.log('[Google Auth] User email:', data.email);
    return data.email || null;
  } catch (error) {
    console.error('[Google Auth] Failed to get user email:', error);
    return null;
  }
}

/**
 * Check auth status and return user info
 * @returns {Promise<{signedIn: boolean, email: string|null}>}
 */
export async function checkAuthStatus() {
  try {
    const signedIn = await isSignedIn();
    let email = null;
    if (signedIn) {
      email = await getUserEmail();
    }
    return { signedIn, email };
  } catch (error) {
    console.error('[Google Auth] Failed to check auth status:', error);
    return { signedIn: false, email: null };
  }
}

/**
 * Sign in (interactive)
 * @returns {Promise<{success: boolean, email?: string, error?: string}>}
 */
export async function signIn() {
  try {
    const token = await getAuthToken(true);
    const email = await getUserEmail();
    return { success: true, email };
  } catch (error) {
    if (error.message === 'USER_CANCELLED') {
      return { success: false, error: 'Sign-in cancelled by user' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Sign out
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signOut() {
  try {
    await revokeToken();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove cached token when API returns 401
 * @param {string} token - Token to remove
 */
export async function clearInvalidToken(token) {
  if (token && cachedToken === token) {
    await clearSavedToken();
    console.log('[Google Auth] Cleared invalid token');
  }
}
