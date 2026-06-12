# Code Wiki

## 项目简介 Project Overview

这是一个原生前端实现的三消原型项目，目标平台是手机竖屏网页。项目使用 `HTML + CSS + JavaScript ES Modules`，没有引入框架，当前重点是快速迭代玩法原型与关卡体验。

当前核心玩法不是传统“交换两个相邻块”，而是：

1. 玩家点击一个 tile，直接把它移除。
2. 棋盘执行重力下落与顶部补位。
3. 如果出现 3 个及以上的同色正交连通块，就自动消除并继续连锁。
4. 玩家在 `moveLimit` 内完成 `goals` 才能过关。

## 当前关卡节奏 Level Curve

- `1-2` 关：教学关 Teaching
- `3-5` 关：稳定通关 Stable Clear
- `6-8` 关：分区试压 Partition Pressure
- `9-10` 关：多分区高压 Multi-Zone Pressure

当前版本的主要难度设计：

- 第 1 关移除镂空，保留固定教学盘，保证教程点击能稳定触发第一次消除。
- 第 2 关使用更小的颜色池，让玩家继续熟悉“点击移除 -> 下落成团”的规则。
- 第 `3-5` 关不再放 `grass` 进随机池，减少干扰，保证大多数局面更顺手。
- 第 `6-8` 关开始引入整行或整列 `holes`，把棋盘切成多个区域，提高规划压力。
- 第 `9` 关使用双竖列镂空，把棋盘切成三个独立掉落区。
- 第 `10` 关使用十字镂空，把棋盘切成四块区域，目标数进一步提高。

## 目录结构 Project Structure

```text
/ 
  assets/
    bee.png
    grass.png
    item_1.png
    item_2.png
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

项目按职责拆成 5 层：

1. `config/`
静态配置层。只存关卡、资源映射、常量，不放运行时逻辑。

2. `state/`
运行时状态层。保存当前棋盘、步数、目标进度、关卡状态。

3. `game/`
纯规则层。负责棋盘生成、匹配检测、特殊块创建、下落补位、关卡进度判定。这里尽量不操作 DOM。

4. `ui/`
表现层。负责布局、DOM、tile 渲染、动画、HUD。

5. `main.js`
流程编排层 Controller。把点击、规则结算、动画、HUD、切关串起来。

关键原则：

- 规则与表现分离 `Logic / View Separation`
- 配置集中管理 `Config Centralization`
- 入口只做流程编排 `Main As Orchestrator`

## 文件说明 File Responsibilities

### 根目录 Root

#### `index.html`
- 页面入口。
- 提供 loading 启动层、HUD、棋盘容器、结算弹层、调试按钮、新手引导层、飞行层 `#flyLayer`。
- 右上角固定调试区 `global-debug-actions` 包含风车测试、蜂巢测试、选关面板；选关面板由 `#debugLevelPickerButton`、`#debugLevelPanel`、`#debugLevelSelect`、`#debugLevelJumpButton` 组成。
- 通过 `<script type="module">` 加载 `src/main.js`。

#### `styles.css`
- 全局视觉样式。
- 包含首屏 loading overlay 与进度条样式。
- 棋盘、格子、tile、特殊块、飞行动画的样式定义。
- 负责移动端适配和整体页面布局。

#### `package.json`
- 声明项目使用 `ES Module`。
- 当前没有额外构建工具链。

#### `Code_Wiki.md`
- 项目中文代码说明文档。
- 目标是让新开发者只看这一份文档就能快速上手。

### `src/`

#### `src/main.js`
- 应用启动入口。
- 新增 bootstrap 启动门：先预加载首屏必需图片，关闭 loading overlay 后再调用 `initialize()`，保留首屏棋盘入场动画可见。
- 初始化状态、DOM、HUD、tileView、布局。
- 处理玩家点击、特殊块点击、关卡重置、切关。
- 驱动主流程：点击 -> 移除 -> 动画 -> 连锁 -> 成败判定。
- 管理第 1 关教程，固定要求点击 `(2, 2)` 的杂草。
- 管理调试按钮：随机把普通花转成风车或蜂巢；支持通过右侧选关面板直接切到指定关卡并调用 `resetBoard()` 重开。

### `src/config/`

#### `src/config/constants.js`
- 动画时间常量。
- `MAX_BOARD_GENERATION_ATTEMPTS`：初始棋盘生成尝试次数上限。
- `MAX_CASCADE_COUNT`：单次结算最大连锁次数，防止极端随机局面长时间循环。

#### `src/config/levels.js`
- 关卡主配置 `LEVELS`。
- 数字映射：
  - `0`: `grass`
  - `1`: `amber`
  - `2`: `mint`
  - `3`: `sky`
  - `4`: `violet`
  - `5`: `rose`
  - `6`: `gold`
  - `7`: `green`
- 每关包含：
  - `columns` / `rows`
  - `moveLimit`
  - `tileKinds`
  - `goals`
  - `initialBoard`（可选）
  - `holes`（可选）
- 当前关卡设计要点：
  - 第 1 关为固定教学盘。
  - 第 `3-5` 关去掉随机草块，提高稳定通关率。
  - 第 `6-8` 关使用整行或整列 `holes` 进行分区。
  - 第 `9` 关使用双竖列 `holes`，形成三路掉落区。
  - 第 `10` 关使用十字 `holes`，形成四象限式分区。

#### `src/config/tileKinds.js`
- 定义所有 tile 类型与资源路径 `assetPath`。
- 普通花、杂草、风车、蜂巢都在这里有统一数据结构。
- 提供 `TILE_KIND_MAP`，方便通过 key 查询类型对象。

#### `src/config/windmillTimings.js`
- 风车特效时序配置。
- 包含加速、吹风、飞花、淡出等阶段的时间参数。

### `src/state/`

#### `src/state/gameState.js`
- 创建统一运行时状态对象。
- 关键字段：
  - `board`
  - `tileIdSeed`
  - `currentLevelIndex`
  - `goalProgress`
  - `movesUsed`
  - `isLevelCompleted`
  - `isLevelFailed`
  - `holes`

### `src/game/`

#### `src/game/board.js`
- 棋盘底层核心模块。
- 创建 tile 数据。
- 生成随机棋盘 `createBoard(...)`。
- 生成固定棋盘 `createFixedBoard(...)`。
- 执行移除、下落、补位 `applyRemovalsAndCollapse(...)`。
- 处理镂空 `holes`：镂空格不生成 tile，掉落时可穿透。
- 负责在 4 连通块时生成风车，在 5+ 连通块时生成蜂巢。

#### `src/game/match.js`
- 匹配检测模块。
- 当前规则不是“直线三消”，而是“正交连通且同色，数量 >= 3”。
- `findMatchGroups(...)` 返回每个可消除连通块。

#### `src/game/levelProgress.js`
- 初始化每关进度。
- 根据关卡配置写入 `state.holes`。
- 判断格子是否为镂空。
- 判断关卡是否完成。
- 计算剩余步数。

### `src/ui/`

#### `src/ui/dom.js`
- 统一获取页面必需 DOM 节点。
- 同时暴露右侧调试区的选关节点，供 `main.js` 直接绑定事件。
- 缺关键节点时尽早报错。

#### `src/ui/boardLayout.js`
- 根据视口计算棋盘尺寸。
- 生成 `.slot` 占位格。
- 根据 `holes` 生成异形棋盘遮罩、外轮廓和内部网格线。
- 这是镂空棋盘视觉正确性的核心模块。

#### `src/ui/tileView.js`
- 管理 tile DOM 的创建、销毁、复用、更新。
- 负责把逻辑坐标映射到像素坐标。
- 提供入场、飞行、缩放、补位等表现接口。

#### `src/ui/animations.js`
- 管理整盘入场、消除、下落、补位、目标飞行、特殊块链式表现的时序。
- 逻辑层只给结果，这里负责把视觉过程播出来。

#### `src/ui/hudView.js`
- 渲染顶部关卡信息和目标列表。
- 更新步数、目标进度、状态文案。
- 管理关卡完成/失败弹层。

### `src/utils/`

#### `src/utils/grid.js`
- 网格工具函数。
- 提供列名、坐标 key、正交邻居等辅助方法。

#### `src/utils/time.js`
- 提供简单的等待能力 `wait()`。
- 用于动画串联。

## 规则细节 Gameplay Details

## 启动加载流程 Startup Loading Flow

当前版本新增了“首屏资源预加载 `First Screen Preload`”机制，目的不是等待整包 zip 内所有文件，而是只等待首屏一定会用到的关键图片资源。

启动顺序：

1. `index.html` 先渲染 loading overlay。
2. `src/main.js` 的 `bootstrap()` 收集第 1 关首屏资源清单。
3. 使用 `Image()` 逐张预加载，并更新进度条。
4. 图片加载完成后先关闭 loading overlay，再调用 `initialize()`。
5. `initialize()` 内部首次 `resetBoard()` 会正常播放首屏棋盘入场动画。
6. 用户可以看到原本的棋盘生成过程，而不是在 loading 层后面播完。

当前首屏资源清单来源：

- 固定资源：`assets/HandPointer.png`
- 第 1 关 `goals`
- 第 1 关 `initialBoard` 里实际出现的 tile 种类

这样做的好处：

- zip 包拆资源后，避免首屏看到缺图或半加载状态。
- 不需要等待后续关卡资源，首开速度更可控。
- 进度条基于显式资源清单，用户感知比浏览器默认空白等待更好。

### 点击规则 Click Rule

- 点击普通 tile：直接移除，消耗 1 步。
- 点击单个风车/蜂巢：触发特殊效果，消耗 1 步。
- 点击与另一个风车上下左右相邻的风车：优先触发“双风车合成”，消耗 1 步；点击后 A 风车会以普通风车点击时的方式持续原地旋转，同时 A/B 两个风车先隐藏箭头层，B 风车后撤并前撞到 A，撞上后 B 消失，A 直接变成放大的大风车并保持旋转，再复用风车连锁逻辑，以点击位置为中心清掉 `3` 条横向整行和 `3` 条纵向整列。

### 消除规则 Match Rule

- 只看正交四方向连接，不看对角线。
- 同色连通块数量达到 `3` 就会整体消除。
- 这意味着局面思考重点是“点击后让哪些块掉下来连成团”，而不是传统直线交换。

### 特殊块规则 Special Tiles

- `风车 Windmill`
  - 由恰好 4 个普通同色连通块生成。
  - 可清一整行或一整列。
  - 如果两个风车上下左右相邻，点击其中一个时不会走单风车逻辑，而是先让相邻风车后撤并撞入点击点，随后临时弹出一个“大风车”，再按风车链式规则结算“中心点上下共 `3` 行 + 左右共 `3` 列”的目标范围。

- `蜂巢 Hive`
  - 由 5 个及以上普通同色连通块生成。
  - 最多放出 5 只蜜蜂。
  - 优先命中未完成目标，其次命中特殊块，再次命中普通花，最后才是草块。

### 镂空规则 Holes

- `holes` 用 `[x, y]` 数组定义，坐标从 `0` 开始。
- 镂空格不渲染底板、不生成 tile、不可点击。
- 掉落时采用“穿透式重力”：上方 tile 可以穿过镂空落到下方可用格。
- 当 `holes` 连成一整列时，视觉和连通性上都会把棋盘切成左右两区。

## 当前关卡配置摘要 Current Level Summary

1. `Level 1`
教学固定盘，`5x5`，无镂空，点击教程草块后会稳定形成第一次蓝花三连通。

2. `Level 2`
`6x6`，低颜色池，低目标数，用于继续熟悉点击与下落。

3. `Level 3`
`6x6`，开始进入稳定随机盘。

4. `Level 4`
`7x7`，目标数量与颜色种类继续提升。

5. `Level 5`
`8x8`，首次三目标，但仍保持稳定通关取向。

6. `Level 6`
`8x8`，第一个整列镂空分区关。

7. `Level 7`
`8x9`，整列镂空继续保留，目标数提高。

8. `Level 8`
`8x10`，四目标 + 整列镂空，为当前最难关。

## 调试与开发建议 Dev Notes

- 关卡难度优先通过 `src/config/levels.js` 调整。
- 如果想做更稳定的数值平衡，下一步建议增加：
  - 随机补位权重 `weighted spawn`
  - 关卡模拟器 `level simulator`
- 当前项目是原型，很多体验差异仍受随机补位影响。

## 新人上手建议 Onboarding

1. 先读 `src/config/levels.js`，理解每关是如何配置的。
2. 再读 `src/main.js`，掌握完整一回合流程。
3. 然后读 `src/game/board.js` 和 `src/game/match.js`，理解规则核心。
4. 最后看 `src/ui/boardLayout.js` 和 `src/ui/animations.js`，理解镂空棋盘和动画表现。

按这个顺序看，能最快建立全局认知。
