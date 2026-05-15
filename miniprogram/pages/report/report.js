const { get, del } = require('../../utils/request');

const LEVEL_LABELS = { 1: '不合格', 2: '不合格', 3: '良好', 4: '优秀' };
const LEVEL_COLORS = { 1: '#e53935', 2: '#e53935', 3: '#4caf50', 4: '#1a73e8' };

Page({
  data: {
    sessionId: 0,
    session: null,
    competencies: [],
    riskAlerts: [],
    instructorNotes: '',
    loaded: false
  },

  onLoad(opts) {
    this.setData({ sessionId: parseInt(opts.sessionId) });
    this.loadReport();
  },

  async loadReport() {
    const res = await get(`/assessments/${this.data.sessionId}/summary`);
    if (res.code !== 0) return;

    const { session, competencies, riskAlerts } = res.data;
    const enriched = competencies.map(c => ({
      ...c,
      levelLabel: c.level ? LEVEL_LABELS[c.level] : '未评定',
      levelColor: c.level ? LEVEL_COLORS[c.level] : '#ccc',
      obs: c.obs.map(ob => ({
        ...ob,
        levelLabel: ob.level ? LEVEL_LABELS[ob.level] : '未评定',
        levelColor: ob.level ? LEVEL_COLORS[ob.level] : '#ccc',
        records: (ob.records || []).map(r => ({
          ...r,
          levelLabel: LEVEL_LABELS[r.level] || '未知',
          levelColor: LEVEL_COLORS[r.level] || '#999'
        }))
      }))
    }));

    this.setData({ session, competencies: enriched, riskAlerts, loaded: true });
  },

  onNotesInput(e) { this.setData({ instructorNotes: e.detail.value }); },

  deleteRecord(e) {
    const { recordId } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '删除这条评估记录？',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await del(`/assessments/${this.data.sessionId}/record/${recordId}`);
        if (result.code === 0) {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadReport();
        } else {
          wx.showToast({ title: result.msg || '删除失败', icon: 'none' });
        }
      }
    });
  },

  copyReport() {
    const { session, competencies, riskAlerts, instructorNotes } = this.data;
    if (!session) return;

    let text = 'CBTA胜任力评估报告\n';
    text += '='.repeat(30) + '\n';
    text += '日期：' + session.flight_date + '\n';
    text += '学员：' + session.student_name + '\n';
    text += '机型：' + session.aircraft_type + '\n';
    text += '任务：' + session.task_type + '\n';
    text += '教员：' + session.instructor_name + '\n\n';

    text += '胜任力评估汇总\n' + '-'.repeat(20) + '\n';
    competencies.forEach(c => {
      text += c.code + ' ' + c.name + '：' + c.levelLabel + '\n';
      c.obs.forEach(ob => {
        text += '  ' + ob.code + ' ' + ob.name + '：' + ob.levelLabel;
        if (ob.evidence) text += ' (' + ob.evidence + ')';
        text += '\n';
      });
      text += '\n';
    });

    if (riskAlerts.length > 0) {
      text += '风险提示\n' + '-'.repeat(20) + '\n';
      riskAlerts.forEach(a => { text += '! ' + a.compName + '：' + a.details + '\n'; });
    }

    if (instructorNotes.trim()) {
      text += '\n教员建议\n' + '-'.repeat(20) + '\n' + instructorNotes.trim() + '\n';
    }

    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
    });
  },

  goBack() { wx.switchTab({ url: '/pages/index/index' }); }
});
