// Each feature registers a render function here as we build it
const pages = {
  dashboard:    () => placeholder('Dashboard and Reports'),
  courses: renderCourses,
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

async function navigate() {
  const page = (location.hash || '#dashboard').slice(1);
  const render = pages[page] || pages.dashboard;
  document.getElementById('content').innerHTML = await render();
  document.getElementById('pageTitle').textContent =
    document.querySelector(`[data-page="${page}"]`)?.textContent || 'Dashboard';
  document.querySelectorAll('.sidebar a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page));
}

async function init() {
  const user = await api('/api/me');
  if (!user) return;
  window.currentUser = user;
  document.getElementById('userName').textContent = user.username + ' ';
  window.addEventListener('hashchange', navigate);
  navigate();
}

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/logout', { method: 'POST' });
  location.href = '/login.html';
};

// ---------- Feature 1: Course Management ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let coursesCache = [];

function periodStatus(c) {
  const today = new Date().toISOString().slice(0, 10);
  if (!c.application_start || !c.application_end) return '<span class="badge gray">Not set</span>';
  if (today < c.application_start) return '<span class="badge blue">Upcoming</span>';
  if (today > c.application_end)   return '<span class="badge red">Closed</span>';
  return '<span class="badge green">Open</span>';
}

async function renderCourses() {
  coursesCache = await api('/api/courses') || [];
  const isAdmin = window.currentUser?.role === 'admin';
  const rows = coursesCache.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.training_provider)}</td>
      <td>${c.slots_available} / ${c.total_slots}</td>
      <td>${esc(c.application_start || '-')} to ${esc(c.application_end || '-')}</td>
      <td>${periodStatus(c)}</td>
      <td class="actions">
        <button onclick="editCourse(${c.id})">Edit</button>
        ${isAdmin ? `<button class="danger" onclick="deleteCourse(${c.id})">Delete</button>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="card-head">
        <h3>Courses</h3>
        <button class="btn-inline" onclick="showCourseForm()">+ Add Course</button>
      </div>
      <table class="table">
        <thead><tr>
          <th>Course</th><th>Training Provider</th><th>Slots (available / total)</th>
          <th>Application Period</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No courses yet. Click "+ Add Course".</td></tr>'}</tbody>
      </table>
    </div>
    <div id="courseModal" class="modal hidden"></div>`;
}

function showCourseForm(course = {}) {
  const m = document.getElementById('courseModal');
  m.innerHTML = `
    <div class="modal-box">
      <h3>${course.id ? 'Edit Course' : 'Add Course'}</h3>
      <div class="error" id="courseError"></div>
      <label>Course name</label>
      <input id="cName" value="${esc(course.name)}">
      <label>Training provider</label>
      <input id="cProvider" value="${esc(course.training_provider)}">
      <label>Total slots</label>
      <input id="cSlots" type="number" min="0" value="${course.total_slots ?? 0}">
      <label>Application start</label>
      <input id="cStart" type="date" value="${esc(course.application_start)}">
      <label>Application end</label>
      <input id="cEnd" type="date" value="${esc(course.application_end)}">
      <div class="modal-actions">
        <button onclick="closeCourseForm()">Cancel</button>
        <button class="btn-inline" onclick="saveCourse(${course.id || 'null'})">Save</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
}

function closeCourseForm() {
  document.getElementById('courseModal').classList.add('hidden');
}

function editCourse(id) {
  showCourseForm(coursesCache.find(c => c.id === id));
}

async function saveCourse(id) {
  const body = {
    name: document.getElementById('cName').value,
    training_provider: document.getElementById('cProvider').value,
    total_slots: document.getElementById('cSlots').value,
    application_start: document.getElementById('cStart').value,
    application_end: document.getElementById('cEnd').value,
  };
  const result = await api(id ? `/api/courses/${id}` : '/api/courses',
                           { method: id ? 'PUT' : 'POST', body });
  if (result?.error) { document.getElementById('courseError').textContent = result.error; return; }
  navigate();
}

async function deleteCourse(id) {
  if (!confirm('Delete this course?')) return;
  const result = await api(`/api/courses/${id}`, { method: 'DELETE' });
  if (result?.error) return alert(result.error);
  navigate();
}

init();