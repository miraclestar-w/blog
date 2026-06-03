import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(req: NextRequest) {
    if (process.env.NEXT_RUNTIME !== 'nodejs') {
        return NextResponse.json(
            { error: 'Management API is only available in local development environment.' },
            { status: 501 }
        );
    }

    const fs = eval('require')('fs').promises;
    const path = eval('require')('path');
    const matter = eval('require')('gray-matter');

    const contentRoot = path.join(process.cwd(), 'content');

    try {
        const authHeader = req.headers.get('Authorization');
        const adminPassword = process.env.ADMIN_PASSWORD || '';

        if (authHeader !== adminPassword) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const postsDir = path.join(contentRoot, 'posts');
        const files = await fs.readdir(postsDir);

        const posts = await Promise.all(
            files
                .filter((file: string) => file.endsWith('.md'))
                .map(async (file: string) => {
                    const filePath = path.join(postsDir, file);
                    const raw = await fs.readFile(filePath, 'utf8');
                    const { data, content } = matter(raw);
                    return {
                        filename: file,
                        title: data.title || file,
                        date: data.date instanceof Date
                            ? data.date.toISOString().split('T')[0]
                            : String(data.date || '').split('T')[0],
                        description: data.description || '',
                        slug: file.replace('.md', ''),
                        content: content
                    };
                })
        );

        // Sort by date descending
        posts.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateB - dateA;
        });

        return NextResponse.json({ posts });
    } catch (error: unknown) {
        console.error('List posts error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
