const express = require('express');
const db = require('../db');
const router = express.Router();

const requireAdmin = (req, res, next) =>
  req.session.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

function validate(b) {
  if (!b.full_name || !b.full_name.trim()) return 'Full name is required';
  if (b.sex && !['Male', 'Female'].includes(b.sex)) return 'Invalid sex value';
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return 'Invalid email address';
  if (b.birthdate && b.birthdate > new Date().toISOString().slice(0, 10))
    return 'Birthdate cannot be in the future';
  return null;
}

const values = b => [
  b.full_name.trim(), b.birthdate || null, b.contact || null, b.address || null,
  b.sex || null, b.email || null, b.education || null
];

router.get('/', (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const rows = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM applications p WHERE p.applicant_id = a.id) AS application_count
    FROM applicants a
    WHERE a.full_name LIKE ? OR a.contact LIKE ?
    ORDER BY a.full_name
  `).all(q, q);
  res.json(rows);
});

router.get('/:id/applications', (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.status, a.applied_at,
           c.name AS course_name, c.training_provider, c.start_date, c.end_date
    FROM applications a
    JOIN courses c ON c.id = a.course_id
    WHERE a.applicant_id = ?
    ORDER BY a.applied_at DESC
  `).all(req.params.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare(`
    INSERT INTO applicants (full_name, birthdate, contact, address, sex, email, education)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(...values(req.body));
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare(`
    UPDATE applicants SET full_name=?, birthdate=?, contact=?, address=?, sex=?, email=?, education=?
    WHERE id=?`).run(...values(req.body), req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Applicant not found' });
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM applications WHERE applicant_id = ?').get(req.params.id).n;
  if (n) return res.status(400).json({ error: `Cannot delete: applicant has ${n} application(s)` });
  db.prepare('DELETE FROM applicants WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Everything for the profile page in one request
router.get('/:id/profile', (req, res) => {
  const a = db.prepare('SELECT * FROM applicants WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Applicant not found' });
  const apps = db.prepare(`
    SELECT a.id, a.status, a.applied_at,
           c.name AS course_name, c.training_provider, c.start_date, c.end_date
    FROM applications a
    JOIN courses c ON c.id = a.course_id
    WHERE a.applicant_id = ?
    ORDER BY a.applied_at DESC
  `).all(a.id);
  const reqs = db.prepare(
    'SELECT id, name, submitted FROM requirements WHERE application_id = ? ORDER BY id');
  const files = db.prepare(
    'SELECT id, original_name FROM requirement_files WHERE requirement_id = ? ORDER BY id');
  apps.forEach(x => {
    x.requirements = reqs.all(x.id);
    x.requirements.forEach(r => r.files = files.all(r.id));
  });
  res.json({ applicant: a, applications: apps });
});

module.exports = router;