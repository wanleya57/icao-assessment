const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'icao.db');
const db = new Database(dbPath);

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_sessions'").all();
  if (tables.length > 0) {
    console.log('login_sessions table already exists, skipping.');
  } else {
    db.exec(`
      CREATE TABLE login_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        device_type TEXT NOT NULL CHECK(device_type IN ('mobile', 'pc')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES instructors(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_login_sessions_user ON login_sessions(user_id);
      CREATE INDEX idx_login_sessions_token ON login_sessions(token);
    `);
    console.log('Created login_sessions table.');
  }
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  db.close();
}
