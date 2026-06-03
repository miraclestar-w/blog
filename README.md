# MiniLoad

MiniLoad 是一个极简 HUD 风格的个人博客主题，基于 Next.js 15、React 19、Tailwind CSS 4 和 Cloudflare D1 构建。它适合用来记录长文、日常日志、照片瞬间和一些个人项目展示，整体视觉偏暗色、终端感、像素感与轻量化信息面板。

项目支持本地 Markdown 内容管理，也预留了 Cloudflare Pages + D1 的边缘部署模式。开发时可以直接写 `content/` 目录下的 Markdown 文件；上线后可以通过 D1 存储文章、日常、瞬间和评论数据。

## 功能特点

- **HUD 风格界面**：暗色背景、Dither 动态纹理、终端信息块、像素字体和极简导航。
- **多内容类型**：支持文章合集、日常时间线、照片瞬间瀑布流、关于页和首页项目展示。
- **Markdown 写作**：文章使用 Markdown + YAML Front Matter，支持 GFM、标题锚点、代码高亮和目录生成。
- **后台管理**：内置 `/admin` 页面，可用密码登录并管理文章、日常、瞬间与评论。
- **评论系统**：评论写入 Cloudflare D1，包含基础限流、蜜罐字段和管理员回复识别。
- **Telegram 通知**：评论提交后可通过 Telegram Bot 推送通知。
- **Cloudflare 适配**：提供 `pages:build` 脚本，适合部署到 Cloudflare Pages，并通过 D1 作为生产环境数据源。

## 技术栈

- Next.js 15 / App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Cloudflare Pages / D1
- Unified / Remark / Rehype
- GSAP、Motion、Three.js、OGL
- shadcn 风格 UI 基础组件

## 页面结构

| 路径 | 说明 |
| --- | --- |
| `/` | 首页，包含动态背景、状态栏、精选信息、工具区和书架区 |
| `/posts` | 文章列表 |
| `/posts/[slug]` | 文章详情，包含 Markdown 渲染、目录和评论 |
| `/daily` | 日常日志时间线 |
| `/moments` | 照片瞬间瀑布流，支持列数切换 |
| `/about` | 关于页 |
| `/admin` | 内容管理后台 |

## 目录说明

```txt
.
├── content/
│   ├── posts/      # 博客文章 Markdown
│   ├── daily/      # 日常日志 Markdown
│   └── moments/    # 照片瞬间 Markdown
├── public/         # 图标、字体和静态资源
├── scripts/        # 辅助脚本，例如生成 D1 迁移 SQL
└── src/
    ├── app/        # Next.js App Router 页面与 API
    ├── components/ # 页面组件、UI 组件和视觉特效组件
    ├── lib/        # 内容读取、Markdown 渲染、通知等工具
    └── types/      # 类型声明
```

## 快速开始

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

访问：

```txt
http://localhost:3000
```

构建生产版本：

```bash
npm run build
```

启动生产服务：

```bash
npm run start
```

代码检查：

```bash
npm run lint
```

## 环境变量

在本地创建 `.env.local`：

```env
ADMIN_PASSWORD=your-secure-password
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 是 | 后台登录密码，也用于识别管理员评论 |
| `TELEGRAM_BOT_TOKEN` | 否 | Telegram Bot Token，用于评论通知 |
| `TELEGRAM_CHAT_ID` | 否 | 接收通知的 Telegram Chat ID |

生产环境如果使用 Cloudflare D1，需要在 Cloudflare Pages 中绑定数据库，绑定名为 `DB`。

## 内容写作

文章放在 `content/posts/`，文件名会作为文章 slug，例如：

```txt
content/posts/hello-miniload.md
```

文章 Front Matter 示例：

```md
---
title: "Hello MiniLoad"
date: 2026-01-01
description: "Welcome to the MiniLoad blog theme"
category: "Getting Started"
---

# Hello MiniLoad

这里是文章正文。
```

日常日志放在 `content/daily/`，照片瞬间放在 `content/moments/`。后台写入时也会按照这些内容类型分别保存。

## Cloudflare D1

项目中的内容读取逻辑会优先尝试读取 D1 数据库；没有 D1 绑定时，本地开发会回退到 `content/` 目录。

代码中使用到的主要数据表包括：

- `posts`：文章数据
- `daily`：日常日志
- `moments`：照片瞬间
- `comments`：评论
- `rate_limits`：评论限流记录，评论接口会按需创建

可以使用脚本把本地 Markdown 生成迁移 SQL：

```bash
node scripts/generate-migration-sql.js
```

脚本会在项目根目录生成 `migration.sql`，用于将 `content/` 中的内容迁移到 Cloudflare D1。

Cloudflare Pages 构建命令：

```bash
npm run pages:build
```

## 个性化配置

常见修改位置：

- 首页工具、状态和书架内容：[src/app/page.tsx](/Users/mortysmith/Documents/myDev/几个博客主题/MiniLoad/src/app/page.tsx)
- 顶部导航：[src/components/header.tsx](/Users/mortysmith/Documents/myDev/几个博客主题/MiniLoad/src/components/header.tsx)
- 关于页文案：[src/app/about/page.tsx](/Users/mortysmith/Documents/myDev/几个博客主题/MiniLoad/src/app/about/page.tsx)
- 全局样式：[src/app/globals.css](/Users/mortysmith/Documents/myDev/几个博客主题/MiniLoad/src/app/globals.css)
- 内容读取与 Markdown 渲染：[src/lib/content.ts](/Users/mortysmith/Documents/myDev/几个博客主题/MiniLoad/src/lib/content.ts)

## 许可证

本项目使用 MIT License，详情见 [LICENSE](/Users/mortysmith/Documents/myDev/几个博客主题/MiniLoad/LICENSE)。
