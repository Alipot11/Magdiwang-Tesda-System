const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();

// Everything here is admin only
router.use((req, res, next) =>
  req.session.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' }));

const adminCount = () =>
  db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;

function checkUsername(username, exceptId = 0) {
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (!/^[A-Za-z0-9._-]+$/.test(username))
    return 'Username can only use letters, numbers, dot, dash and underscore';
  if (db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?').get(username, exceptId))
    return 'That username already exists';
  return null;
}

const passwordError = p =>
  !p || p.length < 8 ? 'Password must be at least 8 characters'
  : !/[A-Za-z]/.test(p) || !/\d/.test(p) ? 'Password must include at least one letter and one number'
  : null;

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, username, role FROM users ORDER BY username').all());
});

router.post('/', async (req, res) => {
  const username = (req.body.username || '').trim();
  const { password, role } = req.body;
  const uerr = checkUsername(username);
  if (uerr) return res.status(400).json({ error: uerr });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);
  res.json({ ok: true });
});

router.put('/:id/password', async (req, res) => {
  const { password } = req.body;
  const perr = passwordError(password);
  if (perr) return res.status(400).json({ error: perr });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'User not found' });
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

router.put('/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.id === req.session.user.id) return res.status(400).json({ error: 'You cannot change your own role' });
  if (u.role === 'admin' && role !== 'admin' && adminCount() <= 1)
    return res.status(400).json({ error: 'At least one admin is required' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, u.id);
  res.json({ ok: true });
});

router.put('/:id/username', (req, res) => {
  const username = (req.body.username || '').trim();
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const err = checkUsername(username, u.id);
  if (err) return res.status(400).json({ error: err });
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, u.id);
  if (u.id === req.session.user.id) req.session.user.username = username;
  res.json({ ok: true, username });
});

router.delete('/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.id === req.session.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (u.role === 'admin' && adminCount() <= 1)
    return res.status(400).json({ error: 'At least one admin is required' });
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});

module.exports = router;