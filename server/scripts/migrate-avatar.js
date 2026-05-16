const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'icao.db');
const db = new Database(dbPath);

try {
  const columns = db.prepare("PRAGMA table_info(instructors)").all();
  const hasAvatar = columns.some(c => c.name === 'avatar');

  if (hasAvatar) {
    console.log('avatar column already exists, skipping migration.');
  } else {
    db.exec('ALTER TABLE instructors ADD COLUMN avatar TEXT');
    console.log('Added avatar column to instructors table.');
  }

  // Ensure avatars directory exists
  const avatarsDir = path.join(__dirname, '..', 'data', 'avatars');
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
    console.log('Created avatars directory.');
  }
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  db.close();
}
