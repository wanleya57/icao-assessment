const { get, del } = require('../../utils/request');
const { isLoggedIn } = require('../../utils/auth');

Page({
  data: {
    sessions: [],
    filteredSessions: [],
    filter: 'all'
  },

  onShow() {
    if (!isLoggedIn()) return wx.reLaunch({ url: '/pages/login/login' });
    this.loadSessions();
  },

  async loadSessions() {
    const res = await get('/sessions');
    if (res.code === 0) {
      this.setData({ sessions: res.data });
      this._applyFilter();
    }
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter });
    this._applyFilter();
  },

  _applyFilter() {
    const { sessions, filter } = this.data;
    const filteredSessions = filter === 'all' ? sessions : sessions.filter(s => s.status === filter);
    this.setData({ filteredSessions });
  },

  viewReport(e) {
    const s = e.currentTarget.dataset.session;
    if (s.status === 'in_progress') {
      wx.navigateTo({
        url: `/pages/record/record?sessionId=${s.id}&studentName=${encodeURIComponent(s.student_name)}`
      });
    } else {
      wx.navigateTo({
        url: `/pages/report/report?sessionId=${s.id}`
      });
    }
  },

  deleteSession(e) {
    const s = e.currentTarget.dataset.session;
    if (s.status !== 'in_progress') return wx.showToast({ title: '只能删除进行中的记录', icon: 'none' });

    wx.showModal({
      title: '删除确认',
      content: `确定删除「${s.student_name}」的训练记录？`,
      success: async (res) => {
        if (!res.confirm) return;
        const r = await del(`/sessions/${s.id}`);
        if (r.code === 0) {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadSessions();
        } else {
          wx.showToast({ title: r.msg, icon: 'none' });
        }
      }
    });
  }
});
