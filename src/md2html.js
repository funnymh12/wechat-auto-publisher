/**
 * md2html.js — Markdown → 微信公众号风格 HTML 转换器
 *
 * 将 .md 文件转换为带内联样式的 HTML，可直接粘贴到微信编辑器。
 * 微信编辑器会剥离 CSS class，所以必须在每个元素上写内联 style。
 */
const { marked } = require('marked');

// ============================
// 微信公众号内联样式定义
// ============================
const STYLES = {
    h1: 'font-size: 24px; font-weight: bold; color: #1a1a2e; text-align: center; margin: 30px 0 20px; line-height: 1.6;',
    h2: 'font-size: 20px; font-weight: bold; color: #1a1a2e; border-left: 4px solid #4f46e5; padding-left: 14px; margin: 36px 0 16px; line-height: 1.6;',
    h3: 'font-size: 18px; font-weight: bold; color: #333; margin: 24px 0 12px; line-height: 1.6;',
    p: 'margin: 14px 0; font-size: 16px; line-height: 2; color: #2c2c2c;',
    blockquote: 'border-left: 4px solid #ddd; padding: 12px 20px; margin: 16px 0; background: #fafafa; color: #666;',
    blockquoteP: 'margin: 6px 0; font-size: 15px; line-height: 1.8; color: #666;',
    code: 'background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; color: #e83e8c; font-family: "Courier New", Consolas, monospace;',
    codeBlock: 'background: #1e1e1e; color: #d4d4d4; border-radius: 8px; padding: 16px; font-family: "Courier New", Consolas, monospace; font-size: 13px; margin: 16px 0; white-space: pre-wrap; line-height: 1.8; overflow-x: auto;',
    ul: 'margin: 14px 0; padding-left: 0; list-style: none;',
    ol: 'margin: 14px 0; padding-left: 0; list-style: none;',
    li: 'margin: 8px 0; font-size: 15px; line-height: 2; padding-left: 16px;',
    strong: 'color: #1a1a2e; font-weight: bold;',
    em: 'font-style: italic; color: #555;',
    a: 'color: #4f46e5; text-decoration: none; border-bottom: 1px solid #4f46e5;',
    hr: 'border: none; border-top: 1px solid #eee; margin: 30px 0;',
    img: 'max-width: 100%; border-radius: 8px; margin: 16px 0; display: block;',
    table: 'width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;',
    th: 'background: #f0f0f0; padding: 10px 12px; text-align: left; border: 1px solid #ddd; font-weight: bold;',
    td: 'padding: 10px 12px; border: 1px solid #ddd;',
};

// ============================
// 自定义 Renderer
// ============================
const renderer = {
    heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const tag = `h${depth}`;
        const style = STYLES[tag] || STYLES.h3;
        return `<${tag} style="${style}">${text}</${tag}>\n`;
    },

    paragraph({ tokens }) {
        const text = this.parser.parseInline(tokens);
        // 检测是否是图片段落
        if (text.startsWith('<img ')) {
            return text + '\n';
        }
        return `<p style="${STYLES.p}">${text}</p>\n`;
    },

    blockquote({ tokens }) {
        const body = this.parser.parse(tokens)
            .replace(/<p style="[^"]*">/g, `<p style="${STYLES.blockquoteP}">`);
        return `<section style="${STYLES.blockquote}">${body}</section>\n`;
    },

    code({ text, lang }) {
        const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<section style="${STYLES.codeBlock}">${escaped}</section>\n`;
    },

    codespan({ text }) {
        return `<code style="${STYLES.code}">${text}</code>`;
    },

    list({ items, ordered }) {
        const tag = ordered ? 'ol' : 'ul';
        const style = ordered ? STYLES.ol : STYLES.ul;
        let body = '';
        items.forEach((item, i) => {
            const prefix = ordered ? `${i + 1}. ` : '• ';
            const content = this.parser.parseInline(item.tokens);
            body += `<li style="${STYLES.li}">${prefix}${content}</li>\n`;
        });
        return `<${tag} style="${style}">${body}</${tag}>\n`;
    },

    listitem({ tokens }) {
        return this.parser.parseInline(tokens);
    },

    strong({ tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<strong style="${STYLES.strong}">${text}</strong>`;
    },

    em({ tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<em style="${STYLES.em}">${text}</em>`;
    },

    link({ href, text }) {
        return `<a style="${STYLES.a}" href="${href}">${text}</a>`;
    },

    image({ href, title, text }) {
        const alt = text || title || '';
        return `<img style="${STYLES.img}" src="${href}" alt="${alt}" />\n`;
    },

    hr() {
        return `<hr style="${STYLES.hr}" />\n`;
    },

    table({ header, rows }) {
        let html = `<table style="${STYLES.table}"><thead><tr>`;
        header.forEach(cell => {
            const text = this.parser.parseInline(cell.tokens);
            html += `<th style="${STYLES.th}">${text}</th>`;
        });
        html += '</tr></thead><tbody>';
        rows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                const text = this.parser.parseInline(cell.tokens);
                html += `<td style="${STYLES.td}">${text}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>\n';
        return html;
    },
};

// ============================
// 主转换函数
// ============================

/**
 * 将 Markdown 文本转换为微信兼容的内联样式 HTML
 * @param {string} markdown - Markdown 原文
 * @param {object} options - 可选参数
 * @param {string} options.coverImagePath - 本地封面图路径（file:// URL）
 * @param {object} options.stats - 文末 changelog 统计数据
 * @returns {string} 完整的 HTML 页面
 */
function md2html(markdown, options = {}) {
    marked.use({ renderer });

    // 解析 Markdown
    let bodyHtml = marked.parse(markdown);

    // 生成封面图 HTML（插入正文之前）
    let coverHtml = '';
    if (options.coverImagePath) {
        const fileUrl = options.coverImagePath.replace(/\\/g, '/');
        coverHtml = `<img style="${STYLES.img} margin-bottom: 24px;" src="${fileUrl}" alt="封面图" />\n`;
    }

    // 生成文末 changelog
    let changelogHtml = '';
    if (options.stats) {
        const s = options.stats;
        const items = [];
        if (s.completedAt) items.push(`📅 完成时间：${s.completedAt}`);
        if (s.wordCount) items.push(`📝 全文字数：约 ${s.wordCount} 字`);
        if (s.duration) items.push(`⏱️ 撰写耗时：${s.duration}`);
        if (s.coverSource) items.push(`🖼️ 封面来源：${s.coverSource}`);
        if (s.extra) items.push(...s.extra);

        if (items.length > 0) {
            changelogHtml = `
<hr style="${STYLES.hr}" />
<section style="background: #f8f9fa; border-radius: 10px; padding: 16px 20px; margin: 20px 0; border: 1px solid #eee;">
  <p style="font-size: 14px; font-weight: bold; color: #999; margin: 0 0 10px;">Changelog</p>
  ${items.map(item => `<p style="font-size: 13px; color: #888; margin: 4px 0; line-height: 1.8;">${item}</p>`).join('\n')}
</section>`;
        }
    }

    // 组装完整 HTML 页面
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>文章预览</title>
<style>
  body {
    max-width: 680px;
    margin: 40px auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    font-size: 16px;
    line-height: 2;
    color: #2c2c2c;
    padding: 0 20px;
  }
</style>
</head>
<body>
<div id="article">
${coverHtml}${bodyHtml}${changelogHtml}
</div>
</body>
</html>`;
}

/**
 * 计算中文文本的大致字数（去掉 HTML 标签后）
 */
function countWords(markdown) {
    const plain = markdown
        .replace(/```[\s\S]*?```/g, '')    // 去掉代码块
        .replace(/`[^`]+`/g, '')            // 去掉行内代码
        .replace(/!\[.*?\]\(.*?\)/g, '')    // 去掉图片
        .replace(/\[([^\]]+)\]\(.*?\)/g, '$1') // 保留链接文字
        .replace(/[#*>\-_|=~]/g, '')        // 去掉 MD 符号
        .replace(/\s+/g, '');               // 去掉空白
    return plain.length;
}

module.exports = { md2html, countWords };
