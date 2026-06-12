# Code Wiki

## 项目简介 Project Overview

这是一个原生前端实现的三消原型项目，当前以手机竖屏体验为目标，使用 HTML + CSS + JavaScript ES Modules 组织代码。

当前玩法不是传统的“交换相邻两个格子”，而是：

- 点击一个花朵格子，先移除该格子
- 棋盘执行下落与补位
- 如果形成 3 个及以上的同色正交连通块，则继续自动连锁消除
- 玩家在步数限制内完成关卡目标

项目目标是先保持原型开发速度，同时把代码拆成清晰模块，方便后续继续扩展：

- 更多关卡 Levels
- 道具 Boosters
- 特殊块 Special Tiles
- 调试工具 Debug Tools
- 新目标类型 Goal Types

## 目录结构 Project Structure

```text
/
  assets/
    grass.png
    flowers/
  src/
    config/
    game/
    state/
    ui/
    utils/
    main.js
  Code_Wiki.md
  index.html
  package.json
  styles.css
```

## 架构说明 Architecture

当前代码按 5 层拆分：

1. `config/`
负责静态配置与基础数据，不包含运行时逻辑。

2. `state/`
负责运行时状态容器，只保存当前关卡、棋盘、步数、目标进度等数据。

3. `game/`
负责纯游戏逻辑，包括棋盘生成、匹配检测、下落补位、关卡进度计算。这里不要写 DOM 操作。

4. `ui/`
负责 DOM 获取、棋盘布局、Tile 渲染、动画、HUD 展示。这里不要放匹配算法或关卡规则。

5. `main.js`
负责流程编排 Controller：初始化、点击处理、一回合结算、连锁循环、切关/重试。

这套结构的关键原则是：

- 规则和表现分离 Logic / View Separation
- 配置集中 Config Centralization
- 入口文件只做编排 Main As Orchestrator

## 文件说明 File Responsibilities

### 根目录 Root

#### `index.html`
- 页面入口
- 提供 HUD、棋盘容器、关卡结算覆盖层 `#levelOverlay`（内含「下一关 / 重试」按钮 `#nextLevelButton`）
- 提供右上角调试按钮 `#debugWindmillButton`，用于随机把一个普通花 tile 转成风车，方便测试 4 消道具效果
- 提供新手引导层 `#tutorialGuide`，包含手指图片 `#tutorialHand` 和提示文案 `#tutorialTip`
- 提供底部常驻提示 `#persistentHint`，在第 1 关引导完成后显示“点击拔出，下落花朵三连消除”
- 顶层飞行浮层 `#flyLayer`：作为 `.phone-frame` 的直接子级，专门承载「飞向目标」的花朵，使其层级高于 HUD（详见「飞行层级」）
- 通过 `<script type="module">` 加载 `src/main.js`

#### `styles.css`
- 全局页面样式
- 棋盘、格子、花朵 tile 的视觉表现
- 消除、生成等 CSS 过渡，以及飞行层样式
- 响应式布局与移动端适配（详见下文「布局与适配」）

#### `package.json`
- 目前仅用于声明项目采用 ES Module 模式
- 方便后续使用 Node 做基础校验或引入工程工具

### `src/`

#### `src/main.js`
- 应用启动入口
- 初始化 DOM、状态、视图模块
- 监听点击、resize、orientationchange
- 驱动整局流程：点击 -> 移除 -> 掉落 -> 连锁 -> 成功/失败判定
- 管理调试按钮：点击 `#debugWindmillButton` 时，随机挑选一个普通花 tile 转成横向或纵向风车，并刷新对应 tile 视觉；该操作不消耗步数，只用于测试
- 管理第 1 关新手引导：开场入场动画结束后，引导玩家点击 0-based 坐标 `(2, 2)` 的杂草；点击其他 tile 会被忽略，点击目标后隐藏引导、显示底部常驻提示并正常结算

### `src/config/`

#### `src/config/constants.js`
- 动画时间常量
- 连锁安全上限 `MAX_CASCADE_COUNT`，避免极端随机补位导致单回合长时间无限结算
- 应用标题 `APP_TITLE`

#### `src/config/tileKinds.js`
- 定义所有可随机生成的 tile 类型 `TILE_KINDS`
- 普通花朵资源当前映射到 `assets/flowers/flower_1.png` ~ `flower_7.png`：橙色、粉色、黄色、红色、蓝色、紫色、绿色
- `grass` 使用 `assets/grass.png`，当前所有关卡的 `tileKinds` 都包含它；它作为干扰块参与随机生成、点击移除、下落补位与同类连通块消除
- `grass` 不写入 `src/config/levels.js` 的 `goals`，因此不会作为关卡目标，也不会计入目标进度
- 提供按 `key` 查询的 `TILE_KIND_MAP`

#### `src/config/levels.js`
- 定义关卡列表 `LEVELS`
- 全数字驱动配置：
  - **0**: 杂草 (grass)
  - **1**: 橙色 (flower_1)
  - **2**: 粉色 (flower_2)
  - **3**: 黄色 (flower_3)
  - **4**: 红色 (flower_4)
  - **5**: 蓝色 (flower_5)
  - **6**: 紫色 (flower_6)
  - **7**: 绿色 (flower_7)
- 每关的棋盘大小 `columns` / `rows`
- 每关的步数限制 `moveLimit`
- 每关的颜色池 `tileKinds` (使用数字 ID)
- 每关的固定开局布局 `initialBoard` (可选，使用数字 ID)
- 每关的目标花朵种类与数量 `goals` (使用数字 ID)
- 当前关卡尺寸递进：`5x5` -> `6x6` -> `7x7` -> `8x8` -> `8x9` -> `8x10`；宽度上限为 `8`，高度上限为 `10`
- 后续关卡主要通过增加目标种类、提高目标数量、适当增加步数来提高难度

#### `src/config/windmillTimings.js`
- 定义风车触发动画时间：`spinUpDuration`（加速旋转）、`burstDuration`（吹风持续）、`flowerFlyDuration`（花朵飞出动画）、`fadeDuration`（减速消失）
- 当前默认值为 `200 / 300 / 1000 / 80` ms
- 暴露 `applyWindmillTimings(...)`，方便后续重新接入调试工具或运行时配置

### `src/state/`

#### `src/state/gameState.js`
- 创建统一运行时状态对象
- 包含棋盘、tile 自增 id、步数、关卡进度、关卡状态等

### `src/game/`

#### `src/game/board.js`
- 创建 tile 数据
- 生成初始棋盘
- 执行移除、下落、补位
- `applyRemovalsAndCollapse(...)` 返回 `removedTiles` 和 `removedTileGroups`：前者供总数/兼容逻辑使用，后者保留消除组，供动画按组错峰起飞
- 精确 4 个普通同色连通块消除时，4 个原 tile 全部正常移除并飞走，同时创建 1 个新的风车道具；横向形状生成纵向风车 `special.type = "windmillColumn"`，纵向形状生成横向风车 `special.type = "windmillRow"`，宽高相同则随机
- 提供按 id 查找 tile 的能力

这是“棋盘数据变化”的核心模块。

#### `src/game/match.js`
- 检测棋盘中的可消除连通块
- 当前规则是“正交连通且同色，数量 >= 3”
- `findMatchGroups(boardState, columns, rows)` 返回每个可消除连通块组成的二维数组
- `findMatches(...)` 保留为兼容 API，内部把 `findMatchGroups(...)` 结果拍平成单个 tile 数组

这是“匹配规则”的核心模块。

#### `src/game/levelProgress.js`
- 重置关卡进度
- 记录被移除的目标花朵数量
- 判断关卡是否完成
- 计算剩余步数

### `src/ui/`

#### `src/ui/dom.js`
- 集中获取页面上必须存在的 DOM 节点（含棋盘、tile 层、目标列表、顶层飞行浮层 `#flyLayer`、调试按钮 `#debugWindmillButton`、新手引导层 `#tutorialGuide`、底部常驻提示 `#persistentHint`）
- 如果关键节点缺失，尽早报错

#### `src/ui/boardLayout.js`
- 根据视口大小计算棋盘布局
- 设置 CSS 变量 `--tile-size` / `--gap`
- 管理棋盘槽位生成；`.slot` 只做不可见占位，棋盘底部的连续横纵网格线由 `.board::before` 绘制，用来轻微标出格子
- `renderBoardSlots(...)` 使用 `DocumentFragment` 批量插入槽位，减少 resize 时的 DOM 写入次数

#### `src/ui/tileView.js`
- 管理 tile DOM 元素的创建、复用、销毁
- 负责 tile 的位置更新与交互状态同步
- 负责入场、补位等与棋盘坐标的转换
- `growTileIntoBoard(tileId, { duration, delay, column, row, onArrive })`：开场入场动画使用；tile 固定在最终棋盘格，从 `scale(0)` / 透明状态原地放大淡入，表现成从土里长出来
- `updateTile(tile)`：在不改变 tile DOM 位置的情况下重新装饰元素；当前用于调试按钮把普通花直接转成风车
- `flyTile(tileId, { duration, targetRect, onArrive })`：统一处理消除后的花朵飞行；目标花传入 `targetRect` 后沿三次贝塞尔曲线收束到 HUD 目标图标，非目标花不传 `targetRect`，沿同一套贝塞尔曲线飞向屏幕外并淡出
- `flyTileByBezier(...)`：JS 逐帧采样 cubic Bezier，按每朵花随机的控制点、旋转、缩放呼吸感和透明度更新 inline `transform` / `opacity`；用于消除飞出，不再依赖 CSS `transition` 或 `@keyframes` 描述飞行路径
- `popTile(...)` / `burstTile(...)`：风车触发专用表现。风车道具先原地放大到约 1.2 倍并在约 0.5 秒内加速旋转，随后在行/列花朵吹散期间保持匀速旋转，吹散结束后再减速、缩小并渐隐；风车本身不走普通飞花路径
- `liftTileToFlyLayer`：负责把元素接管到浮层并固定像素宽高/位置，避免 HUD 遮挡和棋盘裁切
- 移入 `#flyLayer` 的目的：飞行花朵需要盖在 HUD 之上且不被 `.board-shell` 的 `overflow:hidden` 裁切（详见下文「飞行层级」）
- `getBoardMetrics()` 暴露当前棋盘布局快照；入场、下落、补位、resize 批量定位时应复用同一份 metrics，避免每个 tile 都重复触发 `getBoundingClientRect()` / `getComputedStyle()`

#### `src/ui/animations.js`
- 负责移除、下落、补位、整盘入场的动画时序
- 逻辑层算出结果后，由这里把视觉过程播出来
- `animateBoardEntry(...)` 会把初始棋盘按距离棋盘中心由近到远错峰启动 `tileView.growTileIntoBoard()`，形成花朵先从中间、再到边缘依次从土里长出的入场效果
- 消除时目标花和非目标花都调用 `tileView.flyTile()`：目标花传 `targetRect` 并在命中时通过 `onGoalArrive` 回调通知上层更新进度；非目标花不传 `targetRect`，只做飞散视觉，不更新进度
- `GROUP_FLY_STAGGER = 120`：一次结算中如果有多个消除组，会按组错峰启动飞行；下落补位会等到最后一组开始飞之后再执行，避免还没起飞的花被补位视觉覆盖
- `animateResolution` 在移除和下落完成后就返回 `{ goalFlights }`，不会等待目标花飞行结束；主流程收集这些 Promise，让后续连锁可以在上一批飞行期间继续触发，最后在成功/失败判定前统一等待目标花命中，保证目标进度完整
- 入场和下落动画会先获取一次棋盘 metrics，再传给 `tileView` 批量定位，避免同一轮动画中重复读取布局

#### `src/ui/hudView.js`
- 渲染关卡标题、步数、目标列表
- 关卡徽章统一使用 `hero-badge--no-icon`，只显示关卡数字，不显示花朵图标
- 更新状态面板文案
- `showLevelOverlay({ title, detail, actionLabel })` / `hideLevelOverlay()`：在关卡完成或失败时弹出/收起独立的结算覆盖层 `#levelOverlay`（不再把按钮塞在 HUD 里），并设置覆盖层标题、说明与操作按钮文案
- 目标列表项带 `data-goal-kind`，目标小图标 `.goal-swatch` 复用 `--flower-image` 显示对应花朵图片（不再是纯色点）
- 目标达成时 `goal-item` 会带 `is-complete`，CSS 会在 `.goal-swatch` 图片右下角叠加绿色对号
- `getGoalSwatchRect(kind)`：返回某目标花朵图标的视口坐标，供飞行动画作为终点
- `bumpGoal(kind)`：给对应目标项加上 `is-bumping`，触发数字「跳一下」反馈
- `renderGoalList(...)` 使用 `DocumentFragment` 批量刷新目标列表，降低 HUD 重绘时的 DOM 插入开销

### `src/utils/`

#### `src/utils/grid.js`
- 网格相关小工具
- 如坐标 key、列名、正交邻居查询

#### `src/utils/time.js`
- 提供简单等待函数 `wait()`
- 用于动画时序控制

## 布局与适配 Layout & Responsiveness

外层框（`.phone-frame`，模拟手机外壳）的尺寸策略，目标是「手机用满竖向空间 + 桌面网页保持正常竖屏卡片」。

### 宽度 Width

- 定义在 `.app` 的 `--frame-w`：`min(100vw - 12px, 430px)`
- `430px` 是上限，等于最宽 iPhone（Pro Max 系列）的逻辑宽度，覆盖所有现役 iPhone，桌面上也不会过宽
- 小屏自动跟随屏幕收缩

### 高度（弹性比例）Height (Elastic Aspect Ratio)

- 不再使用固定 `aspect-ratio: 9/16`
- `.phone-frame` 高度用 `clamp()` 夹在两个比例之间：
  - 下限 `--frame-w * 16/9`（9:16，偏方，老机型/桌面下限）
  - 期望 `--avail-h`（可用视口高度，尽量用满）
  - 上限 `--frame-w * 19.5/9`（9:19.5，现代 iPhone 细长屏）
- 效果：现代 iPhone 框接近满屏；iPhone SE(9:16) 正好填满；桌面被限制在 9:16~9:19.5 之间，仍是正常竖屏卡片
- 注意：上下限按**框宽度**换算，而非 `height: 100%`，以避免父子高度循环依赖

### 动态视口高度 Dynamic Viewport Height

- `body` 与可用高度计算使用 `100dvh`（带 `100vh` 兜底）
- 解决 iOS Safari 地址栏伸缩导致 `100vh` 偏大、内容被遮挡的问题

### 安全区 Safe Area

- `index.html` 的 viewport 加了 `viewport-fit=cover`，否则 iOS 读不到 `env(safe-area-inset-*)`
- `body` 用 `env(safe-area-inset-*)` 设置四向内边距，避开刘海/灵动岛与底部横条

### 棋盘自适应 Board Auto-fit（无需手动改）

- 棋盘格子尺寸不是写死的；`src/ui/boardLayout.js` 的 `fitBoardToViewport()` 会在运行时按容器尺寸算出 `--tile-size`（最小 34px 保底），CSS 里的 `--tile-size: 52px` 仅为初始兜底值
- `src/main.js` 同时监听 `resize` 与 `orientationchange`，窗口尺寸/横竖屏变化时会重算棋盘并刷新棋子位置

## 核心数据结构 Core Data Shapes

### Tile

```js
{
  id: number,
  x: number,
  y: number,
  kind: {
    key: string,
    label: string,
    name: string,
  },
  special?: {
    type: "windmillRow" | "windmillColumn",
  }
}
```

`special.type = "windmillRow" | "windmillColumn"` 表示 4 消生成的风车道具。它是新创建的 tile，不复用原 4 消中的某朵花；风车不参与普通同色正交连通检测。玩家点击风车不消耗步数，`windmillRow` 清除整行，`windmillColumn` 清除整列，然后继续执行下落补位与后续连锁。风车触发时道具本身先原地放大到约 1.2 倍并在 `spinUpDuration` 内加速旋转；对应行/列上的花随后沿风车方向被吹散，花朵飞出动画使用独立的 `flowerFlyDuration`，不再复用吹风持续时间；吹散期间风车保持匀速旋转，吹风结束后风车再减速、缩小并渐隐。下落补位只等待风车自身结束，即 `spinUpDuration + burstDuration + fadeDuration`，不等待花朵飞出动画结束。

### Board

- 使用二维数组 `board[y][x]`
- 数据源以 `y` 为行、`x` 为列
- 所有棋盘逻辑都默认遵守这个坐标约定

## 主流程 Main Flow

### 初始化 Initialization

1. 读取 DOM
2. 创建状态对象
3. 初始化 HUD 和 Tile View
4. 计算棋盘尺寸
5. 生成无初始连锁的棋盘
6. 执行整盘原地长出动画

### 一次点击 Turn Resolution

1. 玩家点击一个 tile
2. 直接移除该 tile
3. 棋盘下落与顶部补位
4. 播放移除/掉落动画：
   - 目标花朵旋转飞向 HUD 目标面板，命中瞬间对应目标数量逐朵 +1（带跳动反馈）
   - 非目标花朵飞向屏幕外并淡出
5. 下落完成后立即检测是否形成连锁，不等待上一批目标花飞行结束
6. 如果有连锁则继续结算，并继续收集每轮目标花的 `goalFlights`
7. 所有棋盘连锁结束后，等待已收集的目标花飞行命中，再更新成功/失败状态

精确 4 消的特殊处理：如果某次自动连锁中的消除组由 4 个普通同色 tile 组成，棋盘会先移除全部 4 个原 tile，再创建新的风车道具。风车生成槽位优先选择上一轮刚下落/补位且参与该 4 消的 tile 位置；如果有多个候选，则选离本回合玩家点击位置最近的候选；如果没有移动候选，再回退到组内偏下且靠中的稳定位置。风车方向按 4 消形状决定：横向更多生成纵向清除，纵向更多生成横向清除，宽高相同随机。

连锁循环最多执行 `MAX_CASCADE_COUNT` 次。达到上限后会停止继续自动结算，防止极端随机补位让单回合长时间占用交互流程。

注意：目标进度不再在动画前一次性写入，而是由 `main.js` 的 `handleGoalArrive(tile)` 在每朵目标花飞行命中时逐朵累加并刷新 HUD。`recordRemovedTiles` 已不再被主流程调用（单朵记录逻辑内联在 `handleGoalArrive`）。

## 后续扩展建议 Extension Guide

### 新增关卡 Add Levels

优先修改：

- `src/config/levels.js`

如果只是改目标数量或新增关卡，通常不需要碰其他文件。

### 新增花朵种类 Add Tile Kinds

需要同步修改：

- `src/config/tileKinds.js`
- `styles.css` 中对应的 `.tile--xxx`
- `styles.css` 中目标面板色块 `.goal-swatch--xxx`
- `assets/flowers/` 中新增对应资源

### 新增特殊块 Add Special Tiles

建议优先扩展位置：

- `src/game/match.js`：识别特殊形状或组合
- `src/game/board.js`：处理特殊块触发后的移除规则
- `src/ui/animations.js`：补特殊表现

当前已内联支持 4 消风车 `windmillRow` / `windmillColumn`，尚未建立专门的 `specialTiles.js`。后续如果特殊块变多，再单独拆模块。

### 新增道具 Add Boosters

建议扩展路径：

- 在 `src/main.js` 增加玩家输入入口与使用流程
- 在 `src/game/board.js` 增加对应的棋盘影响逻辑
- 在 `src/ui/hudView.js` 或新增 `ui/boosterPanel.js` 处理按钮表现

### 新增目标类型 Add Goal Types

如果目标不再只是“收集某种花若干个”，建议优先重构：

- `src/game/levelProgress.js`
- `src/config/levels.js`

把 `goal` 从简单计数结构升级成更明确的目标定义对象。

## 开发注意事项 Developer Notes

### 1. 不要把 DOM 操作写回 `game/`

`game/` 只负责算结果；动画、按钮、文案都应放在 `ui/`。

### 2. 不要打破坐标约定

当前统一使用：

- 访问：`board[y][x]`
- tile 数据：`tile.x` / `tile.y`

这是最容易在重构时引入 bug 的地方。

### 3. 动画时间和 JS/CSS 是一套协议

这些值要同步关注：

- `REMOVE_DURATION`
- `FLY_DURATION`（消除后花朵飞行时长，由 `tileView.flyTile()` 的 JS 贝塞尔动画使用）
- `GROUP_FLY_STAGGER`（同一次结算中，不同消除组飞行动画的启动间隔，目前定义在 `src/ui/animations.js`）
- `FALL_DURATION`
- `ENTRY_GROW_DURATION`（开场单朵花原地长出时长）
- `ENTRY_TILE_DELAY`（开场每朵花错峰启动间隔；配合中心到边缘排序形成扩散式长出）
- `styles.css` 里对应的 `transition` / `.tile.is-flying` 状态

飞行相关协议：`.tile.is-flying` 只负责固定消除飞行元素的层级与禁用 CSS 过渡；真实路径由 `tileView.flyTileByBezier()` 用 `requestAnimationFrame` 逐帧写入 inline `transform` / `opacity`。消除飞出结束后由 `releaseTileElement` 回收并清理 inline 样式。开场长出不使用 `#flyLayer`，由 `growTileIntoBoard()` 在棋盘固定位置播放 Web Animations API 的缩放/淡入动画，结束后移除 `.no-transition`，避免后续下落动画失效。

### 7. 飞行层级 Fly Layer Stacking

飞向目标的花朵必须显示在 HUD 之上，且不能被棋盘容器裁切，靠以下约定保证：

- 浮层 `#flyLayer`（`.fly-layer`）是 `.phone-frame` 的直接子级，且排在 `.game-screen` 之后，`z-index: 50`、`overflow: visible`、`pointer-events: none`
- HUD（`.hud`）的 `z-index: 1` 只在 `.game-screen` 内部生效；因为 `.fly-layer` 与 `.game-screen` 同属 `.phone-frame` 这一层叠上下文、且 z-index 更高，所以飞行花朵整体盖在 HUD 之上
- `.tile.is-flying` 用 `position: fixed` + 视口坐标定位，天然不受 `.board-shell { overflow: hidden }` 裁切，飞出棋盘也不会被切掉
- **易错点**：tile 的宽高是 `width: var(--tile-size)`，而 `--tile-size` 只定义在棋盘层（`.board` / `.tile-layer`）上。花朵被移入 `#flyLayer` 后会丢失该变量继承，导致宽高解析为 0（飞行过程「看不见」）。因此 `flyTile` 必须把起点的实际像素宽高显式写到 inline style，并在 `releaseTileElement` 回收时清理 `width` / `height`
- 注意：不要为了飞行效果给 `.board-shell` 放开 `overflow`；飞行层级问题应通过 `#flyLayer` 解决，而非改 board-shell

如果只改 JS 或只改 CSS，视觉和逻辑节奏可能错位。

### 4. Tile DOM 采用对象池复用

`src/ui/tileView.js` 中使用了 DOM pool，目的是减少频繁创建销毁元素带来的抖动。修改这里时要注意清理：

- class
- dataset
- aria
- transition-delay

### 5. 不要改回固定比例 / 注意可用高度变量

布局依赖 `.app` 上的 `--frame-w` 与 `--avail-h` 两个变量，以及 `.phone-frame` 的 `clamp()` 高度。修改外框样式时：

- 不要给 `.phone-frame` 加回固定 `aspect-ratio: 9/16`，否则手机上会重新出现上下大留白
- 改宽度上限请同时检查 `@media (max-width: 720px)` 段里的 `--frame-w`（两处要一致）
- 上下限用框宽度换算，不要用 `height: 100%`（会循环依赖）
- 想让棋盘在 iPhone 上更大，调 `src/ui/boardLayout.js` 里的高度系数 `0.56`，而非改外框

### 6. 当前没有引入 Event Bus

这是刻意保持轻量的结果。当前由 `src/main.js` 直接做模块编排，便于快速迭代。

如果后续系统继续变大，再考虑：

- `CustomEvent`
- 轻量事件总线
- 更明确的 command/event 结构

## 建议的下一步 Next Steps

如果继续长期开发，建议下一批工程化动作按这个顺序推进：

1. 增加基础调试信息 Debug Overlay
2. 增加死局检测与洗牌 Deadlock / Shuffle
3. 为 `game/` 层补纯逻辑测试
4. 再考虑是否升级到 Vite 或更完整的工程工具链
