// 并发抓取 uTools 插件市场全部插件详情页（sitemap 里的 /plugins/detail/xxx/ 页面）
// 每页 SSR 直出 __NEXT_DATA__ → props.pageProps.detail.detailInfos，包含完整插件信息
// 输出 data/plugins.jsonl（一行一个插件），支持断点续抓（重跑自动跳过已抓的）

import fs from 'node:fs';
import readline from 'node:readline';

const SITEMAP = new URL('./data/sitemap.xml', import.meta.url);
const OUT = new URL('./data/plugins.jsonl', import.meta.url);
const CONCURRENCY = 8;      // 并发数：对站点压力小、总耗时约几分钟
const RETRY = 3;

// —— 待抓清单：sitemap 里的详情页 URL，去掉域名只留 slug 做唯一键 ——
const xml = fs.readFileSync(SITEMAP, 'utf8');
// 注意做 XML 实体反转义（&amp; → &）：sitemap 里带 & 的插件名会被转义，不还原就拼错 URL
const unescapeXml = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const allSlugs = [...xml.matchAll(/<loc>https:\/\/www\.u-tools\.cn\/plugins\/detail\/([^<]+?)\/?<\/loc>/g)]
  .map(m => unescapeXml(decodeURIComponent(m[1])));
console.log(`sitemap 共 ${allSlugs.length} 个插件详情页`);

// —— 断点续抓：已写进 jsonl 的 slug 直接跳过 ——
const done = new Set();
if (fs.existsSync(OUT)) {
  const rl = readline.createInterface({ input: fs.createReadStream(OUT) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).slug); } catch {}
  }
}
console.log(`已有 ${done.size} 个，还需抓 ${allSlugs.length - done.size} 个`);

// 追加模式写入，每抓到一个立刻落盘，中断不丢进度
const stream = fs.createWriteStream(OUT, { flags: 'a' });

let ok = 0, fail = 0, seq = done.size;

// 抓单个插件：带重试，解析出精简字段（够浏览用，去掉下载地址等无用字段）
async function fetchOne(slug) {
  const url = `https://www.u-tools.cn/plugins/detail/${encodeURIComponent(slug)}/`;
  for (let i = 0; i <= RETRY; i++) {
    try {
      const html = await fetch(url, { signal: AbortSignal.timeout(20000) }).then(r => r.text());
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      if (!m) throw new Error('无 __NEXT_DATA__');
      const d = JSON.parse(m[1])?.props?.pageProps?.detail?.detailInfos;
      if (!d?.plugin_name) throw new Error('数据为空');
      const rec = {
        slug,
        id: d.id,
        name: d.plugin_name,          // 展示名（多为中文）
        devName: d.name,              // 开发者起的内部名（英文）
        desc: d.description,          // 一句话简介
        introduce: d.introduce,       // 详细介绍
        author: d.author,
        downloads: d.downloads,
        rating: d.rating,
        voters: d.voters,
        size: d.size,
        version: d.version,
        logo: d.logo,
        previews: d.previews || [],
        paid: !!(d.rechargeable || d.iap),  // 是否付费插件
        platform: d.platform,         // null 表示全平台
      };
      stream.write(JSON.stringify(rec) + '\n');
      return true;
    } catch (e) {
      if (i === RETRY) return false;
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // 退避后重试
    }
  }
}

// —— 简单并发池：队列里取任务，8 个 worker 同时干活 ——
const queue = allSlugs.filter(s => !done.has(s));
async function worker(wid) {
  while (queue.length) {
    const slug = queue.shift();
    const success = await fetchOne(slug);
    success ? ok++ : fail++;
    if (++seq % 200 === 0) console.log(`进度 ${seq}/${allSlugs.length}（失败 ${fail}）`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

stream.end();
console.log(`\n完成：成功 ${ok}，失败 ${fail}，总计落盘 ${seq} 条 → ${OUT.pathname}`);
if (fail > 0) console.log('有失败的可以重跑本脚本，会自动续抓遗漏的');
