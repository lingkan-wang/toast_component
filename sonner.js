/* sonner.js — 零依赖 toast 引擎，仿 Sonner。挂载到 window.toast。
 *
 * 设计要点：JS 只做两件事——维护 toast 列表、给每条写少量 CSS 变量；
 * 所有位移/缩放/堆叠数学交给 sonner.css 的 calc()，过渡交给 CSS transition。
 * 收起⇄展开靠容器上的 data-expanded 翻转，让 calc 重新求值。
 */
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

  var toaster = null;   // .toaster 元素
  var toasts = [];      // 状态数组，index 0 = 最新/最前
  var counter = 0;      // 自增 id

  // 方向系数：top 位置向下堆叠(+1)，bottom 位置向上堆叠(-1)
  function yDir() { return CONFIG.position.indexOf('top') === 0 ? 1 : -1; }

  // ---- 容器挂载 ----
  function ensureToaster() {
    if (toaster) return toaster;
    toaster = document.createElement('ol');
    toaster.className = 'toaster';
    toaster.setAttribute('aria-live', 'polite');
    toaster.setAttribute('tabindex', '-1');
    applyToasterAttrs();
    // hover 整个容器：展开 + 暂停所有计时；移开：收起 + 续上计时
    toaster.addEventListener('pointerenter', function () { setExpanded(true); pauseAll(); });
    toaster.addEventListener('pointerleave', function () {
      if (!CONFIG.expand) setExpanded(false);
      resumeAll();
    });
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

  function setExpanded(on) {
    if (!toaster) return;
    toaster.dataset.expanded = (on || CONFIG.expand) ? 'true' : 'false';
    sync();
  }

  // ---- 3D 可爱图标（Microsoft Fluent Emoji 3D，走 jsDelivr CDN；alt 兜底为 emoji 字形，离线也能看） ----
  var EMOJI_BASE = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/';
  function emo3d(folder, file, glyph) {
    return '<img class="i3d" alt="' + glyph + '" draggable="false" ' +
           'src="' + EMOJI_BASE + folder + '/3D/' + file + '_3d.png">';
  }
  var ICONS = {
    success: emo3d('Check%20mark%20button', 'check_mark_button', '✅'),
    error:   emo3d('Cross%20mark', 'cross_mark', '❌'),
    warning: emo3d('Warning', 'warning', '⚠️'),
    info:    emo3d('Information', 'information', 'ℹ️'),
    loading: emo3d('Hourglass%20not%20done', 'hourglass_not_done', '⏳')
  };

  // 工具类图标，供 demo 按钮和无类型 toast 复用
  var EXTRA_ICONS = {
    bell:   emo3d('Bell', 'bell', '🔔'),
    note:   emo3d('Memo', 'memo', '📝'),
    undo:   emo3d('Right%20arrow%20curving%20left', 'right_arrow_curving_left', '↩️'),
    loader: emo3d('Hourglass%20not%20done', 'hourglass_not_done', '⏳'),
    layers: emo3d('Party%20popper', 'party_popper', '🎉'),
    trash:  emo3d('Wastebasket', 'wastebasket', '🗑️'),
    fire:   emo3d('Fire', 'fire', '🔥')
  };

  // ---- 新增 / 更新一条 toast ----
  function addToast(message, options, type) {
    ensureToaster();
    var id = options.id != null ? options.id : ++counter;
    var existing = find(id);
    var state = existing || { id: id, el: null, height: 0, timer: null };
    state.type = type;
    state.message = message;
    state.description = options.description || '';
    state.duration = options.duration != null ? options.duration
      : (type === 'loading' ? Infinity : CONFIG.duration);
    state.action = options.action || null;
    state.cancel = options.cancel || null;
    state.icon = options.icon != null ? options.icon : null;

    if (!existing) {
      state.el = createToastEl(state);
      toaster.insertBefore(state.el, toaster.firstChild); // 新的放最前
      toasts.unshift(state);
      // 进场：先在边缘外，下一帧翻 mounted=true 触发 CSS 过渡
      state.el.dataset.mounted = 'false';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          state.el.dataset.mounted = 'true';
          sync();
        });
      });
    } else {
      renderToastContent(state); // 复用 DOM，原地更新（promise 变身用）
    }

    // 计时（每次都重置）
    if (state.timer) state.timer.clear();
    if (state.duration !== Infinity) {
      state.timer = makeTimer(state.duration, function () { removeToast(state); });
      state.timer.start();
    } else {
      state.timer = null;
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
    state.el = li;            // renderToastContent 依赖 state.el，先挂上
    renderToastContent(state);
    addSwipe(li, state);      // 拖拽监听挂在 li 上，重渲染 innerHTML 不会丢
    return li;
  }

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

    // 关闭按钮
    if (CONFIG.closeButton) {
      var close = document.createElement('button');
      close.className = 'toast__close';
      close.setAttribute('aria-label', 'Close');
      close.innerHTML = '&times;';
      close.addEventListener('click', function (e) { e.stopPropagation(); dismiss(state.id); });
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
  }

  // ---- 核心：把列表状态写成 CSS 变量 ----
  function sync() {
    if (!toaster) return;
    var n = toasts.length;
    // 先实测每条高度（offsetHeight 是布局高度，不受 transform 缩放影响）
    for (var i = 0; i < n; i++) {
      var h = toasts[i].el.offsetHeight;
      if (h) toasts[i].height = h;
      toasts[i].el.style.setProperty('--toast-height', toasts[i].height + 'px');
    }
    // 写每条的堆叠变量
    var before = 0; // 比第 j 条更新的所有条的高度之和（含间距）
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
    // 容器高度：收起=最前一条；展开=全部高度+间距
    var expanded = toaster.dataset.expanded === 'true';
    var total = expanded
      ? toasts.reduce(function (acc, s2) { return acc + s2.height + CONFIG.gap; }, 0)
      : (toasts[0] ? toasts[0].height : 0);
    toaster.style.height = total + 'px';
  }

  // ---- 关闭 ----
  function dismiss(id) {
    if (id == null) { toasts.slice().forEach(function (s) { removeToast(s); }); return; }
    var s = find(id);
    if (s) removeToast(s);
  }

  function removeToast(state, viaSwipe) {
    if (state.removing) return;
    state.removing = true;
    if (state.timer) { state.timer.clear(); state.timer = null; }
    // 划走：横向滑出（data-swiped-out）；其他：纵向退场（data-removed）
    if (viaSwipe) state.el.dataset.swipedOut = 'true';
    else state.el.dataset.removed = 'true';
    var done = function () {
      if (state._cleaned) return;
      state._cleaned = true;
      state.el.removeEventListener('transitionend', done);
      if (state.el.parentNode) state.el.parentNode.removeChild(state.el);
      var i = toasts.indexOf(state);
      if (i > -1) toasts.splice(i, 1);
      sync();
    };
    state.el.addEventListener('transitionend', done);
    setTimeout(done, 600); // 兜底：transition 没触发也清理
  }

  // ---- 拖拽划走 ----
  function addSwipe(el, state) {
    var startX = 0, delta = 0, dragging = false, t0 = 0;
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return; // 不抢按钮
      dragging = true; startX = e.clientX; delta = 0; t0 = Date.now();
      el.dataset.swiping = 'true';
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      if (state.timer) state.timer.pause();
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      delta = e.clientX - startX;
      el.style.setProperty('--swipe-amount', delta + 'px'); // 叠加在堆叠 transform 上
      el.style.opacity = String(Math.max(0, 1 - Math.abs(delta) / 200));
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      el.dataset.swiping = 'false';
      var dt = Math.max(1, Date.now() - t0);
      var velocity = Math.abs(delta) / dt; // px/ms；Sonner 的快速划走阈值约 0.11
      if (Math.abs(delta) > 45 || velocity > 0.11) {
        // 顺着拖拽方向继续滑出（保留 translateY 堆叠位置），再移除
        el.style.removeProperty('opacity'); // 交给 data-swiped-out 控制淡出
        el.style.setProperty('--swipe-amount', ((delta > 0 ? 1 : -1) * 400) + 'px');
        removeToast(state, true);
      } else {
        // 没过阈值：弹回
        el.style.removeProperty('--swipe-amount');
        el.style.removeProperty('opacity');
        if (state.timer) state.timer.resume();
      }
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ---- 计时模型（可注入时钟，便于测试；duration=Infinity 时永不触发） ----
  function makeTimer(duration, onExpire, clock) {
    clock = clock || function () { return Date.now(); };
    var startedAt = 0, remaining = duration, running = false, handle = null;
    function schedule() {
      if (duration === Infinity) return;
      handle = setTimeout(function () { running = false; onExpire(); }, Math.max(0, remaining));
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
      remaining: function () { return running ? remaining - (clock() - startedAt) : remaining; },
      clear: function () { if (handle) { clearTimeout(handle); handle = null; } running = false; },
      tick: function () { if (running && (clock() - startedAt) >= remaining) { running = false; onExpire(); } }
    };
  }

  // ---- 对外 API ----
  function toast(message, options) { return addToast(message, options || {}, 'default'); }
  ['success', 'error', 'warning', 'info', 'loading'].forEach(function (type) {
    toast[type] = function (message, options) { return addToast(message, options || {}, type); };
  });
  toast.message = function (message, options) { return addToast(message, options || {}, 'default'); };
  toast.promise = function (promise, opts) {
    opts = opts || {};
    var id = addToast(opts.loading || 'Loading…', { duration: Infinity }, 'loading');
    var p = (typeof promise === 'function') ? promise() : promise;
    Promise.resolve(p).then(function (data) {
      var msg = typeof opts.success === 'function' ? opts.success(data) : (opts.success || 'Success');
      addToast(msg, { id: id, duration: CONFIG.duration }, 'success');
    }, function (err) {
      var msg = typeof opts.error === 'function' ? opts.error(err) : (opts.error || 'Error');
      addToast(msg, { id: id, duration: CONFIG.duration }, 'error');
    });
    return id;
  };
  toast.dismiss = function (id) { dismiss(id); };
  toast.configure = function (partial) {
    for (var k in partial) if (partial.hasOwnProperty(k)) CONFIG[k] = partial[k];
    ensureToaster();
    applyToasterAttrs();
    toasts.forEach(function (s) { renderToastContent(s); }); // 反映 closeButton 等变化
    sync();
  };

  // 对外暴露图标库（demo 按钮复用同款 SVG，保证按钮与 toast 图标完全一致）
  toast.icons = Object.assign({}, ICONS, EXTRA_ICONS);

  // 暴露
  window.toast = toast;
  // 仅供 tests.html 使用的测试钩子
  window.__sonnerTest = { makeTimer: makeTimer, getConfig: function () { return CONFIG; } };

  // DOM 就绪后建容器
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureToaster);
  } else {
    ensureToaster();
  }
})();
