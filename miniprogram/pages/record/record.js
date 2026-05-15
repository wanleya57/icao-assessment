const { get, post, put, del, aiRequest } = require('../../utils/request');

const COMPETENCIES = [
  { code: 'PRO', name: '程序与规章', icon: '📋', obCount: 7 },
  { code: 'COM', name: '沟通', icon: '💬', obCount: 10 },
  { code: 'FPM-A', name: '航径管理(自动)', icon: '✈', obCount: 6 },
  { code: 'FPM-M', name: '航径管理(手动)', icon: '🎛', obCount: 7 },
  { code: 'LTW', name: '领导力与团队', icon: '🤝', obCount: 11 },
  { code: 'PSD', name: '决策与问题解决', icon: '⚡', obCount: 9 },
  { code: 'SAW', name: '情景意识', icon: '👁', obCount: 7 },
  { code: 'WLM', name: '工作量管理', icon: '⏱', obCount: 9 }
];

const LEVEL_LABELS = { 1: '不合格', 2: '不合格', 3: '良好', 4: '优秀' };
const LEVEL_COLORS = { 1: '#e53935', 2: '#e53935', 3: '#4caf50', 4: '#1a73e8' };

Page({
  data: {
    sessionId: 0,
    studentName: '',
    competencies: COMPETENCIES,
    compLevels: {},
    compAssessed: {},
    obLevelCounts: {},
    totalAssessed: 0,
    totalOBs: 66,
    showEndConfirm: false,
    aiFeedback: '',
    aiAnalyzing: false,
    aiResults: [],
    showAiResults: false,
    aiResultsKey: ''
  },

  onLoad(opts) {
    const sessionId = parseInt(opts.sessionId);
    this.setData({
      sessionId,
      studentName: decodeURIComponent(opts.studentName || ''),
      aiResultsKey: 'aiResults_' + sessionId
    });
  },

  onShow() {
    this.loadAssessments();
    this.loadSavedAiResults();
    this.importPendingResults();
  },

  importPendingResults() {
    try {
      let pending = wx.getStorageSync('pending_ai_import');
      if (!pending || pending.length === 0) {
        pending = wx.getStorageSync('pending_ai_backup');
      }
      if (pending && pending.length > 0) {
        wx.removeStorageSync('pending_ai_import');
        wx.removeStorageSync('pending_ai_backup');
        const imported = pending.map(r => ({...r, selected: false}));
        this.setData({ aiResults: imported, showAiResults: true });
        this.saveAiResults(imported);
        this.syncPendingToServer(imported);
        setTimeout(() => {
          wx.showToast({ title: `已导入${pending.length}条待采纳结果`, icon: 'none', duration: 3000 });
        }, 500);
      }
    } catch (e) {}
  },

  loadSavedAiResults() {
    const key = this.data.aiResultsKey;
    if (!key) return;
    try {
      const saved = wx.getStorageSync(key);
      if (saved && saved.length > 0) {
        this.setData({ aiResults: saved, showAiResults: true });
      }
    } catch (e) {}
  },

  async loadAssessments() {
    const res = await get(`/assessments/${this.data.sessionId}`);
    if (res.code !== 0) return;

    const { records, competencyLevels, obLevelCounts, assessedOBCount } = res.data;
    const compLevels = {};
    const compAssessed = {};
    let totalAssessed = 0;
    COMPETENCIES.forEach(c => {
      compLevels[c.code] = competencyLevels[c.code] || null;
      compAssessed[c.code] = assessedOBCount[c.code] || 0;
      totalAssessed += compAssessed[c.code];
    });

    this.setData({
      compLevels,
      compAssessed,
      obLevelCounts: obLevelCounts || {},
      totalAssessed
    });
  },

  onTapComp(e) {
    const code = e.currentTarget.dataset.code;
    const comp = COMPETENCIES.find(c => c.code === code);
    wx.navigateTo({
      url: `/pages/ob-assess/ob-assess?sessionId=${this.data.sessionId}&compCode=${code}&compName=${encodeURIComponent(comp.name)}`
    });
  },

  onFeedbackInput(e) { this.setData({ aiFeedback: e.detail.value }); },

  async analyzeFeedback() {
    const { aiFeedback, aiAnalyzing, sessionId } = this.data;
    if (aiAnalyzing || !aiFeedback.trim()) return wx.showToast({ title: '请输入评语', icon: 'none' });

    this.setData({ aiAnalyzing: true, aiResults: [], showAiResults: false });
    try {
      const systemPrompt = `你是CBTA胜任力评估专家。分析教员对飞行员的口语化评语，匹配可观察行为(OB)，返回JSON数组。

胜任力及OB列表：
- PRO程序与规章：OB 1.1确定程序规章位置 OB 1.2及时应用操作说明 OB 1.3遵循SOP OB 1.4正确操作系统设备 OB 1.5监控系统状态 OB 1.6遵守规章 OB 1.7应用程序知识
- COM沟通：OB 2.1确认接收人就绪 OB 2.2选择沟通方式 OB 2.3清晰准确传达 OB 2.4确认理解 OB 2.5主动倾听 OB 2.6有效提问 OB 2.7升级沟通解决偏差 OB 2.8非语言沟通 OB 2.9标准无线电用语 OB 2.10数据链英文
- FPM-A航径管理自动：OB 3.1使用自动化系统 OB 3.2监控航径偏差 OB 3.3管理航径最佳性能 OB 3.4自动化保持航径管任务 OB 3.5选择自动化等级模式 OB 3.6监控自动模式转换
- FPM-M航径管理手动：OB 4.1精确平稳手操 OB 4.2监控航径偏差 OB 4.3用姿态速度推力手操 OB 4.4管理航径最佳 OB 4.5手操保持航径管任务 OB 4.6用飞行管理系统 OB 4.7监控引导系统
- LTW领导力团队：OB 5.1鼓励参与沟通 OB 5.2主动提供指导 OB 5.3让人参与计划 OB 5.4考虑他人意见 OB 5.5建设性反馈 OB 5.6解决冲突分歧 OB 5.7决定性领导 OB 5.8接受责任 OB 5.9执行指示 OB 5.10干预策略解偏差 OB 5.11应对文化语言挑战
- PSD决策问题解决：OB 6.1识别管理威胁差错 OB 6.2寻求准确信息 OB 6.3验证差错原因 OB 6.4坚持解决优先安全 OB 6.5考虑合适选项 OB 6.6及时决策 OB 6.7监控调整决策 OB 6.8无指导时变通 OB 6.9遇意外快速恢复
- SAW情景意识：OB 7.1监控飞机系统状态 OB 7.2监控能量和航径 OB 7.3监控影响运行环境 OB 7.4验证信息准确 OB 7.5了解人员能力 OB 7.6制定应急预案 OB 7.7响应SA降低
- WLM工作量管理：OB 8.1自我控制 OB 8.2计划优先排序 OB 8.3管理时间 OB 8.4提供帮助 OB 8.5委派任务 OB 8.6寻求接受帮助 OB 8.7监督审查交叉检查 OB 8.8验证任务完成 OB 8.9管理中断干扰

【匹配规则】
1. 只匹配评语中明确提到的行为，不要推断
2. 一条评语可以匹配多个OB，但每个OB必须有原话直接支持
3. 如果评语没有提到某个方面，不要匹配该方面的OB

【示例】
评语："学员起飞前没检查仪表，程序不熟练"
→ 匹配：OB 1.3遵循SOP（原话：学员起飞前没检查仪表）、OB 1.2及时应用操作说明（原话：程序不熟练）

每条JSON包含：competencyCode、obCode、obName、originalText(教员原话片段)、professionalText(CBTA专业改写)、suggestedLevel、confidence(0-100)
suggestedLevel只能是1、3、4：1=不合格、3=良好、4=优秀
只输出JSON数组，无其他文字。`;

      const result = await aiRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: aiFeedback.trim() }
      ]);

      let parsed = [];
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch (e) { console.error('parse error:', e); }

      const levelLabels = { 1: '不合格', 3: '良好', 4: '优秀' };
      const obMap = new Map();
      parsed.forEach(item => {
        if (obMap.has(item.obCode)) {
          const existing = obMap.get(item.obCode);
          if (item.originalText && !existing.originalText.includes(item.originalText)) {
            existing.originalText += '；' + item.originalText;
          }
        } else {
          obMap.set(item.obCode, { ...item, confidence: item.confidence || 75 });
        }
      });

      const results = Array.from(obMap.values()).map(item => ({
        ...item,
        suggestedLevelLabel: levelLabels[item.suggestedLevel] || '未知'
      }));

      if (results.length > 0) {
        const aiResults = results.map(r => ({...r, selected: false}));
        this.setData({ aiResults, showAiResults: true });
        this.saveAiResults(aiResults);
        this.syncPendingToServer(aiResults);
        wx.showToast({ title: `识别到${results.length}条结果`, icon: 'none' });
      } else {
        wx.showToast({ title: '未识别到相关胜任力', icon: 'none' });
      }
    } catch (e) {
      console.error('AI error:', e);
      wx.showToast({ title: 'AI服务不可用', icon: 'none' });
    }
    this.setData({ aiAnalyzing: false });
  },

  toggleAiResult(e) {
    const index = e.currentTarget.dataset.index;
    const aiResults = [...this.data.aiResults];
    aiResults[index] = { ...aiResults[index], selected: !aiResults[index].selected };
    this.setData({ aiResults });
    this.saveAiResults(aiResults);
  },

  saveAiResults(results) {
    try {
      wx.setStorageSync(this.data.aiResultsKey, results);
    } catch (e) {}
  },

  async syncPendingToServer(results) {
    try {
      await post('/assessments/pending-ai', { results }, 10000);
      wx.removeStorageSync('pending_ai_backup');
    } catch (e) {
      try { wx.setStorageSync('pending_ai_backup', results); } catch (_) {}
    }
  },

  async applyAllAiResults() {
    const { aiResults, sessionId } = this.data;
    const selected = aiResults.filter(r => r.selected);
    if (selected.length === 0) return wx.showToast({ title: '请先勾选要采纳的结果', icon: 'none' });

    const assessments = selected.map(r => ({
      competencyCode: r.competencyCode,
      obCode: r.obCode,
      level: r.suggestedLevel,
      originalText: r.originalText || '',
      professionalText: r.professionalText || ''
    }));

    const res = await post(`/assessments/${sessionId}`, { assessments });
    if (res.code === 0) {
      wx.showToast({ title: `已采纳${selected.length}条`, icon: 'success' });
      this.loadAssessments();
      wx.removeStorageSync(this.data.aiResultsKey);
      wx.removeStorageSync('pending_ai_backup');
      del('/assessments/pending-ai').catch(() => {});
      this.setData({ aiResults: [], showAiResults: false });
    }
  },

  clearAiResults() {
    wx.removeStorageSync(this.data.aiResultsKey);
    wx.removeStorageSync('pending_ai_backup');
    del('/assessments/pending-ai').catch(() => {});
    this.setData({ aiResults: [], showAiResults: false });
  },

  showEnd() { this.setData({ showEndConfirm: true }); },
  hideEnd() { this.setData({ showEndConfirm: false }); },

  async endSession() {
    await put(`/sessions/${this.data.sessionId}/complete`);
    this.setData({ showEndConfirm: false });
    wx.redirectTo({ url: `/pages/report/report?sessionId=${this.data.sessionId}` });
  }
});
