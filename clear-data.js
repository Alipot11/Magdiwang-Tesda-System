// This file clears all the date be sure to backup before deleting all data
// Type in terminal: node clear-data.js
// To confirm: node clear-data.js --yes

const fs = require('fs');
const path = require('path');
const db = require('./db');

const tables = ['requirements', 'applications', 'applicants', 'courses'];
const count = t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

console.log('Current records:');
tables.forEach(t => console.log(' ', t, count(t)));
console.log('  users (kept):', count('users'));

if (!process.argv.includes('--yes')) {
  console.log('\nNothing deleted. Run "node clear-data.js --yes" to delete the records above.');
  process.exit(0);
}

db.transaction(() => {
  tables.forEach(t => db.exec(`DELETE FROM ${t}`));
  db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('requirements','applications','applicants','courses')`);
})();

const dir = path.join(__dirname, 'uploads');
if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => {
  const p = path.join(dir, f);
  if (fs.statSync(p).isFile()) fs.unlinkSync(p);
});
console.log('Done. Users were kept.');