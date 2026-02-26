/**
 * publish.js — 公众号文章自动发布工具 v2
 *
 * 新功能：
 *   - 接受 Markdown 文件作为输入（article.md）
 *   - 自动将 MD 转为微信兼容的内联样式 HTML
 *   - Unsplash 封面图插入文章头部
 *   - 文末自动生成 Changelog（时间、字数、耗时）
 *   - 七牛云上传不再必须，封面用本地文件即可
 *
 * 使用：
 *   1. 把文章写到 article.md
 *   2. 在 config.json 中填写配置
 *   3. node publish.js
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { chromium } = require('playwright');
const { md2html, countWords } = require('./src/md2html');

// ===== 路径 =====
const CONFIG_PATH = path.join(__dirname, 'config.json');
const ARTICLE_MD = path.join(__dirname, 'article.md');
const PREVIEW_HTML = path.join(__dirname, 'article_preview.html');
const AUTH_STATE = path.join(__dirname, 'auth.json');
const COVER_TEMP = path.join(__dirname, 'cover_temp.jpg');

// ===== 读取配置 =====
if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 未找到 config.json，请先：cp config.example.json config.json');
    process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// ===== 读取文章 =====
if (!fs.existsSync(ARTICLE_MD)) {
    console.error('❌ 未找到 article.md，请先写好文章');
    process.exit(1);
}

async function main() {
    const startTime = Date.now();

    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║   🤖 公众号文章自动发布工具 v2 (Markdown 版)      ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');

    // ── Step 1: 读取 Markdown ──
    console.log('📖 读取文章...');
    const markdown = fs.readFileSync(ARTICLE_MD, 'utf-8');

    // 提取标题：取 Markdown 中第一个 # 标题
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const articleTitle = config.articleTitle || (titleMatch ? titleMatch[1].trim() : '未命名文章');
    const wordCount = countWords(markdown);
    console.log(`   标题: "${articleTitle}"`);
    console.log(`   字数: 约 ${wordCount} 字\n`);

    // ── Step 2: Unsplash 获取封面图 ──
    let coverLocalPath = null;
    let coverPhotographer = null;
    const query = config.unsplashQuery || 'productivity workspace minimal';

    if (config.unsplashAccessKey) {
        console.log(`🖼️  Unsplash 配图（"${query}"）...`);
        try {
            const r = await fetch(
                `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`,
                { headers: { Authorization: `Client-ID ${config.unsplashAccessKey}`, 'Accept-Version': 'v1' } }
            );
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            coverPhotographer = data.user?.name || 'Unsplash';
            console.log(`   📸 摄影师: ${coverPhotographer}`);

            const imgRes = await fetch(data.urls.regular);
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(COVER_TEMP, buffer);
            coverLocalPath = COVER_TEMP;
            console.log('   ✅ 封面图已下载\n');
        } catch (err) {
            console.warn(`   ⚠️  封面图获取失败: ${err.message}，将跳过\n`);
        }
    } else {
        console.log('⏭️  未配置 Unsplash API Key，跳过自动配图\n');
    }

    // ── Step 3: 转换 MD → HTML ──
    console.log('🔄 Markdown → HTML 转换...');
    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const htmlContent = md2html(markdown, {
        coverImagePath: coverLocalPath ? `file:///${coverLocalPath.replace(/\\/g, '/')}` : null,
        stats: {
            completedAt: timeStr,
            wordCount: wordCount,
            duration: `${elapsedMin} 分钟`,
            coverSource: coverPhotographer ? `Unsplash / ${coverPhotographer}` : null,
        },
    });

    // 写入预览文件
    fs.writeFileSync(PREVIEW_HTML, htmlContent, 'utf-8');
    console.log(`   ✅ 已生成 article_preview.html (${htmlContent.length} 字符)\n`);

    // ── Step 4: 登录微信 ──
    const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });

    try {
        let context, page;

        if (fs.existsSync(AUTH_STATE)) {
            console.log('🔐 复用登录状态...');
            context = await browser.newContext({ storageState: AUTH_STATE });
            page = await context.newPage();
            await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            if (!page.url().includes('token=')) {
                await context.close();
                console.log('   登录过期，请扫码...');
                context = await browser.newContext();
                page = await context.newPage();
                await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });
                await page.waitForURL(/token=/, { timeout: 120000 });
                fs.writeFileSync(AUTH_STATE, JSON.stringify(await context.storageState()));
            }
            console.log('   ✅ 登录有效\n');
        } else {
            console.log('📱 请扫码登录...\n');
            context = await browser.newContext();
            page = await context.newPage();
            await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });
            await page.waitForURL(/token=/, { timeout: 120000 });
            fs.writeFileSync(AUTH_STATE, JSON.stringify(await context.storageState()));
            console.log('   ✅ 登录成功\n');
        }

        // 提取 Token
        const token = await page.evaluate(() => {
            const m = window.location.href.match(/token=(\d+)/);
            if (m) return m[1];
            for (const s of document.querySelectorAll('script')) {
                const mt = (s.textContent || '').match(/token\s*[:=]\s*["']?(\d{5,})["']?/);
                if (mt) return mt[1];
            }
            return null;
        });
        if (!token) { console.error('❌ 无法获取 token'); return; }
        console.log(`🔑 Token: ${token.substring(0, 6)}***\n`);

        // ── Step 5: 复制文章到剪贴板 ──
        console.log('📋 复制文章到剪贴板...');
        const previewPage = await context.newPage();
        await previewPage.goto('file:///' + PREVIEW_HTML.replace(/\\/g, '/'), { waitUntil: 'load' });
        await previewPage.waitForTimeout(1000);
        await previewPage.evaluate(() => {
            const article = document.getElementById('article');
            const range = document.createRange();
            range.selectNodeContents(article);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
        });
        await previewPage.close();
        console.log('   ✅ 已复制\n');

        // ── Step 6: 打开编辑器 ──
        console.log('📝 打开图文编辑器...');
        await page.goto(
            `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&token=${token}&lang=zh_CN`,
            { waitUntil: 'domcontentloaded' }
        );
        await page.waitForTimeout(4000);

        // 填标题
        for (const sel of ['#title', 'textarea[placeholder*="标题"]']) {
            const el = await page.$(sel);
            if (el) { await el.click(); await el.fill(articleTitle); console.log(`✅ 标题: "${articleTitle}"\n`); break; }
        }
        await page.waitForTimeout(1000);

        // 粘贴正文
        console.log('📝 粘贴正文...');
        for (const sel of ['#edui1_iframeholder [contenteditable="true"]', '[contenteditable="true"]', '.edui-body-container']) {
            const el = await page.$(sel);
            if (el) {
                await el.click();
                await page.keyboard.press('Control+a');
                await page.waitForTimeout(200);
                await page.keyboard.press('Delete');
                await page.waitForTimeout(200);
                await page.keyboard.press('Control+v');
                await page.waitForTimeout(2000);
                console.log('   ✅ 正文已粘贴\n');
                break;
            }
        }

        // ── Step 7: 上传封面图 ──
        if (coverLocalPath && fs.existsSync(coverLocalPath)) {
            console.log('🖼️  上传封面图...');
            try {
                const fileInput = await page.$('input[type="file"][accept*="image"]');
                if (fileInput) {
                    await fileInput.setInputFiles(coverLocalPath);
                    await page.waitForTimeout(3000);
                    for (const sel of ['.btn_confirm', 'button:has-text("完成")', 'button:has-text("确定")']) {
                        const btn = await page.$(sel);
                        if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
                    }
                    console.log('   ✅ 封面已上传\n');
                } else {
                    console.log('   ⚠️  未找到封面上传入口，请手动上传\n');
                }
            } catch (err) {
                console.warn(`   ⚠️  封面上传出错: ${err.message}\n`);
            }
        }

        // 完成
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log('═══════════════════════════════════════════════════');
        console.log('  ✅ 全部完成！');
        console.log(`  ⏱️  总耗时: ${totalTime} 秒`);
        console.log(`  📝 字数: ${wordCount} 字`);
        console.log('');
        console.log('  请在浏览器中：');
        console.log('    1. 检查标题、正文、封面图');
        console.log('    2. 填写摘要（选填）');
        console.log('    3. 点击「保存草稿」或「群发」');
        console.log('');
        console.log('  按 Ctrl+C 关闭脚本');
        console.log('═══════════════════════════════════════════════════');

        await page.waitForTimeout(600000);
    } finally {
        if (coverLocalPath && fs.existsSync(coverLocalPath)) fs.unlinkSync(coverLocalPath);
        await browser.close();
    }
}

main().catch(console.error);
