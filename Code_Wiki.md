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
- 提供 HUD、棋盘容器、下一关按钮
- 通过 `<script type="module">` 加载 `src/main.js`

#### `styles.css`
- 全局页面样式
- 棋盘、格子、花朵 tile 的视觉表现
- 消除、生成、入场等 CSS 过渡动画
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

### `src/config/`

#### `src/config/constants.js`
- 棋盘大小 `COLUMNS` / `ROWS`
- 动画时间常量
- 步数限制 `MOVE_LIMIT`
- 应用标题 `APP_TITLE`

#### `src/config/tileKinds.js`
- 定义所有花朵类型 `TILE_KINDS`
- 提供按 `key` 查询的 `TILE_KIND_MAP`

#### `src/config/levels.js`
- 定义关卡列表 `LEVELS`
- 每关的目标花朵种类与数量

### `src/state/`

#### `src/state/gameState.js`
- 创建统一运行时状态对象
- 包含棋盘、tile 自增 id、步数、关卡进度、关卡状态等

### `src/game/`

#### `src/game/board.js`
- 创建 tile 数据
- 生成初始棋盘
- 执行移除、下落、补位
- 提供按 id 查找 tile 的能力

这是“棋盘数据变化”的核心模块。

#### `src/game/match.js`
- 检测棋盘中的可消除连通块
- 当前规则是“正交连通且同色，数量 >= 3”

这是“匹配规则”的核心模块。

#### `src/game/levelProgress.js`
- 重置关卡进度
- 记录被移除的目标花朵数量
- 判断关卡是否完成
- 计算剩余步数

### `src/ui/`

#### `src/ui/dom.js`
- 集中获取页面上必须存在的 DOM 节点
- 如果关键节点缺失，尽早报错

#### `src/ui/boardLayout.js`
- 根据视口大小计算棋盘布局
- 设置 CSS 变量 `--tile-size` / `--gap`
- 绘制底部格子槽位

#### `src/ui/tileView.js`
- 管理 tile DOM 元素的创建、复用、销毁
- 负责 tile 的位置更新与交互状态同步
- 负责入场初始位置、补位初始位置等与棋盘坐标的转换

#### `src/ui/animations.js`
- 负责移除、下落、补位、整盘入场的动画时序
- 逻辑层算出结果后，由这里把视觉过程播出来

#### `src/ui/hudView.js`
- 渲染关卡标题、步数、目标列表
- 更新状态面板文案
- 控制下一关 / 重试按钮文案与显隐

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
  }
}
```

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
6. 执行整盘入场动画

### 一次点击 Turn Resolution

1. 玩家点击一个 tile
2. 直接移除该 tile
3. 棋盘下落与顶部补位
4. 播放移除/掉落动画
5. 检测是否形成连锁
6. 如果有连锁则继续结算
7. 更新目标进度、步数、成功/失败状态

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

当前版本还没有建立专门的 `specialTiles.js`，因为原型阶段先保证基础连锁稳定。后续如果特殊块变多，再单独拆模块。

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

### 3. 动画时间和 CSS 是一套协议

这些值要同步关注：

- `REMOVE_DURATION`
- `FALL_DURATION`
- `ENTRY_FALL_DURATION`
- `styles.css` 里对应的 `transition`

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
