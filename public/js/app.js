// Each feature registers a render function here as we build it
const pages = {
  dashboard:    () => placeholder('Dashboard and Reports'),
  courses: renderCourses,
  applicants:   renderApplicants,
  applications: renderApplications,
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
      <td>${c.slots_available} / ${c.total_slots}</td>
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
          <th>Course</th><th>Training Provider</th><th>Slots (available / total)</th>
          <th>Course Period</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No courses in this view.</td></tr>'}</tbody>
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
        <button onclick="viewApplicantCourses(${a.id})">Courses</button>
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

async function viewApplicantCourses(id) {
  const a = applicantsCache.find(x => x.id === id);
  const list = await api(`/api/applicants/${id}/applications`) || [];
  const rows = list.map(r => `
    <tr>
      <td>${esc(r.course_name)}</td>
      <td>${esc(r.training_provider || '-')}</td>
      <td>${esc(r.start_date || '-')} to ${esc(r.end_date || '-')}</td>
      <td>${statusBadge(r)}</td>
      <td>${esc(r.status)}</td>
    </tr>`).join('');
  const m = document.getElementById('applicantModal');
  m.innerHTML = `
    <div class="modal-box wide">
      <h3>${esc(a.full_name)}: Courses</h3>
      <table class="table">
        <thead><tr><th>Course</th><th>Provider</th><th>Period</th><th>Course status</th><th>Application</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No course applications yet.</td></tr>'}</tbody>
      </table>
      <div class="modal-actions"><button onclick="closeApplicantForm()">Close</button></div>
    </div>`;
  m.classList.remove('hidden');
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

init();