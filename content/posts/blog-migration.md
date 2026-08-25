---
title: "博客迁移完成"
date: 2026-08-25
description: "新博客正式上线：基于 Next.js 15 + Cloudflare Pages + D1，从旧站 miraclestar-w.github.io 迁移而来。"
category: "随笔"
---

# 博客迁移完成

新的博客正式上线了。

旧站在 [miraclestar-w.github.io](https://miraclestar-w.github.io/)，这次换成了一套更轻的方案：

- **框架**：Next.js 15 / App Router
- **样式**：Tailwind CSS 4，暗色 HUD 风格
- **部署**：GitHub + Cloudflare Pages
- **数据**：Cloudflare D1，文章与评论都存边缘数据库

## 为什么迁移

- 静态托管能力有限，想要原生的评论系统
- Cloudflare 边缘节点全球加速，国内访问也更稳
- Markdown 写作流程不变，本地写完推送到 GitHub 即自动部署

## 之后会写什么

还是老方向：运维自动化、AI Agent、可观测性和开发工具。

Stay hungry, stay foolish.
