const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'icao.db');
const db = new Database(dbPath);

try {
  // Check if column already exists
  const columns = db.prepare("PRAGMA table_info(pilots)").all();
  const hasCreatedBy = columns.some(c => c.name === 'created_by');

  if (hasCreatedBy) {
    console.log('created_by column already exists, skipping migration.');
  } else {
    db.exec('ALTER TABLE pilots ADD COLUMN created_by INTEGER REFERENCES instructors(id)');
    console.log('Added created_by column to pilots table.');
  }

  // Set existing pilots to be owned by the first instructor (id=1)
  if (!hasCreatedBy) {
    const updated = db.prepare('UPDATE pilots SET created_by = 1 WHERE created_by IS NULL').run();
    console.log(`Updated ${updated.changes} existing pilots with created_by = 1.`);
  }
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  db.close();
}
