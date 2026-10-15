// Each feature registers a render function here as we build it
const pages = {
  dashboard: renderDashboard,
  courses: renderCourses,
  applicants: renderApplicants,
  applications: renderApplications,
  requirements: renderRequirements,
  users: renderUsers,
  applicant:    renderApplicantProfile,
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
  const [page, param] = (location.hash || '#dashboard').slice(1).split('/');
  const render = pages[page] || pages.dashboard;
  document.getElementById('content').innerHTML = await render(param);
  const navPage = page === 'applicant' ? 'applicants' : page;
  document.getElementById('pageTitle').textContent =
    page === 'applicant' ? 'Applicant Profile'
    : document.querySelector(`[data-page="${page}"]`)?.textContent || 'Dashboard';
  document.querySelectorAll('.sidebar a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === navPage));
}

async function init() {
  const user = await api('/api/me');
  if (!user) return;
  window.currentUser = user;
  if (user.role !== 'admin') document.querySelector('[data-page="users"]')?.remove();
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
let courseFilter = 'All';

function courseStatus(c) {
  const today = new Date().toISOString().slice(0, 10);
  if (!c.start_date || !c.end_date) return 'Not set';
  if (today < c.start_date) return 'Upcoming';
  if (today > c.end_date) return 'Finished';
  return 'Ongoing';
}

function statusBadge(c) {
  const color = { 'Upcoming': 'blue', 'Ongoing': 'green', 'Finished': 'gray', 'Not set': 'gray' };
  const s = courseStatus(c);
  return `<span class="badge ${color[s]}">${s}</span>`;
}

function setCourseFilter(f) { courseFilter = f; navigate(); }

async function renderCourses() {
  coursesCache = await api('/api/courses') || [];
  const isAdmin = window.currentUser?.role === 'admin';
  const filters = ['All', 'Upcoming', 'Ongoing', 'Finished'];
  const list = coursesCache.filter(c => courseFilter === 'All' || courseStatus(c) === courseFilter);
  const rows = list.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.training_provider)}</td>
      <td>${c.total_slots}</td>
      <td>${c.applications}</td>
      <td>${c.slots_taken}</td>
      <td><strong>${c.slots_available}</strong></td>
      <td>${esc(c.start_date || '-')} to ${esc(c.end_date || '-')}</td>
      <td>${statusBadge(c)}</td>
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
      <div class="tabs">
        ${filters.map(f => `<button class="${f === courseFilter ? 'active' : ''}"
          onclick="setCourseFilter('${f}')">${f}</button>`).join('')}
      </div>
      <table class="table">
        <thead><tr>
          <th>Course</th><th>Training Provider</th><th>Total slots</th><th>Applications</th>
          <th>Approved</th><th>Slots available</th><th>Course Period</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="9">No courses in this view.</td></tr>'}</tbody>
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
      <label>Course start date</label>
      <input id="cStart" type="date" value="${esc(course.start_date)}">
      <label>Course end date</label>
      <input id="cEnd" type="date" value="${esc(course.end_date)}">
      <div class="modal-actions">
        <button onclick="closeCourseForm()">Cancel</button>
        <button class="btn-inline" onclick="saveCourse(${course.id || 'null'})">Save</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
}

function closeCourseForm() { document.getElementById('courseModal').classList.add('hidden'); }
function editCourse(id) { showCourseForm(coursesCache.find(c => c.id === id)); }

async function saveCourse(id) {
  const body = {
    name: document.getElementById('cName').value,
    training_provider: document.getElementById('cProvider').value,
    total_slots: document.getElementById('cSlots').value,
    start_date: document.getElementById('cStart').value,
    end_date: document.getElementById('cEnd').value,
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

// ---------- Feature 2: Applicant Profiles ----------
let applicantsCache = [];

function calcAge(birthdate) {
  if (!birthdate) return '-';
  const b = new Date(birthdate), t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

function applicantRows(list) {
  const isAdmin = window.currentUser?.role === 'admin';
  return list.map(a => `
    <tr>
      <td>${esc(a.full_name)}</td>
      <td>${calcAge(a.birthdate)}</td>
      <td>${esc(a.sex || '-')}</td>
      <td>${esc(a.contact || '-')}</td>
      <td>${esc(a.education || '-')}</td>
      <td>${a.application_count}</td>
      <td class="actions">
        <button onclick="location.hash='#applicant/${a.id}'">Profile</button>
        <button onclick="editApplicant(${a.id})">Edit</button>
        ${isAdmin ? `<button class="danger" onclick="deleteApplicant(${a.id})">Delete</button>` : ''}
      </td>
    </tr>`).join('') || '<tr><td colspan="7">No applicants found.</td></tr>';
}

async function renderApplicants() {
  applicantsCache = await api('/api/applicants') || [];
  return `
    <div class="card">
      <div class="card-head">
        <h3>Applicants</h3>
        <div>
          <input id="applicantSearch" class="search" placeholder="Search name or contact" oninput="searchApplicants()">
          <button class="btn-inline" onclick="showApplicantForm()">+ Add Applicant</button>
        </div>
      </div>
      <table class="table">
        <thead><tr>
          <th>Name</th><th>Age</th><th>Sex</th><th>Contact</th>
          <th>Education</th><th>Applications</th><th></th>
        </tr></thead>
        <tbody id="applicantBody">${applicantRows(applicantsCache)}</tbody>
      </table>
    </div>
    <div id="applicantModal" class="modal hidden"></div>`;
}

let searchTimer;
function searchApplicants() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = encodeURIComponent(document.getElementById('applicantSearch').value);
    applicantsCache = await api('/api/applicants?q=' + q) || [];
    document.getElementById('applicantBody').innerHTML = applicantRows(applicantsCache);
  }, 250);
}

function showApplicantForm(a = {}) {
  const sel = (v, cur) => v === cur ? 'selected' : '';
  const levels = ['Elementary', 'High School', 'Senior High School', 'Vocational/Technical',
                  'College Undergraduate', 'College Graduate'];
  const m = document.getElementById('applicantModal');
  m.innerHTML = `
    <div class="modal-box">
      <h3>${a.id ? 'Edit Applicant' : 'Add Applicant'}</h3>
      <div class="error" id="applicantError"></div>
      <label>Full name</label>
      <input id="aName" value="${esc(a.full_name)}">
      <label>Birthdate</label>
      <input id="aBirth" type="date" value="${esc(a.birthdate)}">
      <label>Sex</label>
      <select id="aSex">
        <option value="">-</option>
        <option ${sel('Male', a.sex)}>Male</option>
        <option ${sel('Female', a.sex)}>Female</option>
      </select>
      <label>Contact number</label>
      <input id="aContact" value="${esc(a.contact)}">
      <label>Email</label>
      <input id="aEmail" type="email" value="${esc(a.email)}">
      <label>Address</label>
      <input id="aAddress" value="${esc(a.address)}">
      <label>Educational attainment</label>
      <select id="aEdu">
        <option value="">-</option>
        ${levels.map(l => `<option ${sel(l, a.education)}>${l}</option>`).join('')}
      </select>
      <div class="modal-actions">
        <button onclick="closeApplicantForm()">Cancel</button>
        <button class="btn-inline" onclick="saveApplicant(${a.id || 'null'})">Save</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
}

function closeApplicantForm() { document.getElementById('applicantModal').classList.add('hidden'); }
function editApplicant(id) { showApplicantForm(applicantsCache.find(a => a.id === id)); }

async function saveApplicant(id) {
  const body = {
    full_name: document.getElementById('aName').value,
    birthdate: document.getElementById('aBirth').value,
    sex: document.getElementById('aSex').value,
    contact: document.getElementById('aContact').value,
    email: document.getElementById('aEmail').value,
    address: document.getElementById('aAddress').value,
    education: document.getElementById('aEdu').value,
  };
  const result = await api(id ? `/api/applicants/${id}` : '/api/applicants',
                           { method: id ? 'PUT' : 'POST', body });
  if (result?.error) { document.getElementById('applicantError').textContent = result.error; return; }
  navigate();
}

async function deleteApplicant(id) {
  if (!confirm('Delete this applicant?')) return;
  const result = await api(`/api/applicants/${id}`, { method: 'DELETE' });
  if (result?.error) return alert(result.error);
  navigate();
}

// ---------- Feature 3: Application Tracking ----------
const STATUSES = ['Received', 'Under Review', 'Incomplete', 'Qualified', 'Waitlisted', 'Approved'];
const statusColor = {
  'Received': 'gray', 'Under Review': 'blue', 'Incomplete': 'red',
  'Qualified': 'blue', 'Waitlisted': 'gray', 'Approved': 'green'
};
let appFilter = { status: '', course_id: '' };

async function renderApplications() {
  const qs = new URLSearchParams(Object.entries(appFilter).filter(([, v]) => v)).toString();
  const [apps, courses] = await Promise.all([
    api('/api/applications' + (qs ? '?' + qs : '')),
    api('/api/courses')
  ]);
  coursesCache = courses || [];
  const isAdmin = window.currentUser?.role === 'admin';

  const rows = (apps || []).map(a => `
    <tr>
      <td>${esc(a.full_name)}</td>
      <td>${esc(a.course_name)}</td>
      <td>${esc(a.applied_at.slice(0, 10))}</td>
      <td>
        <select onchange="changeStatus(${a.id}, this.value)">
          ${STATUSES.map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td class="actions">
        ${isAdmin ? `<button class="danger" onclick="deleteApplication(${a.id})">Delete</button>` : ''}
      </td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="card-head">
        <h3>Applications</h3>
        <button class="btn-inline" onclick="showApplicationForm()">+ New Application</button>
      </div>
      <div class="filters">
        <select onchange="setAppFilter('status', this.value)">
          <option value="">All statuses</option>
          ${STATUSES.map(s => `<option ${s === appFilter.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select onchange="setAppFilter('course_id', this.value)">
          <option value="">All courses</option>
          ${coursesCache.map(c => `<option value="${c.id}" ${String(c.id) === appFilter.course_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <table class="table">
        <thead><tr><th>Applicant</th><th>Course</th><th>Date applied</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No applications found.</td></tr>'}</tbody>
      </table>
    </div>
    <div id="applicationModal" class="modal hidden"></div>`;
}

function setAppFilter(key, value) { appFilter[key] = value; navigate(); }

async function showApplicationForm() {
  const applicants = await api('/api/applicants') || [];
  const m = document.getElementById('applicationModal');
  m.innerHTML = `
    <div class="modal-box">
      <h3>New Application</h3>
      <div class="error" id="applicationError"></div>
      <label>Applicant</label>
      <select id="appApplicant">
        <option value="">Choose applicant</option>
        ${applicants.map(a => `<option value="${a.id}">${esc(a.full_name)}</option>`).join('')}
      </select>
      <label>Course</label>
      <select id="appCourse">
        <option value="">Choose course</option>
        ${coursesCache.filter(c => courseStatus(c) !== 'Finished')
          .map(c => `<option value="${c.id}">${esc(c.name)} (${c.slots_available} slots left)</option>`).join('')}
      </select>
      <div class="modal-actions">
        <button onclick="closeApplicationForm()">Cancel</button>
        <button class="btn-inline" onclick="saveApplication()">Save</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
}

function closeApplicationForm() { document.getElementById('applicationModal').classList.add('hidden'); }

async function saveApplication() {
  const result = await api('/api/applications', { method: 'POST', body: {
    applicant_id: document.getElementById('appApplicant').value,
    course_id: document.getElementById('appCourse').value
  }});
  if (result?.error) { document.getElementById('applicationError').textContent = result.error; return; }
  navigate();
}

async function changeStatus(id, status) {
  const result = await api(`/api/applications/${id}/status`, { method: 'PUT', body: { status } });
  if (result?.error) alert(result.error);
  navigate();   // reload so the dropdown shows the real saved status
}

async function deleteApplication(id) {
  if (!confirm('Delete this application?')) return;
  const result = await api(`/api/applications/${id}`, { method: 'DELETE' });
  if (result?.error) return alert(result.error);
  navigate();
}

// ---------- Feature 4: Requirements Management ----------
let reqOverview = [];
let reqOnlyIncomplete = false;
let currentReqApp = null;

async function renderRequirements() {
  reqOverview = await api('/api/requirements/overview') || [];
  const shown = reqOnlyIncomplete
    ? reqOverview.filter(a => a.total === 0 || a.submitted < a.total)
    : reqOverview;

  // Group the applications by course
  const groups = new Map();
  shown.forEach(a => {
    if (!groups.has(a.course_id)) groups.set(a.course_id, { name: a.course_name, items: [] });
    groups.get(a.course_id).items.push(a);
  });

  const row = a => {
    const badge = a.total === 0 ? '<span class="badge gray">Not started</span>'
      : a.submitted === a.total ? '<span class="badge green">Complete</span>'
      : '<span class="badge red">Incomplete</span>';
    return `
      <tr>
        <td>${esc(a.full_name)}</td>
        <td>${esc(a.status)}</td>
        <td>${a.submitted} / ${a.total}</td>
        <td>${badge}</td>
        <td class="actions"><button onclick="showRequirements(${a.application_id})">Manage</button></td>
      </tr>`;
  };

  const sections = [...groups.entries()].map(([courseId, g]) => {
    const all = reqOverview.filter(x => x.course_id === courseId);   // counts ignore the filter
    const complete = all.filter(x => x.total > 0 && x.submitted === x.total).length;
    return `
      <details class="course-group" open>
        <summary><strong>${esc(g.name)}</strong>
          <span class="muted">${all.length} application(s) &middot; ${complete} complete</span></summary>
        <table class="table">
          <thead><tr><th>Applicant</th><th>Application status</th>
            <th>Submitted</th><th>Requirements</th><th></th></tr></thead>
          <tbody>${g.items.map(row).join('')}</tbody>
        </table>
      </details>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-head">
        <h3>Requirements</h3>
        <label><input type="checkbox" ${reqOnlyIncomplete ? 'checked' : ''}
          onchange="reqOnlyIncomplete = this.checked; navigate()"> Show incomplete only</label>
      </div>
      ${sections || '<p class="muted">No applications found.</p>'}
    </div>
    <div id="requirementModal" class="modal hidden"></div>`;
}

async function showRequirements(appId) {
  currentReqApp = reqOverview.find(a => a.application_id === appId) || currentReqApp;
  const list = await api(`/api/requirements/application/${appId}`) || [];
  const isAdmin = window.currentUser?.role === 'admin';

  const rows = list.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td><input type="checkbox" ${r.submitted ? 'checked' : ''}
           onchange="toggleRequirement(${r.id}, this.checked)"></td>
      <td>${r.files.length
        ? r.files.map(f => `
            <div class="file-line">
              <a href="/api/requirements/files/${f.id}/download">${esc(f.original_name)}</a>
              <button class="link-danger" onclick="removeRequirementFile(${f.id})">Remove</button>
            </div>`).join('')
        : '<span class="muted">No file</span>'}</td>
      <td class="actions">
        <label class="upload-btn">Add files
          <input type="file" hidden multiple accept=".pdf,.jpg,.jpeg,.png"
                 onchange="uploadRequirement(${r.id}, this)"></label>
        ${isAdmin ? `<button class="danger" onclick="deleteRequirement(${r.id})">Delete</button>` : ''}
      </td>
    </tr>`).join('');

  const m = document.getElementById('requirementModal');
  m.innerHTML = `
    <div class="modal-box wide">
      <h3>${esc(currentReqApp.full_name)}: ${esc(currentReqApp.course_name)}</h3>
      <table class="table">
        <thead><tr><th>Requirement</th><th>Submitted</th><th>Scanned file</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="req-add">
        <input id="newReqName" placeholder="Add another requirement">
        <button class="btn-inline" onclick="addRequirement()">Add</button>
      </div>
      <div class="modal-actions"><button onclick="closeRequirements()">Close</button></div>
    </div>`;
  m.classList.remove('hidden');
}

function closeRequirements() { navigate(); }   // reload the page so the counts refresh

function refreshRequirements() { return showRequirements(currentReqApp.application_id); }

async function toggleRequirement(id, submitted) {
  const result = await api(`/api/requirements/${id}/submitted`, { method: 'PUT', body: { submitted } });
  if (result?.error) alert(result.error);
  refreshRequirements();
}

async function uploadRequirement(id, input) {
  if (!input.files.length) return;
  const fd = new FormData();
  [...input.files].forEach(f => fd.append('files', f));
  const res = await fetch(`/api/requirements/${id}/upload`, { method: 'POST', body: fd });
  if (res.status === 401) { location.href = '/login.html'; return; }
  const data = await res.json();
  if (data.error) alert(data.error);
  refreshRequirements();
}

async function removeRequirementFile(fileId) {
  if (!confirm('Remove this file?')) return;
  const result = await api(`/api/requirements/files/${fileId}`, { method: 'DELETE' });
  if (result?.error) alert(result.error);
  refreshRequirements();
}

async function addRequirement() {
  const name = document.getElementById('newReqName').value;
  const result = await api(`/api/requirements/application/${currentReqApp.application_id}`,
                           { method: 'POST', body: { name } });
  if (result?.error) return alert(result.error);
  refreshRequirements();
}

async function deleteRequirement(id) {
  if (!confirm('Delete this requirement?')) return;
  const result = await api(`/api/requirements/${id}`, { method: 'DELETE' });
  if (result?.error) return alert(result.error);
  refreshRequirements();
}

// ---------- Feature 5: Dashboard and Reports ----------
async function renderDashboard() {
  const d = await api('/api/dashboard');
  if (!d) return '';
  const t = d.totals;

  const card = (label, value, cls = '') =>
    `<div class="stat ${cls}"><div class="stat-num">${value}</div><div class="stat-label">${label}</div></div>`;

  const max = Math.max(1, ...Object.values(d.by_status));
  const bars = STATUSES.map(s => `
    <div class="bar-row">
      <span class="bar-label">${s}</span>
      <div class="bar-track"><div class="bar-fill ${statusColor[s]}" style="width:${(d.by_status[s] / max) * 100}%"></div></div>
      <span class="bar-count">${d.by_status[s]}</span>
    </div>`).join('');

  const courseRows = d.courses.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.training_provider || '-')}</td>
      <td>${statusBadge(c)}</td>
      <td>${c.applications}</td>
      <td>${c.approved}</td>
      <td>${c.slots_available} / ${c.total_slots}</td>
    </tr>`).join('');

  return `
    <div class="stats">
      ${card('Total applicants', t.applicants)}
      ${card('Total applications', t.applications)}
      ${card('Pending applications', t.pending, 'blue')}
      ${card('Incomplete requirements', t.incomplete_requirements, 'red')}
      ${card('Approved scholars', t.approved, 'green')}
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:14px">Applications by status</h3>
      ${bars}
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Course enrollment</h3>
        <div class="no-print">
          <a class="btn-inline link-btn" href="/api/dashboard/export/courses.csv">Export courses (CSV)</a>
          <a class="btn-inline link-btn" href="/api/dashboard/export/applications.csv">Export applications (CSV)</a>
          <button class="btn-inline" onclick="window.print()">Print</button>
        </div>
      </div>
      <table class="table">
        <thead><tr><th>Course</th><th>Provider</th><th>Status</th>
          <th>Applications</th><th>Approved</th><th>Slots (available / total)</th></tr></thead>
        <tbody>${courseRows || '<tr><td colspan="6">No courses yet.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ---------- Users (admin only) ----------
let usersCache = [];

async function renderUsers() {
  const list = await api('/api/users');
  if (!Array.isArray(list)) return '<div class="card"><h3>Users</h3><p>Admin access only.</p></div>';
  usersCache = list;
  const me = window.currentUser.id;

  const rows = list.map(u => `
    <tr>
      <td>${esc(u.username)}${u.id === me ? ' <span class="badge gray">You</span>' : ''}</td>
      <td>
        <select ${u.id === me ? 'disabled' : ''} onchange="changeUserRole(${u.id}, this.value)">
          <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>staff</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td class="actions">
        <button onclick="showEditUserForm(${u.id})">Edit</button>
        <button onclick="showPasswordForm(${u.id})">Reset password</button>
        ${u.id === me ? '' : `<button class="danger" onclick="deleteUser(${u.id})">Delete</button>`}
      </td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="card-head">
        <h3>Users</h3>
        <button class="btn-inline" onclick="showUserForm()">+ Add User</button>
      </div>
      <table class="table">
        <thead><tr><th>Username</th><th>Role</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div id="userModal" class="modal hidden"></div>`;
}

const USERNAME_HINT = `
  <div class="hint">
    <strong>Username rules</strong>
    <ul>
      <li>At least 3 characters</li>
      <li>Letters, numbers, dot ( . ), dash ( - ) and underscore ( _ ) only, no spaces</li>
      <li>Must not already be used by another account</li>
    </ul>
  </div>`;

const PASSWORD_HINT = `
  <div class="hint">
    <strong>Password rules</strong>
    <ul>
      <b>Required:</b> at least 8 characters, with at least one letter and one number
      <li><b>Recommended:</b> mix letters, numbers and symbols, or use a short phrase</li>
      <li><b>Avoid:</b> names, birthdates, or simple ones like 12345678</li>
      <li>Give each staff member their own account and don't share passwords</li>
    </ul>
  </div>`;

function passwordField(id) {
  return `
    <div class="password-wrap">
      <input id="${id}" type="password" autocomplete="new-password">
      <button type="button" onclick="togglePw('${id}', this)" aria-label="Show password">Show</button>
    </div>`;
}

function togglePw(id, btn) {
  const input = document.getElementById(id);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.textContent = show ? 'Hide' : 'Show';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  input.focus();
}

function showUserForm() {
  const m = document.getElementById('userModal');
  m.innerHTML = `
    <div class="modal-box">
      <h3>Add User</h3>
      <div class="error" id="userError"></div>
      <label>Username</label>
      <input id="uName" autocomplete="off">
      ${USERNAME_HINT}
      <label>Password</label>
      ${passwordField('uPass')}
      ${PASSWORD_HINT}
      <label>Role</label>
      <select id="uRole"><option value="staff">staff</option><option value="admin">admin</option></select>
      <div class="modal-actions">
        <button onclick="closeUserForm()">Cancel</button>
        <button class="btn-inline" onclick="saveUser()">Save</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
}

function showEditUserForm(id) {
  const u = usersCache.find(x => x.id === id);
  const m = document.getElementById('userModal');
  m.innerHTML = `
    <div class="modal-box">
      <h3>Edit username</h3>
      <div class="error" id="userError"></div>
      <label>Username</label>
      <input id="uName" autocomplete="off" value="${esc(u.username)}">
      ${USERNAME_HINT}
      <p class="muted" style="margin-top:10px">After you change it, this person must log in with the new username.</p>
      <div class="modal-actions">
        <button onclick="closeUserForm()">Cancel</button>
        <button class="btn-inline" onclick="saveUsername(${id})">Save</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
}

function showPasswordForm(id) {
  const u = usersCache.find(x => x.id === id);
  const m = document.getElementById('userModal');
  m.innerHTML = `
    <div class="modal-box">
      <h3>Reset password: ${esc(u.username)}</h3>
      <div class="error" id="userError"></div>
      <label>New password</label>
      ${passwordField('uPass')}
      ${PASSWORD_HINT}
      <div class="modal-actions">
        <button onclick="closeUserForm()">Cancel</button>
        <button class="btn-inline" onclick="savePassword(${id})">Save</button>
      </div>
    </div>`;
  m.classList.remove('hidden');
}

async function saveUsername(id) {
  const result = await api(`/api/users/${id}/username`, { method: 'PUT',
    body: { username: document.getElementById('uName').value } });
  if (result?.error) { document.getElementById('userError').textContent = result.error; return; }
  if (id === window.currentUser.id) {          // you renamed your own account
    window.currentUser.username = result.username;
    document.getElementById('userName').textContent = result.username + ' ';
  }
  navigate();
}

function closeUserForm() { document.getElementById('userModal').classList.add('hidden'); }

async function saveUser() {
  const result = await api('/api/users', { method: 'POST', body: {
    username: document.getElementById('uName').value,
    password: document.getElementById('uPass').value,
    role: document.getElementById('uRole').value
  }});
  if (result?.error) { document.getElementById('userError').textContent = result.error; return; }
  navigate();
}

async function savePassword(id) {
  const result = await api(`/api/users/${id}/password`, { method: 'PUT',
    body: { password: document.getElementById('uPass').value } });
  if (result?.error) { document.getElementById('userError').textContent = result.error; return; }
  closeUserForm();
  alert('Password updated.');
}

async function changeUserRole(id, role) {
  const result = await api(`/api/users/${id}/role`, { method: 'PUT', body: { role } });
  if (result?.error) alert(result.error);
  navigate();
}

async function deleteUser(id) {
  if (!confirm('Delete this user? They will no longer be able to log in.')) return;
  const result = await api(`/api/users/${id}`, { method: 'DELETE' });
  if (result?.error) return alert(result.error);
  navigate();
}

// ---------- Applicant Profile page ----------
const isImage = name => /\.(jpe?g|png)$/i.test(name || '');
const isPdf = name => /\.pdf$/i.test(name || '');

function enrollmentBadge(c) {
  if (c.status !== 'Approved') return '';
  return courseStatus(c) === 'Finished'
    ? '<span class="badge green">Completed</span>'
    : '<span class="badge green">Enrolled</span>';
}

function requirementFile(r) {
  const files = r.files || [];
  if (!files.length) return '<span class="muted">No file</span>';
  return files.map(f => {
    const base = `/api/requirements/files/${f.id}`;
    if (isImage(f.original_name))
      return `<div class="file-item"><img class="thumb" src="${base}/preview" alt="${esc(r.name)}"
                onclick="openImage('${base}/preview')"><br><a href="${base}/download">Download</a></div>`;
    if (isPdf(f.original_name))
      return `<div class="file-item"><a href="${base}/preview" target="_blank">View PDF</a><br>
                <a href="${base}/download">Download</a></div>`;
    return `<div class="file-item"><a href="${base}/download">${esc(f.original_name)}</a></div>`;
  }).join('');
}

async function renderApplicantProfile(id) {
  const p = await api(`/api/applicants/${id}/profile`);
  if (!p || p.error)
    return '<div class="card"><p>Applicant not found.</p><p><a href="#applicants">Back to applicants</a></p></div>';
  const a = p.applicant;
  const field = (label, value) =>
    `<div><div class="field-label">${label}</div><div>${esc(value || '-')}</div></div>`;

  const courseCards = p.applications.map(c => {
    const done = c.requirements.filter(r => r.submitted).length;
    const rows = c.requirements.map(r => `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${r.submitted ? '<span class="badge green">Submitted</span>' : '<span class="badge red">Missing</span>'}</td>
        <td>${requirementFile(r)}</td>
      </tr>`).join('');
    return `
      <div class="card" style="margin-top:16px">
        <div class="card-head">
          <div>
            <h3>${esc(c.course_name)}</h3>
            <div class="muted">${esc(c.training_provider || '-')} &middot;
              ${esc(c.start_date || '-')} to ${esc(c.end_date || '-')}</div>
          </div>
          <div>${statusBadge(c)} <span class="badge blue">${esc(c.status)}</span> ${enrollmentBadge(c)}</div>
        </div>
        ${c.requirements.length ? `
          <p class="muted" style="margin-bottom:8px">Requirements: ${done} of ${c.requirements.length} submitted</p>
          <table class="table">
            <thead><tr><th>Requirement</th><th>Status</th><th>Scanned file</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : '<p class="muted">Requirement checklist not started. Open the Requirements page to start it.</p>'}
      </div>`;
  }).join('') || '<div class="card" style="margin-top:16px"><p class="muted">No course applications yet.</p></div>';

  return `
    <a class="back-link" href="#applicants">&larr; Back to applicants</a>
    <div class="card">
      <h3 style="margin-bottom:14px">${esc(a.full_name)}</h3>
      <div class="profile-grid">
        ${field('Birthdate', a.birthdate)}
        ${field('Age', String(calcAge(a.birthdate)))}
        ${field('Sex', a.sex)}
        ${field('Contact number', a.contact)}
        ${field('Email', a.email)}
        ${field('Address', a.address)}
        ${field('Educational attainment', a.education)}
        ${field('Registered', (a.created_at || '').slice(0, 10))}
      </div>
    </div>
    <h3 style="margin:20px 0 0">Courses and requirements</h3>
    ${courseCards}
    <div id="imageModal" class="modal hidden" onclick="closeImage()"></div>`;
}

function openImage(src) {
  const m = document.getElementById('imageModal');
  m.innerHTML = `<img class="modal-img" src="${src}" alt="Scanned document">`;
  m.classList.remove('hidden');
}
function closeImage() { document.getElementById('imageModal').classList.add('hidden'); }

init();