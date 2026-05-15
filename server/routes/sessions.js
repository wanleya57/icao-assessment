const router = require('express').Router();
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Create training session
router.post('/', async (req, res) => {
  try {
    const { studentName, aircraftType, taskType, flightDate, pilotId } = req.body;
    if (!studentName || !aircraftType || !taskType || !flightDate) {
      return res.json({ code: 400, msg: '请填写完整信息' });
    }
    const code = 'TS' + Date.now();
    const [result] = await db.query(
      `INSERT INTO training_sessions (session_code, instructor_id, pilot_id, student_name, aircraft_type, task_type, flight_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, req.user.id, pilotId || null, studentName, aircraftType, taskType, flightDate]
    );
    res.json({ code: 0, data: { sessionId: result.insertId, sessionCode: code } });
  } catch (err) {
    console.error('create session error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// List sessions
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM training_sessions WHERE instructor_id = ?';
    const params = [req.user.id];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await db.query(sql, params);
    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('list sessions error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Get single session with events
router.get('/:id', async (req, res) => {
  try {
    const [sessions] = await db.query(
      'SELECT * FROM training_sessions WHERE id = ? AND instructor_id = ?',
      [req.params.id, req.user.id]
    );
    if (sessions.length === 0) return res.json({ code: 404, msg: '会话不存在' });

    const [events] = await db.query(
      'SELECT * FROM event_records WHERE session_id = ? ORDER BY event_time',
      [req.params.id]
    );
    res.json({ code: 0, data: { ...sessions[0], events } });
  } catch (err) {
    console.error('get session error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Complete session
router.put('/:id/complete', async (req, res) => {
  try {
    await db.query(
      "UPDATE training_sessions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ? AND instructor_id = ?",
      [req.params.id, req.user.id]
    );
    res.json({ code: 0, msg: '已结束' });
  } catch (err) {
    console.error('complete session error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Delete session (only in_progress)
router.delete('/:id', async (req, res) => {
  try {
    const [sessions] = await db.query(
      "SELECT id, status FROM training_sessions WHERE id = ? AND instructor_id = ?",
      [req.params.id, req.user.id]
    );
    if (sessions.length === 0) return res.json({ code: 404, msg: '会话不存在' });
    if (sessions[0].status !== 'in_progress') return res.json({ code: 400, msg: '只能删除进行中的记录' });

    await db.query('DELETE FROM event_records WHERE session_id = ?', [req.params.id]);
    await db.query('DELETE FROM training_sessions WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (err) {
    console.error('delete session error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Get pilots list (shared across all users)
router.get('/pilots/list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM pilots ORDER BY name');
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Add pilot
router.post('/pilots', async (req, res) => {
  try {
    const { name, employeeId, rank } = req.body;
    if (!name) return res.json({ code: 400, msg: '姓名不能为空' });
    const [result] = await db.query(
      'INSERT INTO pilots (name, employee_id, rank, created_by) VALUES (?, ?, ?, ?)',
      [name, employeeId || null, rank || '学员', req.user.id]
    );
    res.json({ code: 0, data: { id: result.insertId } });
  } catch (err) {
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Delete pilot
router.delete('/pilots/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM pilots WHERE id = ?', [req.params.id]);
    res.json({ code: 0, msg: '已删除' });
  } catch (err) {
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// === Observable Behaviors ===

// Get OBs for a competency
router.get('/competencies/:code/obs', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT ob.* FROM observable_behaviors ob
       JOIN competencies c ON ob.competency_id = c.id
       WHERE c.code = ? ORDER BY ob.code`,
      [req.params.code]
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Get all competencies with OBs
router.get('/competencies/all', async (req, res) => {
  try {
    const [comps] = await db.query('SELECT * FROM competencies ORDER BY code');
    const [obs] = await db.query('SELECT * FROM observable_behaviors ORDER BY code');
    const result = comps.map(c => ({
      ...c,
      observableBehaviors: obs.filter(ob => ob.competency_id === c.id)
    }));
    res.json({ code: 0, data: result });
  } catch (err) {
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// === Event Records ===

// Add event
router.post('/:id/events', async (req, res) => {
  try {
    const { competencyCode, competencyName, obCode, severity, evidence } = req.body;
    if (!competencyCode || !competencyName) return res.json({ code: 400, msg: '缺少胜任力信息' });

    const [session] = await db.query(
      'SELECT id FROM training_sessions WHERE id = ? AND instructor_id = ?',
      [req.params.id, req.user.id]
    );
    if (session.length === 0) return res.json({ code: 404, msg: '会话不存在' });

    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const [result] = await db.query(
      'INSERT INTO event_records (session_id, competency_code, ob_code, competency_name, event_time, count, severity, evidence) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [req.params.id, competencyCode, obCode || null, competencyName, now, severity || 'normal', evidence || null]
    );
    res.json({ code: 0, data: { eventId: result.insertId, eventTime: now } });
  } catch (err) {
    console.error('add event error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Increment event count
router.post('/:sessionId/events/:eventId/increment', async (req, res) => {
  try {
    const [session] = await db.query(
      'SELECT id FROM training_sessions WHERE id = ? AND instructor_id = ?',
      [req.params.sessionId, req.user.id]
    );
    if (session.length === 0) return res.json({ code: 404, msg: '会话不存在' });

    await db.query('UPDATE event_records SET count = count + 1 WHERE id = ? AND session_id = ?',
      [req.params.eventId, req.params.sessionId]);
    const [rows] = await db.query('SELECT count FROM event_records WHERE id = ?', [req.params.eventId]);
    res.json({ code: 0, data: { count: rows[0]?.count || 0 } });
  } catch (err) {
    console.error('increment event error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Update event (evidence, severity)
router.put('/:sessionId/events/:eventId', async (req, res) => {
  try {
    const { evidence, severity } = req.body;
    const fields = [];
    const params = [];
    if (evidence !== undefined) { fields.push('evidence = ?'); params.push(evidence); }
    if (severity !== undefined) { fields.push('severity = ?'); params.push(severity); }
    if (fields.length === 0) return res.json({ code: 400, msg: '无更新内容' });

    params.push(req.params.eventId);
    await db.query(`UPDATE event_records SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ code: 0, msg: '已更新' });
  } catch (err) {
    console.error('update event error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Undo last event for a competency
router.delete('/:sessionId/events/last', async (req, res) => {
  try {
    const { competencyCode } = req.query;
    if (!competencyCode) return res.json({ code: 400, msg: '缺少参数' });

    const [session] = await db.query(
      'SELECT id FROM training_sessions WHERE id = ? AND instructor_id = ?',
      [req.params.sessionId, req.user.id]
    );
    if (session.length === 0) return res.json({ code: 404, msg: '会话不存在' });

    await db.query(
      `DELETE FROM event_records WHERE id = (
        SELECT id FROM event_records WHERE session_id = ? AND competency_code = ?
        ORDER BY id DESC LIMIT 1
      )`,
      [req.params.sessionId, competencyCode]
    );
    res.json({ code: 0, msg: '已撤销' });
  } catch (err) {
    console.error('undo event error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Delete specific event
router.delete('/:sessionId/events/:eventId', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM event_records WHERE id = ? AND session_id = ?',
      [req.params.eventId, req.params.sessionId]
    );
    res.json({ code: 0, msg: '已删除' });
  } catch (err) {
    console.error('delete event error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
