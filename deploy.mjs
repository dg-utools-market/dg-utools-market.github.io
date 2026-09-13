// 一键更新 uTools 插件市场镜像：重新抓取官网全量数据 → 重建 index.html → 提交推送（自动触发 Pages 部署）
// 用法：node deploy.mjs    （全程约 5-10 分钟，取决于网络）
// 零依赖：只用 node 内置模块和全局 fetch

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SITEMAP_URL = 'https://www.u-tools.cn/sitemap.xml';
const DATA_DIR = new URL('./data/', import.meta.url);
const SITEMAP = new URL('./data/sitemap.xml', import.meta.url);
const PLUGINS = new URL('./data/plugins.jsonl', import.meta.url);
const PLUGINS_OLD = new URL('./data/plugins.old.jsonl', import.meta.url);

// 小工具：带步骤序号的日志 + 失败即停
let step = 0;
const log = msg => console.log(`\n[步骤 ${++step}] ${msg}`);
const die = msg => { console.error(`\n✖ ${msg}`); process.exit(1); };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' }); // 子脚本输出直接透传，便于看爬取进度
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} 退出码 ${r.status}，已中止（未提交未推送）`);
};

// —— 1. 拉最新 sitemap：不重拉就发现不了新上架的插件 ——
log('拉取官网最新 sitemap…');
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const xml = await fetch(SITEMAP_URL, { signal: AbortSignal.timeout(30000) }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });
  if (!xml.includes('plugins/detail')) die('sitemap 内容异常（没有插件详情页），已中止');
  fs.writeFileSync(SITEMAP, xml);
  console.log(`  已保存，共 ${fs.statSync(SITEMAP).size} 字节`);
} catch (e) { die(`拉取 sitemap 失败：${e.message}`); }

// —— 2. 轮转旧数据：备份后清空 plugins.jsonl ——
// 必须清空：crawl-details 是断点续抓设计，旧文件在就会跳过已有插件，
// 下载量/评分永远不刷新、已下架插件永远残留。旧文件留作行数护栏的参照。
log('轮转旧数据（备份 → 清空）…');
let oldCount = 0;
if (fs.existsSync(PLUGINS)) {
  fs.copyFileSync(PLUGINS, PLUGINS_OLD);
  oldCount = fs.readFileSync(PLUGINS_OLD, 'utf8').split('\n').filter(l => l.trim()).length;
  fs.writeFileSync(PLUGINS, '');
  console.log(`  旧数据 ${oldCount} 条已备份到 data/plugins.old.jsonl`);
} else {
  console.log('  无旧数据，跳过');
}

// —— 3. 依次跑三个脚本：抓分类 → 抓详情 → 合成页面 ——
log('抓取分类页（约 1 分钟）…');
run('node', ['crawl-topics.mjs']);
log('抓取全部插件详情（约 4-8 分钟，进度每 200 个打印一次）…');
run('node', ['crawl-details.mjs']);
log('重建 index.html…');
run('node', ['build-html.mjs']);

// —— 4. 护栏：抓取不完整就不许发布（防半截镜像上线）——
const newCount = fs.readFileSync(PLUGINS, 'utf8').split('\n').filter(l => l.trim()).length;
console.log(`\n本轮抓取：${newCount} 条（上轮 ${oldCount} 条）`);
if (oldCount > 0 && newCount < oldCount * 0.8) {
  die(`新数据不足上轮的 80%（${newCount}/${oldCount}），疑似官网改版或网络异常，已中止（未提交未推送）`);
}

// —— 5. 提交推送：push 到 main 自动触发 GitHub Actions 部署 Pages ——
log('提交并推送…');
const today = new Date().toISOString().slice(0, 10);
run('git', ['add', '-A']);
// 空提交保护：数据没变化就不推（git commit 失败即中止）
run('git', ['commit', '-m', `data: 刷新插件市场快照 ${today}（${newCount} 个插件）`]);
run('git', ['push']);

console.log(`
✔ 更新完成：${newCount} 个插件已推送
  GitHub Actions 正在部署，约 1-2 分钟后生效：
  https://dg-utools-market.github.io/`);
