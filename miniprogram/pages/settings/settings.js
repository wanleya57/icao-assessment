const { logout } = require('../../utils/auth');

Page({
  data: {
    nightMode: false,
    version: '2.0.0',
    userInfo: null
  },

  onShow() {
    const app = getApp();
    this.setData({
      nightMode: app.globalData.nightMode || false,
      userInfo: app.globalData.userInfo || null
    });
  },

  toggleNightMode() {
    const newVal = !this.data.nightMode;
    this.setData({ nightMode: newVal });
    getApp().globalData.nightMode = newVal;
    wx.setStorageSync('nightMode', newVal);
    wx.showToast({ title: newVal ? '已开启夜间模式' : '已关闭夜间模式', icon: 'none' });
  },

  viewPhrases() {
    wx.navigateTo({ url: '/pages/phrases/phrases' });
  },

  clearData() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地缓存数据，不影响服务器数据',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({ title: '缓存已清除', icon: 'success' });
        }
      }
    });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出当前账号？',
      success: (res) => {
        if (res.confirm) {
          logout();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});
