const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const contentRoot = path.join(process.cwd(), 'content');
const outputFile = path.join(process.cwd(), 'migration.sql');

function escapeSql(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/'/g, "''");
}

function normalizeDate(value) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value;
    return '';
}

async function run() {
    let sql = `-- Cloudflare D1 数据迁移脚本\n`;
    sql += `-- 生成时间: ${new Date().toLocaleString()}\n\n`;
    sql += `-- 【说明】请分块复制以下 SQL 到 Cloudflare D1 Console 运行，以免超出系统限制。\n\n`;

    // 1. Posts
    sql += `-- ==========================================\n`;
    sql += `-- 第一部分: 博文数据 (Posts)\n`;
    sql += `-- ==========================================\n`;
    const postsDir = path.join(contentRoot, 'posts');
    if (fs.existsSync(postsDir)) {
        const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const slug = file.replace(/\.md$/, '');
            const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
            const { data, content } = matter(raw);
            const title = data.title || slug;
            const date = normalizeDate(data.date);
            const description = data.description || content.replace(/\s+/g, ' ').trim().slice(0, 120);

            sql += `INSERT OR REPLACE INTO posts (slug, title, date, description, content) VALUES ('${escapeSql(slug)}', '${escapeSql(title)}', '${escapeSql(date)}', '${escapeSql(description)}', '${escapeSql(content)}');\n`;
        }
    }
    sql += `\n\n`;

    // 2. Daily
    sql += `-- ==========================================\n`;
    sql += `-- 第二部分: 日记数据 (Daily)\n`;
    sql += `-- ==========================================\n`;
    const dailyDir = path.join(contentRoot, 'daily');
    if (fs.existsSync(dailyDir)) {
        const files = fs.readdirSync(dailyDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filename = file;
            const raw = fs.readFileSync(path.join(dailyDir, file), 'utf8');
            const { data, content } = matter(raw);
            const date = normalizeDate(data.date) || file.replace(/\.md$/, '');
            const imageUrl = data.imageUrl || data.image || '';

            sql += `INSERT OR REPLACE INTO daily (filename, date, content, image_url) VALUES ('${escapeSql(filename)}', '${escapeSql(date)}', '${escapeSql(content)}', '${escapeSql(imageUrl)}');\n`;
        }
    }
    sql += `\n\n`;

    // 3. Moments
    sql += `-- ==========================================\n`;
    sql += `-- 第三部分: 瞬间数据 (Moments)\n`;
    sql += `-- ==========================================\n`;
    const momentsDir = path.join(contentRoot, 'moments');
    if (fs.existsSync(momentsDir)) {
        const files = fs.readdirSync(momentsDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
            const filename = file;
            const raw = fs.readFileSync(path.join(momentsDir, file), 'utf8');
            const { data, content } = matter(raw);
            const title = data.title || filename;
            const date = normalizeDate(data.date) || file.replace(/\.md$/, '');
            const imageUrl = data.imageUrl || data.image || '';

            sql += `INSERT OR REPLACE INTO moments (filename, title, date, image_url, content) VALUES ('${escapeSql(filename)}', '${escapeSql(title)}', '${escapeSql(date)}', '${escapeSql(imageUrl)}', '${escapeSql(content)}');\n`;
        }
    }

    fs.writeFileSync(outputFile, sql);
    console.log(`\n✅ 迁移 SQL 已重新生成: ${outputFile}`);
    console.log(`\n新的 migration.sql 已经按分类分好了块。`);
    console.log(`建议先复制第一部分（Posts）运行，成功后再复制后面部分。`);
}

run().catch(err => {
    console.error('❌ 脚本运行出错:', err);
    process.exit(1);
});
