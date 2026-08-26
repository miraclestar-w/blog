---
title: "把 Cloudflare 免费额度榨干：图床、备份、知识库、截图 API 一次搭齐"
date: 2026-08-26
description: "博客部署完之后，账号里还剩一大堆免费额度没用。这次一口气搭了四个 Worker：Telegram 图床、D1 定时备份、向量知识库 RAG、无头浏览器截图 API，外加邮箱别名。全程 0 元，记录方案取舍和安全细节。"
category: "运维"
---

> 目标：不花一分钱，把 Cloudflare 账号的空闲资源全部利用起来
> 成果：4 个新 Worker + 1 套邮箱别名 + 每天 automatic 备份
> 月成本：¥0

## 一、起因

上次把博客迁到 Cloudflare Pages + D1 之后（[前文](/posts/deploy-miniload-on-cloudflare)），我盘了一下账号：Workers 每天 10 万请求、D1 5GB、Workers AI 免费档……博客一个项目连零头都用不掉，纯属浪费。

于是决定把这些额度变成真正有用的服务。清单如下：

| 服务 | 解决什么问题 |
|------|-------------|
| Telegram 图床 | 博客/日常贴图有地方放，不占本地 |
| D1 定时备份 | 图床元数据丢了图就找不回了，必须有兜底 |
| 向量知识库 RAG | 个人笔记的语义检索 API |
| 截图 API | 网页转 PNG，给自动化流程用 |
| 邮箱别名 | 注册各种网站用不同地址，泄露能定位来源 |

## 二、全景架构

![架构总览](/images/cf-free-stack/arch.svg)

所有东西都跑在 Cloudflare 免费套餐里：Workers 做计算，D1/KV 做存储，Workers AI 和 Vectorize 做 RAG，Browser Rendering 做截图，Email Routing 收邮件。图片实体文件放在 Telegram 频道——这是整个方案里唯一不在 Cloudflare 的部分，但它免费且无限量。

## 三、图床：CloudFlare-ImgBed

直接部署开源项目 [MarSeventh/CloudFlare-ImgBed](https://github.com/MarSeventh/CloudFlare-ImgBed)，以 Workers 模式跑（官方教程走 Pages，但 Workers 模式配合 wrangler CLI 更适合命令行党）：

```bash
npx wrangler d1 create img_d1          # 元数据库
# 编辑 deploy/worker/wrangler.toml 填入 D1 ID 和 TG 凭证
npm run deploy:worker                   # 一键构建部署
npx wrangler d1 execute img_d1 --remote --file=database/init.sql
```

两个踩坑点值得记下来：

1. **建表必须手动执行** `database/init.sql`。代码默认查 `settings` 表，空库会直接 503，报错信息还是"密码错误"，非常有迷惑性。
2. 认证码支持环境变量 `AUTH_CODE` 直接注入，不用先进后台设置。

部署完第一件事是**加安全层**，公开图床裸奔等于邀请别人白嫖你的 Workers 额度：

- **认证码登录墙**——上传和后台必须登录，游客只能看到登录页：

![图床登录墙](/images/cf-free-stack/imgbed-login.png)

- **每 IP 日限额**——原版只有匿名限速，我在上传入口加了一个基于 D1 计数的按天限额（`manage@ipUploadCount@日期@IP`），超过直接 429。脚本批量刷也刷不动。
- **AI 自动打标**——接了 Workers AI 的 llava 视觉模型，图片上传时自动生成描述和标签写进元数据，失败不影响上传主流程。以后素材多了可以直接按语义搜图。

## 四、每日备份：把数据库寄存到 Telegram

图床的 D1 里存着所有图片的元数据（TG 的 file_id、消息位置），这个库丢了 = 全部图片变死链。R2 要绑卡才开通，所以我用了更野的方案：**Cron Trigger 定时导出全库，打包成 SQL 文件发到 Telegram 频道**。

核心逻辑不到 60 行：

```js
export default {
  async scheduled(controller, env) {
    const dumps = [];
    for (const t of ["settings", "files", "index_operations"]) {
      const r = await env.DB.prepare(`SELECT * FROM ${t}`).all();
      dumps.push({ table: t, rows: r.results });
    }
    // 拼 INSERT 语句 → FormData 包成 SQL 文件
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendDocument`, {
      method: "POST",
      body: form,
    });
  },
};
```

wrangler.toml 里一行 `[triggers] crons = ["0 21 * * *"]`，每天北京时间凌晨 5 点，备份包准时出现在 TG 频道里。恢复时把 SQL 重放一遍即可。Telegram 频道当备份仓库意外地好用：无限容量、自带客户端、天然异地冗余。

## 五、知识库 RAG：Workers AI + Vectorize

想要个"第二大脑"API：随手丢句子进去，需要的时候语义检索出来。用 Workers AI 的 embedding 模型 + Vectorize 向量库，一个 Worker 搞定，三个端点：

```bash
# 写入
curl -X POST $KB_API/ingest -H "Authorization: Bearer $TOKEN" \
  -d '{"texts": ["Vectorize 是向量数据库，用于语义检索"]}'

# 查询
curl -X POST $KB_API/query -H "Authorization: Bearer $TOKEN" \
  -d '{"q": "免费存储哪家强", "topK": 3}'
```

实测中文检索效果不错——查询"免费存储哪家强"，正确召回"R2 是对象存储，免费 10GB"那条，得分 0.68。embedding 用的 `bge-base-en-v1.5`（768 维），虽然是个英文为主的模型但对中文短文本够用了，后面可以考虑换 `bge-m3`。

## 六、截图 API：Browser Rendering

这个最好玩。Cloudflare 给每个 Worker 提供了无头浏览器绑定，装上 `@cloudflare/playwright` 就能在边缘节点开 Chrome：

```
GET /shot?url=https://example.com&w=1280&h=720&full=true
```

返回 PNG。本文第二节那张架构图旁边的登录墙截图，就是用它自己截的自己——有点递归的味道。

唯一的坑：新版 `@cloudflare/playwright` 要求 `compatibility_date >= 2025-09-15`，否则运行时报 `fs.mkdtemp is not implemented`（旧版 polyfill 没有原生 fs）。这个报错在 issue 区坑了很多人。

## 七、邮箱别名：Email Routing

域名本来就托管在 Cloudflare，开 Email Routing 是免费的。我的用法：

- **catch-all → 收信 Worker**：任意 `*@miracle.us.ci` 都进临时邮箱服务，注册不重要的网站随便编地址
- **指定别名直转 Gmail**：重要地址单独建转发规则，直达真实邮箱

好处是每个网站用不同别名，哪天收到垃圾邮件看收件地址就知道是谁泄露的，直接拉黑那个别名。

## 八、额度对账单

| 资源 | 免费限额 | 我的使用量 |
|------|---------|-----------|
| Workers 请求 | 10 万/天 | < 500/天 |
| D1 存储 | 5 GB | < 5 MB |
| KV | 10 万读/天 | 极少 |
| Workers AI | 免费 neurons 档 | 每张图上传打一次标 |
| Browser Rendering | 免费时长档 | 按需截图 |
| Email Routing | 无限别名 | 自用 |

结论：个人规模下免费套餐根本用不完，放心造。

## 九、安全清单

自部署服务暴露公网，这几条是底线：

1. **所有非只读端点带鉴权**——图床上传要认证码，RAG 和截图 API 用 Bearer Token，Token 只存在 wrangler.toml / Secrets，绝不进 Git 公开仓库
2. **限速前置**——认证码防不住泄露，按 IP 的日限额是最后一道闸
3. **备份与主库分离**——备份在 Telegram，即使 Cloudflare 账号炸了数据还在
4. **最小暴露面**——管理后台路径不开自定义域，workers.dev 默认域仅自己使用

至此，Cloudflare 账号里能白嫖的服务基本盘完了。剩下的 Pages Functions、Queues、Durable Objects 等，等有真实需求再说。
