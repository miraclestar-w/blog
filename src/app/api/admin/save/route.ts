import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

type AdminType = 'post' | 'daily' | 'moment';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function POST(request: Request) {
    // 更加稳健的环境识别
    const isNode = typeof process.versions?.node !== 'undefined';
    let db: any = null;

    if (!isNode) {
        try {
            const { env } = getRequestContext();
            db = (env as any).DB;
        } catch (e) {
            // Silence noisy logs in local development
            if (process.env.NODE_ENV !== 'development') {
                console.error('Failed to get D1 binding:', e);
            }
        }
    }

    try {
        const authHeader = request.headers.get('Authorization');
        const adminPassword = process.env.ADMIN_PASSWORD || '';

        if (authHeader !== adminPassword) {
            const res = NextResponse.json({ error: 'Unauthorized: Invalid security key' }, { status: 401 });
            res.headers.set('Cache-Control', 'no-store');
            return res;
        }

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const { type, data } = await request.json() as { type: AdminType; data: any };

        if (!type || !data) {
            const res = NextResponse.json({ error: 'Missing type or data' }, { status: 400 });
            res.headers.set('Cache-Control', 'no-store');
            return res;
        }

        // --- 本地文件操作 (仅在 Node 环境下) ---
        if (isNode) {
            const fs = eval('require')('fs');
            const path = eval('require')('path');
            const matter = eval('require')('gray-matter');
            const contentDir = path.join(process.cwd(), 'content');
            let filePath = '';
            let fileContent = '';

            if (type === 'post') {
                const { title, date, description, category, content, slug, filename } = data;
                if (filename) {
                    filePath = path.join(contentDir, 'posts', filename);
                } else {
                    const baseFileName = slug || date.replace(/-/g, '');
                    let fileName = `${baseFileName}.md`;
                    filePath = path.join(contentDir, 'posts', fileName);
                    let counter = 1;
                    while (fs.existsSync(filePath)) {
                        fileName = `${baseFileName}_${counter}.md`;
                        filePath = path.join(contentDir, 'posts', fileName);
                        counter++;
                    }
                }
                fileContent = matter.stringify(content, { title, date, description, category });
            } else if (type === 'daily') {
                let { date, content, imageUrl } = data;

                // 规范化日期格式为 YYYY-MM-DD
                if (date) {
                    // 处理 M.D 或 M-D 格式
                    if (/^\d{1,2}[.-]\d{1,2}$/.test(date)) {
                        const [m, d] = date.split(/[.-]/).map(Number);
                        const now = new Date();
                        const year = now.getFullYear();
                        date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    } else if (/^\d{6}$/.test(date)) {
                        const year = 2000 + parseInt(date.slice(0, 2));
                        const month = date.slice(2, 4);
                        const day = date.slice(4, 6);
                        date = `${year}-${month}-${day}`;
                    }
                }

                const fileName = `${date.replace(/-/g, '').slice(2)}.md`;
                filePath = path.join(contentDir, 'daily', fileName);
                let newContent = `\n\n${content}\n`;
                if (imageUrl && imageUrl.trim() !== '') {
                    newContent += `\n![Daily Image](${imageUrl})\n`;
                }
                if (fs.existsSync(filePath)) {
                    const existing = fs.readFileSync(filePath, 'utf8');
                    fileContent = newContent + `\n---\n${existing}`;
                } else {
                    fileContent = newContent;
                }
            } else if (type === 'moment') {
                const { title, date, imageUrl, content } = data;
                const timestamp = new Date().getTime();
                const fileName = `moment_${timestamp}.md`;
                filePath = path.join(contentDir, 'moments', fileName);
                fileContent = matter.stringify(content || '', {
                    title: title || `Moment_${timestamp}`,
                    date,
                    image: imageUrl,
                });
            }

            if (filePath) {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, fileContent, 'utf8');
            }
        }

        // --- 数据库操作 (可在 Edge 环境下运行) ---
        if (db) {
            if (type === 'post') {
                const { title, date, description, category, content, slug } = data;
                await db.prepare(`
                    INSERT INTO posts (slug, title, date, description, category, content) 
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(slug) DO UPDATE SET
                    title=excluded.title, date=excluded.date, description=excluded.description, category=excluded.category, content=excluded.content
                `).bind(slug, title, date, description, category || '', content).run();
            } else if (type === 'daily') {
                let { date, content, imageUrl } = data;

                // 规范化日期格式为 YYYY-MM-DD
                if (date) {
                    if (/^\d{1,2}[.-]\d{1,2}$/.test(date)) {
                        const [m, d] = date.split(/[.-]/).map(Number);
                        const now = new Date();
                        const year = now.getFullYear();
                        date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    } else if (/^\d{6}$/.test(date)) {
                        const year = 2000 + parseInt(date.slice(0, 2));
                        const month = date.slice(2, 4);
                        const day = date.slice(4, 6);
                        date = `${year}-${month}-${day}`;
                    }
                }

                const filename = `${date.replace(/-/g, '').slice(2)}.md`;
                // 由于 daily 是追加模式，先尝试获取
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                const existing: any = await db.prepare('SELECT content FROM daily WHERE filename = ?').bind(filename).first();
                let finalContent = content;
                if (existing) {
                    finalContent = content + '\n---\n' + existing.content;
                }
                await db.prepare(`
                    INSERT INTO daily (filename, date, content, image_url)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(filename) DO UPDATE SET
                    content=excluded.content, image_url=excluded.image_url
                `).bind(filename, date, finalContent, imageUrl || '').run();
            } else if (type === 'moment') {
                const { title, date, imageUrl, content } = data;
                const filename = `moment_${new Date().getTime()}.md`;
                await db.prepare(`
                    INSERT INTO moments (filename, title, date, image_url, content)
                    VALUES (?, ?, ?, ?, ?)
                `).bind(filename, title || '', date, imageUrl || '', content || '').run();
            }
        }

        const res = NextResponse.json({ success: true });
        res.headers.set('Cache-Control', 'no-store');
        return res;
    } catch (error: unknown) {
        console.error('Save error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        const res = NextResponse.json({ error: message }, { status: 500 });
        res.headers.set('Cache-Control', 'no-store');
        return res;
    }
}
