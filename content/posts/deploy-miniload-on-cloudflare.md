---
title: "从静态托管到边缘全栈：本站部署全记录（Next.js + Cloudflare Pages + D1）"
date: 2026-08-25
description: "旧站是纯静态托管，想要评论系统和在线后台。这次换成 MiniLoad 主题（Next.js 15），部署到 Cloudflare Pages + D1，全程零成本。记录完整流程和五个踩坑。"
category: "运维"
---

> 旧站：GitHub Pages 纯静态，53 篇文章，无评论无后台
> 新站：Cloudflare Pages + D1 边缘全栈，域名 miracle.us.ci
> 成本：0 元（全部免费套餐）

## 一、为什么要迁移

旧站用静态生成器搭在 GitHub Pages 上，用了很久，但有几个一直忍着的问题：

- **没有评论系统**——读者没法留言，互动全靠社交软件
- **没有在线后台**——发文章必须本地构建再 push，改个错别字也要走完整流程
- **功能天花板低**——想加点动态内容（浏览统计、瞬间、时间线）都没地方跑

选型时看到 [miniload.top](https://miniload.top) 这个博客，暗色 HUD 终端风很对我胃口，一查发现主题是开源的（[MiniLoad](https://github.com/arkleselect/MiniLoad)）：Next.js 15 + Tailwind CSS 4，数据层用 Cloudflare D1，原生支持评论、后台管理、Telegram 通知——正好是我要的全部，于是直接基于它改造。

## 二、整体架构

```
本地 Markdown / /admin 后台
        │
        ▼
GitHub 仓库（源码 + 文章）
        │ push 触发
        ▼
Cloudflare Pages（自动构建 next-on-pages，边缘节点运行）
        │
        ▼
Cloudflare D1（文章 / 日常 / 瞬间 / 评论 / 限流）
```

- **源码托管**：GitHub 私有逻辑上公开都行，push 即自动构建部署
- **运行时**：Cloudflare Pages 边缘节点，全球访问延迟低
- **数据**：D1 数据库，绑定名 `DB`，文章和评论都在里面
- **域名**：`miracle.us.ci`，DNS 本来就托管在 Cloudflare，绑 CNAME 几分钟生效

## 三、部署流程

### 1. 建仓推送

```bash
git init && git add -A && git commit -m "init"
gh repo create blog --source=. --remote=origin --push
```

### 2. Cloudflare Pages 连接仓库

Dashboard → Workers & Pages → Create → Pages → Connect to Git，选仓库后构建配置：

- Framework preset: **Next.js**
- Build command: `npx @cloudflare/next-on-pages@1`
- Build output: `.vercel/output/static`

### 3. 建 D1 并导入数据

```bash
npx wrangler d1 create blog-db
# 项目里配好 wrangler.toml 的绑定（binding = "DB"）
node scripts/generate-migration-sql.js        # 本地 md → migration.sql
npx wrangler d1 execute blog-db --remote --file=schema.sql -y
npx wrangler d1 execute blog-db --remote --file=migration.sql -y
```

### 4. 密钥与环境变量

```bash
echo "<password>" | npx wrangler pages secret put ADMIN_PASSWORD --project-name blog
echo "<token>" | npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name blog
echo "<chat_id>" | npx wrangler pages secret put TELEGRAM_CHAT_ID --project-name blog
```

### 5. 绑定域名

Pages 项目 → Custom domains → 添加 `miracle.us.ci`，DNS 托管在 Cloudflare 的情况下 CNAME 自动配置。

### 6. 个性化

- 导航隐藏了日常/瞬间入口（只留文章 + 关于，以后想开随时恢复）
- 站点标题、关于页文案、联系方式换成自己的
- 评论通知接 Telegram Bot，有人留言秒收到推送

## 四、踩坑记录（重点）

### 坑 1：Windows 中文编码污染 D1

用 PowerShell 脚本把 Markdown 转换写入文件，中文被按 GBK 写入（还带了个 UTF-8 BOM 伪装）。这批数据导入 D1 后全站乱码。

**教训**：Windows 上处理中文内容，不要经过 PowerShell 的字符串管道，用 Node/Python 原生读写 UTF-8；验证编码要用字节级别检查，控制台显示正常不代表数据正常。

### 坑 2：next-on-pages 本地构建失败

```
SHELLAC COMMAND FAILED! npm --version → ENOENT
```

新版 Node 出于安全限制不允许 spawn `.cmd` 脚本（`npm.cmd` 直接 EINVAL/ENOENT），next-on-pages 的构建探测在 Windows 上直接挂。

**解法**：放弃本地构建，改用 Cloudflare Pages 的 Git 集成——构建在 Linux 环境跑，天然没这个问题，还白得 push 自动部署。

### 坑 3：本地 dev 文章页永远"未找到"

文章页是 `runtime = 'edge'`，本地 `next dev` 模拟的 Edge 环境没有文件系统也没有 D1 绑定，所以本地永远渲染不出文章。

**结论**：这个架构下本地 dev 只能调样式，内容验证必须上线后做（或本地起 wrangler 模拟 D1）。

### 坑 4：Pages Secret 只对新部署生效

设置完 `ADMIN_PASSWORD` 后立刻登录后台，Access Denied。因为 Secret 是绑定到部署实例的，**已运行的部署拿不到新 Secret**。

**解法**：设置 Secret 后触发一次新部署（随便 push 一个 commit 即可）。

### 坑 5：控制台的"乱码"不一定是真乱码

排查 D1 乱码时，PowerShell 捕获 wrangler 的 JSON 输出会按 GBK 解码，显示出来全是乱码，让人以为数据坏了。

**解法**：验证一律用 Node 脚本（`execSync` 拿 buffer 自己按 UTF-8 解码），绕开 PowerShell 的编码层。最后证明 D1 数据一直是好的。

## 五、验证清单

上线后逐项过了一遍：

- [x] 首页 / 文章列表 / 文章详情 / 关于页 200
- [x] 文章中文内容无乱码（D1 → 边缘渲染全链路 UTF-8）
- [x] 4 张配图正常加载
- [x] 评论提交 → D1 入库 → Telegram 收到推送
- [x] /admin 后台密码登录、删评论正常
- [x] 自定义域名 HTTPS 证书生效

## 六、成本

| 项目 | 费用 |
|---|---|
| Cloudflare Pages | 免费套餐（500 次/月构建，够用） |
| Cloudflare D1 | 免费套餐（5GB 存储 + 每天百万级读） |
| GitHub 私有仓库 | 免费 |
| 域名 | 已有 |

**总计 0 元**，相比静态托管还多了评论、后台和边缘计算能力。

## 七、后续计划

- [ ] 旧站 53 篇文章批量迁移
- [ ] 换站点 favicon / 头像
- [ ] 观察免费额度用量，必要时优化

---

如果你也想搞一个，MiniLoad 主题开源在 [GitHub](https://github.com/arkleselect/MiniLoad)，配合 Cloudflare 免费套餐，一个晚上就能跑通。
