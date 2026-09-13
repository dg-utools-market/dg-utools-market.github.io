# dg-utools-market

[uTools 插件市场](https://www.u-tools.cn/plugins/) 的全量镜像浏览页：把官方市场 4000+ 个插件抓下来，做成一个可以**搜索、筛选、排序**的单页浏览工具。

**在线使用**：<https://dg-utools-market.github.io/>

## 为什么做这个

uTools 官方插件市场没有按下载量排序、没有免费/付费筛选、同类插件也难以对比——想从四千多个插件里挑出对自己有用的，逐页翻很费劲。这个镜像页把这些浏览能力补齐了。

## 页面功能

- **搜索**：按名称 / 简介 / 作者全文匹配
- **筛选排序**：分类（官网专题）、免费 / 付费、下载量 / 评分 / 名称
- **详情**：作者、下载量、评分、大小、版本、详细介绍、预览图（点击放大）、官方页面直达
- **想装清单**：看到心动的点「加入想装」，存在浏览器 localStorage（关页面不丢），最后导出 Markdown 清单照单安装

## 数据来源与声明

- 数据为 uTools 官网的公开页面快照，页面顶栏标注「数据截至」日期
- 插件图标与预览图直接引用官方 CDN（`res.u-tools.cn`），本站不存储图片
- 下载量、评分等数字以官网实时数据为准
- 插件及相关资料的版权归原作者与 uTools 平台所有；本仓库仅为个人学习用途的浏览工具，如有侵权请联系删除

## 如何更新数据

```bash
node deploy.mjs
```

一条命令完成全流程：拉最新 sitemap → 重抓分类页与全部插件详情（约 5-10 分钟）→ 重建 `index.html` → 提交推送。推送到 `main` 会自动触发 GitHub Actions 部署 GitHub Pages，约 1-2 分钟后线上生效。

脚本内置护栏：新抓取条数不足上轮 80% 时判定抓取异常，中止提交，防止半截数据上线。

## 目录结构

```
├── index.html          # 浏览页（构建产物，Pages 直接发布它）
├── crawl-topics.mjs    # 爬虫：抓官网分类/专题页 → data/topics.json
├── crawl-details.mjs   # 爬虫：并发抓全部插件详情页 → data/plugins.jsonl（支持断点续抓）
├── build-html.mjs      # 构建：合并数据 → index.html（自包含单文件）
├── deploy.mjs          # 一键更新：sitemap → 轮转数据 → 爬虫 → 构建 → 提交推送
└── data/               # 抓取的原始数据（gitignore，不入库）
```

## 相关文章

被博客文章 [《Mac 效率工具 uTools》](https://dgblog.top/posts/utools/utools) 的「插件市场」章节引用。
