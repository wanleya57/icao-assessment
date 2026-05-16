const { logout } = require('../../utils/auth');
const { post } = require('../../utils/request');

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

  changeAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.compressImage({
          src: tempFilePath,
          quality: 60,
          success: (compressed) => {
            wx.getFileSystemManager().readFile({
              filePath: compressed.tempFilePath,
              encoding: 'base64',
              success: (data) => {
                const ext = tempFilePath.split('.').pop().toLowerCase();
                const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                this.uploadAvatar(`data:${mime};base64,${data.data}`);
              }
            });
          }
        });
      }
    });
  },

  async uploadAvatar(base64) {
    wx.showLoading({ title: '上传中...' });
    try {
      const res = await post('/auth/avatar', { avatar: base64 });
      if (res.code === 0) {
        const app = getApp();
        const userInfo = { ...app.globalData.userInfo, avatar: res.data.avatar };
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);
        this.setData({ userInfo });
        wx.showToast({ title: '头像已更新', icon: 'success' });
      } else {
        wx.showToast({ title: res.msg || '上传失败', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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
