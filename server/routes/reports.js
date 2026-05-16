const router = require('express').Router();
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Get report data for a session (from assessment_records)
router.get('/sessions/:sessionId', async (req, res) => {
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
      'SELECT * FROM assessment_records WHERE session_id = ?',
      [req.params.sessionId]
    );

    const assessMap = {};
    records.forEach(r => {
      assessMap[r.ob_code] = { level: r.level, evidence: r.evidence || '' };
    });

    const competencies = comps.map(c => {
      const obs = allObs.filter(ob => ob.competency_id === c.id).map(ob => ({
        code: ob.code,
        name: ob.name_cn,
        level: assessMap[ob.code]?.level || 0,
        evidence: assessMap[ob.code]?.evidence || ''
      }));
      const ratedLevels = obs.filter(o => o.level > 0).map(o => o.level);
      const level = ratedLevels.length > 0 ? Math.min(...ratedLevels) : 0;
      return { code: c.code, name: c.name_cn, level, obs };
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
    console.error('report error:', err);
    res.json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
