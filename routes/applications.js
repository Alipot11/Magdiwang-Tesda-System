const express = require('express');
const db = require('../db');
const router = express.Router();

const STATUSES = ['Received', 'Under Review', 'Incomplete', 'Qualified', 'Waitlisted', 'Approved'];

// Slots left for a course (Approved applications use a slot)
function slotsLeft(courseId, excludeApplicationId = 0) {
  const c = db.prepare('SELECT total_slots FROM courses WHERE id = ?').get(courseId);
  if (!c) return 0;
  const taken = db.prepare(`
    SELECT COUNT(*) AS n FROM applications
    WHERE course_id = ? AND status = 'Approved' AND id != ?`).get(courseId, excludeApplicationId).n;
  return c.total_slots - taken;
}

// List, with optional ?status= and ?course_id= filters
router.get('/', (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.course_id) { where.push('a.course_id = ?'); params.push(req.query.course_id); }
  const rows = db.prepare(`
    SELECT a.id, a.status, a.applied_at, a.updated_at,
           a.applicant_id, ap.full_name,
           a.course_id, c.name AS course_name
    FROM applications a
    JOIN applicants ap ON ap.id = a.applicant_id
    JOIN courses c ON c.id = a.course_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.applied_at DESC
  `).all(...params);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { applicant_id, course_id } = req.body;
  if (!applicant_id || !course_id) return res.status(400).json({ error: 'Choose an applicant and a course' });
  const dup = db.prepare('SELECT id FROM applications WHERE applicant_id = ? AND course_id = ?')
                .get(applicant_id, course_id);
  if (dup) return res.status(400).json({ error: 'This applicant already applied to this course' });
  const info = db.prepare('INSERT INTO applications (applicant_id, course_id) VALUES (?, ?)')
                 .run(applicant_id, course_id);
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (status === 'Approved' && slotsLeft(app.course_id, app.id) <= 0)
    return res.status(400).json({ error: 'No slots left for this course' });
  db.prepare("UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(status, app.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  db.prepare('DELETE FROM requirements WHERE application_id = ?').run(req.params.id);
  db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;