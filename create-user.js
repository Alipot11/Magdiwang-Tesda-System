const bcrypt = require('bcrypt');
const db = require('./db');
const [,, username, password, role = 'staff'] = process.argv;
db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)')
  .run(username, bcrypt.hashSync(password, 10), role);
console.log('Created', username);