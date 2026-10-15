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

const MAX_FILES = 10;   // per requirement

const requireAdmin = (req, res, next) =>
  req.session.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' });

const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png'];
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB each
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new Error('Only PDF, JPG or PNG files are allowed'))
});

const removeFile = name => { if (name) fs.unlink(path.join(UPLOAD_DIR, name), () => {}); };
const fileCount = reqId =>
  db.prepare('SELECT COUNT(*) AS n FROM requirement_files WHERE requirement_id = ?').get(reqId).n;
const fileRow = id => db.prepare('SELECT * FROM requirement_files WHERE id = ?').get(id);

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

// Requirements of one application, each with its files (creates the default checklist the first time)
router.get('/application/:appId', (req, res) => {
  const appId = req.params.appId;
  if (!db.prepare('SELECT id FROM applications WHERE id = ?').get(appId))
    return res.status(404).json({ error: 'Application not found' });
  if (!db.prepare('SELECT COUNT(*) AS n FROM requirements WHERE application_id = ?').get(appId).n) {
    const ins = db.prepare('INSERT INTO requirements (application_id, name) VALUES (?, ?)');
    db.transaction(() => DEFAULT_REQUIREMENTS.forEach(name => ins.run(appId, name)))();
  }
  const list = db.prepare('SELECT id, name, submitted FROM requirements WHERE application_id = ? ORDER BY id').all(appId);
  const files = db.prepare('SELECT id, original_name FROM requirement_files WHERE requirement_id = ? ORDER BY id');
  list.forEach(r => r.files = files.all(r.id));
  res.json(list);
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
  if (!req.body.submitted && fileCount(r.id))
    return res.status(400).json({ error: 'Remove the uploaded files first' });
  db.prepare('UPDATE requirements SET submitted = ? WHERE id = ?').run(req.body.submitted ? 1 : 0, r.id);
  res.json({ ok: true });
});

// Upload one or more scanned documents (marks the requirement as submitted)
router.post('/:id/upload', (req, res) => {
  upload.array('files', MAX_FILES)(req, res, err => {
    if (err) return res.status(400).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'A file is larger than 10 MB'
           : err.code === 'LIMIT_UNEXPECTED_FILE' ? `You can upload up to ${MAX_FILES} files at a time`
           : err.message });
    const files = req.files || [];
    const cleanup = () => files.forEach(f => removeFile(f.filename));
    if (!files.length) return res.status(400).json({ error: 'Choose at least one file' });
    const r = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
    if (!r) { cleanup(); return res.status(404).json({ error: 'Requirement not found' }); }
    if (fileCount(r.id) + files.length > MAX_FILES) {
      cleanup();
      return res.status(400).json({ error: `A requirement can have up to ${MAX_FILES} files` });
    }
    const ins = db.prepare('INSERT INTO requirement_files (requirement_id, file_path, original_name) VALUES (?, ?, ?)');
    db.transaction(() => {
      files.forEach(f => ins.run(r.id, f.filename, f.originalname));
      db.prepare('UPDATE requirements SET submitted = 1 WHERE id = ?').run(r.id);
    })();
    res.json({ ok: true });
  });
});

// Authorized download: only reachable by logged-in users
router.get('/files/:fileId/download', (req, res) => {
  const f = fileRow(req.params.fileId);
  if (!f) return res.status(404).json({ error: 'File not found' });
  res.download(path.join(UPLOAD_DIR, f.file_path), f.original_name);
});

const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

// Show a file inside the browser (login required, like downloads)
router.get('/files/:fileId/preview', (req, res) => {
  const f = fileRow(req.params.fileId);
  if (!f) return res.status(404).json({ error: 'File not found' });
  const type = MIME[path.extname(f.file_path).toLowerCase()];
  if (!type) return res.status(400).json({ error: 'Preview not available' });
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(UPLOAD_DIR, f.file_path));
});

// Remove one file
router.delete('/files/:fileId', (req, res) => {
  const f = fileRow(req.params.fileId);
  if (!f) return res.status(404).json({ error: 'File not found' });
  removeFile(f.file_path);
  db.prepare('DELETE FROM requirement_files WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

// Delete a whole requirement and its files (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('SELECT file_path FROM requirement_files WHERE requirement_id = ?')
    .all(req.params.id).forEach(f => removeFile(f.file_path));
  db.prepare('DELETE FROM requirement_files WHERE requirement_id = ?').run(req.params.id);
  db.prepare('DELETE FROM requirements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;