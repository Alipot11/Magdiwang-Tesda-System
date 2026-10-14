const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(session({
  secret: 'change-this-to-a-long-random-string',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json(req.session.user);
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

// Gate everything else behind login
const requireLogin = (req, res, next) =>
  req.session.user ? next() : res.status(401).json({ error: 'Login required' });

app.get('/api/me', requireLogin, (req, res) => res.json(req.session.user));

// Feature routes go here, e.g. app.use('/api/courses', requireLogin, require('./routes/courses'));
app.use('/api/courses', requireLogin, require('./routes/courses'));

app.use('/api/applicants', requireLogin, require('./routes/applicants'));

app.use('/api/applications', requireLogin, require('./routes/applications'));

app.use('/api/requirements', requireLogin, require('./routes/requirements'));

app.use('/api/dashboard', requireLogin, require('./routes/dashboard'));

// Frontend
app.get('/', (req, res) =>
  res.redirect(req.session.user ? '/index.html' : '/login.html'));
app.use(express.static(path.join(__dirname, 'public')));

// '0.0.0.0' lets other PCs on your network connect
app.listen(3000, '0.0.0.0', () => console.log('Running on port 3000'));

const cron = require('node-cron');
const { runBackup } = require('./backup');
cron.schedule('0 16 * * *', () =>        // every day at 6:00 PM (PC time)
  runBackup().catch(e => console.error('Backup failed:', e)));