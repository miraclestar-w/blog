import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

type AdminType = 'post' | 'daily' | 'moment' | 'comment';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function DELETE(request: Request) {
    const isNode = typeof process.versions?.node !== 'undefined';
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    let db: any = null;

    if (!isNode) {
        try {
            const { env } = getRequestContext();
            db = (env as any).DB;
        } catch (e) {
            console.error('Failed to get D1 binding:', e);
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

        const { type, filename } = await request.json() as { type: AdminType; filename: string };

        if (!type || !filename) {
            const res = NextResponse.json({ error: 'Missing type or filename' }, { status: 400 });
            res.headers.set('Cache-Control', 'no-store');
            return res;
        }

        // --- 本地文件操作 ---
        if (isNode) {
            const fs = eval('require')('fs');
            const path = eval('require')('path');
            const contentDir = path.join(process.cwd(), 'content');
            let filePath = '';

            if (type === 'post') filePath = path.join(contentDir, 'posts', filename);
            else if (type === 'daily') filePath = path.join(contentDir, 'daily', filename);
            else if (type === 'moment') filePath = path.join(contentDir, 'moments', filename);

            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // --- 数据库操作 ---
        if (db) {
            if (type === 'post') {
                const slug = filename.replace('.md', '');
                await db.prepare('DELETE FROM posts WHERE slug = ?').bind(slug).run();
            } else if (type === 'daily') {
                await db.prepare('DELETE FROM daily WHERE filename = ?').bind(filename).run();
            } else if (type === 'moment') {
                await db.prepare('DELETE FROM moments WHERE filename = ?').bind(filename).run();
            } else if (type === 'comment') {
                console.log('Attempting to delete comment with identifier:', filename);
                // filename 格式为 comment___${created_at}___${nickname}
                const parts = filename.split('___');
                if (parts.length === 3) {
                    const createdAt = parts[1];
                    const nickname = parts[2];
                    console.log('Parsed deletion params:', { createdAt, nickname });
                    const result = await db.prepare('DELETE FROM comments WHERE created_at = ? AND nickname = ?').bind(createdAt, nickname).run();
                    console.log('D1 Delete Result:', JSON.stringify(result));
                } else {
                    console.error('Failed to parse comment filename for deletion (invalid parts count):', filename);
                }
            }
        }

        const res = NextResponse.json({ success: true });
        res.headers.set('Cache-Control', 'no-store');
        return res;

    } catch (error: unknown) {
        console.error('Delete error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        const res = NextResponse.json({ error: message }, { status: 500 });
        res.headers.set('Cache-Control', 'no-store');
        return res;
    }
}
