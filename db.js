const Database = require('better-sqlite3');
const db = new Database('data/tesda.db');
db.pragma('journal_mode = WAL');   // lets 2+ users read/write smoothly
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff'   -- 'admin' or 'staff'
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  training_provider TEXT,
  total_slots INTEGER DEFAULT 0,
  application_start DATE,
  application_end DATE
);

CREATE TABLE IF NOT EXISTS applicants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  birthdate DATE,
  contact TEXT,
  address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  status TEXT NOT NULL DEFAULT 'Received'
    CHECK (status IN ('Received','Under Review','Incomplete','Qualified','Waitlisted','Approved')),
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  name TEXT NOT NULL,
  submitted INTEGER DEFAULT 0,
  file_path TEXT
);
`);

module.exports = db;