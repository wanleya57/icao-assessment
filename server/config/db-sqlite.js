const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'icao.db');
const fs = require('fs');

// 确保 data 目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// 启用 WAL 模式提高性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 评估记录表（CBTA 等级评估，允许多条记录）
db.exec(`
  CREATE TABLE IF NOT EXISTS assessment_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    competency_code TEXT NOT NULL,
    ob_code TEXT NOT NULL,
    level INTEGER NOT NULL CHECK(level IN (1, 2, 3, 4)),
    original_text TEXT,
    professional_text TEXT,
    evidence TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  );
`);

// 包装 query 方法以兼容 mysql2 的接口
function query(sql, params = []) {
  try {
    // 判断是 SELECT 还是其他操作
    const trimmedSql = sql.trim().toUpperCase();

    // 处理 MySQL 风格的批量插入 VALUES ?
    if (sql.includes('VALUES ?') && Array.isArray(params[0]) && Array.isArray(params[0][0])) {
      // 提取 INSERT INTO 部分
      const insertPrefix = sql.replace(/VALUES\s*\?/i, 'VALUES ');
      const rows = params[0];

      // 使用事务批量插入
      const insertMany = db.transaction((items) => {
        const results = [];
        for (const row of items) {
          const placeholders = row.map(() => '?').join(', ');
          const insertSql = insertPrefix + `(${placeholders})`;
          const stmt = db.prepare(insertSql);
          const result = stmt.run(row);
          results.push({ insertId: result.lastInsertRowid, affectedRows: result.changes });
        }
        return results;
      });

      const results = insertMany(rows);
      return Promise.resolve([{ insertId: results[results.length - 1]?.insertId, affectedRows: results.length }]);
    }

    if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
      const stmt = db.prepare(sql);
      const rows = stmt.all(params);
      return Promise.resolve([rows]);
    } else {
      const stmt = db.prepare(sql);
      const result = stmt.run(params);
      return Promise.resolve([{ insertId: result.lastInsertRowid, affectedRows: result.changes }]);
    }
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = { query, db };
