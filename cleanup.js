const db = require('./db');

for (const col of ['application_start', 'application_end', 'course_start', 'course_end']) {
  try {
    db.exec(`ALTER TABLE courses DROP COLUMN ${col}`);
    console.log('Dropped', col);
  } catch (e) {
    console.log('Skipped', col, '-', e.message);
  }
}

console.log('Columns now:', db.prepare('PRAGMA table_info(courses)').all().map(c => c.name));
console.log('Courses:', db.prepare('SELECT id, name, start_date, end_date FROM courses').all());