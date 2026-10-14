// This file is used to manually backup data
// Type in terminal: node backup.js

const fs = require('fs');
const path = require('path');
const db = require('./db');

// For real protection, point this at a different drive, e.g. 'D:\\TESDA-backups'
const BACKUP_ROOT = path.join(__dirname, 'backups');
const KEEP = 14;   // number of backups to keep

async function runBackup() {
  const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-').slice(0, 16); // 2026-10-14-18-00
  const dir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });

  await db.backup(path.join(dir, 'tesda.db'));

  const uploads = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dir, 'uploads'), { recursive: true });

  // Delete the oldest backups beyond KEEP
  fs.readdirSync(BACKUP_ROOT).filter(n => /^\d{4}-/.test(n)).sort()
    .slice(0, -KEEP)
    .forEach(n => fs.rmSync(path.join(BACKUP_ROOT, n), { recursive: true, force: true }));

  console.log('Backup done:', dir);
}

module.exports = { runBackup };

// Lets you run a manual backup with: node backup.js
if (require.main === module) runBackup().then(() => process.exit(0));