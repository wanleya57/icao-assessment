const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { JWT_SECRET } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { phone, password, name, deviceType } = req.body;
    if (!phone || !password || !name) return res.json({ code: 400, msg: '手机号、密码、姓名均为必填' });
    if (!/^1\d{10}$/.test(phone)) return res.json({ code: 400, msg: '请输入正确的11位手机号' });
    if (password.length < 6) return res.json({ code: 400, msg: '密码至少6位' });

    const [existing] = await db.query('SELECT id FROM instructors WHERE phone = ?', [phone]);
    if (existing.length > 0) return res.json({ code: 400, msg: '该手机号已注册' });

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO instructors (phone, password, name) VALUES (?, ?, ?)',
      [phone, hashed, name.trim()]
    );
    const token = jwt.sign({ id: result.insertId }, JWT_SECRET, { expiresIn: '7d' });
    const dt = ['mobile', 'pc'].includes(deviceType) ? deviceType : 'mobile';
    await db.query(
      'INSERT INTO login_sessions (user_id, token, device_type) VALUES (?, ?, ?)',
      [result.insertId, token, dt]
    );
    res.json({ code: 0, data: { token, instructor: { id: result.insertId, name: name.trim(), phone, employee_id: null } } });
  } catch (err) {
    console.error('register error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password, deviceType } = req.body;
    if (!phone || !password) return res.json({ code: 400, msg: '请输入手机号和密码' });

    const [rows] = await db.query('SELECT * FROM instructors WHERE phone = ?', [phone]);
    if (rows.length === 0) return res.json({ code: 400, msg: '手机号未注册' });

    const instructor = rows[0];
    const match = await bcrypt.compare(password, instructor.password);
    if (!match) return res.json({ code: 400, msg: '密码错误' });

    const dt = ['mobile', 'pc'].includes(deviceType) ? deviceType : 'mobile';
    await db.query(
      'DELETE FROM login_sessions WHERE user_id = ? AND device_type = ?',
      [instructor.id, dt]
    );

    const token = jwt.sign({ id: instructor.id }, JWT_SECRET, { expiresIn: '7d' });
    await db.query(
      'INSERT INTO login_sessions (user_id, token, device_type) VALUES (?, ?, ?)',
      [instructor.id, token, dt]
    );

    // Fetch pending AI results from previous device
    let pendingAiResults = [];
    try {
      const [pending] = await db.query(
        'SELECT results FROM pending_ai_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [instructor.id]
      );
      if (pending.length > 0) {
        pendingAiResults = JSON.parse(pending[0].results);
      }
    } catch (e) {}

    res.json({
      code: 0, data: {
        token,
        instructor: { id: instructor.id, name: instructor.name, phone: instructor.phone, employee_id: instructor.employee_id },
        pendingAiResults
      }
    });
  } catch (err) {
    console.error('login error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { phone, name, newPassword } = req.body;
    if (!phone || !name || !newPassword) return res.json({ code: 400, msg: '手机号、姓名、新密码均为必填' });
    if (newPassword.length < 6) return res.json({ code: 400, msg: '密码至少6位' });

    const [rows] = await db.query('SELECT * FROM instructors WHERE phone = ? AND name = ?', [phone, name.trim()]);
    if (rows.length === 0) return res.json({ code: 400, msg: '手机号或姓名不匹配' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE instructors SET password = ? WHERE id = ?', [hashed, rows[0].id]);
    res.json({ code: 0, msg: '密码重置成功' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
