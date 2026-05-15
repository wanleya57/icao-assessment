const { post } = require('../../utils/request');
const { setLogin } = require('../../utils/auth');
const app = getApp();

const CACHE_KEY = 'cbta_last_account';

Page({
  data: {
    phone: '',
    password: '',
    showPassword: false,
    showReset: false,
    resetPhone: '',
    resetName: '',
    resetPassword: '',
    showRegister: false,
    regPhone: '',
    regName: '',
    regPassword: '',
    loginLoading: false,
    resetLoading: false,
    regLoading: false,
    regCode: '',
    regCodeLoading: false,
    regCodeSent: false,
    regCodeCountdown: 0,
    f: '',
    rememberAccount: true
  },

  _loginLock: false,
  _resetLock: false,

  onLoad() {
    this._restore();
  },

  onUnload() {
    this._loginLock = false;
    this._resetLock = false;
  },

  _restore() {
    try {
      const c = wx.getStorageSync(CACHE_KEY);
      if (c && c.phone) this.setData({ phone: c.phone });
    } catch (_) {}
  },

  _cache(phone) {
    try { wx.setStorageSync(CACHE_KEY, { phone }); } catch (_) {}
  },

  onFocusPhone() { this.setData({ f: 'p' }); },
  onBlurPhone() { if (this.data.f === 'p') this.setData({ f: '' }); },
  onFocusPassword() { this.setData({ f: 'w' }); },
  onBlurPassword() { if (this.data.f === 'w') this.setData({ f: '' }); },
  onFocusResetPhone() { this.setData({ f: 'rp' }); },
  onBlurResetPhone() { if (this.data.f === 'rp') this.setData({ f: '' }); },
  onFocusResetName() { this.setData({ f: 'rn' }); },
  onBlurResetName() { if (this.data.f === 'rn') this.setData({ f: '' }); },
  onFocusResetPassword() { this.setData({ f: 'rw' }); },
  onBlurResetPassword() { if (this.data.f === 'rw') this.setData({ f: '' }); },

  toggleShowPassword() { this.setData({ showPassword: !this.data.showPassword }); },
  toggleRemember() { this.setData({ rememberAccount: !this.data.rememberAccount }); },
  noop() {},

  onPhoneInput(e) { this.setData({ phone: e.detail.value }); },
  onPasswordInput(e) { this.setData({ password: e.detail.value }); },
  onResetPhoneInput(e) { this.setData({ resetPhone: e.detail.value }); },
  onResetNameInput(e) { this.setData({ resetName: e.detail.value }); },
  onResetPasswordInput(e) { this.setData({ resetPassword: e.detail.value }); },

  showResetModal() { this.setData({ showReset: true }); },
  closeResetModal() { this.setData({ showReset: false }); },
  showRegister() { this.setData({ showRegister: true }); },
  closeRegister() {
    if (this._countdownTimer) clearInterval(this._countdownTimer);
    this.setData({ showRegister: false, regPhone: '', regName: '', regPassword: '', regCode: '', regCodeSent: false, regCodeCountdown: 0 });
  },
  onRegPhoneInput(e) { this.setData({ regPhone: e.detail.value }); },
  onRegNameInput(e) { this.setData({ regName: e.detail.value }); },
  onRegPasswordInput(e) { this.setData({ regPassword: e.detail.value }); },
  onRegCodeInput(e) { this.setData({ regCode: e.detail.value }); },

  async onSendRegCode() {
    if (this.data.regCodeLoading || this.data.regCodeCountdown > 0) return;
    const phone = this.data.regPhone.trim();
    if (!phone) return wx.showToast({ title: '请输入手机号', icon: 'none' });
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请输入正确的手机号', icon: 'none' });

    this.setData({ regCodeLoading: true });
    try {
      const res = await post('/auth/send-code', { phone });
      if (res.code === 0) {
        wx.showToast({ title: '验证码已发送', icon: 'success' });
        this.setData({ regCodeSent: true, regCodeCountdown: 60 });
        this._countdownTimer = setInterval(() => {
          const c = this.data.regCodeCountdown - 1;
          if (c <= 0) {
            clearInterval(this._countdownTimer);
            this.setData({ regCodeCountdown: 0 });
          } else {
            this.setData({ regCodeCountdown: c });
          }
        }, 1000);
      } else {
        wx.showToast({ title: res.msg, icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '发送失败', icon: 'none' });
    } finally {
      this.setData({ regCodeLoading: false });
    }
  },

  async onLogin() {
    if (this._loginLock) return;
    const { phone, password, loginLoading } = this.data;
    if (loginLoading) return;
    if (!phone.trim()) return wx.showToast({ title: '请输入学号', icon: 'none' });
    if (!password) return wx.showToast({ title: '请输入密码', icon: 'none' });

    this._loginLock = true;
    this.setData({ loginLoading: true });
    app.globalData.loggingIn = true;

    try {
      const sysInfo = wx.getSystemInfoSync();
      const deviceType = ['windows', 'mac', 'devtools'].includes(sysInfo.platform) ? 'pc' : 'mobile';
      const res = await post('/auth/login', { phone: phone.trim(), password, deviceType });
      if (res.code === 0) {
        this._cache(phone.trim());
        setLogin(res.data.token, res.data.instructor);
        if (res.data.pendingAiResults && res.data.pendingAiResults.length > 0) {
          wx.setStorageSync('pending_ai_import', res.data.pendingAiResults);
        }
        wx.switchTab({ url: '/pages/index/index' });
      } else {
        wx.showToast({ title: res.msg, icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '登录失败', icon: 'none' });
    } finally {
      app.globalData.loggingIn = false;
      this.setData({ loginLoading: false });
      setTimeout(() => { this._loginLock = false; }, 1500);
    }
  },

  async onRegister() {
    if (this._regLock) return;
    const { regPhone, regName, regPassword, regCode, regLoading } = this.data;
    if (regLoading) return;
    if (!regPhone.trim()) return wx.showToast({ title: '请输入手机号', icon: 'none' });
    if (!regName.trim()) return wx.showToast({ title: '请输入姓名', icon: 'none' });
    if (!regPassword || regPassword.length < 6) return wx.showToast({ title: '密码至少6位', icon: 'none' });
    if (!regCode || regCode.length !== 6) return wx.showToast({ title: '请输入6位验证码', icon: 'none' });

    this._regLock = true;
    this.setData({ regLoading: true });
    app.globalData.loggingIn = true;

    try {
      const sysInfo = wx.getSystemInfoSync();
      const deviceType = ['windows', 'mac', 'devtools'].includes(sysInfo.platform) ? 'pc' : 'mobile';
      const res = await post('/auth/register', {
        phone: regPhone.trim(),
        name: regName.trim(),
        password: regPassword,
        code: regCode,
        deviceType
      });
      if (res.code === 0) {
        wx.showToast({ title: '注册成功', icon: 'success' });
        this.setData({
          showRegister: false,
          phone: regPhone.trim(),
          password: regPassword,
          regPhone: '', regName: '', regPassword: '', regCode: '',
          regCodeSent: false, regCodeCountdown: 0
        });
      } else {
        wx.showToast({ title: res.msg, icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '注册失败', icon: 'none' });
    } finally {
      app.globalData.loggingIn = false;
      this.setData({ regLoading: false });
      setTimeout(() => { this._regLock = false; }, 1500);
    }
  },

  async onResetPassword() {
    if (this._resetLock) return;
    const { resetPhone, resetName, resetPassword, resetLoading } = this.data;
    if (resetLoading) return;
    if (!resetPhone.trim()) return wx.showToast({ title: '请输入手机号', icon: 'none' });
    if (!resetName.trim()) return wx.showToast({ title: '请输入姓名', icon: 'none' });
    if (!resetPassword) return wx.showToast({ title: '请输入新密码', icon: 'none' });

    this._resetLock = true;
    this.setData({ resetLoading: true });

    try {
      const res = await post('/auth/reset-password', {
        phone: resetPhone.trim(),
        name: resetName.trim(),
        newPassword: resetPassword
      });
      if (res.code === 0) {
        wx.showToast({ title: '密码已重置', icon: 'success' });
        this.setData({
          showReset: false,
          phone: resetPhone.trim(),
          password: resetPassword,
          resetPhone: '', resetName: '', resetPassword: ''
        });
      } else {
        wx.showToast({ title: res.msg, icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '重置失败', icon: 'none' });
    } finally {
      this.setData({ resetLoading: false });
      setTimeout(() => { this._resetLock = false; }, 1500);
    }
  }
});
