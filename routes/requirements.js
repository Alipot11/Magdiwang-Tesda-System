const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Edit this list to match your office's actual requirements
const DEFAULT_REQUIREMENTS = [
  'Application Form',
  'PSA / Birth / Marriage Certificate',
  'Valid Email Address',
  '2 Pieces 1x1 ID Picture',
  '2 Pieces Passport Size Picture',
  'Any Diploma / TOR'
];

const requireAdmin = (req, res, next) =>
  req.session.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png'];
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new Error('Only PDF, JPG or PNG files are allowed'))
});

const removeFile = name => { if (name) fs.unlink(path.join(UPLOAD_DIR, name), () => {}); };

// Overview: every application with its submitted / total requirement counts
router.get('/overview', (req, res) => {
  res.json(db.prepare(`
    SELECT a.id AS application_id, a.status, ap.full_name, c.name AS course_name,
           COUNT(r.id) AS total, COALESCE(SUM(r.submitted), 0) AS submitted
    FROM applications a
    JOIN applicants ap ON ap.id = a.applicant_id
    JOIN courses c ON c.id = a.course_id
    LEFT JOIN requirements r ON r.application_id = a.id
    GROUP BY a.id
    ORDER BY ap.full_name
  `).all());
});

// Requirements of one application (creates the default checklist the first time)
router.get('/application/:appId', (req, res) => {
  const appId = req.params.appId;
  if (!db.prepare('SELECT id FROM applications WHERE id = ?').get(appId))
    return res.status(404).json({ error: 'Application not found' });
  const n = db.prepare('SELECT COUNT(*) AS n FROM requirements WHERE application_id = ?').get(appId).n;
  if (!n) {
    const ins = db.prepare('INSERT INTO requirements (application_id, name) VALUES (?, ?)');
    db.transaction(() => DEFAULT_REQUIREMENTS.forEach(name => ins.run(appId, name)))();
  }
  res.json(db.prepare('SELECT * FROM requirements WHERE application_id = ? ORDER BY id').all(appId));
});

// Add a custom requirement
router.post('/application/:appId', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Requirement name is required' });
  db.prepare('INSERT INTO requirements (application_id, name) VALUES (?, ?)').run(req.params.appId, name);
  res.json({ ok: true });
});

// Mark submitted / missing by hand (e.g. paper copy received)
router.put('/:id/submitted', (req, res) => {
  const r = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Requirement not found' });
  if (!req.body.submitted && r.file_path)
    return res.status(400).json({ error: 'Remove the uploaded file first' });
  db.prepare('UPDATE requirements SET submitted = ? WHERE id = ?').run(req.body.submitted ? 1 : 0, r.id);
  res.json({ ok: true });
});

// Upload a scanned document (marks the requirement as submitted)
router.post('/:id/upload', (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 10 MB' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Choose a file' });
    const r = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
    if (!r) { removeFile(req.file.filename); return res.status(404).json({ error: 'Requirement not found' }); }
    removeFile(r.file_path);   // replace any previous file
    db.prepare(`UPDATE requirements
                SET file_path = ?, original_name = ?, uploaded_at = CURRENT_TIMESTAMP, submitted = 1
                WHERE id = ?`).run(req.file.filename, req.file.originalname, r.id);
    res.json({ ok: true });
  });
});

// Authorized download: only reachable by logged-in users
router.get('/:id/download', (req, res) => {
  const r = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!r || !r.file_path) return res.status(404).json({ error: 'No file uploaded' });
  res.download(path.join(UPLOAD_DIR, r.file_path), r.original_name);
});

router.delete('/:id/file', (req, res) => {
  const r = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Requirement not found' });
  removeFile(r.file_path);
  db.prepare('UPDATE requirements SET file_path = NULL, original_name = NULL, uploaded_at = NULL WHERE id = ?').run(r.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const fs = require('fs'), path = require('path');
  db.prepare('SELECT file_path FROM requirements WHERE application_id = ? AND file_path IS NOT NULL')
    .all(req.params.id)
    .forEach(r => fs.unlink(path.join(__dirname, '..', 'uploads', r.file_path), () => {}));
  const r = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (r) removeFile(r.file_path);
  db.prepare('DELETE FROM requirements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

// Show a file inside the browser (login required, like downloads)
router.get('/:id/preview', (req, res) => {
  const r = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!r || !r.file_path) return res.status(404).json({ error: 'No file uploaded' });
  const type = MIME[path.extname(r.file_path).toLowerCase()];
  if (!type) return res.status(400).json({ error: 'Preview not available' });
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(UPLOAD_DIR, r.file_path));
});

module.exports = router;