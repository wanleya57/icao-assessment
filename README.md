# ICAO CBTA Assessment System

基于 AI Agent 驱动开发的 ICAO CBTA（胜任力本位培训与评估）航空训练评估系统。

## 项目概述

本项目使用 Claude Code Agent 通过自然语言交互完成了全栈开发，涵盖微信小程序前端、Express.js 后端、SQLite 数据库、AI 大模型分析等模块。

## 技术栈

- **前端**：微信小程序（WXML + WXSS + JS）
- **后端**：Node.js + Express.js
- **数据库**：SQLite（better-sqlite3）
- **AI 分析**：Qwen 大模型 API
- **认证**：JWT + 短信验证码（国阳云 SMS）
- **部署**：Cloudflare Tunnel + PM2

## 核心功能

1. **教员评估记录**：实时记录学员飞行表现观察项，涵盖 CRM、技术操作、决策能力等多维度胜任力指标
2. **AI 智能分析**：Qwen 大模型接收评估数据，自动生成结构化胜任力评估报告
3. **多设备管理**：JWT Token + login_sessions 表实现多设备登录冲突检测与踢出
4. **短信验证码**：国阳云 SMS 服务，支持注册和密码重置
5. **用户自定义头像**：支持上传、压缩、存储头像图片
6. **常用短语库**：教员可管理证据快捷短语，提升评估录入效率
7. **历史记录与报告**：评估历史查询和详细报告展示

## 项目结构

```
icao-assessment/
├── miniprogram/          # 微信小程序前端
│   ├── pages/
│   │   ├── login/        # 登录/注册/忘记密码
│   │   ├── index/        # 首页（学员列表）
│   │   ├── ob-assess/    # 评估录入
│   │   ├── record/       # 评估记录
│   │   ├── report/       # 评估报告
│   │   ├── history/      # 历史记录
│   │   ├── phrases/      # 常用短语库
│   │   └── settings/     # 设置（头像、夜间模式）
│   └── utils/            # 工具函数（auth、request）
└── server/               # Express.js 后端
    ├── routes/           # API 路由（auth、sessions、assessments、reports、phrases、ai）
    ├── middleware/        # 中间件（auth、rateLimiter）
    ├── config/           # 数据库配置（SQLite）
    ├── services/         # 业务服务（SMS、AI）
    └── scripts/          # 数据库迁移脚本
```

## 部署说明

1. 安装依赖：`npm install`
2. 初始化数据库：`node scripts/init-sqlite.js`
3. 配置环境变量：JWT_SECRET、SMS_APPCODE 等
4. 启动服务：`node app.js`
5. 配置 Cloudflare Tunnel 暴露服务

详细部署指南请参考 `部署指南.md`。

## 开发过程

本项目全程使用 Claude Code Agent 通过自然语言交互驱动开发，累计完成 20+ 次功能迭代，包括：
- 全栈代码编写与调试
- 数据库设计与迁移
- 短信验证集成
- 多设备登录冲突处理
- AI 大模型评估分析集成
- 安全加固（JWT 密钥管理、密码策略强化）
- 用户头像上传功能
- UI/UX 优化
