# Sonner 交互复刻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用纯 HTML/CSS/JS（零依赖、双击 `file://` 可运行）完整复刻 Sonner 的 toast 交互。

**Architecture:** 一个 `.toaster` 固定容器 + 若干 `position:absolute` 的 `.toast`。JS 只维护 toast 数组并给每条写少量 CSS 自定义属性（`--index` / `--toasts-before` / `--front` / `--toast-height` / `--before-height` / `--y`），所有位移、缩放、堆叠数学交给 CSS `calc()`，过渡交给 CSS `transition`。收起⇄展开靠容器上的 `data-expanded` 翻转重算 calc。

**Tech Stack:** 原生 DOM API、CSS custom properties + `calc()` + transitions、Pointer Events。无构建、无 npm 依赖、不使用 ES module（确保 `file://` 双击可运行，全局挂 `window.toast`）。

**测试约定（重要，本项目特例）:** 此项目是视觉/交互 demo 且要求零依赖，无法引入 Jest/Vitest。因此：
- **纯逻辑**（计时"剩余时间"模型、options 合并）用 `tests.html` 里一个手写 `assert` 跑红绿，用浏览器工具读 console 判定。
- **视觉/交互行为**（堆叠、展开、进退场、拖拽、位置）用浏览器工具打开 `file://` 截图 + 读 console（必须零报错）作为验收。
- 验证统一用 `/browse` 工具。约定二进制：`B="$HOME/.claude/skills/gstack/browse/dist/browse"`，页面：`file:///Users/lingkanwang/sonner-demo/index.html`，测试页：`file:///Users/lingkanwang/sonner-demo/tests.html`。

**提交约定:** 每个 Task 末尾提交一次。commit message 末尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

```
~/sonner-demo/
  index.html      # demo 页：控制面板 + 引入 sonner.css/sonner.js + 内联脚本接按钮
  sonner.css      # toast 样式 + 堆叠模型（calc 全在这）
  sonner.js       # toast 引擎，IIFE，暴露全局 window.toast
  tests.html      # 零依赖断言页，仅测纯逻辑（计时模型 / options 合并）
  docs/superpowers/...
```

- `sonner.js` 是"库"：状态数组 `toasts`、`CONFIG`、`ensureToaster()`、`createToast()`、`sync()`、计时、指针拖拽、API。
- `sonner.css` 是全部表现层；JS 只写变量，不写内联 transform。
- `index.html` 是"用库的 app"：控制面板 + wiring。

---

## Task 1: 项目骨架（文件 + CONFIG + 容器挂载 + 全局 toast 桩）

**Files:**
- Create: `sonner.js`
- Create: `sonner.css`
- Create: `index.html`

- [ ] **Step 1: 写 `sonner.css` 基础骨架**

```css
/* sonner.css — toast 样式 + 堆叠模型 */
:root {
  --sonner-width: 356px;
}

.toaster {
  position: fixed;
  z-index: 999999;
  width: var(--sonner-width);
  /* --gap / --offset / --y 由 JS 写入 */
  list-style: none;
  margin: 0;
  padding: 0;
  outline: none;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 6 个位置锚点 */
.toaster[data-position="bottom-right"]  { bottom: var(--offset); right: var(--offset); }
.toaster[data-position="bottom-left"]   { bottom: var(--offset); left: var(--offset); }
.toaster[data-position="top-right"]     { top: var(--offset);    right: var(--offset); }
.toaster[data-position="top-left"]      { top: var(--offset);    left: var(--offset); }
.toaster[data-position="bottom-center"] { bottom: var(--offset); left: 50%; transform: translateX(-50%); }
.toaster[data-position="top-center"]    { top: var(--offset);    left: 50%; transform: translateX(-50%); }

/* toast 占满容器宽度，钉在靠屏幕边的一侧 */
.toast {
  position: absolute;
  left: 0;
  right: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  background: var(--toast-bg, #fff);
  color: var(--toast-fg, #18181b);
  border: 1px solid var(--toast-border, rgba(0,0,0,0.08));
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  font-size: 13px;
  line-height: 1.5;
}
.toaster[data-position^="bottom"] .toast { bottom: 0; }
.toaster[data-position^="top"]    .toast { top: 0; }

.toast__content { flex: 1 1 auto; min-width: 0; }
.toast__title { font-weight: 500; }
.toast__desc  { margin-top: 2px; opacity: 0.7; }
```

- [ ] **Step 2: 写 `sonner.js` 骨架（CONFIG + 容器 + 全局 toast 桩）**

```js
/* sonner.js — 零依赖 toast 引擎。挂载 window.toast。 */
(function () {
  'use strict';

  // ---- 全局默认配置 ----
  var CONFIG = {
    position: 'bottom-right',
    theme: 'light',
    richColors: false,
    expand: false,        // true = 默认展开；false = 仅 hover 展开
    visibleToasts: 3,     // 收起态最多可见条数
    gap: 14,              // 展开态每条之间的间距 px
    offset: 24,           // 容器距屏幕边缘 px
    closeButton: false,
    duration: 4000        // 默认自动消失毫秒；loading 为 Infinity
  };

  var toaster = null;       // .toaster 元素
  var toasts = [];          // 状态数组，index 0 = 最新/最前
  var counter = 0;          // 自增 id

  // 顶部/底部位置的方向系数：bottom = -1（向上堆叠），top = +1（向下堆叠）
  function yDir() { return CONFIG.position.indexOf('top') === 0 ? 1 : -1; }

  function ensureToaster() {
    if (toaster) return toaster;
    toaster = document.createElement('ol');
    toaster.className = 'toaster';
    toaster.setAttribute('aria-live', 'polite');
    toaster.setAttribute('tabindex', '-1');
    applyToasterAttrs();
    document.body.appendChild(toaster);
    return toaster;
  }

  function applyToasterAttrs() {
    if (!toaster) return;
    toaster.dataset.position = CONFIG.position;
    toaster.dataset.theme = CONFIG.theme;
    toaster.dataset.expanded = CONFIG.expand ? 'true' : 'false';
    toaster.dataset.richColors = CONFIG.richColors ? 'true' : 'false';
    toaster.style.setProperty('--gap', CONFIG.gap + 'px');
    toaster.style.setProperty('--offset', CONFIG.offset + 'px');
    toaster.style.setProperty('--y', String(yDir()));
  }

  // ---- 对外 API（桩，后续 Task 填充） ----
  function toast(message, options) {
    return addToast(message, options || {}, 'default');
  }
  toast.configure = function (partial) {
    for (var k in partial) if (partial.hasOwnProperty(k)) CONFIG[k] = partial[k];
    ensureToaster();
    applyToasterAttrs();
    sync();
  };
  toast.dismiss = function (id) { dismiss(id); };

  // 占位：后续 Task 实现
  function addToast() { /* Task 2 */ }
  function dismiss() { /* Task 5 */ }
  function sync() { /* Task 3 */ }

  // 暴露
  window.toast = toast;

  // DOM 就绪后建容器
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureToaster);
  } else {
    ensureToaster();
  }
})();
```

- [ ] **Step 3: 写 `index.html` 外壳**

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sonner 复刻</title>
  <link rel="stylesheet" href="sonner.css">
  <style>
    body { margin: 0; min-height: 100vh; background: #fafafa; color: #18181b;
      font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif;
      display: flex; align-items: center; justify-content: center; }
    .panel { display: grid; gap: 12px; padding: 32px; max-width: 520px; }
    .panel h1 { font-size: 18px; margin: 0 0 8px; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; }
    button { font: inherit; padding: 8px 14px; border-radius: 8px;
      border: 1px solid rgba(0,0,0,0.12); background: #fff; cursor: pointer; }
    button:active { transform: scale(0.97); }
  </style>
</head>
<body>
  <main class="panel">
    <h1>Sonner 复刻 demo</h1>
    <div class="row">
      <button id="btn-default">默认 toast</button>
    </div>
  </main>

  <script src="sonner.js"></script>
  <script>
    document.getElementById('btn-default')
      .addEventListener('click', function () { window.toast('这是一条 toast'); });
  </script>
</body>
</html>
```

- [ ] **Step 4: 浏览器验证骨架**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B js "typeof window.toast"
$B js "document.querySelector('.toaster') ? 'toaster-mounted' : 'no-toaster'"
$B console --errors
```
Expected: `typeof window.toast` → `function`；`toaster-mounted`；console 无 error。

- [ ] **Step 5: Commit**

```bash
cd ~/sonner-demo
git add sonner.js sonner.css index.html
git commit -m "feat: project skeleton — CONFIG, toaster mount, global toast stub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 渲染一条基础 toast（默认类型）

**Files:**
- Modify: `sonner.js`（实现 `addToast` / `createToastEl` / 临时 `sync`）

- [ ] **Step 1: 实现 `addToast` + `createToastEl`，替换 Task 1 的 `addToast` 桩**

```js
// 替换 Task 1 中 function addToast() {} 桩：
function addToast(message, options, type) {
  ensureToaster();
  var id = options.id != null ? options.id : ++counter;
  // 若 id 已存在则更新（promise 原地变身用）
  var existing = find(id);
  var state = existing || { id: id, el: null, height: 0, timer: null,
    remaining: 0, startedAt: 0, mounted: false };
  state.type = type;
  state.message = message;
  state.description = options.description || '';
  state.duration = options.duration != null ? options.duration
    : (type === 'loading' ? Infinity : CONFIG.duration);
  state.action = options.action || null;
  state.cancel = options.cancel || null;
  state.icon = options.icon || null;

  if (!existing) {
    state.el = createToastEl(state);
    toaster.insertBefore(state.el, toaster.firstChild);
    toasts.unshift(state);          // 新的放到 index 0（最前）
  } else {
    renderToastContent(state);      // 复用 DOM，更新内容
  }
  sync();
  return id;
}

function find(id) {
  for (var i = 0; i < toasts.length; i++) if (toasts[i].id === id) return toasts[i];
  return null;
}

function createToastEl(state) {
  var li = document.createElement('li');
  li.className = 'toast';
  li.dataset.type = state.type;
  state.el = li;            // 先挂上，renderToastContent 依赖 state.el
  renderToastContent(state);
  return li;
}

function renderToastContent(state) {
  var el = state.el;
  if (!el) return;
  el.dataset.type = state.type;
  el.innerHTML =
    '<div class="toast__content">' +
      '<div class="toast__title"></div>' +
      (state.description ? '<div class="toast__desc"></div>' : '') +
    '</div>';
  el.querySelector('.toast__title').textContent = state.message;
  if (state.description) el.querySelector('.toast__desc').textContent = state.description;
}
```

- [ ] **Step 2: 临时 `sync`（仅设置 z-index，堆叠数学下个 Task 做）**

```js
// 替换 Task 1 中 function sync() {} 桩（本 Task 临时版）：
function sync() {
  for (var i = 0; i < toasts.length; i++) {
    var s = toasts[i];
    s.el.style.zIndex = String(toasts.length - i);
  }
}
```

- [ ] **Step 3: 浏览器验证：点按钮出现一条 toast**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-default"
$B js "document.querySelectorAll('.toast').length"
$B js "document.querySelector('.toast .toast__title').textContent"
$B screenshot /tmp/sonner-t2.png
$B console --errors
```
Expected: `.toast` 数量 `1`；标题文本 `这是一条 toast`；截图右下角出现一条卡片；无 error。用 Read 看 `/tmp/sonner-t2.png` 确认。

- [ ] **Step 4: Commit**

```bash
cd ~/sonner-demo
git add sonner.js
git commit -m "feat: render a basic default toast

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 收起态堆叠模型（CSS 变量 + calc）

**Files:**
- Modify: `sonner.js`（`sync` 写入堆叠变量）
- Modify: `sonner.css`（收起态 transform）
- Modify: `index.html`（加"连发 3 条"按钮，方便观察）

- [ ] **Step 1: `sync` 写入每条的堆叠变量，替换 Task 2 的临时 `sync`**

```js
function sync() {
  var n = toasts.length;
  for (var i = 0; i < n; i++) {
    var s = toasts[i];
    var el = s.el;
    el.style.setProperty('--index', String(i));
    el.style.setProperty('--toasts-before', String(i)); // 前面（更新）压了 i 条
    el.style.setProperty('--front', i === 0 ? '1' : '0');
    el.style.zIndex = String(n - i);
    el.dataset.front = i === 0 ? 'true' : 'false';
    el.dataset.visible = i < CONFIG.visibleToasts ? 'true' : 'false';
  }
}
```

- [ ] **Step 2: `sonner.css` 加收起态 transform + 可见数控制**

```css
.toast {
  --peek: 16px;          /* 收起态每条往外露出的距离 */
  --scale-step: 0.05;    /* 每往后一条缩小 5% */
  transform:
    translateY(calc(var(--y) * var(--toasts-before) * var(--peek)))
    scale(calc(1 - var(--toasts-before) * var(--scale-step)));
  transition:
    transform .45s cubic-bezier(.21,1.02,.73,1),
    opacity .4s ease,
    height .4s ease;
  transform-origin: center
    var(--origin-edge, bottom); /* bottom 位置以底边为基准缩放 */
}
.toaster[data-position^="top"] .toast { --origin-edge: top; }

/* 超过可见数的藏起来 */
.toast[data-visible="false"] { opacity: 0; pointer-events: none; }
```

- [ ] **Step 3: `index.html` 加"连发 3 条"按钮**

在 `.row` 内 `#btn-default` 之后加：
```html
<button id="btn-burst">连发 3 条</button>
```
在底部脚本里加：
```js
document.getElementById('btn-burst').addEventListener('click', function () {
  window.toast('第一条'); window.toast('第二条'); window.toast('第三条');
});
```

- [ ] **Step 4: 浏览器验证叠纸效果**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-burst"
$B js "document.querySelectorAll('.toast').length"
$B js "getComputedStyle(document.querySelector('.toast[data-front=\"true\"]')).transform"
$B screenshot /tmp/sonner-t3.png
$B console --errors
```
Expected: 3 条；最前一条 transform 约等于 none/缩放 1；截图呈"叠纸"——最前满尺寸、后面两条逐级缩小并露出上沿。Read `/tmp/sonner-t3.png` 确认。无 error。

- [ ] **Step 5: Commit**

```bash
cd ~/sonner-demo
git add sonner.js sonner.css index.html
git commit -m "feat: collapsed stacking model via CSS vars + calc

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 实测高度 + hover 展开成列

**Files:**
- Modify: `sonner.js`（measure 高度、写 `--toast-height`/`--before-height`、hover 切 `data-expanded`）
- Modify: `sonner.css`（展开态 transform、容器高度）

- [ ] **Step 1: `ensureToaster` 里加 hover 监听（展开/收起）**

在 `ensureToaster()` 的 `document.body.appendChild(toaster);` 之前加：
```js
    toaster.addEventListener('pointerenter', function () { setExpanded(true); });
    toaster.addEventListener('pointerleave', function () {
      if (!CONFIG.expand) setExpanded(false);
    });
```

加函数：
```js
function setExpanded(on) {
  if (!toaster) return;
  toaster.dataset.expanded = (on || CONFIG.expand) ? 'true' : 'false';
  sync();
}
```

- [ ] **Step 2: `sync` 里实测高度并写入累计高度变量**

在 `sync()` 的循环之后追加（先测量，再写 before-height）：
```js
function sync() {
  var n = toasts.length;
  // 先测每条高度
  for (var i = 0; i < n; i++) {
    var h = toasts[i].el.getBoundingClientRect().height;
    if (h) toasts[i].height = h;
    toasts[i].el.style.setProperty('--toast-height', toasts[i].height + 'px');
  }
  // 累计：比第 i 条更新的所有条的高度之和
  var before = 0;
  for (var j = 0; j < n; j++) {
    var s = toasts[j];
    s.el.style.setProperty('--index', String(j));
    s.el.style.setProperty('--toasts-before', String(j));
    s.el.style.setProperty('--before-height', before + 'px');
    s.el.style.setProperty('--front', j === 0 ? '1' : '0');
    s.el.style.zIndex = String(n - j);
    s.el.dataset.front = j === 0 ? 'true' : 'false';
    s.el.dataset.visible = j < CONFIG.visibleToasts ? 'true' : 'false';
    before += s.height + CONFIG.gap;
  }
  // 容器高度：收起=最前一条高度；展开=全部高度+间距
  var expanded = toaster.dataset.expanded === 'true';
  var total = expanded
    ? toasts.reduce(function (a, s) { return a + s.height + CONFIG.gap; }, 0)
    : (toasts[0] ? toasts[0].height : 0);
  toaster.style.height = total + 'px';
}
```

注意：删除 Task 3 中旧的 `sync`，用本版替换。

- [ ] **Step 3: `sonner.css` 加展开态 transform**

```css
.toaster[data-expanded="true"] .toast {
  transform: translateY(calc(var(--y) * (var(--before-height) + var(--toasts-before) * var(--gap))));
}
.toaster[data-expanded="true"] .toast[data-visible="false"] { opacity: 1; pointer-events: auto; }
```
（展开态以"前面各条高度和 + 间距"平移；方向由 `--y` 决定，bottom 向上、top 向下。）

- [ ] **Step 4: 浏览器验证 hover 展开**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-burst"
$B screenshot /tmp/sonner-t4-collapsed.png
$B hover ".toaster"
$B screenshot /tmp/sonner-t4-expanded.png
$B js "document.querySelector('.toaster').dataset.expanded"
$B console --errors
```
Expected: collapsed 截图叠纸；hover 后 `data-expanded=true`，expanded 截图三条平铺成一列、间距均匀、都满尺寸。Read 两张图对比。无 error。

- [ ] **Step 5: Commit**

```bash
cd ~/sonner-demo
git add sonner.js sonner.css
git commit -m "feat: measure heights + hover-to-expand into a list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 进/退场动画 + dismiss + 移除后重算

**Files:**
- Modify: `sonner.js`（mount 动画、`dismiss` 实现、`transitionend` 清理）
- Modify: `sonner.css`（`data-mounted` / `data-removed` 起止态）

- [ ] **Step 1: `sonner.css` 加进退场起止态**

```css
/* 进场起点 / 退场终点：在屏幕边缘外、透明、略缩小。方向与堆叠相反 */
.toast[data-mounted="false"],
.toast[data-removed="true"] {
  opacity: 0;
  transform: translateY(calc(var(--y) * -100%)) scale(0.9);
}
```
（bottom 位置 `--y=-1` → `translateY(100%)` 从下方进；top 位置从上方进。）

- [ ] **Step 2: `addToast` 里新建时先 `data-mounted=false`，下一帧置 true**

在 `addToast` 的 `if (!existing) { ... toasts.unshift(state); }` 分支里，`toaster.insertBefore` 之后加：
```js
    state.el.dataset.mounted = 'false';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        state.el.dataset.mounted = 'true';
        sync();
      });
    });
```

- [ ] **Step 3: 实现 `dismiss`，替换 Task 1 的 `dismiss` 桩**

```js
function dismiss(id) {
  if (id == null) {            // 不传 = 全部关闭
    toasts.slice().forEach(function (s) { removeToast(s); });
    return;
  }
  var s = find(id);
  if (s) removeToast(s);
}

function removeToast(state) {
  if (state.removing) return;
  state.removing = true;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  state.el.dataset.removed = 'true';
  var done = function () {
    state.el.removeEventListener('transitionend', done);
    if (state.el.parentNode) state.el.parentNode.removeChild(state.el);
    var i = toasts.indexOf(state);
    if (i > -1) toasts.splice(i, 1);
    sync();
  };
  state.el.addEventListener('transitionend', done);
  // 兜底：transition 没触发时也清理
  setTimeout(done, 600);
}
```

- [ ] **Step 4: 让最前一条可点关闭（临时验证手段；正式关闭按钮在 Task 9）**

在 `createToastEl` 的 `return li;` 之前加临时点击关闭：
```js
  li.addEventListener('click', function (e) {
    if (e.target.closest('button')) return; // 不抢按钮
    dismiss(state.id);
  });
```

- [ ] **Step 5: 浏览器验证进退场**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-default"
$B js "document.querySelector('.toast').dataset.mounted"
$B click ".toast[data-front='true']"
$B js "new Promise(r=>setTimeout(()=>r(document.querySelectorAll('.toast').length),700))"
$B console --errors
```
Expected: 进场后 `data-mounted=true`；点击后约 0.7s 内 `.toast` 数量回到 `0`（已移除）。无 error。

- [ ] **Step 6: Commit**

```bash
cd ~/sonner-demo
git add sonner.js sonner.css
git commit -m "feat: enter/exit animations + dismiss + cleanup recompute

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 计时自动消失 + hover 暂停（含 tests.html 逻辑测试）

**Files:**
- Modify: `sonner.js`（计时模型、hover 暂停/续上）
- Create: `tests.html`（纯逻辑断言）

- [ ] **Step 1: 先写失败的逻辑测试 `tests.html`**

```html
<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>tests</title></head>
<body><pre id="out"></pre>
<script src="sonner.js"></script>
<script>
  var out = document.getElementById('out');
  var pass = 0, fail = 0;
  function assert(name, cond) {
    if (cond) { pass++; out.textContent += 'PASS ' + name + '\n'; }
    else { fail++; out.textContent += 'FAIL ' + name + '\n'; }
  }
  // 计时模型：window.__sonnerTest.makeTimer 由 sonner.js 暴露（仅测试用）
  var T = window.__sonnerTest;
  assert('exposes test hooks', !!T && typeof T.makeTimer === 'function');
  if (T) {
    var fired = 0;
    var now = 1000;
    var clock = function () { return now; };
    var timer = T.makeTimer(100, function () { fired++; }, clock);
    timer.start();
    now = 1050; timer.pause();
    assert('not fired before duration', fired === 0);
    assert('remaining tracked', Math.round(timer.remaining()) === 50);
    now = 9999; // 暂停期间时间流逝不算
    assert('paused freezes remaining', Math.round(timer.remaining()) === 50);
    now = 10000; timer.resume();
    now = 10050; timer.tick(); // 测试用手动推进
    assert('fires after remaining elapses', fired === 1);
  }
  out.textContent += '\n' + pass + ' passed, ' + fail + ' failed\n';
  window.__testResult = { pass: pass, fail: fail };
</script>
</body></html>
```

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/tests.html
$B js "JSON.stringify(window.__testResult)"
```
Expected: FAIL（`__sonnerTest` 还没暴露），`fail > 0`。

- [ ] **Step 2: 在 `sonner.js` 实现可注入时钟的计时模型**

加（在 IIFE 内、`window.toast = toast;` 之前）：
```js
// 计时模型：可注入时钟，便于测试。duration=Infinity 时永不触发。
function makeTimer(duration, onExpire, clock) {
  clock = clock || function () { return Date.now(); };
  var startedAt = 0, remaining = duration, running = false, handle = null;
  function schedule() {
    if (duration === Infinity) return;
    handle = setTimeout(function () { running = false; onExpire(); },
      Math.max(0, remaining));
  }
  return {
    start: function () { startedAt = clock(); running = true; remaining = duration; schedule(); },
    pause: function () {
      if (!running) return;
      running = false;
      if (handle) { clearTimeout(handle); handle = null; }
      remaining = remaining - (clock() - startedAt);
    },
    resume: function () {
      if (running || duration === Infinity) return;
      startedAt = clock(); running = true; schedule();
    },
    remaining: function () {
      return running ? remaining - (clock() - startedAt) : remaining;
    },
    clear: function () { if (handle) { clearTimeout(handle); handle = null; } running = false; },
    tick: function () { // 测试用：手动判定到期
      if (running && (clock() - startedAt) >= remaining) { running = false; onExpire(); }
    }
  };
}

// 仅测试钩子
window.__sonnerTest = { makeTimer: makeTimer };
```

Run（同 Step 1 命令），Expected: `__testResult` 为 `{"pass":6,"fail":0}`（全绿）。

- [ ] **Step 3: 把计时接到 toast 生命周期 + hover 暂停**

在 `addToast` 的 `sync(); return id;` 之前，替换为：
```js
  // 计时
  if (state.timer) state.timer.clear();
  if (state.duration !== Infinity) {
    state.timer = makeTimer(state.duration, function () { removeToast(state); });
    state.timer.start();
  }
  sync();
  return id;
```

在 `ensureToaster` 的 hover 监听里加暂停/续上：
```js
    toaster.addEventListener('pointerenter', function () { setExpanded(true); pauseAll(); });
    toaster.addEventListener('pointerleave', function () {
      if (!CONFIG.expand) setExpanded(false);
      resumeAll();
    });
```
加函数：
```js
function pauseAll()  { toasts.forEach(function (s) { if (s.timer) s.timer.pause(); }); }
function resumeAll() { toasts.forEach(function (s) { if (s.timer) s.timer.resume(); }); }
```

- [ ] **Step 4: 浏览器验证自动消失 + hover 暂停**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B js "window.toast('短命', {duration: 800}); 'fired'"
$B js "new Promise(r=>setTimeout(()=>r(document.querySelectorAll('.toast').length),1200))"
$B console --errors
```
Expected: 约 1.2s 后数量为 `0`（已自动消失）。无 error。

- [ ] **Step 5: Commit**

```bash
cd ~/sonner-demo
git add sonner.js tests.html
git commit -m "feat: auto-dismiss timer model + hover pause, with logic tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 拖拽划走关闭（swipe to dismiss）

**Files:**
- Modify: `sonner.js`（pointer 拖拽）
- Modify: `sonner.css`（`--swipe-amount`、`data-swiping` 关过渡）

- [ ] **Step 1: `sonner.css` 支持拖拽位移与拖拽期关过渡**

```css
.toast { touch-action: none; cursor: grab; }
.toast[data-swiping="true"] {
  cursor: grabbing;
  transition: none;
  transform: translateX(var(--swipe-amount, 0px));
}
```
（拖拽时改为只跟手平移；松手恢复默认 transition。）

- [ ] **Step 2: `sonner.js` 在 `createToastEl` 里加 pointer 拖拽**

把 Task 5 加的临时 `li.addEventListener('click', ...)` 删除（拖拽接管交互），改加：
```js
  addSwipe(li, state);
```
加函数：
```js
function addSwipe(el, state) {
  var startX = 0, delta = 0, dragging = false, t0 = 0;
  el.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    dragging = true; startX = e.clientX; delta = 0; t0 = Date.now();
    el.dataset.swiping = 'true';
    el.setPointerCapture(e.pointerId);
    if (state.timer) state.timer.pause();
  });
  el.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    delta = e.clientX - startX;
    el.style.setProperty('--swipe-amount', delta + 'px');
    var o = Math.max(0, 1 - Math.abs(delta) / 200);
    el.style.opacity = String(o);
  });
  function end(e) {
    if (!dragging) return;
    dragging = false;
    el.dataset.swiping = 'false';
    var dt = Math.max(1, Date.now() - t0);
    var velocity = Math.abs(delta) / dt; // px/ms
    if (Math.abs(delta) > 45 || velocity > 0.3) {
      // 顺势滑出并移除
      el.style.transition = 'transform .2s ease, opacity .2s ease';
      el.style.transform = 'translateX(' + (delta > 0 ? 1 : -1) * 400 + 'px)';
      el.style.opacity = '0';
      removeToast(state);
    } else {
      // 弹回
      el.style.removeProperty('--swipe-amount');
      el.style.removeProperty('opacity');
      if (state.timer) state.timer.resume();
    }
  }
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
```

- [ ] **Step 3: 浏览器验证拖拽划走（脚本模拟 pointer 事件）**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-default"
cat > /tmp/swipe.js <<'EOF'
var el = document.querySelector('.toast[data-front="true"]');
var r = el.getBoundingClientRect();
var cx = r.left + r.width/2, cy = r.top + r.height/2;
function pe(type, x){ return new PointerEvent(type, {bubbles:true, cancelable:true, pointerId:1, clientX:x, clientY:cy}); }
el.dispatchEvent(pe('pointerdown', cx));
el.dispatchEvent(pe('pointermove', cx+120));
el.dispatchEvent(pe('pointerup', cx+120));
new Promise(function(res){ setTimeout(function(){ res(document.querySelectorAll('.toast').length); }, 400); });
EOF
$B eval /tmp/swipe.js
$B console --errors
```
Expected: 返回 `0`（向右拖 120px 超阈值 → 已划走移除）。无 error。

- [ ] **Step 4: Commit**

```bash
cd ~/sonner-demo
git add sonner.js sonner.css
git commit -m "feat: swipe-to-dismiss with velocity threshold + snap-back

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: 类型 + 图标 + loading spinner + rich colors + 明暗主题

**Files:**
- Modify: `sonner.js`（图标 SVG、`toast.success/error/...`、loading）
- Modify: `sonner.css`（rich colors 色板、明暗主题、spinner 动画）

- [ ] **Step 1: `sonner.js` 加类型 API 与图标**

在 `toast` 函数定义之后加：
```js
['success', 'error', 'warning', 'info', 'loading'].forEach(function (type) {
  toast[type] = function (message, options) {
    return addToast(message, options || {}, type);
  };
});
toast.message = function (message, options) { return addToast(message, options || {}, 'default'); };
```

加图标表（内联 SVG 字符串）：
```js
var ICONS = {
  success: '<svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3l-4.2 4.2-2.2-2.2 1.1-1.1 1.1 1.1 3.1-3.1 1.1 1.1z"/></svg>',
  error:   '<svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 5h2v6H9V5zm0 8h2v2H9v-2z"/></svg>',
  warning: '<svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor"><path d="M10 1l9 16H1L10 1zm-1 6h2v5H9V7zm0 7h2v2H9v-2z"/></svg>',
  info:    '<svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9h2v5H9V9zm0-3h2v2H9V6z"/></svg>',
  loading: '<span class="toast__spinner" aria-label="loading"></span>'
};
```

在 `renderToastContent` 里，标题前插入图标节点：
```js
function renderToastContent(state) {
  var el = state.el;
  if (!el) return;
  el.dataset.type = state.type;
  var iconHTML = state.icon != null ? state.icon : (ICONS[state.type] || '');
  el.innerHTML =
    (iconHTML ? '<span class="toast__icon">' + iconHTML + '</span>' : '') +
    '<div class="toast__content">' +
      '<div class="toast__title"></div>' +
      (state.description ? '<div class="toast__desc"></div>' : '') +
    '</div>';
  el.querySelector('.toast__title').textContent = state.message;
  if (state.description) el.querySelector('.toast__desc').textContent = state.description;
}
```

- [ ] **Step 2: `sonner.css` 加图标、spinner、rich colors、明暗主题**

```css
.toast__icon { flex: 0 0 auto; display: flex; }
.toast__spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid rgba(0,0,0,0.15); border-top-color: rgba(0,0,0,0.6);
  display: inline-block; animation: toast-spin .7s linear infinite;
}
@keyframes toast-spin { to { transform: rotate(360deg); } }

/* 暗色主题 */
.toaster[data-theme="dark"] .toast {
  --toast-bg: #18181b; --toast-fg: #fafafa; --toast-border: rgba(255,255,255,0.1);
}
.toaster[data-theme="dark"] .toast__spinner {
  border-color: rgba(255,255,255,0.2); border-top-color: rgba(255,255,255,0.7);
}

/* rich colors：按类型上色 */
.toaster[data-rich-colors="true"] .toast[data-type="success"] {
  --toast-bg:#ecfdf3; --toast-fg:#0a6b3b; --toast-border:#a6f4c5; }
.toaster[data-rich-colors="true"] .toast[data-type="error"] {
  --toast-bg:#fef3f2; --toast-fg:#b42318; --toast-border:#fecdca; }
.toaster[data-rich-colors="true"] .toast[data-type="warning"] {
  --toast-bg:#fffaeb; --toast-fg:#b54708; --toast-border:#fedf89; }
.toaster[data-rich-colors="true"] .toast[data-type="info"] {
  --toast-bg:#eff8ff; --toast-fg:#175cd3; --toast-border:#b2ddff; }
.toaster[data-theme="dark"][data-rich-colors="true"] .toast[data-type="success"] {
  --toast-bg:#052e1c; --toast-fg:#6ce9a6; --toast-border:#085d3a; }
.toaster[data-theme="dark"][data-rich-colors="true"] .toast[data-type="error"] {
  --toast-bg:#3a0a0a; --toast-fg:#fda29b; --toast-border:#7a271a; }
```

- [ ] **Step 3: 浏览器验证类型与配色**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B js "window.toast.configure({richColors:true}); window.toast.success('成功'); window.toast.error('失败'); window.toast.loading('处理中…'); 'ok'"
$B hover ".toaster"
$B screenshot /tmp/sonner-t8.png
$B js "document.querySelectorAll('.toast[data-type=\"loading\"] .toast__spinner').length"
$B console --errors
```
Expected: 截图三条带各自图标与配色；loading 有转圈 spinner（计数 ≥1）。Read 图确认。无 error。

- [ ] **Step 4: Commit**

```bash
cd ~/sonner-demo
git add sonner.js sonner.css
git commit -m "feat: types, icons, loading spinner, rich colors, dark theme

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: action / cancel / 关闭按钮

**Files:**
- Modify: `sonner.js`（渲染按钮 + 回调）
- Modify: `sonner.css`（按钮与关闭按钮样式）

- [ ] **Step 1: `renderToastContent` 末尾追加按钮区与关闭按钮**

在 `renderToastContent` 设置完标题/描述后追加：
```js
  // 关闭按钮
  if (CONFIG.closeButton) {
    var close = document.createElement('button');
    close.className = 'toast__close';
    close.setAttribute('aria-label', '关闭');
    close.innerHTML = '&times;';
    close.addEventListener('click', function () { dismiss(state.id); });
    el.appendChild(close);
  }
  // action / cancel
  if (state.action || state.cancel) {
    var bar = document.createElement('div');
    bar.className = 'toast__actions';
    if (state.cancel) {
      var c = document.createElement('button');
      c.className = 'toast__btn toast__btn--cancel';
      c.textContent = state.cancel.label;
      c.addEventListener('click', function () {
        if (state.cancel.onClick) state.cancel.onClick();
        dismiss(state.id);
      });
      bar.appendChild(c);
    }
    if (state.action) {
      var a = document.createElement('button');
      a.className = 'toast__btn toast__btn--action';
      a.textContent = state.action.label;
      a.addEventListener('click', function () {
        if (state.action.onClick) state.action.onClick();
        dismiss(state.id);
      });
      bar.appendChild(a);
    }
    el.querySelector('.toast__content').appendChild(bar);
  }
```

- [ ] **Step 2: `sonner.css` 加按钮样式**

```css
.toast__actions { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
.toast__btn { font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
.toast__btn--action { background: #18181b; color: #fff; }
.toast__btn--cancel { background: transparent; color: inherit; border-color: rgba(0,0,0,0.15); }
.toaster[data-theme="dark"] .toast__btn--action { background: #fafafa; color: #18181b; }
.toast__close {
  position: absolute; top: 6px; left: 6px; width: 20px; height: 20px;
  border-radius: 50%; border: 1px solid var(--toast-border); background: var(--toast-bg);
  color: inherit; cursor: pointer; line-height: 1; font-size: 14px; padding: 0;
  opacity: 0; transition: opacity .15s;
}
.toast:hover .toast__close { opacity: 1; }
```

- [ ] **Step 3: `index.html` 加"带 action"按钮**

`.row` 内加：
```html
<button id="btn-action">带撤销按钮</button>
```
脚本加：
```js
document.getElementById('btn-action').addEventListener('click', function () {
  window.toast('已删除一项', { action: { label: '撤销', onClick: function () { window.toast.success('已恢复'); } } });
});
```

- [ ] **Step 4: 浏览器验证按钮**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-action"
$B screenshot /tmp/sonner-t9.png
$B click ".toast__btn--action"
$B js "new Promise(r=>setTimeout(()=>r(document.querySelector('.toast .toast__title') ? document.querySelector('.toast .toast__title').textContent : 'none'),300))"
$B console --errors
```
Expected: 截图显示带"撤销"按钮的 toast；点撤销后出现"已恢复"成功 toast。Read 图确认。无 error。

- [ ] **Step 5: Commit**

```bash
cd ~/sonner-demo
git add sonner.js sonner.css index.html
git commit -m "feat: action/cancel/close buttons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: promise toast（loading → success/error 原地变身）

**Files:**
- Modify: `sonner.js`（`toast.promise`）
- Modify: `index.html`（promise 演示按钮）

- [ ] **Step 1: `sonner.js` 实现 `toast.promise`**

在类型 API 之后加：
```js
toast.promise = function (promise, opts) {
  opts = opts || {};
  var id = addToast(opts.loading || '加载中…', { duration: Infinity }, 'loading');
  var p = (typeof promise === 'function') ? promise() : promise;
  Promise.resolve(p).then(function (data) {
    var msg = typeof opts.success === 'function' ? opts.success(data) : (opts.success || '成功');
    addToast(msg, { id: id, duration: CONFIG.duration }, 'success');
  }, function (err) {
    var msg = typeof opts.error === 'function' ? opts.error(err) : (opts.error || '失败');
    addToast(msg, { id: id, duration: CONFIG.duration }, 'error');
  });
  return id;
};
```
注意：`addToast` 复用同一 `id` 时走"更新已存在"分支（Task 2 已实现），并需重置计时——确认 Task 6 的计时段在更新路径也会执行（`addToast` 末尾统一处理计时，已满足）。

- [ ] **Step 2: `index.html` 加 promise 演示按钮**

`.row` 内加：
```html
<button id="btn-promise">promise toast</button>
```
脚本加：
```js
document.getElementById('btn-promise').addEventListener('click', function () {
  window.toast.promise(new Promise(function (res) { setTimeout(res, 1500); }),
    { loading: '保存中…', success: '已保存', error: '保存失败' });
});
```

- [ ] **Step 3: 浏览器验证 promise 流程**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-promise"
$B js "document.querySelector('.toast').dataset.type"
$B js "new Promise(r=>setTimeout(()=>r(document.querySelector('.toast') ? document.querySelector('.toast').dataset.type : 'gone'),1800))"
$B console --errors
```
Expected: 初始 `loading`；约 1.8s 后同一条变为 `success`。无 error。

- [ ] **Step 4: Commit**

```bash
cd ~/sonner-demo
git add sonner.js index.html
git commit -m "feat: promise toast (loading -> success/error in place)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: 6 个位置切换

**Files:**
- Modify: `sonner.js`（切位置时重建方向 + 重排 DOM 顺序无需变，更新 `--y`）
- Modify: `index.html`（位置下拉）

- [ ] **Step 1: 确认 `applyToasterAttrs` 已写 `--y`（Task 1 已含 `yDir()`）**

无需改代码；`toast.configure({position:'top-left'})` 会调用 `applyToasterAttrs()` + `sync()`，`--y` 随之更新。仅需验证 top 位置堆叠方向正确。

- [ ] **Step 2: `index.html` 加位置下拉**

`.row` 之后加：
```html
<label>位置：
  <select id="sel-pos">
    <option value="bottom-right">bottom-right</option>
    <option value="bottom-center">bottom-center</option>
    <option value="bottom-left">bottom-left</option>
    <option value="top-right">top-right</option>
    <option value="top-center">top-center</option>
    <option value="top-left">top-left</option>
  </select>
</label>
```
脚本加：
```js
document.getElementById('sel-pos').addEventListener('change', function (e) {
  window.toast.configure({ position: e.target.value });
  window.toast(e.target.value);
});
```

- [ ] **Step 3: 浏览器验证 4 个角 + 2 个 center**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
for P in bottom-right top-right top-left bottom-left top-center bottom-center; do
  $B js "window.toast.dismiss(); window.toast.configure({position:'$P'}); window.toast('$P'); window.toast('第二条'); '$P'"
  $B screenshot /tmp/sonner-pos-$P.png
done
$B console --errors
```
Expected: 6 张图，toast 分别贴对应角/中；top 系列向下堆叠、bottom 系列向上堆叠。Read 抽查 `top-left` 与 `bottom-right` 两张。无 error。

- [ ] **Step 4: Commit**

```bash
cd ~/sonner-demo
git add sonner.js index.html
git commit -m "feat: 6 positions with correct stacking direction

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: 控制面板补全（开关 + 全部触发按钮）

**Files:**
- Modify: `index.html`（补全面板：类型按钮、描述、rich colors / 默认展开 / 主题 / 关闭按钮开关）

- [ ] **Step 1: 补全 `index.html` 面板按钮与开关**

`.row` 内补齐类型与描述按钮：
```html
<button id="btn-success">成功</button>
<button id="btn-error">错误</button>
<button id="btn-warning">警告</button>
<button id="btn-info">信息</button>
<button id="btn-loading">loading</button>
<button id="btn-desc">带描述</button>
```
位置下拉后加一组开关：
```html
<div class="row">
  <label><input type="checkbox" id="sw-rich"> rich colors</label>
  <label><input type="checkbox" id="sw-expand"> 默认展开</label>
  <label><input type="checkbox" id="sw-dark"> 暗色</label>
  <label><input type="checkbox" id="sw-close"> 关闭按钮</label>
</div>
```

- [ ] **Step 2: 补全脚本 wiring**

```js
var map = { 'btn-success':'success','btn-error':'error','btn-warning':'warning','btn-info':'info','btn-loading':'loading' };
Object.keys(map).forEach(function (id) {
  document.getElementById(id).addEventListener('click', function () {
    window.toast[map[id]](map[id] + ' toast');
  });
});
document.getElementById('btn-desc').addEventListener('click', function () {
  window.toast('带描述的 toast', { description: '这里是副标题，说明更多细节。' });
});
document.getElementById('sw-rich').addEventListener('change', function (e) { window.toast.configure({ richColors: e.target.checked }); });
document.getElementById('sw-expand').addEventListener('change', function (e) { window.toast.configure({ expand: e.target.checked }); });
document.getElementById('sw-dark').addEventListener('change', function (e) { window.toast.configure({ theme: e.target.checked ? 'dark' : 'light' }); });
document.getElementById('sw-close').addEventListener('change', function (e) { window.toast.configure({ closeButton: e.target.checked }); });
```

- [ ] **Step 3: 浏览器验证面板**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#sw-dark"
$B click "#sw-rich"
$B click "#btn-success"; $B click "#btn-error"; $B click "#btn-info"
$B hover ".toaster"
$B screenshot /tmp/sonner-panel.png
$B console --errors
```
Expected: 暗色 + rich colors 下三条带色 toast 展开成列。Read 图确认。无 error。

- [ ] **Step 4: Commit**

```bash
cd ~/sonner-demo
git add index.html
git commit -m "feat: complete control panel (type buttons + toggles)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: prefers-reduced-motion + 全量验收

**Files:**
- Modify: `sonner.css`（reduced-motion）

- [ ] **Step 1: `sonner.css` 加 reduced-motion**

```css
@media (prefers-reduced-motion: reduce) {
  .toast, .toaster[data-expanded="true"] .toast { transition-duration: 0.01ms !important; }
  .toast__spinner { animation-duration: 1.5s; }
}
```

- [ ] **Step 2: 全量浏览器验收（连发/展开/类型/promise/位置/主题）**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/index.html
$B click "#btn-burst"; $B hover ".toaster"; $B screenshot /tmp/final-expand.png
$B js "window.toast.dismiss(); window.toast.promise(new Promise(r=>setTimeout(r,1000)),{loading:'L',success:'S'}); 'ok'"
$B js "new Promise(r=>setTimeout(()=>r(document.querySelector('.toast').dataset.type),1300))"
$B console --errors
$B console
```
Expected: 展开图正常；promise 末态 `success`；`console --errors` 为空。Read `/tmp/final-expand.png`。

- [ ] **Step 3: 逻辑测试回归**

Run:
```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B goto file:///Users/lingkanwang/sonner-demo/tests.html
$B js "JSON.stringify(window.__testResult)"
```
Expected: `{"pass":6,"fail":0}`。

- [ ] **Step 4: Commit**

```bash
cd ~/sonner-demo
git add sonner.css
git commit -m "feat: prefers-reduced-motion + final verification pass

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review 备注（已核对）

- **Spec 覆盖**：堆叠收起(T3)、hover 展开(T4)、进退场(T5)、计时+hover 暂停(T6)、拖拽划走(T7)、类型/图标/loading/rich colors/主题(T8)、action/cancel/close(T9)、promise(T10)、6 位置(T11)、控制面板(T12)、reduced-motion(T13)、双击运行(T1，非 module + 全局 toast)。spec 各节均有对应 Task。
- **命名一致**：`addToast` / `createToastEl` / `renderToastContent` / `sync` / `setExpanded` / `removeToast` / `dismiss` / `find` / `makeTimer` / `pauseAll` / `resumeAll` / `addSwipe` / `applyToasterAttrs` / `yDir` 全程一致。CSS 变量 `--index` `--toasts-before` `--front` `--toast-height` `--before-height` `--y` `--gap` `--offset` `--peek` `--scale-step` `--swipe-amount` 全程一致。
- **占位符**：无 TBD/TODO；每个代码步骤均含完整代码。
- **已知衔接点**：`sync` 在 T2(临时)→T3→T4 三次替换，按 Task 顺序执行即为最终版；`renderToastContent` 在 T2→T8→T9 递进追加。执行时以"最新 Task 的版本"为准。
