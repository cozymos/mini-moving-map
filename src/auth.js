// Simple implementation of Replit Auth with local development option
// This allows the app to work locally without Replit Auth

// Check if running locally (localhost)
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname.includes('replit.dev');

/**
 * Initialize authentication - bypassed in local development
 */
export async function initAuth() {
  if (isLocalDevelopment) {
    console.log('Running in local development mode - Replit Auth is disabled');
    // Return an anonymous user for local development
    return {
      isAuthenticated: true,
      user: {
        id: 'local-dev-user',
        name: 'Local Developer',
      }
    };
  }

  // In production on Replit, use Replit Auth
  try {
    // Check if user is logged in
    const response = await fetch('/api/auth/user', {
      credentials: 'include'
    });

    if (response.ok) {
      const user = await response.json();
      return {
        isAuthenticated: true,
        user
      };
    }
    
    return {
      isAuthenticated: false,
      user: null
    };
  } catch (error) {
    console.error('Auth error:', error);
    return {
      isAuthenticated: false,
      user: null,
      error
    };
  }
}

/**
 * Login function - redirects to Replit Auth in production
 */
export function login() {
  if (isLocalDevelopment) {
    console.log('Local development mode - login is simulated');
    window.location.reload();
    return;
  }
  
  // Redirect to Replit login
  window.location.href = '/api/login';
}

/**
 * Logout function - redirects to Replit Auth logout in production
 */
export function logout() {
  if (isLocalDevelopment) {
    console.log('Local development mode - logout is simulated');
    window.location.reload();
    return;
  }
  
  // Redirect to Replit logout
  window.location.href = '/api/logout';
}

/**
 * Check if auth is enabled for the current environment
 */
export function isAuthEnabled() {
  return !isLocalDevelopment || import.meta.env.VITE_ENABLE_AUTH_IN_DEV === 'true';
}