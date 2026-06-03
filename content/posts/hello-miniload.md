---
title: "Hello MiniLoad"
date: 2026-01-01
description: "Welcome to the MiniLoad blog theme — a minimal, HUD-styled personal blog built with Next.js"
category: "Getting Started"
---

# Hello MiniLoad

Welcome to **MiniLoad** — a minimal, HUD-styled personal blog theme built with Next.js 15, Tailwind CSS 4, and Cloudflare D1.

## Features

- **Minimal HUD design** — Tactical layout with dither background effects
- **Content types** — Posts, daily diary, and photo moments
- **Markdown-driven** — Write content in Markdown with YAML frontmatter
- **Admin dashboard** — Password-protected admin panel for managing content
- **Comment system** — With rate limiting and Telegram notifications
- **Cloudflare-ready** — Deploy to Cloudflare Pages with D1 database

## Quick Start

```bash
git clone <your-repo>
cd miniload
npm install
npm run dev
```

Set up your environment variables in `.env.local`:

```env
ADMIN_PASSWORD=your-secure-password
```

## Directory Structure

```
content/
├── posts/    # Blog articles
├── daily/    # Diary entries
└── moments/  # Photo moments
```

Each content file is a Markdown file with YAML frontmatter.
