/**
 * publish.js — 公众号文章自动发布工具
 *
 * 使用前：
 *   1. cp config.example.json config.json 并填写配置
 *   2. npm install
 *   3. 把你的文章内容写到 article_preview.html 的 #article 区域
 *   4. 设置本文件顶部的 ARTICLE_TITLE
 *   5. node publish.js
 *
 * 流程：
 *   Unsplash 获取封面图 → 上传七牛云 → 打开微信编辑器
 *   → 填标题 → 粘贴正文 → 上传封面 → 保持浏览器开着等你检查
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const CryptoJS = require('crypto-js');
const { chromium } = require('playwright');

// ===== 每次发布前修改这里 =====
const ARTICLE_TITLE = '在这里填写文章标题';
// ==============================

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PREVIEW_HTML = path.join(__dirname, 'article_preview.html');
const AUTH_STATE = path.join(__dirname, 'auth.json');
const COVER_TEMP = path.join(__dirname, 'cover_temp.jpg');

// 读取配置
if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 未找到 config.json，请先复制 config.example.json 并填写配置');
    process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// =========================================
// 七牛云工具
// =========================================
function urlSafeBase64(str) {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function qiniuToken() {
    const q = config.qiniu;
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const policy = JSON.stringify({ scope: q.bucket, deadline });
    const encoded = urlSafeBase64(policy);
    const sign = CryptoJS.HmacSHA1(encoded, q.secretKey)
        .toString(CryptoJS.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_');
    return `${q.accessKey}:${sign}:${encoded}`;
}

function qiniuUploadUrl() {
    const map = {
        z0: 'https://upload.qiniup.com', z1: 'https://upload-z1.qiniup.com',
        z2: 'https://upload-z2.qiniup.com', na0: 'https://upload-na0.qiniup.com',
        as0: 'https://upload-as0.qiniup.com',
    };
    return map[(config.qiniu.region || 'z0').toLowerCase()] || map.z0;
}

async function uploadToQiniu(buffer, ext) {
    const token = qiniuToken();
    const key = `wx_cover_${Date.now()}.${ext}`;
    const boundary = '----QiniuBound' + Date.now();
    const textPart = `--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${token}\r\n`
        + `--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${key}\r\n`;
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${key}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const body = Buffer.concat([Buffer.from(textPart), Buffer.from(fileHeader), buffer, Buffer.from(`\r\n--${boundary}--\r\n`)]);

    const res = await fetch(qiniuUploadUrl(), {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
    });
    if (!res.ok) throw new Error(`Qiniu upload failed: ${res.status} - ${await res.text()}`);
    const json = await res.json();
    let domain = config.qiniu.domain.replace(/\/+$/, '');
    if (!domain.startsWith('http')) domain = 'https://' + domain;
    return `${domain}/${json.key}`;
}

// =========================================
// 主流程
// =========================================
async function main() {
    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║   🤖 公众号文章自动发布工具 wechat-auto-publisher  ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');

    // ── Step 1: Unsplash 获取封面图 ──
    let coverLocalPath = null;
    let coverQiniuUrl = null;

    const query = config.unsplashQuery || 'productivity workspace minimal';
    console.log(`🖼️  Unsplash 配图（关键词："${query}"）...`);

    try {
        const r = await fetch(
            `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&content_filter=high`,
            { headers: { Authorization: `Client-ID ${config.unsplashAccessKey}`, 'Accept-Version': 'v1' } }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();

        console.log(`   摄影师：${data.user?.name || 'Unsplash'}`);

        const imgRes = await fetch(data.urls.regular);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(COVER_TEMP, buffer);
        coverLocalPath = COVER_TEMP;
        console.log('   ✅ 图片已下载\n');

        console.log('   ⬆️  上传七牛云...');
        coverQiniuUrl = await uploadToQiniu(buffer, 'jpg');
        console.log(`   ✅ ${coverQiniuUrl}\n`);
    } catch (err) {
        console.warn(`   ⚠️  封面图失败：${err.message}（将跳过配图）\n`);
    }

    // ── Step 2: 登录 ──
    const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });

    try {
        let context, page;

        if (fs.existsSync(AUTH_STATE)) {
            console.log('🔐 复用已保存的登录状态...');
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
            console.log('📱 请扫码登录公众平台...\n');
            context = await browser.newContext();
            page = await context.newPage();
            await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });
            await page.waitForURL(/token=/, { timeout: 120000 });
            fs.writeFileSync(AUTH_STATE, JSON.stringify(await context.storageState()));
            console.log('✅ 登录成功，状态已保存\n');
        }

        // ── Step 3: 提取 Token ──
        const token = await page.evaluate(() => {
            const m = window.location.href.match(/token=(\d+)/);
            if (m) return m[1];
            for (const s of document.querySelectorAll('script')) {
                const mt = (s.textContent || '').match(/token\s*[:=]\s*["']?(\d{5,})["']?/);
                if (mt) return mt[1];
            }
            for (const a of document.querySelectorAll('a[href*="token="]')) {
                const mt = a.href.match(/token=(\d+)/);
                if (mt) return mt[1];
            }
            return null;
        });
        if (!token) { console.error('❌ 无法获取 token'); return; }
        console.log(`🔑 Token: ${token.substring(0, 6)}***\n`);

        // ── Step 4: 复制文章到剪贴板 ──
        if (!fs.existsSync(PREVIEW_HTML)) {
            console.error(`❌ 未找到 article_preview.html，请先创建文章内容`);
            return;
        }

        console.log('📋 复制文章到剪贴板...');
        const previewPage = await context.newPage();
        await previewPage.goto('file:///' + PREVIEW_HTML.replace(/\\/g, '/'), { waitUntil: 'load' });
        await previewPage.waitForTimeout(1000);
        await previewPage.evaluate(() => {
            const article = document.getElementById('article');
            if (!article) { console.error('❌ article_preview.html 中未找到 #article 元素'); return; }
            const range = document.createRange();
            range.selectNodeContents(article);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            document.execCommand('copy');
        });
        await previewPage.close();
        console.log('   ✅ 已复制\n');

        // ── Step 5: 打开微信编辑器 ──
        console.log('📝 打开图文编辑器...');
        await page.goto(
            `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&token=${token}&lang=zh_CN`,
            { waitUntil: 'domcontentloaded' }
        );
        await page.waitForTimeout(4000);

        // ── Step 6: 填标题 ──
        for (const sel of ['#title', 'textarea[placeholder*="标题"]', '.title_input textarea']) {
            const el = await page.$(sel);
            if (el) { await el.click(); await el.fill(ARTICLE_TITLE); console.log('✅ 标题已填入\n'); break; }
        }
        await page.waitForTimeout(1000);

        // ── Step 7: 粘贴正文 ──
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

        // ── Step 8: 上传封面图 ──
        if (coverLocalPath && fs.existsSync(coverLocalPath)) {
            console.log('🖼️  上传封面图...');
            try {
                const fileInput = await page.$('input[type="file"][accept*="image"]');
                if (fileInput) {
                    await fileInput.setInputFiles(coverLocalPath);
                    await page.waitForTimeout(3000);
                    // 点击裁剪确认（如有）
                    for (const sel of ['.btn_confirm', 'button:has-text("完成")', 'button:has-text("确定")']) {
                        const btn = await page.$(sel);
                        if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
                    }
                    console.log('   ✅ 封面已上传\n');
                } else {
                    console.log('   ⚠️  未找到封面上传入口，请手动上传封面\n');
                }
            } catch (err) {
                console.warn(`   ⚠️  封面上传出错：${err.message}\n`);
            }
        }

        // ── 完成 ──
        console.log('═══════════════════════════════════════════════════');
        console.log('  ✅ 全部自动步骤完成！');
        console.log('');
        console.log('  请在浏览器中：');
        console.log('    1. 检查标题、正文、封面图');
        console.log('    2. 填写摘要（选填）');
        console.log('    3. 点击「保存草稿」或「群发」');
        if (coverQiniuUrl) console.log(`\n  封面图永久链接: ${coverQiniuUrl}`);
        console.log('\n  按 Ctrl+C 关闭脚本');
        console.log('═══════════════════════════════════════════════════');

        await page.waitForTimeout(600000);
    } finally {
        if (coverLocalPath && fs.existsSync(coverLocalPath)) fs.unlinkSync(coverLocalPath);
        await browser.close();
    }
}

main().catch(console.error);
