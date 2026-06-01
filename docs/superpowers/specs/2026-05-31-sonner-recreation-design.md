# Sonner 交互复刻 — 设计文档

日期：2026-05-31
目标：用纯 HTML/CSS/JS 完整复刻 [emilkowalski/sonner](https://github.com/emilkowalski/sonner) 的 toast 交互，作为一个可双击打开、可交互、带教学注释的学习 demo。

## 1. 目标与非目标

**目标**
- 复刻 Sonner 最有辨识度的交互：多条 toast 堆叠收起、hover 展开成一列、拖拽划走关闭、进/退场动画、自动计时消失（hover 时暂停）。
- 完整范围：类型（默认/成功/错误/警告/信息/loading）含图标、rich colors、action/cancel/关闭按钮、promise toast、6 个屏幕位置、明暗主题。
- 纯静态，双击 `index.html` 即可运行（不依赖构建工具、不依赖 npm 包、不使用 ES module）。
- 代码带清晰中文注释；交付后用中文讲透三个关键机制（堆叠数学、hover 展开、拖拽关闭）。

**非目标**
- 不做 npm 发包、不做框架适配（React/Vue 封装）。
- 不追求像素级 1:1 还原 Sonner 源码，重在把同一套技术原理做对、做顺手。
- 不做无障碍的完整 ARIA live region 规范（保留基础 `role`/`aria-live`，但不作为验收重点）。

## 2. 技术选型

- 单一目录 `~/sonner-demo/`，纯 HTML/CSS/JS。
- 不使用 ES module（`import`/`export`），改用普通 `<script src>`，确保 `file://` 双击可运行。
- 引擎挂载到全局 `window.toast`，自动创建并管理一个 `.toaster` 容器。
- 实现思路 A：**CSS 变量驱动**。JS 只管理 toast 列表并写少量 CSS 自定义属性，所有位移/缩放/堆叠数学交给 CSS `calc()`，过渡动画交给 CSS `transition`。这与真实 Sonner 的实现同源。

## 3. 文件结构

```
~/sonner-demo/
  index.html      # demo 页：控制面板 + 引入 css/js + 内联脚本接按钮
  sonner.css      # toast 样式 + 堆叠模型（calc 全在这）
  sonner.js       # toast 引擎，暴露全局 window.toast
  docs/superpowers/specs/2026-05-31-sonner-recreation-design.md
```

分文件的目的：让"库本身"（sonner.js/sonner.css）和"调用库的页面"（index.html）边界清晰，便于学习。

## 4. 对外 API（仿真 Sonner）

```js
toast(message, options?)                  // 默认类型
toast.success(message, options?)
toast.error(message, options?)
toast.warning(message, options?)
toast.info(message, options?)
toast.loading(message, options?)          // duration 默认 Infinity
toast.message(message, options?)          // 自定义图标等
toast.promise(promise, { loading, success, error })
toast.dismiss(id?)                         // 关闭指定 id；不传则全部关闭
```

**单条 options**
- `description: string` — 副标题
- `icon: string` — 自定义图标（HTML/SVG 字符串），覆盖类型默认图标
- `action: { label, onClick }` — 主操作按钮
- `cancel: { label, onClick }` — 取消按钮
- `duration: number` — 毫秒，默认 4000；loading 为 Infinity
- `position` — 覆盖全局位置
- `id` — 复用/更新已存在的 toast

**全局配置**：`sonner.js` 顶部一个 `CONFIG` 对象保存默认值，并暴露 `toast.configure(partial)` 在运行时覆盖（控制面板的开关即调用它）。可配置项：
- `position`：`top-left | top-center | top-right | bottom-left | bottom-center | bottom-right`，默认 `bottom-right`
- `theme`：`light | dark`，默认 `light`
- `richColors`：布尔，默认 false
- `expand`：布尔，是否默认展开，默认 false（仅 hover 展开）
- `visibleToasts`：收起态最多可见数，默认 3
- `gap`：展开态每条之间的间距 px，默认 14
- `offset`：容器距屏幕边缘的距离 px，默认 24
- `closeButton`：是否显示关闭按钮，默认 false

## 5. 堆叠模型（核心）

容器 `.toaster`：`position: fixed`，按 `data-position` 锚在某角；带 `data-expanded`、`data-theme`、`data-position` 属性。

每条 `.toast`：`position: absolute`，统一钉在容器的同一条边。JS 给每条写入 CSS 变量，位置由 CSS calc 计算：

- `--index`：0 = 最前（最新），向后递增
- `--toasts-before`：该条前面（更新）压了几条 = `--index`
- `--front`：是否最前一条（1/0）
- `--toast-height`：JS 用 `getBoundingClientRect` 实测的本条高度
- `--before-height`：比它新的所有条的高度之和（用于展开态精确平移）
- `--z`：z-index = 总数 − index
- `--y`：方向系数，底部位置为 +1（向上堆叠 = 负方向平移），顶部位置为 −1，让同一套 calc 适配上下

**收起态（默认）**
- 最前一条：`scale(1)`，offset 0，完全不透明
- 后面第 n 条：`translateY(calc(--y * n * -CollapsedGap))` 往外顶约 16px 露出边缘 + `scale(1 - n*0.05)`
- `--toasts-before > visibleToasts-1` 的条 `opacity: 0`（藏起来）
- 容器高度 = 最前一条高度（后面的"藏"在下面）

**展开态（`data-expanded=true`，hover 或 expand=true 时）**
- 每条 `translateY(calc(--y * (--before-height + --toasts-before * gap) * -1))`，全部满尺寸、不透明，铺成一列
- 容器高度 = 所有可见条高度之和 + 间距

**过渡**：`.toast { transition: transform .4s, opacity .4s; }`。收起⇄展开只翻 `data-expanded`，calc 重算，CSS 自动补间。JS 不写任何逐帧动画。

## 6. 交互细节

1. **进/退场**
   - 新 toast 插入 DOM 时 `data-mounted=false`（位于边缘外：`translateY(100% * --y方向)`、`opacity:0`、`scale(.9)`），`requestAnimationFrame` 下一帧置 `true`，CSS 过渡进入。
   - 移除时置 `data-removed=true` 反向过渡，`transitionend` 后从 DOM 删除并重算其余条的变量。

2. **拖拽划走（swipe to dismiss）**
   - `pointerdown` 在 toast 上 → `setPointerCapture`，记起点。
   - `pointermove` → 计算沿 x 轴位移写入 `--swipe-amount`，并随距离降低 `opacity`；拖拽期间容器/该条挂 `data-swiping` 关闭常规 transition。
   - `pointerup` → 若 `|位移| > 45px` 或速度够快：沿方向滑出 + 移除；否则弹回（恢复 transition，`--swipe-amount` 归零）。

3. **计时 + hover 暂停**
   - 每条按 `duration` 设到期时间；用基于时间戳的"剩余时间"模型，便于暂停/续上。
   - 容器 `pointerenter` → 暂停所有计时并记录剩余；`pointerleave` → 续上。
   - loading 类型 `duration = Infinity`，不自动消失。

4. **promise toast**
   - `toast.promise` 立刻建一个 loading 条（不计时），await 传入的 promise。
   - resolve → 原地把该条改成 success（换图标/文案/颜色），开始正常计时；reject → 改成 error 同理。
   - 通过复用同一 `id` 实现"原地变身"，触发布局重算与过渡。

5. **6 个位置**
   - `data-position` 决定容器锚点、`--y` 方向、堆叠与划走方向。控制面板可实时切换。

6. **类型与 rich colors**
   - `data-type`：`default | success | error | warning | info | loading`，各配内联 SVG 图标；loading 为 CSS 旋转 spinner。
   - `richColors=true` 时按类型套底色/描边/文字色；明暗主题各一套色板。

7. **按钮**
   - `action` / `cancel` 渲染在 toast 内；`closeButton` 渲染左上角关闭按钮。点击 action/cancel 执行回调并关闭。

8. **可见数上限**
   - 收起态仅前 `visibleToasts`（默认 3）条可见，其余 `opacity:0`；上面的关闭后下面的递补。

9. **prefers-reduced-motion**
   - `@media (prefers-reduced-motion: reduce)` 把过渡时长降到近 0，仍可用但不动画。

## 7. 控制面板（index.html）

页面顶部一块面板，让 demo 像可玩的卡片：
- 触发按钮：默认 / 成功 / 错误 / 警告 / 信息 / loading / promise / 带 action / 带描述。
- 位置选择：6 个位置（按钮组或下拉）。
- 开关：rich colors、默认展开、明暗主题、关闭按钮。
- 一个"连发 3 条"按钮，方便观察堆叠。

## 8. 验收方式

用浏览器工具打开 `file://` 后：
- 连发多条 → 截图确认堆叠（叠纸效果、仅 3 条可见）。
- hover 容器 → 截图确认展开成一列、计时暂停。
- 切 6 个位置各截一张。
- 跑一次 promise（loading → success）。
- 触发 action / 关闭按钮、拖拽划走（用脚本模拟 pointer 事件验证移除）。
- 开 reduced-motion 确认仍可用。
- 控制台必须零报错。

## 9. 验收标准（Definition of Done）

- 双击 `index.html` 可直接运行，无需服务器、无报错。
- 收起 3 条呈叠纸态；hover 平滑展开成列、移开平滑收回。
- 进/退场、拖拽划走、计时+hover 暂停均工作。
- 6 个位置、6 种类型、rich colors、明暗主题、action/cancel/关闭按钮、promise toast 全部可用。
- 关键机制有中文注释；交付后提供堆叠/展开/拖拽三段讲解。
