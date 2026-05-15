const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'icao-assessment-dev-secret-key';
if (!process.env.JWT_SECRET) {
  console.error('警告: JWT_SECRET 环境变量未设置，使用默认密钥（仅限开发环境）');
}

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ code: 401, msg: '未登录' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [sessions] = await db.query(
      'SELECT id FROM login_sessions WHERE token = ? AND user_id = ?',
      [token, decoded.id]
    );
    if (sessions.length === 0) {
      return res.status(401).json({ code: 401, msg: '登录已过期' });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ code: 401, msg: '登录已过期' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
