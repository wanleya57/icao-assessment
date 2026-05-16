const { get, post, del } = require('../../utils/request');

const LEVELS = [
  { value: 1, label: '不合格', color: '#e53935' },
  { value: 3, label: '良好', color: '#4caf50' },
  { value: 4, label: '优秀', color: '#1a73e8' }
];

Page({
  data: {
    sessionId: 0,
    compCode: '',
    compName: '',
    compDescription: '',
    obs: [],
    ratedCount: 0,
    levels: LEVELS,
    hasChanges: false,
    saving: false
  },

  onLoad(opts) {
    this.setData({
      sessionId: parseInt(opts.sessionId),
      compCode: opts.compCode,
      compName: decodeURIComponent(opts.compName)
    });
    this.loadData();
  },

  async loadData() {
    const obsRes = await get(`/sessions/competencies/${this.data.compCode}/obs`);
    if (obsRes.code !== 0) return;

    const assessRes = await get(`/assessments/${this.data.sessionId}`);

    // Group records by OB
    const recordsByOB = {};
    const latestByOB = {};
    if (assessRes.code === 0) {
      (assessRes.data.records || [])
        .filter(r => r.competency_code === this.data.compCode)
        .forEach(r => {
          if (!recordsByOB[r.ob_code]) recordsByOB[r.ob_code] = [];
          recordsByOB[r.ob_code].push(r);
          if (!latestByOB[r.ob_code] || r.id > latestByOB[r.ob_code].id) {
            latestByOB[r.ob_code] = r;
          }
        });
    }

    const obs = obsRes.data.map(ob => {
      const records = recordsByOB[ob.code] || [];
      const latest = latestByOB[ob.code];
      // Level counts
      const levelCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
      records.forEach(r => { levelCounts[r.level]++; });
      // Build level summary string
      const levelSummary = [];
      if (levelCounts[1] > 0) levelSummary.push(`不合格×${levelCounts[1]}`);
      if (levelCounts[2] > 0) levelSummary.push(`发展中×${levelCounts[2]}`);
      if (levelCounts[3] > 0) levelSummary.push(`良好×${levelCounts[3]}`);
      if (levelCounts[4] > 0) levelSummary.push(`优秀×${levelCounts[4]}`);

      return {
        id: ob.id,
        code: ob.code,
        name_cn: ob.name_cn,
        name_en: ob.name_en,
        level: latest ? latest.level : 0,
        evidence: latest ? (latest.evidence || '') : '',
        records: records.map(r => ({
          id: r.id,
          level: r.level,
          levelLabel: LEVELS.find(l => l.value === r.level)?.label || '',
          levelColor: LEVELS.find(l => l.value === r.level)?.color || '#999',
          originalText: r.original_text || '',
          professionalText: r.professional_text || '',
          evidence: r.evidence || '',
          created_at: r.created_at
        })),
        levelSummary: levelSummary.join('、'),
        recordCount: records.length
      };
    });

    const compRes = await get('/sessions/competencies/all');
    if (compRes.code === 0) {
      const comp = compRes.data.find(c => c.code === this.data.compCode);
      if (comp) this.setData({ compDescription: comp.description_cn || '' });
    }

    const ratedCount = obs.filter(o => o.level > 0).length;
    this.setData({ obs, ratedCount });
  },

  onSelectLevel(e) {
    const { index, level, obCode } = e.currentTarget.dataset;
    const obs = [...this.data.obs];
    // Find the correct OB by code instead of using index
    const obIndex = obs.findIndex(o => o.code === obCode);
    if (obIndex !== -1) {
      const newLevel = obs[obIndex].level === parseInt(level) ? 0 : parseInt(level);
      obs[obIndex] = { ...obs[obIndex], level: newLevel };
      const ratedCount = obs.filter(o => o.level > 0).length;
      this.setData({ obs, hasChanges: true, ratedCount });
    }
  },

  onEvidenceInput(e) {
    const index = e.currentTarget.dataset.index;
    const obs = [...this.data.obs];
    obs[index] = { ...obs[index], evidence: e.detail.value };
    this.setData({ obs, hasChanges: true });
  },

  toggleEvidence(e) {
    const index = e.currentTarget.dataset.index;
    const obs = [...this.data.obs];
    obs[index] = { ...obs[index], showEvidence: !obs[index].showEvidence };
    this.setData({ obs });
  },

  toggleRecords(e) {
    const index = e.currentTarget.dataset.index;
    const obs = [...this.data.obs];
    obs[index] = { ...obs[index], showRecords: !obs[index].showRecords };
    this.setData({ obs });
  },

  async deleteRecord(e) {
    const { obIndex, recordId } = e.currentTarget.dataset;
    const obs = [...this.data.obs];
    const ob = obs[obIndex];

    wx.showModal({
      title: '确认删除',
      content: '删除这条评估记录？',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await del(`/assessments/${this.data.sessionId}/record/${recordId}`);
        if (result.code === 0) {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadData();
        } else {
          wx.showToast({ title: result.msg || '删除失败', icon: 'none' });
        }
      }
    });
  },

  async saveAssessments() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    const { sessionId, compCode, obs } = this.data;
    const assessments = obs
      .filter(o => o.level > 0)
      .map(o => ({
        competencyCode: compCode,
        obCode: o.code,
        level: o.level,
        evidence: o.evidence || null
      }));

    const res = await post(`/assessments/${sessionId}`, { assessments });
    this.setData({ saving: false, hasChanges: false });

    if (res.code === 0) {
      wx.showToast({ title: '已保存', icon: 'success' });
      this.loadData();
    } else {
      wx.showToast({ title: res.msg || '保存失败', icon: 'none' });
    }
  },

  onUnload() {
    if (this.data.hasChanges) {
      this.saveAssessments();
    }
  }
});
