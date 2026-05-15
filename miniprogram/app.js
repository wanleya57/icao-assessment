App({
  globalData: {
    baseUrl: 'https://fshd5u.cn/api',
    token: '',
    userInfo: null,
    nightMode: false,
    loggingIn: false
  },
  onLaunch() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    const nightMode = wx.getStorageSync('nightMode');
    if (token) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    }
    if (nightMode) this.globalData.nightMode = nightMode;
    this._startTokenCheck();
  },

  _startTokenCheck() {
    if (this._tokenTimer) clearInterval(this._tokenTimer);
    this._tokenTimer = setInterval(() => {
      if (!this.globalData.token || this.globalData.loggingIn || this._kickPending) return;
      wx.request({
        url: this.globalData.baseUrl + '/sessions/pilots/list',
        method: 'GET',
        header: { 'Authorization': 'Bearer ' + this.globalData.token },
        success: (res) => {
          if (res.data.code === 401) {
            this.globalData.token = '';
            wx.removeStorageSync('token');
            this._kickPending = true;
            wx.showModal({
              title: '账号已在别处登录',
              content: '当前有另外一台设备登录了此账号，您已被迫下线。',
              showCancel: false,
              confirmText: '重新登录',
              success: () => {
                this._kickPending = false;
                wx.reLaunch({ url: '/pages/login/login' });
              }
            });
          }
        },
        fail: () => {}
      });
    }, 10000);
  }
});
