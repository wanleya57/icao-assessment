const router = require('express').Router();
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// === Pending AI Results (跨设备同步) - 必须在 /:sessionId 前面 ===

// Save pending AI results
router.post('/pending-ai', async (req, res) => {
  try {
    const { results } = req.body;
    if (!results || !Array.isArray(results)) return res.json({ code: 400, msg: '无效数据' });
    await db.query('DELETE FROM pending_ai_results WHERE user_id = ?', [req.user.id]);
    if (results.length > 0) {
      await db.query(
        'INSERT INTO pending_ai_results (user_id, results) VALUES (?, ?)',
        [req.user.id, JSON.stringify(results)]
      );
    }
    res.json({ code: 0, msg: '已同步' });
  } catch (err) {
    console.error('save pending ai error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Get pending AI results
router.get('/pending-ai', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM pending_ai_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    if (rows.length === 0) return res.json({ code: 0, data: { results: [] } });
    res.json({ code: 0, data: { results: JSON.parse(rows[0].results), createdAt: rows[0].created_at } });
  } catch (err) {
    console.error('get pending ai error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Delete pending AI results
router.delete('/pending-ai', async (req, res) => {
  try {
    await db.query('DELETE FROM pending_ai_results WHERE user_id = ?', [req.user.id]);
    res.json({ code: 0, msg: '已清除' });
  } catch (err) {
    console.error('delete pending ai error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Check if current session is the latest (for kick detection)
router.get('/check-session', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const [rows] = await db.query(
      'SELECT id, created_at FROM login_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );
    const isLatest = rows.length > 0 && rows[0].token === token;
    res.json({ code: 0, data: { isLatest } });
  } catch (err) {
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// === Session Assessments ===

// Get all assessments for a session
router.get('/:sessionId', async (req, res) => {
  try {
    const [sessions] = await db.query(
      'SELECT id FROM training_sessions WHERE id = ? AND instructor_id = ?',
      [req.params.sessionId, req.user.id]
    );
    if (sessions.length === 0) return res.json({ code: 404, msg: '会话不存在' });

    const [records] = await db.query(
      'SELECT * FROM assessment_records WHERE session_id = ? ORDER BY competency_code, ob_code, created_at',
      [req.params.sessionId]
    );

    // Group by competency, then by OB
    const competencySummary = {};
    records.forEach(r => {
      if (!competencySummary[r.competency_code]) {
        competencySummary[r.competency_code] = { assessedOBs: new Set(), obLevels: {} };
      }
      competencySummary[r.competency_code].assessedOBs.add(r.ob_code);
      if (!competencySummary[r.competency_code].obLevels[r.ob_code]) {
        competencySummary[r.competency_code].obLevels[r.ob_code] = { 1: 0, 2: 0, 3: 0, 4: 0 };
      }
      competencySummary[r.competency_code].obLevels[r.ob_code][r.level]++;
    });

    // Compute competency levels (min of all rated OBs' latest levels)
    const competencyLevels = {};
    // Get latest level per OB
    const latestPerOB = {};
    records.forEach(r => {
      const key = r.ob_code;
      if (!latestPerOB[key] || r.id > latestPerOB[key].id) {
        latestPerOB[key] = r;
      }
    });
    Object.values(latestPerOB).forEach(r => {
      if (!competencyLevels[r.competency_code] || r.level < competencyLevels[r.competency_code]) {
        competencyLevels[r.competency_code] = r.level;
      }
    });

    // Build obLevelCounts per competency
    const obLevelCounts = {};
    Object.entries(competencySummary).forEach(([code, data]) => {
      obLevelCounts[code] = {};
      Object.entries(data.obLevels).forEach(([obCode, levels]) => {
        obLevelCounts[code][obCode] = levels;
      });
    });

    res.json({
      code: 0,
      data: {
        records,
        competencyLevels,
        obLevelCounts,
        assessedOBCount: Object.fromEntries(
          Object.entries(competencySummary).map(([k, v]) => [k, v.assessedOBs.size])
        )
      }
    });
  } catch (err) {
    console.error('get assessments error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Insert assessments (always new records, no upsert)
router.post('/:sessionId', async (req, res) => {
  try {
    const [sessions] = await db.query(
      'SELECT id FROM training_sessions WHERE id = ? AND instructor_id = ?',
      [req.params.sessionId, req.user.id]
    );
    if (sessions.length === 0) return res.json({ code: 404, msg: '会话不存在' });

    const { assessments } = req.body;
    if (!assessments || !Array.isArray(assessments) || assessments.length === 0) {
      return res.json({ code: 400, msg: '无评估数据' });
    }

    const sessionId = parseInt(req.params.sessionId);
    const stmt = db.db.prepare(`
      INSERT INTO assessment_records (session_id, competency_code, ob_code, level, original_text, professional_text, evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.db.transaction((items) => {
      for (const a of items) {
        stmt.run(sessionId, a.competencyCode, a.obCode, a.level, a.originalText || null, a.professionalText || null, a.evidence || null);
      }
    });
    insertMany(assessments);

    res.json({ code: 0, msg: '已保存' });
  } catch (err) {
    console.error('save assessments error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Delete specific assessment record
router.delete('/:sessionId/record/:recordId', async (req, res) => {
  try {
    await db.query(
      'DELETE FROM assessment_records WHERE id = ? AND session_id = ?',
      [req.params.recordId, req.params.sessionId]
    );
    res.json({ code: 0, msg: '已删除' });
  } catch (err) {
    console.error('delete assessment error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

// Get summary for report
router.get('/:sessionId/summary', async (req, res) => {
  try {
    const [sessions] = await db.query(
      'SELECT ts.*, i.name as instructor_name FROM training_sessions ts JOIN instructors i ON ts.instructor_id = i.id WHERE ts.id = ? AND ts.instructor_id = ?',
      [req.params.sessionId, req.user.id]
    );
    if (sessions.length === 0) return res.json({ code: 404, msg: '会话不存在' });

    const session = sessions[0];
    const [comps] = await db.query('SELECT * FROM competencies ORDER BY code');
    const [allObs] = await db.query('SELECT * FROM observable_behaviors ORDER BY code');
    const [records] = await db.query(
      'SELECT * FROM assessment_records WHERE session_id = ? ORDER BY competency_code, ob_code, created_at',
      [req.params.sessionId]
    );

    // Get latest level per OB
    const latestPerOB = {};
    records.forEach(r => {
      if (!latestPerOB[r.ob_code] || r.id > latestPerOB[r.ob_code].id) {
        latestPerOB[r.ob_code] = r;
      }
    });

    // Group records by OB
    const recordsByOB = {};
    records.forEach(r => {
      if (!recordsByOB[r.ob_code]) recordsByOB[r.ob_code] = [];
      recordsByOB[r.ob_code].push(r);
    });

    const competencies = comps.map(c => {
      const obs = allObs.filter(ob => ob.competency_id === c.id).map(ob => {
        const obRecords = recordsByOB[ob.code] || [];
        const latest = latestPerOB[ob.code];
        // Level counts
        const levelCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        obRecords.forEach(r => { levelCounts[r.level]++; });

        return {
          code: ob.code,
          name: ob.name_cn,
          name_en: ob.name_en,
          level: latest ? latest.level : 0,
          levelCounts,
          totalCount: obRecords.length,
          records: obRecords.map(r => ({
            id: r.id,
            level: r.level,
            original_text: r.original_text || '',
            professional_text: r.professional_text || '',
            evidence: r.evidence || '',
            created_at: r.created_at
          }))
        };
      });

      // Competency level = min of latest OB levels
      const ratedLevels = obs.filter(o => o.level > 0).map(o => o.level);
      const level = ratedLevels.length > 0 ? Math.min(...ratedLevels) : 0;
      const assessedCount = obs.filter(o => o.totalCount > 0).length;

      return {
        code: c.code,
        name: c.name_cn,
        name_en: c.name_en,
        description: c.description_cn,
        level,
        assessedCount,
        totalOBCount: obs.length,
        obs
      };
    });

    const riskAlerts = [];
    competencies.forEach(c => {
      const belowObs = c.obs.filter(o => o.level === 1);
      if (belowObs.length > 0) {
        riskAlerts.push({
          compCode: c.code,
          compName: c.name,
          details: belowObs.map(o => `${o.code} 低于预期`).join('；')
        });
      }
    });

    res.json({ code: 0, data: { session, competencies, riskAlerts } });
  } catch (err) {
    console.error('assessment summary error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
