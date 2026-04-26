const API_BASE = '/api/survex';
const TOKEN_KEY = 'survex_dashboard_token';

const loginCard = document.getElementById('loginCard');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const surveysContainer = document.getElementById('surveysContainer');
const surveysEmpty = document.getElementById('surveysEmpty');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const whoami = document.getElementById('whoami');
const summary = document.getElementById('summary');

let currentUser = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return date.toLocaleString();
}

function renderSurveys(items) {
  surveysContainer.innerHTML = '';

  if (!items.length) {
    surveysEmpty.classList.remove('hidden');
    return;
  }

  surveysEmpty.classList.add('hidden');

  for (const survey of items) {
    const div = document.createElement('article');
    div.className = 'survey';

    const status = survey.status || 'pending';
    const fieldName = survey.fieldOfficer?.name || 'Unknown Officer';
    const location = survey.surveyData?.location || '-';
    const issue = survey.surveyData?.issue || '-';
    const linkedNeed = survey.linkedNeed;

    div.innerHTML = `
      <div class="survey-head">
        <div>
          <strong>${fieldName}</strong>
          <div class="meta">${location}</div>
        </div>
        <span class="badge ${status}">${status}</span>
      </div>
      <p>${issue}</p>
      <div class="meta">Submitted: ${formatDate(survey.timestamp)}</div>
      <div class="meta">Officer Phone: ${survey.fieldOfficer?.phone || '-'}</div>
      <div class="meta">Survey ID: ${survey.id}</div>
      <div class="meta">Coordinator Ticket: ${linkedNeed?.id || 'Not synced yet'}</div>
      <div class="meta">Ticket Status: ${linkedNeed?.status || '-'}</div>
      ${currentUser?.role === 'coordinator' ? `
        <div style="margin-top: 10px; display:flex; gap:8px;">
          <button class="ghost" data-id="${survey.id}" data-status="pending">Mark Pending</button>
          <button class="ghost" data-id="${survey.id}" data-status="resolved">Mark Resolved</button>
        </div>
      ` : ''}
    `;

    div.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/surveys/${btn.dataset.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: btn.dataset.status }),
          });
          await loadSurveys();
        } catch (error) {
          alert(error.message);
        }
      });
    });

    surveysContainer.appendChild(div);
  }
}

async function loadSurveys() {
  const q = searchInput.value.trim();
  const status = statusFilter.value;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);

  const surveys = await api(`/surveys?${params.toString()}`);
  const syncedCount = surveys.filter((survey) => Boolean(survey.linkedNeed?.id)).length;
  summary.textContent = `${surveys.length} surveys loaded · ${syncedCount} synced to coordinator tickets`;
  renderSurveys(surveys);
}

async function loadMe() {
  currentUser = await api('/auth/me');
  whoami.textContent = `${currentUser.name} (${currentUser.role})`;
}

async function onLogin(event) {
  event.preventDefault();
  loginError.classList.add('hidden');

  const phone = document.getElementById('phoneInput').value.trim();
  const password = document.getElementById('passwordInput').value;

  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });

    setToken(result.token);
    await bootstrap();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  }
}

async function bootstrap() {
  const token = getToken();
  if (!token) {
    loginCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    return;
  }

  try {
    await loadMe();
    await loadSurveys();

    loginCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
  } catch (error) {
    clearToken();
    loginCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  }
}

loginForm.addEventListener('submit', onLogin);
refreshBtn.addEventListener('click', () => loadSurveys().catch((e) => alert(e.message)));
searchInput.addEventListener('input', () => loadSurveys().catch((e) => alert(e.message)));
statusFilter.addEventListener('change', () => loadSurveys().catch((e) => alert(e.message)));
logoutBtn.addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
  clearToken();
  await bootstrap();
});

bootstrap().catch((error) => {
  loginError.textContent = error.message;
  loginError.classList.remove('hidden');
});
