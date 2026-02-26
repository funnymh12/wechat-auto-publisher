# wechat-auto-publisher 开发复盘日志

> 副产品比主产品有时候更有价值

**项目地址**：github.com/funnymh12/wechat-auto-publisher（待推送）  
**孵化自**：[wechat-article-exporter](https://github.com/funnymh12/wechat-article-exporter) 的发布阶段  
**独立时间**：2026-02-26

---

## 一、起源：一个意外的副产品

这个工具的诞生，完全不在最初的计划里。

当时的目标是：做一个公众号文章批量导出工具，导出完成后，顺手写一篇推荐文章发到公众号上。

结果，「顺手发一篇」这件事，本身变成了一个值得做的自动化工具。

---

## 二、第一次尝试：直接操作 DOM（失败）

第一版的思路很直接：用 Playwright 打开微信编辑器，直接把 HTML 写入编辑区域的 DOM。

代码大概长这样：

```javascript
const editArea = await page.$('[contenteditable="true"]');
await editArea.evaluate((el, html) => {
    el.innerHTML = html;
});
```

运行结果：标题填进去了，正文区域依然空白。

**根本原因**：微信编辑器是 UEditor，正文区域是一个 `<iframe>`，有自己的沙箱 document。直接对 contenteditable 的 `innerHTML` 赋值，不会触发 UEditor 的内部事件监听，内容无法被识别和保存。

---

## 三、解决方案：剪贴板粘贴

思路转变：**不要「写入」，而是「粘贴进去」**。

这是微信编辑器支持的自然用户行为——复制外部富文本，粘贴进来，编辑器自动处理格式转换。

具体实现分两步：

**Step 1**：先在本地打开一个带样式的 HTML 文件，选中 `#article` 内容，用 `document.execCommand('copy')` 复制到剪贴板：

```javascript
const previewPage = await context.newPage();
await previewPage.goto('file:///' + htmlPath.replace(/\\/g, '/'));
await previewPage.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('article'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
});
await previewPage.close();
```

**Step 2**：在微信编辑器里聚焦并 Ctrl+V：

```javascript
const editor = await page.$('#edui1_iframeholder [contenteditable="true"]');
await editor.click();
await page.keyboard.press('Control+v');
```

效果：标题、加粗、颜色、背景色、代码块风格全部保留，和在真实浏览器里手动粘贴效果一致。

---

## 四、封面图自动化

封面图有三种可能的方案：

| 方案 | 结果 |
|------|------|
| AI 生成图片 | 服务频繁返回 503（容量限制），不可靠 |
| 手动上传 | 可用，但破坏了「全自动」的体验 |
| Unsplash API → 本地下载 → file input 上传 | ✅ 可靠 |

Unsplash 的免费 API 每小时 50 次请求，对发文章完全够用。按关键词搜图，限定 landscape 横图，适合公众号封面比例。

下载图片后，通过 Playwright 的 `setInputFiles` 方法找到编辑器里隐藏的文件上传 input，直接设置文件路径：

```javascript
const fileInput = await page.$('input[type="file"][accept*="image"]');
await fileInput.setInputFiles(localImagePath);
```

这条选择器能稳定命中，因为整个编辑器页面里只有封面上传区域才会有图片 file input。

同时把图片上传一份到七牛云，获取永久 URL 备用（万一 file input 方式失败，至少有个 URL 可以手动贴进去）。

---

## 五、HTML 文章模板的样式约定

写公众号文章有个坑：**微信编辑器粘贴后会剥离 CSS class**，只保留 `style=""` 内联样式。

因此，`article_preview.html` 的规范约定是：
- 用 `<style>` 块写本地预览样式（方便调试）
- 每个元素必须**同时**写 `style=""` 内联样式
- 内联样式和 `<style>` 块的效果相同，但内联的才会随粘贴保留

为此做了一个 `article_template.html`，预置了常用的组件：Hero 横幅、功能介绍盒子、深色数据块、代码展示区、CTA 按钮区，每个都带完整的内联样式，可以直接复制修改使用。

---

## 六、从「工具」到「可复用流程」

完成后把整套逻辑封装成了 `wechat-publisher` Skill，供 AI 助手后续调用：
- 研究项目 → 写文章 → 生成 HTML → 配封面 → 发布
- 全程只需要用户最后检查内容并手动点击发布

关键的 Skill 文档记录了：所有经验积累的选择器、等待时间、路径约定、调试经验。

---

## 七、经验总结

1. **「用户视角」比「技术视角」更可靠**：剪贴板粘贴是用户的自然行为，比直接操作 DOM 稳定得多。

2. **外部 API 要降级处理**：AI 图片生成会 503，所以必须有 Unsplash 作为备选。任何依赖外部服务的步骤都需要 fallback。

3. **共享 auth.json 跨项目复用**：微信登录状态文件放在一个固定位置，多个发布脚本共享，避免重复扫码。

4. **副产品有时比主产品更有价值**：`wechat-article-exporter` 是为了导出历史文章，但发布流程的自动化可能是更频繁用到的工具。

---

## 八、文件结构

```
wechat-auto-publisher/
├── publish.js              ← 主脚本（Unsplash + Qiniu + 微信编辑器）
├── article_template.html   ← 文章排版模板（含内联样式示例）
├── article_preview.html    ← 当次发布的文章（.gitignore）
├── config.example.json     ← 配置模板
├── config.json             ← 实际配置（.gitignore）
├── auth.json               ← 微信登录态（.gitignore）
├── package.json
├── CHANGELOG.md
├── README.md
└── LICENSE
```
