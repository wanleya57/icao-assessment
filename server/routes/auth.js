const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const https = require('https');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

// 国阳云 SMS configuration
const SMS_APPCODE = process.env.SMS_APPCODE || 'YOUR_SMS_APPCODE';
const SMS_SIGN_ID = process.env.SMS_SIGN_ID || 'YOUR_SMS_SIGN_ID';
const SMS_TEMPLATE_ID = process.env.SMS_TEMPLATE_ID || 'YOUR_SMS_TEMPLATE_ID';

// In-memory verification code store (code, phone, expireTime)
const codeStore = new Map();

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendSms(phone, code) {
  const param = `**code**:${code},**minute**:5`;
  const qs = `mobile=${encodeURIComponent(phone)}&templateId=${SMS_TEMPLATE_ID}&smsSignId=${SMS_SIGN_ID}&param=${encodeURIComponent(param)}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'gyytz.market.alicloudapi.com',
      path: `/sms/smsSend?${qs}`,
      method: 'POST',
      headers: {
        'Authorization': `APPCODE ${SMS_APPCODE}`,
        'Content-Type': 'application/json'
      }
    }, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ code: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

router.post('/send-code', async (req, res) => {
  try {
    const { phone, type } = req.body;
    if (!phone || !/^1\d{10}$/.test(phone)) return res.json({ code: 400, msg: '请输入正确的手机号' });

    const [existing] = await db.query('SELECT id FROM instructors WHERE phone = ?', [phone]);
    if (type === 'register' && existing.length > 0) return res.json({ code: 400, msg: '该手机号已注册' });
    if (type === 'reset' && existing.length === 0) return res.json({ code: 400, msg: '该手机号未注册' });

    const now = Date.now();
    const prev = codeStore.get(phone);
    if (prev && now - prev.time < 60000) {
      return res.json({ code: 400, msg: '请60秒后再试' });
    }

    const code = generateCode();
    codeStore.set(phone, { code, time: now });

    const smsRes = await sendSms(phone, code);
    if (smsRes.code === '0') {
      res.json({ code: 0, msg: '验证码已发送' });
    } else {
      console.error('SMS error:', smsRes);
      res.json({ code: 400, msg: smsRes.msg || '验证码发送失败' });
    }
  } catch (err) {
    console.error('send-code error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { phone, password, name, code, deviceType } = req.body;
    if (!phone || !password || !name) return res.json({ code: 400, msg: '手机号、密码、姓名均为必填' });
    if (!/^1\d{10}$/.test(phone)) return res.json({ code: 400, msg: '请输入正确的11位手机号' });
    if (password.length < 8) return res.json({ code: 400, msg: '密码至少8位' });
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return res.json({ code: 400, msg: '密码需包含字母和数字' });
    if (!code || code.length !== 6) return res.json({ code: 400, msg: '请输入6位验证码' });

    const stored = codeStore.get(phone);
    if (!stored) return res.json({ code: 400, msg: '请先获取验证码' });
    if (Date.now() - stored.time > 300000) {
      codeStore.delete(phone);
      return res.json({ code: 400, msg: '验证码已过期，请重新获取' });
    }
    if (stored.code !== code) return res.json({ code: 400, msg: '验证码错误' });

    const [existing] = await db.query('SELECT id FROM instructors WHERE phone = ?', [phone]);
    if (existing.length > 0) return res.json({ code: 400, msg: '该手机号已注册' });

    codeStore.delete(phone);

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
    res.json({ code: 0, data: { token, instructor: { id: result.insertId, name: name.trim(), phone, employee_id: null, avatar: null } } });
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
        instructor: { id: instructor.id, name: instructor.name, phone: instructor.phone, employee_id: instructor.employee_id, avatar: instructor.avatar || null },
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
    const { phone, code, newPassword } = req.body;
    if (!phone || !code || !newPassword) return res.json({ code: 400, msg: '手机号、验证码、新密码均为必填' });
    if (newPassword.length < 8) return res.json({ code: 400, msg: '密码至少8位' });
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) return res.json({ code: 400, msg: '密码需包含字母和数字' });

    const stored = codeStore.get(phone);
    if (!stored) return res.json({ code: 400, msg: '请先获取验证码' });
    if (Date.now() - stored.time > 300000) {
      codeStore.delete(phone);
      return res.json({ code: 400, msg: '验证码已过期，请重新获取' });
    }
    if (stored.code !== code) return res.json({ code: 400, msg: '验证码错误' });

    const [rows] = await db.query('SELECT * FROM instructors WHERE phone = ?', [phone]);
    if (rows.length === 0) return res.json({ code: 400, msg: '该手机号未注册' });

    codeStore.delete(phone);

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE instructors SET password = ? WHERE id = ?', [hashed, rows[0].id]);
    res.json({ code: 0, msg: '密码重置成功' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Upload avatar (requires auth)
router.post('/avatar', authMiddleware, async (req, res) => {
  try {
    console.log('avatar upload: user_id=', req.user.id, 'body_keys=', Object.keys(req.body), 'avatar_type=', typeof req.body.avatar);
    const { avatar } = req.body;
    if (!avatar) {
      console.log('avatar upload: no avatar in body');
      return res.json({ code: 400, msg: '请提供头像数据' });
    }
    console.log('avatar upload: avatar length=', avatar.length, 'preview=', avatar.substring(0, 50));

    // Validate base64 image
    const matches = avatar.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      console.log('avatar upload: regex mismatch, avatar starts with:', avatar.substring(0, 100));
      return res.json({ code: 400, msg: '无效的图片格式' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    console.log('avatar upload: buffer length=', buffer.length, 'ext=', ext);

    // Limit size to 500KB
    if (buffer.length > 500 * 1024) {
      console.log('avatar upload: file too large', buffer.length);
      return res.json({ code: 400, msg: '图片大小不能超过500KB' });
    }

    // Save to DATA_DIR/avatars/
    const avatarsDir = path.join(__dirname, '..', 'data', 'avatars');
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

    const filename = `${req.user.id}.${ext}`;
    fs.writeFileSync(path.join(avatarsDir, filename), buffer);
    console.log('avatar upload: saved to', path.join(avatarsDir, filename));

    // Update database - use full URL for mini program to load
    const avatarUrl = `https://YOUR_DOMAIN/api/auth/avatar/${req.user.id}`;
    await db.query('UPDATE instructors SET avatar = ? WHERE id = ?', [avatarUrl, req.user.id]);
    console.log('avatar upload: updated db, avatarUrl=', avatarUrl);

    res.json({ code: 0, data: { avatar: avatarUrl } });
  } catch (err) {
    console.error('upload avatar error:', err);
    res.json({ code: 500, msg: '上传失败' });
  }
});

// Serve avatar image
router.get('/avatar/:userId', (req, res) => {
  try {
    const avatarsDir = path.join(__dirname, '..', 'data', 'avatars');
    const files = fs.readdirSync(avatarsDir).filter(f => f.startsWith(`${req.params.userId}.`));
    if (files.length === 0) return res.status(404).send('Not found');

    const file = files[0];
    const ext = path.extname(file).slice(1);
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
    res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(avatarsDir, file));
  } catch (err) {
    res.status(404).send('Not found');
  }
});

module.exports = router;
