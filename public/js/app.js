// Each feature registers a render function here as we build it
const pages = {
  dashboard:    () => placeholder('Dashboard and Reports'),
  courses:      () => placeholder('Course Management'),
  applicants:   () => placeholder('Applicant Profiles'),
  applications: () => placeholder('Application Tracking'),
  requirements: () => placeholder('Requirements Management'),
};

function placeholder(name) {
  return `<div class="card"><h3>${name}</h3><p>Coming soon.</p></div>`;
}

// Small helper all features will reuse. Redirects to login if the session expired.
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (res.status === 401) { location.href = '/login.html'; return; }
  return res.json();
}

function navigate() {
  const page = (location.hash || '#dashboard').slice(1);
  const render = pages[page] || pages.dashboard;
  document.getElementById('content').innerHTML = render();
  document.getElementById('pageTitle').textContent =
    document.querySelector(`[data-page="${page}"]`)?.textContent || 'Dashboard';
  document.querySelectorAll('.sidebar a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page));
}

async function init() {
  const user = await api('/api/me');
  if (!user) return;
  document.getElementById('userName').textContent = user.username + ' ';
  window.addEventListener('hashchange', navigate);
  navigate();
}

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/logout', { method: 'POST' });
  location.href = '/login.html';
};

init();