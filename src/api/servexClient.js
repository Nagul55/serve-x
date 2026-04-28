const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const ACCESS_TOKEN_KEY = 'servex_access_token';
const REFRESH_TOKEN_KEY = 'servex_refresh_token';
const AUTH_USER_KEY = 'servex_auth_user';
let refreshInFlight = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  const causeMessage = String(error?.cause?.message || '').toLowerCase();

  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('unable to reach backend') ||
    causeMessage.includes('failed to fetch') ||
    causeMessage.includes('networkerror')
  );
}

async function retryOnNetworkWarmup(task, {
  maxAttempts = 8,
  delayMs = 1200,
  maxDelayMs = 5000,
  backoffMultiplier = 1.6,
} = {}) {
  let lastError;
  let currentDelayMs = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      const shouldRetry = attempt < maxAttempts && isTransientNetworkError(error);
      if (!shouldRetry) {
        throw error;
      }

      await sleep(currentDelayMs);
      currentDelayMs = Math.min(
        maxDelayMs,
        Math.max(delayMs, Math.round(currentDelayMs * backoffMultiplier))
      );
    }
  }

  throw lastError;
}

function getAccessToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

function getRefreshToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

function setAuthSession({ accessToken, refreshToken, user }) {
  if (typeof window === 'undefined') return;
  if (accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  if (user) {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
}

function clearAuthSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function refreshSession() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearAuthSession();
    return null;
  }

  refreshInFlight = request('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
    skipRefresh: true,
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then((result) => {
      setAuthSession({
        accessToken: result?.access_token,
        refreshToken: result?.refresh_token,
        user: result?.user,
      });
      return result;
    })
    .catch((error) => {
      clearAuthSession();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

async function request(path, options = {}) {
  const {
    skipAuth = false,
    skipRefresh = false,
    retryOnAuthFailure = true,
    headers = {},
    ...fetchOptions
  } = options;
  const token = getAccessToken();
  const shouldSendAuth = !skipAuth;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(shouldSendAuth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...fetchOptions,
    });
  } catch (fetchError) {
    const error = new Error('Unable to reach backend service. Please wait a few seconds and try again.');
    error.cause = fetchError;
    throw error;
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore parse errors for non-JSON responses.
    }
    const error = new Error(message);
    error.status = response.status;

    if (
      response.status === 401 &&
      !skipRefresh &&
      retryOnAuthFailure &&
      !path.startsWith('/auth/')
    ) {
      try {
        await refreshSession();
        return request(path, {
          ...options,
          retryOnAuthFailure: false,
        });
      } catch {
        clearAuthSession();
      }
    }

    if (
      response.status === 401 &&
      path.startsWith('/auth/') &&
      !['/auth/login'].includes(path)
    ) {
      clearAuthSession();
    }

    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function createEntityClient(resourcePath) {
  return {
    list: (sort = '-created_date', limit = 100) => {
      const query = new URLSearchParams();
      if (sort) query.set('sort', sort);
      if (limit) query.set('limit', String(limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return request(`${resourcePath}${suffix}`);
    },
    create: (data) => request(resourcePath, { method: 'POST', body: JSON.stringify(data || {}) }),
    update: (id, data) => request(`${resourcePath}/${id}`, { method: 'PUT', body: JSON.stringify(data || {}) }),
    delete: (id) => request(`${resourcePath}/${id}`, { method: 'DELETE' }),
  };
}

export const servexApi = {
  entities: {
    CommunityNeed: createEntityClient('/community-needs'),
    Volunteer: createEntityClient('/volunteers'),
    Dispatch: createEntityClient('/dispatches'),
    FieldReport: createEntityClient('/field-reports'),
  },
  integrations: {
    Core: {
      InvokeLLM: (payload) => request('/integrations/llm', {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }),
    },
    Volunteers: {
      assignChatbotTask: ({ volunteerId, ...payload }) => request(
        `/integrations/volunteers/${volunteerId}/assign-chatbot-task`,
        {
          method: 'POST',
          body: JSON.stringify(payload || {}),
        }
      ),
    },
  },
  notifications: {
    list: (limit = 25) => request(`/notifications?limit=${Math.max(1, Number(limit) || 25)}`),
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request('/notifications/read-all', { method: 'POST' }),
  },
  auth: {
    login: async ({ email, role, password }) => {
      const result = await retryOnNetworkWarmup(() => request('/auth/login', {
        method: 'POST',
        skipAuth: true,
        skipRefresh: true,
        body: JSON.stringify({ email, role, password }),
      }));

      setAuthSession({
        accessToken: result?.access_token,
        refreshToken: result?.refresh_token,
        user: result?.user,
      });

      return result;
    },
    me: async () => {
      const token = getAccessToken();
      if (!token) {
        const error = new Error('Authentication required');
        error.status = 401;
        throw error;
      }

      const me = await request('/auth/me');
      if (me) {
        setAuthSession({ accessToken: token, user: me });
      }
      return me;
    },
    refresh: refreshSession,
    logout: async () => {
      try {
        await request('/auth/logout', { method: 'POST' });
      } catch {
        // Ignore logout API errors and clear local session anyway.
      }
      clearAuthSession();
    },
    logoutAll: async () => {
      await request('/auth/logout-all', { method: 'POST' });
      clearAuthSession();
    },
    fieldOfficerAccess: () => request('/auth/field-officer-access'),
    listSessions: () => request('/auth/sessions'),
    revokeSession: (sessionId) => request(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    redirectToLogin: () => {
      if (typeof window === 'undefined') return;
      window.location.href = '/login';
    },
    getStoredUser,
    hasSession: () => Boolean(getAccessToken() && getRefreshToken()),
  },
};
