# wechat-auto-publisher

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**公众号文章自动发布工具** — 写好 **Markdown**，一行命令自动完成：选配图 + 排版 + 推送到微信公众号编辑器。

## 功能 (v2.0)

- 📝 **原生 Markdown 输入**：内置排版引擎，将 Markdown 自动转换为微信兼容的内联样式 HTML 并在编辑器内保留
- 🖼️ **自动封面配图**：按你的设定关键词，从 **Unsplash** 获取高质量横图
- 📌 **聪明地插入图片**：自动将获取到的封面插入文章起始处
- 📊 **自动 Changelog**：根据打字量自动测算在文末标注全文字数、生成时间、耗时和图源
- 📋 **完全自动化填充**：通过系统剪贴板将文章粘贴进微信编辑器（这是绕过微信富文本限制唯一的可靠方式），标题提取自 Markdown 里的第一个标题
- 🔐 **持久化登录状态**：头一次扫码，后续持久复用登录，实现真正的“一行命令”
- 🖥️ **流程安全**：文章写完不自动群发，保持浏览器开启让你做发布前的最后检查

## 安装

```bash
# 1. 克隆项目
git clone https://github.com/funnymh12/wechat-auto-publisher.git
cd wechat-auto-publisher

# 2. 安装依赖
npm install

# 3. 安装 Playwright 浏览器组件
npx playwright install chromium

# 4. 配置
cp config.example.json config.json
# 用编辑器打开 config.json，填入免费申请的 Unsplash API Key
```

## 使用

**第一步**：写文章，保存在项目根目录的 `article.md` （正常的 Markdown 语法）

> 标题约定：文章的第一个一级标题 `# 开头的标题` 将自动被用作推文标题。

**第二步**：运行发布：

```bash
node publish.js
```

就是这么简单。第一次运行需要扫码登录微信公众平台，之后会被缓存记忆。结束后在打开的 Chromium 浏览器里，检查排版效果并点击公众号底部的“保存”或“群发”。

## 配置说明 (config.json)

| 字段 | 说明 |
|------|------|
| `unsplashQuery` | Unsplash 搜图关键词，如 `"productivity workspace minimal"`，可换成 `ai technology code` 等等 |
| `unsplashAccessKey` | Unsplash 免费 API Key，从 [unsplash.com/developers](https://unsplash.com/developers) 注册获取 |
| `qiniu` | **(可选)** 历史遗留功能。如果有七牛云密钥，可将其作为额外图床图源备份，不配也不影响主流程发文 |

## 项目结构

```
wechat-auto-publisher/
├── src/md2html.js          # Markdown 到微信 HTML 排版引擎
├── publish.js              # 主控制脚本
├── article.md              # 【你要写的文章】（.gitignore 忽略）
├── article_template.html   # 不使用 MD 时的纯 HTML 模板备胎
├── config.example.json     # 配置模板
├── config.json             # 实际配置（不会被提交）
├── auth.json               # 微信登录状态缓存（不会被提交）
├── package.json
└── README.md
```

## 常见问题

**Q：Markdown 支持哪些语法？**  
A：所有的常见语法（标题 1-6，段落，粗体，斜体，引用 blockquote，无序/有序列表，代码块，超链接，图片，表格）。代码块甚至自带类似 VSCode 的深色护眼背景风格。

**Q：排版看着怪怪的，可以改吗？**  
A：当然可以，打开 `src/md2html.js`，顶部的 `STYLES` 字典可以按喜好把所有文字颜色，段间距修改成自己的风格！

**Q：登录似乎过期了？**  
A：当脚本检测未登录时，会自动停留在扫码页面等你，或直接删掉 `auth.json` 重新跑一遍。

## License

MIT
