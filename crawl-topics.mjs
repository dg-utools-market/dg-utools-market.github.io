// 抓取 uTools 插件市场的 64 个分类（topic）页
// 每个页面都是 SSR 直出的，分类下的插件列表内嵌在 __NEXT_DATA__ JSON 里
// 输出 data/topics.json：[{ id, title, plugins: [插件英文名...] }]

import fs from 'node:fs';

const SITEMAP = new URL('./data/sitemap.xml', import.meta.url);
const OUT = new URL('./data/topics.json', import.meta.url);

// —— 第一步：从 sitemap 提取所有 topic 页的 URL ——
const xml = fs.readFileSync(SITEMAP, 'utf8');
const topicUrls = [...xml.matchAll(/<loc>(https:\/\/www\.u-tools\.cn\/plugins\/topic\/(\d+)\/)<\/loc>/g)]
  .map(m => ({ url: m[1], id: Number(m[2]) }));
console.log(`sitemap 里共 ${topicUrls.length} 个分类页`);

// —— 第二步：逐个抓取（分类页数量少，串行 + 小延迟即可，对站点友好）——
const results = [];
for (const { url, id } of topicUrls) {
  try {
    const html = await fetch(url, { signal: AbortSignal.timeout(20000) }).then(r => r.text());
    // 页面标题形如「xxx - uTools」，用作分类名
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1]?.replace(/\s*-\s*uTools.*$/, '') || `topic-${id}`;
    // 插件列表藏在 __NEXT_DATA__ → topic.componentsList 里 component==='plugins' 的 items
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    const names = [];
    if (m) {
      const data = JSON.parse(m[1]);
      const comps = data?.props?.pageProps?.topic?.componentsList || [];
      for (const c of comps) {
        if (c.component === 'plugins') {
          for (const item of c.data.items || []) names.push(item.name);
        }
      }
    }
    results.push({ id, title, url, plugins: [...new Set(names)] });
    console.log(`[${results.length}/${topicUrls.length}] ${title} — ${names.length} 个插件`);
  } catch (e) {
    console.error(`topic ${id} 失败: ${e.message}`);
    results.push({ id, title: `topic-${id}`, url, plugins: [], error: e.message });
  }
  await new Promise(r => setTimeout(r, 300)); // 每个请求间隔 300ms
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(`\n完成：${results.length} 个分类 → ${OUT.pathname}`);
