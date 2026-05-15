const app = getApp();

const AI_BASE = 'https://api.<YOUR_DOMAIN>';

let _kickShown = false;

function request(url, method = 'GET', data = {}, timeout = 60000) {
  return new Promise((resolve, reject) => {
    if (!app.globalData.token && !url.includes('/auth/')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return reject(new Error('未登录'));
    }
    wx.request({
      url: app.globalData.baseUrl + url,
      method,
      data,
      timeout,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + app.globalData.token
      },
      success(res) {
        if (res.data.code === 401) {
          app.globalData.token = '';
          wx.removeStorageSync('token');
          if (!_kickShown) {
            _kickShown = true;
            wx.showModal({
              title: '账号已在别处登录',
              content: '当前有另外一台设备登录了此账号，您已被迫下线。',
              showCancel: false,
              confirmText: '重新登录',
              success() {
                _kickShown = false;
                wx.reLaunch({ url: '/pages/login/login' });
              }
            });
          } else {
            wx.reLaunch({ url: '/pages/login/login' });
          }
          return reject(new Error('未登录'));
        }
        resolve(res.data);
      },
      fail(err) {
        wx.showToast({ title: '网络错误', icon: 'none' });
        reject(err);
      }
    });
  });
}

function aiRequest(messages, timeout = 600000) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: AI_BASE + '/v1/chat/completions',
      method: 'POST',
      data: { model: 'qwen', messages, max_tokens: 4096, temperature: 0.05 },
      timeout,
      header: { 'Content-Type': 'application/json' },
      success(res) {
        const msg = res.data?.choices?.[0]?.message;
        resolve(msg?.content || msg?.reasoning_content || '分析结果为空');
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

module.exports = {
  get: (url, data) => request(url, 'GET', data),
  post: (url, data, timeout) => request(url, 'POST', data, timeout),
  put: (url, data) => request(url, 'PUT', data),
  del: (url, data) => request(url, 'DELETE', data),
  request,
  aiRequest
};
