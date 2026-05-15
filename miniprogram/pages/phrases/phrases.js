const { get, post, del } = require('../../utils/request');

const CATEGORIES = ['情景意识', '沟通', '程序与规章', '飞行径路', '决策', '团队合作', '领导力与管理', '工作负荷管理'];

Page({
  data: {
    phrases: [],
    categories: CATEGORIES,
    activeCategory: '',
    showAdd: false,
    newCategory: '',
    newText: '',
    categoryIndex: 0
  },

  onLoad(opts) {
    if (opts.compCode) {
      const name = { SA: '情景意识', COM: '沟通', PE: '程序与规章', FPM: '飞行径路', DM: '决策', TW: '团队合作', LM: '领导力与管理', WM: '工作负荷管理' }[opts.compCode];
      if (name) this.setData({ activeCategory: name });
    }
    this.loadPhrases();
  },

  async loadPhrases() {
    const params = {};
    if (this.data.activeCategory) params.category = this.data.activeCategory;
    const res = await get('/phrases', params);
    if (res.code === 0) this.setData({ phrases: res.data });
  },

  filterCategory(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.cat });
    this.loadPhrases();
  },

  toggleAdd() { this.setData({ showAdd: !this.data.showAdd }); },
  onCategoryChange(e) { this.setData({ categoryIndex: e.detail.value, newCategory: this.data.categories[e.detail.value] }); },
  onNewText(e) { this.setData({ newText: e.detail.value }); },

  async addPhrase() {
    const { categories, categoryIndex, newText } = this.data;
    if (!newText.trim()) return wx.showToast({ title: '请输入短语内容', icon: 'none' });
    const res = await post('/phrases', {
      category: categories[categoryIndex],
      text: newText.trim()
    });
    if (res.code === 0) {
      this.setData({ newText: '', showAdd: false });
      this.loadPhrases();
      wx.showToast({ title: '已添加', icon: 'success' });
    }
  },

  async deletePhrase(e) {
    const phrase = e.currentTarget.dataset.phrase;
    if (phrase.is_default) return wx.showToast({ title: '默认短语不可删除', icon: 'none' });
    wx.showModal({
      title: '删除短语',
      content: '确认删除这条短语？',
      success: async (res) => {
        if (!res.confirm) return;
        await del(`/phrases/${phrase.id}`);
        this.loadPhrases();
      }
    });
  },

  copyPhrase(e) {
    const text = e.currentTarget.dataset.text;
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    });
  }
});
