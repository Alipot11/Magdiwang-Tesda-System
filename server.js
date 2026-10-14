const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db');

const fs = require('fs');
const envFile = require('path').join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const app = express();

if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== 'development') {
  console.error('SESSION_SECRET is missing. Create a .env file.');
  process.exit(1);
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret',
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
const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  const u = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.session.user.id);
  if (!u) return req.session.destroy(() => res.status(401).json({ error: 'Login required' }));
  req.session.user.role = u.role;   // role changes take effect immediately
  next();
};

app.get('/api/me', requireLogin, (req, res) => res.json(req.session.user));

// Feature routes go here, e.g. app.use('/api/courses', requireLogin, require('./routes/courses'));
app.use('/api/courses', requireLogin, require('./routes/courses'));

app.use('/api/applicants', requireLogin, require('./routes/applicants'));

app.use('/api/applications', requireLogin, require('./routes/applications'));

app.use('/api/requirements', requireLogin, require('./routes/requirements'));

app.use('/api/dashboard', requireLogin, require('./routes/dashboard'));

app.use('/api/users', requireLogin, require('./routes/users'));

// Frontend
app.get('/', (req, res) =>
  res.redirect(req.session.user ? '/index.html' : '/login.html'));
app.use(express.static(path.join(__dirname, 'public')));

// '0.0.0.0' lets other PCs on your network connect
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Running on port ' + PORT));

if (process.env.NODE_ENV !== 'development') {
  const cron = require('node-cron');
  const { runBackup } = require('./backup');
  cron.schedule('0 16 * * *', () => // backup happens every 4pm
    runBackup().catch(e => console.error('Backup failed:', e)));
}