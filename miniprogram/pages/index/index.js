const { get, post, del } = require('../../utils/request');
const { isLoggedIn } = require('../../utils/auth');

Page({
  data: {
    pilots: [],
    keyword: '',
    selectedPilot: null,
    studentName: '',
    aircraftType: '',
    taskTypes: ['私照训练', '商照训练', '航线运输', '型别rating', '复训', '检查', '其他'],
    taskIndex: 0,
    flightDate: '',
    showAddPilot: false,
    newPilotName: '',
    recentSessions: []
  },

  onShow() {
    if (!isLoggedIn()) return wx.reLaunch({ url: '/pages/login/login' });
    this.loadPilots();
    this.loadRecent();
    if (!this.data.flightDate) {
      const d = new Date();
      this.setData({ flightDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
    }
  },

  async loadPilots() {
    const res = await get('/sessions/pilots/list');
    if (res.code === 0) this.setData({ pilots: res.data });
  },

  async loadRecent() {
    const res = await get('/sessions', { status: 'in_progress' });
    if (res.code === 0) this.setData({ recentSessions: res.data.slice(0, 3) });
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
  },

  get filteredPilots() {
    const kw = this.data.keyword.toLowerCase();
    return kw ? this.data.pilots.filter(p => p.name.includes(kw)) : this.data.pilots;
  },

  selectPilot(e) {
    const pilot = e.currentTarget.dataset.pilot;
    this.setData({ selectedPilot: pilot, studentName: pilot.name });
  },

  onStudentInput(e) { this.setData({ studentName: e.detail.value, selectedPilot: null }); },
  onAircraftInput(e) { this.setData({ aircraftType: e.detail.value }); },
  onTaskChange(e) { this.setData({ taskIndex: e.detail.value }); },
  onDateChange(e) { this.setData({ flightDate: e.detail.value }); },

  toggleAddPilot() { this.setData({ showAddPilot: !this.data.showAddPilot }); },
  onNewPilotName(e) { this.setData({ newPilotName: e.detail.value }); },

  async addPilot() {
    const name = this.data.newPilotName.trim();
    if (!name) return wx.showToast({ title: '请输入姓名', icon: 'none' });
    const res = await post('/sessions/pilots', { name });
    if (res.code === 0) {
      this.setData({ newPilotName: '', showAddPilot: false });
      this.loadPilots();
      wx.showToast({ title: '添加成功', icon: 'success' });
    } else {
      wx.showToast({ title: res.msg, icon: 'none' });
    }
  },

  deletePilot(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定删除学员「${name}」吗？`,
      success: async (res) => {
        if (res.confirm) {
          const r = await del(`/sessions/pilots/${id}`);
          if (r.code === 0) {
            this.loadPilots();
            wx.showToast({ title: '已删除', icon: 'success' });
          }
        }
      }
    });
  },

  async startSession() {
    const { studentName, aircraftType, taskTypes, taskIndex, flightDate, selectedPilot } = this.data;
    if (!studentName.trim()) return wx.showToast({ title: '请输入学员姓名', icon: 'none' });
    if (!aircraftType.trim()) return wx.showToast({ title: '请输入机型', icon: 'none' });
    if (!flightDate) return wx.showToast({ title: '请选择日期', icon: 'none' });

    const res = await post('/sessions', {
      studentName: studentName.trim(),
      aircraftType: aircraftType.trim(),
      taskType: taskTypes[taskIndex],
      flightDate,
      pilotId: selectedPilot ? selectedPilot.id : null
    });
    if (res.code === 0) {
      wx.navigateTo({
        url: `/pages/record/record?sessionId=${res.data.sessionId}&studentName=${encodeURIComponent(studentName.trim())}`
      });
    } else {
      wx.showToast({ title: res.msg, icon: 'none' });
    }
  },

  continueSession(e) {
    const s = e.currentTarget.dataset.session;
    wx.navigateTo({
      url: `/pages/record/record?sessionId=${s.id}&studentName=${encodeURIComponent(s.student_name)}`
    });
  }
});
