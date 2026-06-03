import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(req: NextRequest) {
    const isNode = typeof process.versions?.node !== 'undefined';
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
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
        const authHeader = req.headers.get('Authorization');
        const adminPassword = process.env.ADMIN_PASSWORD || '';

        if (authHeader !== adminPassword) {
            const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            res.headers.set('Cache-Control', 'no-store');
            return res;
        }

        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'post';

        // --- 数据库模式 ---
        if (db) {
            if (type === 'post') {
                const { results } = await db.prepare('SELECT slug, title, date, description, category, content FROM posts').all();
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                const posts = results.map((r: any) => ({ ...r, filename: `${r.slug}.md` }));
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                posts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                return NextResponse.json({ items: posts });
            } else if (type === 'daily') {
                const { results } = await db.prepare('SELECT * FROM daily').all();
                results.sort((a: any, b: any) => b.filename.localeCompare(a.filename));
                return NextResponse.json({ items: results });
            } else if (type === 'moment') {
                const { results } = await db.prepare('SELECT * FROM moments').all();
                results.sort((a: any, b: any) => b.filename.localeCompare(a.filename));
                return NextResponse.json({ items: results });
            } else if (type === 'comment') {
                const { results: comments } = await db.prepare('SELECT * FROM comments').all();
                const { results: posts } = await db.prepare('SELECT slug, title FROM posts').all();
                const { results: daily } = await db.prepare('SELECT filename as slug, date as title FROM daily').all();
                const { results: moments } = await db.prepare('SELECT filename as slug, title FROM moments').all();

                // 建立 slug -> title 映射
                const titleMap: Record<string, string> = {};
                [...posts, ...daily, ...moments].forEach((item: any) => {
                    titleMap[item.slug.replace('.md', '')] = item.title;
                });

                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                const items = comments.map((r: any) => {
                    const cleanRSlog = r.slug.replace('.md', '');
                    return {
                        ...r,
                        filename: `comment___${r.created_at}___${r.nickname}`,
                        articleTitle: titleMap[cleanRSlog] || r.slug
                    };
                });



                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                items.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                return NextResponse.json({ items });
            }

        }

        // --- 本地文件模式 (Node) ---
        if (isNode) {
            const fs = eval('require')('fs');
            const path = eval('require')('path');
            const matter = eval('require')('gray-matter');
            const contentRoot = path.join(process.cwd(), 'content');

            if (type === 'post') {
                const postsDir = path.join(contentRoot, 'posts');
                const files = await fs.promises.readdir(postsDir);
                const posts = await Promise.all(
                    files.filter((f: string) => f.endsWith('.md')).map(async (f: string) => {
                        const raw = await fs.promises.readFile(path.join(postsDir, f), 'utf8');
                        const { data, content } = matter(raw);
                        return {
                            filename: f,
                            title: data.title || f,
                            date: String(data.date || '').split('T')[0],
                            description: data.description || '',
                            category: data.category || '',
                            slug: f.replace('.md', ''),
                            content
                        };
                    })
                );
                posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                return NextResponse.json({ items: posts });
            } else if (type === 'daily') {
                const dailyDir = path.join(contentRoot, 'daily');
                const files = await fs.readdirSync(dailyDir);
                const items = await Promise.all(
                    files.filter((f: string) => f.endsWith('.md')).map(async (f: string) => {
                        const raw = await fs.readFileSync(path.join(dailyDir, f), 'utf8');
                        const { data, content } = matter(raw);
                        return {
                            filename: f,
                            date: data.date || f.replace('.md', ''),
                            content,
                            imageUrl: data.imageUrl || ''
                        };
                    })
                );
                items.sort((a, b) => b.filename.localeCompare(a.filename));
                return NextResponse.json({ items });
            } else if (type === 'moment') {
                const momentsDir = path.join(contentRoot, 'moments');
                const files = await fs.readdirSync(momentsDir);
                const items = await Promise.all(
                    files.filter((f: string) => f.endsWith('.md')).map(async (f: string) => {
                        const raw = await fs.readFileSync(path.join(momentsDir, f), 'utf8');
                        const { data, content } = matter(raw);
                        return {
                            filename: f,
                            title: data.title || f,
                            date: data.date || '',
                            imageUrl: data.image || '',
                            content
                        };
                    })
                );
                items.sort((a, b) => b.filename.localeCompare(a.filename));
                return NextResponse.json({ items });
            }
        }

        return NextResponse.json({ items: [] });
    } catch (error: unknown) {
        console.error('List error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
