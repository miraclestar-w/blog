// 移除顶级 Node.js 导入以适配 Edge Runtime
// import fs from 'node:fs/promises';
// import path from 'node:path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import GithubSlugger from 'github-slugger';
import { getRequestContext } from '@cloudflare/next-on-pages';

const getContentRoot = () => {
  if (process.env.NEXT_RUNTIME === 'edge') return '';
  try {
    // 再次检查是否真的在 Node 环境
    if (typeof eval('require') !== 'function') return '';
    const path = eval('require')('path');
    return path.join(process.cwd(), 'content');
  } catch {
    return '';
  }
};

type TocItem = { depth: number; text: string; id: string };
type HeadingNode = { depth?: number };
type ElementNode = {
  tagName?: string;
  properties?: Record<string, unknown>;
};

// 获取 D1 数据库实例
function getDB() {
  if (process.env.NEXT_RUNTIME === 'nodejs') return null;
  try {
    const { env } = getRequestContext();
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return (env as any).DB;
  } catch {
    return null;
  }
}

async function renderMarkdown(markdown: string) {
  const slugger = new GithubSlugger();
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const toc: TocItem[] = [];

  visit(tree, 'heading', (node: unknown) => {
    const heading = node as HeadingNode;
    const depth = typeof heading.depth === 'number' ? heading.depth : 0;
    if (depth < 1 || depth > 4) return;
    const text = toString(node as never).trim();
    if (!text) return;
    const id = slugger.slug(text);
    toc.push({ depth, text, id });
  });

  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(() => (tree) => {
      visit(tree, 'element', (node: unknown) => {
        const element = node as ElementNode;
        if (element.tagName === 'a' && element.properties?.href) {
          const href = element.properties.href;
          if (typeof href === 'string' && (href.startsWith('http') || href.startsWith('//'))) {
            element.properties.target = '_blank';
            element.properties.rel = 'noopener noreferrer';
          }
        }
      });
    })
    .use(rehypeSlug)
    .use(rehypeHighlight, { detect: false, ignoreMissing: true })
    .use(rehypeStringify)
    .process(markdown);

  const htmlString = html.toString();

  return { html: htmlString, toc };
}

function normalizeDate(value?: unknown) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value;
  return '';
}

function safeDate(value?: unknown) {
  const normalized = normalizeDate(value);
  if (!normalized) return 0;

  // 支持 M.D 或 M-D 格式 (例如 2.7 -> 2026-02-07)
  if (/^\d{1,2}[.-]\d{1,2}$/.test(normalized)) {
    const [m, d] = normalized.split(/[.-]/).map(Number);
    const now = new Date();
    const date = new Date(now.getFullYear(), m - 1, d);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }

  // 支持 YYMMDD 格式 (例如 250724 -> 2025-07-24)
  if (/^\d{6}$/.test(normalized)) {
    const year = 2000 + parseInt(normalized.slice(0, 2));
    const month = parseInt(normalized.slice(2, 4)) - 1;
    const day = parseInt(normalized.slice(4, 6));
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? 0 : ts;
}

export async function getPostSlugs() {
  const db = getDB();
  if (db) {
    const { results } = await db.prepare('SELECT slug FROM posts').all();
    return results.map((r: Record<string, unknown>) => r.slug as string);
  }
  if (process.env.NEXT_RUNTIME === 'edge') return [];

  try {
    if (typeof eval('require') !== 'function') return [];
    const path = eval('require')('path');
    const fs = eval('require')('fs/promises');
    const dir = path.join(getContentRoot(), 'posts');
    const files = await fs.readdir(dir);
    return files.filter((file: string) => file.endsWith('.md') && !file.startsWith('.')).map((file: string) => file.replace(/\.md$/, ''));
  } catch (error) {
    console.error('Error fetching post slugs from filesystem:', error);
    return [];
  }
}

export async function getAllPosts() {
  const db = getDB();
  if (db) {
    const { results } = await db.prepare('SELECT slug, title, date, description, category FROM posts ORDER BY date DESC').all();
    return results.map((post: Record<string, unknown>) => ({
      slug: post.slug as string,
      title: post.title as string,
      date: post.date as string,
      description: post.description as string,
      category: (post.category as string) || '',
      _ts: safeDate(post.date)
    }));
  }

  if (process.env.NEXT_RUNTIME === 'edge') return [];

  try {
    if (typeof eval('require') !== 'function') return [];
    const path = eval('require')('path');
    const fs = eval('require')('fs/promises');
    const dir = path.join(getContentRoot(), 'posts');
    const files = await fs.readdir(dir);
    const posts = await Promise.all(
      files.filter((file: string) => file.endsWith('.md')).map(async (file: string) => {
        const slug = file.replace(/\.md$/, '');
        const raw = await fs.readFile(path.join(dir, file), 'utf8');
        const { data, content } = matter(raw);
        const description =
          typeof data.description === 'string'
            ? data.description
            : content.replace(/\s+/g, ' ').trim().slice(0, 120);
        const date = normalizeDate(data.date);
        return {
          slug,
          title: typeof data.title === 'string' ? data.title : slug,
          date,
          description,
          category: typeof data.category === 'string' ? data.category : '',
          _ts: safeDate(date)
        };
      })
    );

    return posts.sort((a, b) => b._ts - a._ts).map((post) => {
      const { _ts, ...rest } = post;
      void _ts;
      return rest;
    });
  } catch (error) {
    console.error('Error fetching all posts from filesystem:', error);
    return [];
  }
}

export async function getPostBySlug(slug: string) {
  const db = getDB();
  if (db) {
    const post = await db.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first() as Record<string, unknown> | null;
    if (!post) throw new Error('Post not found');
    const { html, toc } = await renderMarkdown(post.content as string);
    return {
      slug: post.slug as string,
      title: post.title as string,
      date: post.date as string,
      description: post.description as string,
      category: (post.category as string) || '',
      html,
      toc
    };
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new Error('FileSystem access not available in Edge Runtime');
  }

  try {
    if (typeof eval('require') !== 'function') {
      throw new Error('Require not available');
    }
    const path = eval('require')('path');
    const fs = eval('require')('fs/promises');
    const filePath = path.join(getContentRoot(), 'posts', `${slug}.md`);
    const raw = await fs.readFile(filePath, 'utf8');
    const { data, content } = matter(raw);
    const { html, toc } = await renderMarkdown(content);

    const date = normalizeDate(data.date);
    return {
      slug,
      title: typeof data.title === 'string' ? data.title : slug,
      date,
      description: typeof data.description === 'string' ? data.description : '',
      category: typeof data.category === 'string' ? data.category : '',
      html,
      toc
    };
  } catch (error) {
    console.error(`Error fetching post by slug ${slug} from filesystem:`, error);
    throw error;
  }
}

export async function getDailyEntries() {
  const db = getDB();
  if (db) {
    const { results } = await db.prepare('SELECT * FROM daily').all();
    const entries = await Promise.all(results.map(async (entry: Record<string, unknown>) => {
      const { html } = await renderMarkdown(entry.content as string);
      const date = entry.date as string;
      return {
        date,
        title: (entry.title as string) || '',
        image: (entry.image_url as string) || '',
        html,
        _ts: safeDate(date)
      };
    }));
    // 统一排序：按时间戳降序
    return entries.sort((a, b) => b._ts - a._ts).map(({ _ts, ...rest }) => rest);
  }

  if (process.env.NEXT_RUNTIME === 'edge') return [];

  try {
    if (typeof eval('require') !== 'function') return [];
    const path = eval('require')('path');
    const fs = eval('require')('fs/promises');
    const dir = path.join(getContentRoot(), 'daily');
    const files = await fs.readdir(dir);
    const entries = await Promise.all(
      files.filter((file: string) => file.endsWith('.md')).map(async (file: string) => {
        const raw = await fs.readFile(path.join(dir, file), 'utf8');
        const { data, content } = matter(raw);
        const { html } = await renderMarkdown(content);
        const date = normalizeDate(data.date) || file.replace(/\.md$/, '');
        return {
          date,
          title: typeof data.title === 'string' ? data.title : '',
          image: typeof data.image === 'string' ? data.image : '',
          html,
          _ts: safeDate(date)
        };
      })
    );

    return entries.sort((a, b) => b._ts - a._ts).map((entry) => {
      const { _ts, ...rest } = entry;
      void _ts;
      return rest;
    });
  } catch (error) {
    console.error('Error fetching daily entries from filesystem:', error);
    return [];
  }
}

export async function getMomentsEntries() {
  const db = getDB();
  if (db) {
    const { results } = await db.prepare('SELECT * FROM moments ORDER BY date DESC').all();
    return Promise.all(results.map(async (entry: Record<string, unknown>) => {
      const { html } = await renderMarkdown(entry.content as string);
      return {
        date: entry.date as string,
        title: (entry.title as string) || '',
        image: (entry.image_url as string) || '',
        html
      };
    }));
  }

  if (process.env.NEXT_RUNTIME === 'edge') return [];

  try {
    if (typeof eval('require') !== 'function') return [];
    const path = eval('require')('path');
    const fs = eval('require')('fs/promises');
    const dir = path.join(getContentRoot(), 'moments');
    try {
      await fs.access(dir);
    } catch {
      return [];
    }

    const files = await fs.readdir(dir);
    const entries = await Promise.all(
      files.filter((file: string) => file.endsWith('.md')).map(async (file: string) => {
        const raw = await fs.readFile(path.join(dir, file), 'utf8');
        const { data, content } = matter(raw);
        const { html } = await renderMarkdown(content);
        const date = normalizeDate(data.date) || file.replace(/\.md$/, '');
        return {
          date,
          title: typeof data.title === 'string' ? data.title : '',
          image: typeof data.image === 'string' ? data.image : '',
          html,
          _ts: safeDate(date)
        };
      })
    );

    return entries.sort((a, b) => b._ts - a._ts).map((entry) => {
      const { _ts, ...rest } = entry;
      void _ts;
      return rest;
    });
  } catch (error) {
    console.error('Error fetching moments entries from filesystem:', error);
    return [];
  }
}
