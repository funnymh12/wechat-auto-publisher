# Changelog

## [1.0.0] - 2026-02-26

### 🎉 首次发布

起源于 `wechat-article-exporter` 项目的副产品，独立成为一个完整的自动化工具。

### ✨ 功能

- **Unsplash 自动配图**：按关键词搜索，自动获取 landscape 高清封面图
- **七牛云图床**：封面图自动上传，生成永久稳定 URL
- **微信编辑器自动化（Playwright）**：
  - 扫码登录一次，`auth.json` 持久化，后续无需重复扫码
  - 自动打开图文编辑器新建页面
  - 自动填写文章标题
  - 通过剪贴板粘贴富文本正文（含样式，WeChat 原生处理）
  - 通过 `input[type="file"]` 上传封面图
- **浏览器保持打开**：内容填好后由用户检查并手动点发布，不自动群发

### 🔑 关键技术决策

1. **剪贴板粘贴而非 DOM 注入**：微信编辑器（UEditor）的 iframe 沙箱使直接 innerHTML 注入无效；通过 `document.execCommand('copy')` + Ctrl+V 粘贴，编辑器原生处理富文本格式
2. **本地 HTML 渲染**：先在本地用 `file://` 协议渲染带样式的 HTML，选中复制后粘贴进微信，样式通过内联 style 属性得以保留
3. **封面图走文件上传而非 URL 注入**：微信编辑器封面只接受上传，不支持直接填写 URL

### 📦 依赖

| 包 | 用途 |
|----|------|
| playwright | 浏览器自动化 |
| node-fetch | HTTP 请求（Unsplash API + Qiniu 上传） |
| crypto-js | 七牛云 Token 签名（HmacSHA1） |
