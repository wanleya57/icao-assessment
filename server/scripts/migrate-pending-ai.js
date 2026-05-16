const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'icao.db');
const db = new Database(dbPath);

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pending_ai_results'").all();
  if (tables.length > 0) {
    console.log('pending_ai_results table already exists, skipping.');
  } else {
    db.exec(`
      CREATE TABLE pending_ai_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        results TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES instructors(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_pending_ai_user ON pending_ai_results(user_id);
    `);
    console.log('Created pending_ai_results table.');
  }
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  db.close();
}
