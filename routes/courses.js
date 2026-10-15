const express = require('express');
const db = require('../db');
const router = express.Router();

const requireAdmin = (req, res, next) =>
  req.session.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

// Validate input shared by create and update
function validate(b) {
  if (!b.name || !b.name.trim()) return 'Course name is required';
  const slots = Number(b.total_slots);
  if (!Number.isInteger(slots) || slots < 0) return 'Slots must be a whole number, 0 or more';
  if (b.start_date && b.end_date && b.end_date < b.start_date)
    return 'Course end date cannot be before the start date';
  return null;
}

// List all courses, with slots already taken (Approved applications) and what's left
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM applications a WHERE a.course_id = c.id) AS applications,
      (SELECT COUNT(*) FROM applications a
        WHERE a.course_id = c.id AND a.status = 'Approved') AS slots_taken
    FROM courses c
    ORDER BY c.name
  `).all();
  rows.forEach(r => r.slots_available = Math.max(r.total_slots - r.slots_taken, 0));
  res.json(rows);
});

router.post('/', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const info = db.prepare(`
    INSERT INTO courses (name, training_provider, total_slots, start_date, end_date)
    VALUES (?, ?, ?, ?, ?)`)
    .run(b.name.trim(), b.training_provider || null, Number(b.total_slots),
         b.start_date || null, b.end_date || null);
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const info = db.prepare(`
    UPDATE courses SET name=?, training_provider=?, total_slots=?, start_date=?, end_date=?
    WHERE id=?`)
    .run(b.name.trim(), b.training_provider || null, Number(b.total_slots),
         b.start_date || null, b.end_date || null, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Course not found' });
  res.json({ ok: true });
});

// Admin only, and blocked if applications already exist for the course
router.delete('/:id', requireAdmin, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM applications WHERE course_id = ?').get(req.params.id).n;
  if (used) return res.status(400).json({ error: `Cannot delete: ${used} application(s) use this course` });
  db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;