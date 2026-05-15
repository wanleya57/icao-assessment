const express = require('express');
const axios = require('axios');
const router = express.Router();

const QWEN_BASE = process.env.QWEN_BASE_URL || 'http://localhost:8000';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen';

async function callQwen(messages, timeout = 600000) {
  const response = await axios.post(`${QWEN_BASE}/v1/chat/completions`, {
    model: QWEN_MODEL,
    messages,
    max_tokens: 4096,
    temperature: 0.05
  }, { timeout });
  const msg = response.data?.choices?.[0]?.message;
  return msg?.content || msg?.reasoning_content || '分析结果为空';
}

// 文本分析
router.post('/analyze', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    if (!prompt) return res.json({ code: 400, msg: '请输入分析内容' });

    const systemMsg = context || '你是一位CBTA胜任力评估专家，帮助教员分析飞行训练中的观察记录。请用简洁专业的中文回答。';

    const result = await callQwen([
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt }
    ]);
    res.json({ code: 0, data: { result } });
  } catch (err) {
    console.error('AI analyze error:', err.message);
    res.json({ code: 500, msg: '大模型服务不可用: ' + err.message });
  }
});

// 多模态分析（将图片描述为文字后分析）
router.post('/analyze-media', async (req, res) => {
  try {
    const { prompt, images } = req.body;
    if (!prompt && (!images || !images.length)) {
      return res.json({ code: 400, msg: '请输入分析内容或选择媒体文件' });
    }

    let fullPrompt = prompt || '';
    if (images && images.length) {
      fullPrompt += `\n（用户上传了 ${images.length} 张图片，请基于描述进行分析）`;
    }

    const result = await callQwen([
      { role: 'system', content: '你是一位CBTA胜任力评估专家，帮助教员分析飞行训练中的观察记录。' },
      { role: 'user', content: fullPrompt }
    ]);
    res.json({ code: 0, data: { result } });
  } catch (err) {
    console.error('AI media analyze error:', err.message);
    res.json({ code: 500, msg: '分析失败: ' + err.message });
  }
});

// 评语识别：自然语言 → CBTA OB 匹配
router.post('/analyze-feedback', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback || !feedback.trim()) return res.json({ code: 400, msg: '请输入评语' });

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

评语："沟通不清楚，遇到紧急情况就慌了"
→ 匹配：OB 2.3清晰准确传达（原话：沟通不清楚）、OB 6.9遇意外快速恢复（原话：遇到紧急情况就慌了）

评语："飞行技术不错，态度也好"
→ 匹配：OB 4.1精确平稳手操（原话：飞行技术不错，confidence:75）

每条JSON包含：competencyCode(PRO/COM/FPM-A/FPM-M/LTW/PSD/SAW/WLM)、obCode(OB X.X)、obName、originalText(教员原话片段)、professionalText(CBTA专业改写)、suggestedLevel、confidence(0-100的整数，表示匹配置信度)
suggestedLevel只能是1、3、4这三个值之一：1=不合格(低于标准)、3=良好(符合标准)、4=优秀(超出标准)。不要使用2。
confidence表示该OB与评语的匹配程度：90+=高度匹配，70-89=较匹配，50-69=可能匹配，<50=不确定
只输出JSON数组，无其他文字。`;

    const result = await callQwen([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: feedback.trim() }
    ], 600000);

    // Parse JSON from response
    let parsed = [];
    try {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('AI feedback parse error:', e.message, 'raw:', result.substring(0, 500));
    }

    // Add level labels and filter by confidence
    const levelLabels = { 1: '不合格', 2: '不合格', 3: '良好', 4: '优秀' };

    // Deduplicate by OB code (keep first occurrence, merge originalText)
    console.log('Before dedup:', parsed.length, 'items');
    const obMap = new Map();
    parsed.forEach(item => {
      const key = item.obCode;
      console.log('Processing:', key, 'exists:', obMap.has(key));
      if (obMap.has(key)) {
        // Merge originalText if different
        const existing = obMap.get(key);
        if (item.originalText && !existing.originalText.includes(item.originalText)) {
          existing.originalText += '；' + item.originalText;
        }
      } else {
        obMap.set(key, { ...item, confidence: item.confidence || 75 });
      }
    });

    parsed = Array.from(obMap.values()).map(item => ({
      ...item,
      suggestedLevelLabel: levelLabels[item.suggestedLevel] || '未知'
    }));
    console.log('After dedup:', parsed.length, 'items');

    res.json({ code: 0, data: { results: parsed, raw: result } });
  } catch (err) {
    console.error('AI feedback error:', err.message);
    res.json({ code: 500, msg: 'AI服务不可用: ' + err.message });
  }
});

// 语音转文字（提示用户手动输入替代）
router.post('/speech-to-text', async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) return res.json({ code: 400, msg: '请提供音频数据' });

    const result = await callQwen([
      { role: 'system', content: '你是语音识别助手，将用户描述的内容整理为文字。' },
      { role: 'user', content: `请将以下语音内容整理为文字：${audio}` }
    ]);
    res.json({ code: 0, data: { text: result } });
  } catch (err) {
    console.error('STT error:', err.message);
    res.json({ code: 500, msg: '语音识别失败: ' + err.message });
  }
});

module.exports = router;
