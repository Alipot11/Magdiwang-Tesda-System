const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data', 'tesda.db'));

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
  course_start DATE,
  course_end DATE
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

const courseCols = db.prepare("PRAGMA table_info(courses)").all().map(c => c.name);
for (const col of ['start_date', 'end_date']) {
  if (!courseCols.includes(col)) db.exec(`ALTER TABLE courses ADD COLUMN ${col} DATE`);
}

const applicantCols = db.prepare("PRAGMA table_info(applicants)").all().map(c => c.name);
for (const [col, type] of [['sex', 'TEXT'], ['email', 'TEXT'], ['education', 'TEXT']]) {
  if (!applicantCols.includes(col)) db.exec(`ALTER TABLE applicants ADD COLUMN ${col} ${type}`);
}

const reqCols = db.prepare("PRAGMA table_info(requirements)").all().map(c => c.name);
for (const [col, type] of [['original_name', 'TEXT'], ['uploaded_at', 'DATETIME']]) {
  if (!reqCols.includes(col)) db.exec(`ALTER TABLE requirements ADD COLUMN ${col} ${type}`);
}

db.exec(`
CREATE TABLE IF NOT EXISTS requirement_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  file_path TEXT NOT NULL,
  original_name TEXT,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// Move files from the old one-file-per-requirement columns (runs once, safe to repeat)
db.transaction(() => {
  db.exec(`
    INSERT INTO requirement_files (requirement_id, file_path, original_name, uploaded_at)
    SELECT id, file_path, original_name, COALESCE(uploaded_at, CURRENT_TIMESTAMP)
    FROM requirements WHERE file_path IS NOT NULL`);
  db.exec(`UPDATE requirements SET file_path = NULL, original_name = NULL, uploaded_at = NULL
           WHERE file_path IS NOT NULL`);
})();

module.exports = db;