const app = getApp();

function isLoggedIn() {
  return !!app.globalData.token;
}

function setLogin(token, userInfo) {
  app.globalData.token = token;
  app.globalData.userInfo = userInfo;
  wx.setStorageSync('token', token);
  wx.setStorageSync('userInfo', userInfo);
}

function logout() {
  app.globalData.token = '';
  app.globalData.userInfo = null;
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');
}

module.exports = { isLoggedIn, setLogin, logout };
