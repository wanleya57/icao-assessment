const router = require('express').Router();
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// List phrases (default + custom)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM phrase_library WHERE (is_default = 1 OR instructor_id = ?)';
    const params = [req.user.id];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY category, id';
    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('list phrases error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Add custom phrase
router.post('/', async (req, res) => {
  try {
    const { category, text } = req.body;
    if (!category || !text) return res.json({ code: 400, msg: '类别和内容不能为空' });
    const [result] = await db.query(
      'INSERT INTO phrase_library (category, text, instructor_id, is_default) VALUES (?, ?, ?, 0)',
      [category, text.trim(), req.user.id]
    );
    res.json({ code: 0, data: { id: result.insertId } });
  } catch (err) {
    console.error('add phrase error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Delete custom phrase (only own phrases)
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM phrase_library WHERE id = ? AND instructor_id = ? AND is_default = 0',
      [req.params.id, req.user.id]
    );
    res.json({ code: 0, msg: '已删除' });
  } catch (err) {
    console.error('delete phrase error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
