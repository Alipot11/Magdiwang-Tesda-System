const express = require('express');
const db = require('../db');
const router = express.Router();

const PENDING = ['Received', 'Under Review'];   // change here if your office defines "pending" differently
const STATUSES = ['Received', 'Under Review', 'Incomplete', 'Qualified', 'Waitlisted', 'Approved'];

function courseEnrollment() {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.training_provider, c.total_slots, c.start_date, c.end_date,
           COUNT(a.id) AS applications,
           COALESCE(SUM(a.status = 'Approved'), 0) AS approved
    FROM courses c
    LEFT JOIN applications a ON a.course_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  rows.forEach(r => r.slots_available = Math.max(r.total_slots - r.approved, 0));
  return rows;
}

router.get('/', (req, res) => {
  const courseId = Number(req.query.course_id) || 0;
  const where = courseId ? 'WHERE a.course_id = ?' : '';
  const params = courseId ? [courseId] : [];
  const one = (sql, ...p) => db.prepare(sql).get(...p).n;

  const byStatus = Object.fromEntries(STATUSES.map(s => [s, 0]));
  db.prepare(`SELECT a.status, COUNT(*) AS n FROM applications a ${where} GROUP BY a.status`)
    .all(...params).forEach(r => byStatus[r.status] = r.n);

  // Per-course breakdown (always all courses, used by the table)
  const courses = courseEnrollment();
  courses.forEach(c => c.by_status = Object.fromEntries(STATUSES.map(s => [s, 0])));
  db.prepare('SELECT course_id, status, COUNT(*) AS n FROM applications GROUP BY course_id, status')
    .all().forEach(r => {
      const c = courses.find(x => x.id === r.course_id);
      if (c) c.by_status[r.status] = r.n;
    });

  res.json({
    totals: {
      applicants: courseId
        ? one('SELECT COUNT(DISTINCT applicant_id) AS n FROM applications WHERE course_id = ?', courseId)
        : one('SELECT COUNT(*) AS n FROM applicants'),
      applications: Object.values(byStatus).reduce((a, b) => a + b, 0),
      pending: PENDING.reduce((sum, s) => sum + byStatus[s], 0),
      approved: byStatus['Approved'],
      incomplete_requirements: one(`
        SELECT COUNT(*) AS n FROM (
          SELECT COUNT(r.id) AS t, COALESCE(SUM(r.submitted), 0) AS s
          FROM applications a LEFT JOIN requirements r ON r.application_id = a.id
          ${where}
          GROUP BY a.id
        ) WHERE t = 0 OR s < t`, ...params)
    },
    by_status: byStatus,
    courses
  });
});

// CSV exports (open in Excel)
const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;          // stops spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
};
function sendCsv(res, filename, header, rows) {
  const body = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + body);                     // BOM so Excel reads accents correctly
}

router.get('/export/applications.csv', (req, res) => {
  const courseId = Number(req.query.course_id) || 0;
  const rows = db.prepare(`
    SELECT ap.full_name, ap.contact, c.name AS course, a.status, a.applied_at,
           (SELECT COUNT(*) FROM requirements r WHERE r.application_id = a.id) AS req_total,
           (SELECT COALESCE(SUM(r.submitted), 0) FROM requirements r WHERE r.application_id = a.id) AS req_done
    FROM applications a
    JOIN applicants ap ON ap.id = a.applicant_id
    JOIN courses c ON c.id = a.course_id
    ${courseId ? 'WHERE a.course_id = ?' : ''}
    ORDER BY c.name, ap.full_name
  `).all(...(courseId ? [courseId] : []));
  sendCsv(res, 'applications.csv',
    ['Applicant', 'Contact', 'Course', 'Status', 'Date applied', 'Requirements submitted', 'Requirements total'],
    rows.map(r => [r.full_name, r.contact, r.course, r.status, r.applied_at.slice(0, 10), r.req_done, r.req_total]));
});

router.get('/export/courses.csv', (req, res) => {
  sendCsv(res, 'course-enrollment.csv',
    ['Course', 'Training provider', 'Start date', 'End date', 'Total slots', 'Applications', 'Approved', 'Slots available'],
    courseEnrollment().map(c => [c.name, c.training_provider, c.start_date, c.end_date,
                                 c.total_slots, c.applications, c.approved, c.slots_available]));
});

module.exports = router;