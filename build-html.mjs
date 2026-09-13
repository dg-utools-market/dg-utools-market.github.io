// 把 data/plugins.jsonl + data/topics.json 合并生成一个自包含的浏览页 index.html
// （部署在 GitHub Pages 仓库根路径，https://dg-utools-market.github.io/ 直接打开）
// 用法：node build-html.mjs && open index.html
// 页面功能：搜索 / 分类筛选 / 排序 / 插件详情（介绍+预览图）/「想装」勾选（localStorage）/ 导出清单

import fs from 'node:fs';

const PLUGINS = new URL('./data/plugins.jsonl', import.meta.url);
const TOPICS = new URL('./data/topics.json', import.meta.url);
const OUT = new URL('./index.html', import.meta.url);

// 数据快照日期：构建当天，展示在页面顶栏（读者据此判断数据新旧）
const AS_OF = new Date().toISOString().slice(0, 10);

// —— 读入插件明细（jsonl 一行一条；断点续抓可能产生重复行，按 slug 去重保留最后一条）——
const uniq = new Map();
for (const l of fs.readFileSync(PLUGINS, 'utf8').split('\n').filter(l => l.trim())) {
  const rec = JSON.parse(l);
  uniq.set(rec.slug, rec);
}
const plugins = [...uniq.values()];

// —— 读入分类，建立 devName → 分类名列表 的映射 ——
const topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8'))
  .filter(t => t.plugins.length > 0)                       // 0 插件的是功能介绍页，不参与
  .map(t => ({ ...t, title: t.title.replace(/^uTools专题\s*-\s*/, '').trim() })); // 去掉标题前缀
const catMap = new Map(); // devName -> [分类名...]
for (const t of topics) {
  for (const dev of t.plugins) {
    if (!catMap.has(dev)) catMap.set(dev, []);
    catMap.get(dev).push(t.title);
  }
}

// —— 组装进页面的精简数据（控制体积：introduce 截断、预览图最多 6 张）——
const catalog = plugins.map(p => ({
  s: p.slug,
  n: p.name,
  d: p.desc || '',
  i: (p.introduce || '').slice(0, 2000),
  a: p.author || '',
  dl: p.downloads || 0,
  r: p.rating || 0,
  v: p.voters || 0,
  z: p.size || '',
  ver: p.version || '',
  g: p.logo || '',
  pv: (p.previews || []).slice(0, 6),
  paid: !!p.paid,
  c: catMap.get(p.devName) || [],
}));

console.log(`插件 ${catalog.length} 个，分类 ${topics.length} 个，含分类信息 ${[...catMap.keys()].length} 个`);

// 注意：下面模板里的输出 JS 用的是普通字符串拼接（不含反引号），
// 且文本部分的 \\n 等转义经模板字面量处理后会原样落进 HTML
fs.writeFileSync(OUT, `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<!-- 图片全走 res.u-tools.cn CDN：不带 Referer 请求，避开可能的防盗链校验（本地 file:// 能显示是无 Referer 的巧合） -->
<meta name="referrer" content="no-referrer">
<title>uTools 插件市场全量浏览（${catalog.length} 个）</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f6fa; color: #2c3e50; display: flex; flex-direction: column; height: 100vh; }

  /* 顶栏 */
  header { background: #fff; border-bottom: 1px solid #e4e7ed; padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 17px; }
  header .stats { color: #909399; font-size: 13px; }
  header .actions { margin-left: auto; display: flex; gap: 8px; }
  .btn { border: 1px solid #dcdfe6; background: #fff; border-radius: 6px; padding: 6px 14px; font-size: 13px; cursor: pointer; text-decoration: none; color: #2c3e50; display: inline-block; }
  .btn:hover { border-color: #6c63ff; color: #6c63ff; }
  .btn.primary { background: #6c63ff; border-color: #6c63ff; color: #fff; }
  .btn.on { background: #6c63ff; border-color: #6c63ff; color: #fff; }

  /* 主体：左列表 + 右详情 */
  main { flex: 1; display: flex; overflow: hidden; }
  #side { width: 380px; min-width: 320px; background: #fff; border-right: 1px solid #e4e7ed; display: flex; flex-direction: column; }
  #filters { padding: 10px; border-bottom: 1px solid #e4e7ed; display: flex; flex-direction: column; gap: 8px; }
  #filters input, #filters select { border: 1px solid #dcdfe6; border-radius: 6px; padding: 7px 10px; font-size: 13px; width: 100%; background: #fff; }
  #filters input:focus, #filters select:focus { outline: none; border-color: #6c63ff; }
  .row2 { display: flex; gap: 8px; }
  #list { flex: 1; overflow-y: auto; }
  .item { display: flex; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f2f5; align-items: flex-start; }
  .item:hover { background: #f5f6fa; }
  .item.active { background: #eef0ff; }
  .item img { width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0; margin-top: 2px; }
  .item .meta { flex: 1; min-width: 0; }
  .item .nm { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .item .nm .pick { color: #e6a23c; font-size: 12px; }
  .item .ds { font-size: 12px; color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
  .item .nums { font-size: 11px; color: #c0c4cc; margin-top: 3px; }
  .badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #fef0f0; color: #f56c6c; flex-shrink: 0; }
  .badge.free { background: #f0f9eb; color: #67c23a; }

  /* 详情区 */
  #detail { flex: 1; overflow-y: auto; padding: 24px 28px; }
  .d-head { display: flex; gap: 16px; align-items: flex-start; }
  .d-head img.logo { width: 72px; height: 72px; border-radius: 14px; }
  .d-title { font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .d-desc { color: #606266; margin-top: 6px; font-size: 14px; }
  .d-facts { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 12px; font-size: 13px; color: #909399; }
  .d-facts b { color: #2c3e50; }
  .d-ops { margin: 18px 0 0; display: flex; gap: 10px; }
  .cats { margin: 10px 0 0; display: flex; gap: 6px; flex-wrap: wrap; }
  .cats span { background: #eef0ff; color: #6c63ff; font-size: 12px; padding: 2px 10px; border-radius: 10px; }
  h3.sec { margin: 22px 0 10px; font-size: 15px; }
  #intro { white-space: pre-wrap; font-size: 14px; line-height: 1.8; color: #45526b; background: #fff; border-radius: 10px; padding: 16px; border: 1px solid #e4e7ed; }
  .previews { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
  .previews img { width: 100%; border-radius: 8px; border: 1px solid #e4e7ed; cursor: zoom-in; }
  .empty { color: #909399; padding: 60px; text-align: center; }
  #loadmore { margin: 10px auto; display: block; }
  #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: none; align-items: center; justify-content: center; cursor: zoom-out; z-index: 9; }
  #lightbox img { max-width: 94vw; max-height: 94vh; }
</style>
</head>
<body>
<header>
  <h1>uTools 插件市场</h1>
  <span class="stats" id="stats"></span>
  <div class="actions">
    <button class="btn" id="onlyPick">只看想装</button>
    <button class="btn primary" id="export">导出想装清单</button>
  </div>
</header>
<main>
  <div id="side">
    <div id="filters">
      <input id="q" type="search" placeholder="搜索名称 / 简介 / 作者…">
      <div class="row2">
        <select id="cat"></select>
        <select id="sort">
          <option value="dl">按下载量</option>
          <option value="r">按评分</option>
          <option value="n">按名称</option>
        </select>
      </div>
      <div class="row2">
        <select id="fee">
          <option value="all">全部（免费+付费）</option>
          <option value="free">仅免费</option>
          <option value="paid">仅付费</option>
        </select>
        <select id="pick">
          <option value="all">勾选状态</option>
          <option value="yes">已勾想装</option>
          <option value="no">未勾</option>
        </select>
      </div>
    </div>
    <div id="list"></div>
  </div>
  <div id="detail"><div class="empty">从左侧选一个插件查看详情</div></div>
</main>
<div id="lightbox"><img></div>

<script id="catalog" type="application/json">${JSON.stringify(catalog).replace(/<\//g, '<\\/')}</script>
<script>
// ================== 元素引用（统一用 $ 取，避免依赖 id 全局变量） ==================
const $ = id => document.getElementById(id);
const listEl = $('list'), detailEl = $('detail'), statsEl = $('stats');
const q = $('q'), catSel = $('cat'), sortSel = $('sort'), feeSel = $('fee'), pickSel = $('pick');
const onlyPickBtn = $('onlyPick'), exportBtn = $('export'), lightboxEl = $('lightbox');

// ================== 数据准备 ==================
const PLUGINS = JSON.parse($('catalog').textContent);
const PICK_KEY = 'utools-market-picks'; // localStorage 键：想装清单（slug 数组）
let picks = new Set(JSON.parse(localStorage.getItem(PICK_KEY) || '[]'));

// 分类下拉：全部分类 + 各专题 + 未分类
const cats = [...new Set(PLUGINS.flatMap(p => p.c))].sort((a, b) => a.localeCompare(b, 'zh'));
catSel.innerHTML = ['<option value="">全部分类</option>', ...cats.map(c => '<option>' + c + '</option>'), '<option value="__none__">（未分类）</option>'].join('');

// ================== 过滤 + 排序 ==================
let shown = [];      // 当前条件下可见的插件
let rendered = 0;    // 已渲染条数（分批渲染用）
const CHUNK = 120;   // 每批渲染条数，避免一次塞 4000+ 个 DOM 卡顿

function apply() {
  const kw = q.value.trim().toLowerCase();
  const cat = catSel.value, sort = sortSel.value, fee = feeSel.value, pick = pickSel.value;
  shown = PLUGINS.filter(p =>
    (!kw || (p.n + p.d + p.i + p.a).toLowerCase().includes(kw)) &&
    (!cat || (cat === '__none__' ? p.c.length === 0 : p.c.includes(cat))) &&
    (fee === 'all' || (fee === 'paid') === p.paid) &&
    (pick === 'all' || (pick === 'yes') === picks.has(p.s))
  );
  if (sort === 'dl') shown.sort((a, b) => b.dl - a.dl);
  else if (sort === 'r') shown.sort((a, b) => b.r - a.r || b.dl - a.dl);
  else shown.sort((a, b) => a.n.localeCompare(b.n, 'zh'));
  rendered = 0;
  listEl.innerHTML = '';
  renderChunk();
  statsEl.textContent = '数据截至 ${AS_OF} · 共 ' + PLUGINS.length + ' 个插件 · 当前 ' + shown.length + ' 个 · 想装 ' + picks.size + ' 个';
}

function renderChunk() {
  const frag = document.createDocumentFragment();
  const end = Math.min(rendered + CHUNK, shown.length);
  for (; rendered < end; rendered++) {
    const p = shown[rendered];
    const div = document.createElement('div');
    div.className = 'item' + (cur && cur.s === p.s ? ' active' : '');
    div.dataset.slug = p.s;
    div.innerHTML =
      '<img loading="lazy" src="' + p.g + '">' +
      '<div class="meta"><div class="nm">' + (picks.has(p.s) ? '<span class="pick">★</span>' : '') + esc(p.n) +
      (p.paid ? '<span class="badge">付费</span>' : '<span class="badge free">免费</span>') + '</div>' +
      '<div class="ds">' + esc(p.d) + '</div>' +
      '<div class="nums">↓' + fmt(p.dl) + (p.r ? ' · ★' + p.r : '') + '</div></div>';
    div.onclick = () => select(p);
    frag.appendChild(div);
  }
  listEl.appendChild(frag);
  // 列表没渲染完时，底部给一个「继续加载」按钮
  const old = $('loadmore');
  if (old) old.remove();
  if (rendered < shown.length) {
    const b = document.createElement('button');
    b.id = 'loadmore'; b.className = 'btn'; b.textContent = '加载更多（剩 ' + (shown.length - rendered) + '）';
    b.onclick = renderChunk;
    listEl.appendChild(b);
  }
}

// ================== 详情展示 ==================
let cur = null;
function select(p) {
  cur = p;
  document.querySelectorAll('.item.active').forEach(e => e.classList.remove('active'));
  const row = document.querySelector('.item[data-slug="' + CSS.escape(p.s) + '"]');
  if (row) { row.classList.add('active'); row.scrollIntoView({ block: 'nearest' }); }
  detailEl.innerHTML =
    '<div class="d-head"><img class="logo" src="' + p.g + '">' +
    '<div><div class="d-title">' + esc(p.n) + (p.paid ? '<span class="badge">付费</span>' : '<span class="badge free">免费</span>') + '</div>' +
    '<div class="d-desc">' + esc(p.d) + '</div>' +
    '<div class="d-facts"><span>作者 <b>' + esc(p.a) + '</b></span><span>下载 <b>' + fmt(p.dl) + '</b></span>' +
    '<span>评分 <b>' + (p.r || '—') + '</b>（' + p.v + ' 人）</span><span>大小 <b>' + esc(p.z) + '</b></span><span>版本 <b>' + esc(p.ver) + '</b></span></div>' +
    (p.c.length ? '<div class="cats">' + p.c.map(c => '<span>' + esc(c) + '</span>').join('') + '</div>' : '') +
    '<div class="d-ops"><button class="btn primary" id="togglePick">' + (picks.has(p.s) ? '★ 已加入想装' : '☆ 加入想装') + '</button>' +
    '<a class="btn" target="_blank" href="https://www.u-tools.cn/plugins/detail/' + encodeURIComponent(p.s) + '/">官方页面 ↗</a></div>' +
    '</div></div>' +
    (p.i ? '<h3 class="sec">详细介绍</h3><div id="intro">' + esc(p.i) + '</div>' : '') +
    (p.pv.length ? '<h3 class="sec">预览图（点击放大）</h3><div class="previews">' + p.pv.map(u => '<img loading="lazy" src="' + u + '">').join('') + '</div>' : '');
  $('togglePick').onclick = () => togglePick(p);
  detailEl.querySelectorAll('.previews img').forEach(img => img.onclick = () => lightboxShow(img.src));
}

// 勾选/取消「想装」：写 localStorage 并刷新列表与详情
function togglePick(p) {
  picks.has(p.s) ? picks.delete(p.s) : picks.add(p.s);
  localStorage.setItem(PICK_KEY, JSON.stringify([...picks]));
  select(p);
  apply();
}

// ================== 顶栏操作 ==================
onlyPickBtn.onclick = () => {
  pickSel.value = (pickSel.value === 'yes') ? 'all' : 'yes';
  onlyPickBtn.classList.toggle('on', pickSel.value === 'yes');
  apply();
};
exportBtn.onclick = () => {
  // 导出为 Markdown：复制到剪贴板 + 触发下载
  const lines = [...picks].map(s => PLUGINS.find(p => p.s === s)).filter(Boolean)
    .sort((a, b) => b.dl - a.dl)
    .map(p => '- **' + p.n + '**（↓' + fmt(p.dl) + (p.paid ? '，付费' : '') + '）— ' + p.d + '\\n  https://www.u-tools.cn/plugins/detail/' + encodeURIComponent(p.s) + '/');
  const text = '# uTools 想装清单（' + lines.length + ' 个）\\n\\n' + lines.join('\\n');
  navigator.clipboard.writeText(text).then(() => alert('清单已复制到剪贴板（' + lines.length + ' 个）'), () => {});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = 'utools-想装清单.md'; a.click();
};

// ================== 工具函数 ==================
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fmt(n) { return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }
lightboxEl.onclick = () => lightboxEl.style.display = 'none';
// Esc 也能关闭预览放大层（此前只能点击关闭）
document.addEventListener('keydown', e => { if (e.key === 'Escape') lightboxEl.style.display = 'none'; });
function lightboxShow(src) { lightboxEl.querySelector('img').src = src; lightboxEl.style.display = 'flex'; }

// ================== 事件绑定 + 启动 ==================
let deb;
q.oninput = () => { clearTimeout(deb); deb = setTimeout(apply, 200); };  // 搜索防抖
[catSel, sortSel, feeSel, pickSel].forEach(el => el.onchange = apply);
apply();
</script>
</body>
</html>`);

console.log(`已生成 ${OUT.pathname}（${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB）`);
console.log('用浏览器打开即可：open index.html');
