import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    console.log('API: Fetching comments for slug:', slug);

    if (!slug) {
        return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const isNode = typeof process.versions?.node !== 'undefined';
    let db: any = null;

    if (!isNode) {
        try {
            const { env } = getRequestContext();
            db = (env as any).DB;
        } catch (e) {
            // Silence noisy logs in local development if needed, or log for debugging
            console.warn('Failed to get D1 binding (expected in local dev):', e);
        }
    }

    // Local dev mock or error if needed. For now, we just return error if no DB and no local logic implemented here yet.
    // The previous implementation tried to access DB directly.

    if (!db) {
        // If we are in node (local dev) and haven't set up a local mock, we can't really fetch comments from D1 easily without wrangler proxy.
        // For now, returning empty list or error is better than crashing.
        console.warn('No database binding found. Returning empty list for local dev safety.');
        return NextResponse.json({ comments: [] });
    }

    try {
        const { results } = await db.prepare(
            'SELECT nickname, content, contact, created_at, is_admin, parent_id FROM comments WHERE slug = ? ORDER BY created_at ASC'
        ).bind(slug).all();

        return NextResponse.json({ comments: results });
    } catch (error: any) {
        console.error('Fetch comments error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const isNode = typeof process.versions?.node !== 'undefined';
        let env: any = {};

        if (!isNode) {
            try {
                env = getRequestContext().env;
            } catch (e) {
                console.warn('Failed to get context env:', e);
            }
        }

        const tgToken = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

        let db: any = env.DB;

        if (!db) {
            console.warn('No database binding found for POST.');
            return NextResponse.json({ error: 'D1 database not found (local dev)' }, { status: 500 });
        }

        interface CommentBody {
            slug: string;
            pageTitle?: string;
            nickname: string;
            contact?: string;
            content: string;
            parent_id?: string;
            adminPassword?: string;
            hp_check?: string; // Honeypot field
        }

        const body = (await req.json()) as CommentBody;
        const { slug, pageTitle, nickname, contact, content, parent_id, adminPassword, hp_check } = body;

        // Honeypot check
        if (hp_check) {
            console.warn(`Honeypot triggered by IP: ${req.headers.get('cf-connecting-ip')}`);
            // Return success to confuse the bot, but don't save anything
            return NextResponse.json({ success: true });
        }

        if (!slug || !nickname || !content) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (content.length > 500) {
            return NextResponse.json({ error: 'Comment too long' }, { status: 400 });
        }

        const isAdmin = adminPassword === (process.env.ADMIN_PASSWORD || '');

        // --- Rate Limiting Strategy (D1) ---
        if (!isAdmin) {
            try {
                // Determine IP
                const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';

                // Ensure table exists (Lazy migration for personal blog simplicity)
                await db.prepare(
                    'CREATE TABLE IF NOT EXISTS rate_limits (ip_address TEXT PRIMARY KEY, last_comment_at INTEGER)'
                ).run();

                const now = Date.now();
                const limitWindow = 60 * 1000; // 60 seconds

                // Check last comment time
                const record = await db.prepare('SELECT last_comment_at FROM rate_limits WHERE ip_address = ?').bind(ip).first();

                if (record && (now - record.last_comment_at < limitWindow)) {
                    const timeLeft = Math.ceil((limitWindow - (now - record.last_comment_at)) / 1000);
                    return NextResponse.json({ error: `Too many comments. Please wait ${timeLeft}s.` }, { status: 429 });
                }

                // Update rate limit record
                await db.prepare(
                    'INSERT INTO rate_limits (ip_address, last_comment_at) VALUES (?, ?) ON CONFLICT(ip_address) DO UPDATE SET last_comment_at = ?'
                ).bind(ip, now, now).run();

            } catch (rlError) {
                console.error('Rate limit check failed:', rlError);
                // Fail open or closed? Let's fail open (allow comment) but log error to avoid blocking legit users if DB issues specific to this table arise.
                // However, if DB is completely down, the outer try-catch handles it.
            }
        }

        await db.prepare(
            'INSERT INTO comments (slug, nickname, contact, content, parent_id, is_admin) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(slug, nickname, contact || '', content, parent_id || null, isAdmin ? 1 : 0).run();

        // 发送 Telegram 通知
        if (tgToken && tgChatId) {
            try {
                const { sendTelegramNotification } = await import('@/lib/telegram');
                const displayTitle = pageTitle || slug;
                const message = `<b>📬 新评论通知</b>\n\n` +
                    `<b>文章:</b> <code>${displayTitle}</code>\n` +
                    `<b>来自:</b> ${nickname}${isAdmin ? ' (管理员)' : ''}\n` +
                    `<b>联系方式:</b> ${contact || '无'}\n` +
                    `<b>内容:</b>\n${content}\n\n` +
                    `<a href="https://miracle.us.ci/posts/${slug}">点击查看详情</a>`;

                // 使用 await 确保在 Edge Runtime 中发送完成
                await sendTelegramNotification(tgToken, tgChatId, message);
            } catch (err) {
                console.error('Failed to send TG notification:', err);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Post comment error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
