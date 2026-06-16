# Code Wiki

## 项目简介 Project Overview

这是一个原生前端实现的三消原型项目，目标平台是手机竖屏网页。项目使用 `HTML + CSS + JavaScript ES Modules`，没有引入框架，当前重点是快速迭代玩法原型与关卡体验。

当前核心玩法不是传统“交换两个相邻块”，而是一个正在迭代中的点击消除原型：

1. 玩家点击普通花或 `grass` 时，会直接移除该格并消耗 `1` 步。
2. 棋盘空位会继续执行下落与顶部补位，并在形成 `3+` 同色正交连通块时自动消除与连锁。
3. 底部区域现在是 `Energy Meter`，采用“梦幻花园式”充能：普通消除不充能，只有特殊道具触发才会充能。
4. 目标 tile 仍然优先用于推进关卡目标；能量条与目标结算是两套并行规则，不再按“非目标 tile 数量”累计能量。
5. 每累计 `10` 点有效能量，就会自动在棋盘上随机挑一个非特殊普通格，替换生成一个 `光球 Lightball`。

## 当前关卡节奏 Level Curve

- `1-3` 关：规则教学 Teaching
- `4-10` 关：稳定爽感 Stable Clear
- `11-20` 关：软分区与穿透理解 Soft Partition Pressure
- `21-30` 关：多分区高压 Multi-Zone Pressure

当前版本的主要难度设计：

- 当前启动顺序恢复为标准的 `1 -> 2 -> 3 -> ... -> 30`。
- 第 1 关是固定教学盘，用一个草块点击示范“点掉单格后靠重力形成第一次连通消除”。
- 第 `2-10` 关优先保证颜色池可读、步数紧凑，并穿插短步数爽快关。
- 第 `3` 关开始间歇性引入 `brick` 砖块，部分关卡会直接用整行砖墙封住下方区域。
- 第 `11-20` 关开始引入虚线分区、穿透式横切和环形镂空，训练玩家理解掉落路径。
- 第 `21-30` 关逐步叠加多区规划压力、grass 干扰、更大的盘面与更厚的砖墙结构，作为当前版本的长线挑战段。

## 目录结构 Project Structure

```text
/ 
  assets/
    bee.png
    grass.png
    item_1.png
    item_ball.png
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
- 右上角固定调试区 `global-debug-actions` 包含风车测试、光球测试、选关面板；选关面板由 `#debugLevelPickerButton`、`#debugLevelPanel`、`#debugLevelSelect`、`#debugLevelJumpButton` 组成。
- 通过 `<script type="module">` 加载 `src/main.js`。

#### `styles.css`
- 全局视觉样式。
- 包含首屏 loading overlay 与进度条样式。
- 棋盘、格子、tile、特殊块、飞行动画的样式定义。
- 现在额外包含基于 SVG 填充风团 `wind-gust-shape` 的风带表现，并辅以少量 `wind-gust-mote` 风屑粒子，供风车按“旋转 -> 风带命中 -> 目标消除”的节奏使用。
- 负责移动端适配和整体页面布局。

#### `windmill-showcase.html`
- 独立的特效展示页入口。
- 不依赖主棋盘结算流程，当前包含 `风车` 与 `双光球` 两个页签。
- 当前展示页使用 `5x5` 棋盘格布局，元素都按格子中心对齐，方便更接近实机感受。
- 内置循环播放和调试面板，页签切换后参数面板会跟着切换。
- 提供写回按钮，可把当前调好的参数写回 `src/config/windmillTimings.js` 或 `src/config/lightballTimings.js`。

#### `windmill-showcase.css`
- 独立展示页样式。
- 负责展示棋盘、格子、风车页签、双光球页签、SVG 风刷、黑场、冲击波、循环播放控制和调试面板的视觉表现。

### `tools/`

#### `tools/windmill-writeback-server.js`
- 本地写回服务。
- 提供 `http://127.0.0.1:3210/api/write-effect-defaults` 接口，供展示页按钮直接把当前参数写回 `src/config/windmillTimings.js`（以及双光球配置文件）。
- 同时提供简单静态文件服务与健康检查接口 `GET /api/health`。

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
- 编排一整回合的点击消除、特殊道具触发、后续消除结算、能量累计、自动生成光球。
- 当前能量规则为：只统计特殊道具触发的充能值；若同一次特殊道具使用带出了多个特殊道具，则按这条特殊道具链的总触发数做倍率放大。
- 风车 / 光球点击结算逻辑仍保留并继续作为特殊块默认入口。
- 双风车合体入口已关闭；相邻风车现在只会按普通特殊连锁继续触发，不再生成大风车。
- 关卡目标达成后，如果场上仍有特殊道具，当前版本会先自动依次激活并播放完整收尾连消；收尾阶段不再生成新道具，等表演结束后才弹出下一关按钮。
- 旧教程入口已关闭，改为直接显示当前原型提示文案。
- 管理调试按钮：随机把普通花转成风车或光球；支持通过右侧选关面板直接切到指定关卡并调用 `resetBoard()` 重开。

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
  - `bricks`（可选）
- 当前关卡设计要点：
  - 第 1 关为固定教学盘。
  - 第 `2-10` 关以低到中颜色池为主，优先教学点击坍塌、连通成团、特殊块和能量循环。
  - `brick` 不计入消除目标种类，但会直接改变初始可达区域与掉落路径。
  - 第 `11-20` 关使用软分区、虚线镂空和环形镂空来制造可规划的中盘压力。
  - 第 `21-30` 关使用更大的棋盘、更多目标数和多区组合镂空作为后段挑战。

#### `src/config/tileKinds.js`
- 定义所有 tile 类型与资源路径 `assetPath`。
- 普通花、杂草、风车、光球都在这里有统一数据结构。
- 提供 `TILE_KIND_MAP`，方便通过 key 查询类型对象。

#### `src/config/windmillTimings.js`
- 风车特效时序配置。
- 包含加速、SVG 风带、目标受风反馈、飞花、淡出，以及风团厚度/弯曲/分散/风屑等主风形参数。

#### `src/config/lightballTimings.js`
- 双光球特效时序配置。
- 当前把 `公转时长 orbitDuration` 与 `公转速度 orbitSpeed` 分开管理，二者互不影响。
- 同时包含停顿、对撞、黑场、爆闪、冲击波、抖动等参数。

### `src/state/`

#### `src/state/gameState.js`
- 创建统一运行时状态对象。
- 关键字段：
  - `board`
  - `recycleCharge`
  - `tileIdSeed`
  - `currentLevelIndex`
  - `goalProgress`
  - `movesUsed`
  - `isLevelCompleted`
  - `isLevelFailed`
  - `holes`
  - `bricks`

### `src/game/`

#### `src/game/board.js`
- 棋盘底层核心模块。
- 创建 tile 数据。
- 生成随机棋盘 `createBoard(...)`。
- 生成固定棋盘 `createFixedBoard(...)`。
- 执行移除、下落、补位 `applyRemovalsAndCollapse(...)`。
- 处理镂空 `holes`：镂空格不生成 tile，掉落时可穿透。
- 处理 `brick`：砖块格不生成 tile；砖块下方的空区会按“先直落、再斜滑”的三消式重力逐步灌满。
- 负责在 4 连通块时生成风车，在 5+ 连通块时生成光球。

#### `src/game/match.js`
- 匹配检测模块。
- 当前规则不是“直线三消”，而是“正交连通且同色，数量 >= 3”。
- `findMatchGroups(...)` 返回每个可消除连通块。

#### `src/game/levelProgress.js`
- 初始化每关进度。
- 根据关卡配置写入 `state.holes`。
- 根据关卡配置写入 `state.bricks`。
- 判断格子是否为镂空。
- 处理砖块受击：砖块四邻格累计被消除 2 次后破碎。
- 判断关卡是否完成。
- 计算剩余步数。

### `src/ui/`

#### `src/ui/dom.js`
- 统一获取页面必需 DOM 节点。
- 包含底部能量面板容器与计数节点。
- 包含独立的 `brickLayer`，用于在 tile 下方渲染砖块障碍层。
- 同时暴露右侧调试区的选关节点，供 `main.js` 直接绑定事件。
- 缺关键节点时尽早报错。

#### `src/ui/boardLayout.js`
- 根据视口计算棋盘尺寸。
- 生成 `.slot` 占位格。
- 根据 `holes` 生成异形棋盘遮罩、外轮廓和内部网格线。
- 同步给 `brickLayer` / `tileLayer` 写入统一的格子尺寸，保证砖块与 tile 精确对齐。
- 这是镂空棋盘视觉正确性的核心模块。

#### `src/ui/tileView.js`
- 管理 tile DOM 的创建、销毁、复用、更新。
- 负责把逻辑坐标映射到像素坐标。
- 额外维护 `brickLayer` 的砖块 DOM，支持完整、受损、破碎后的刷新。
- 提供入场、飞行、缩放、补位等表现接口。
- 当前同时提供 `playWindLines(...)`，用于从风车中心向目标格发射基于 SVG 填充风团的多股风带并带少量风屑拖尾，且会读取 `windmillTimings` 里的风形参数；`gustHitTile(...)` 用于目标格受风偏移反馈。

#### `src/ui/animations.js`
- 管理整盘入场、消除、下落、补位、目标飞行、特殊块链式表现的时序。
- 风车的当前表现改为：先旋转蓄力，再发出风线，等风线命中目标格后才触发对应格子的消除或后续特殊链。
- 双光球当前会读取 `DUAL_LIGHTBALL_TIMINGS`，按“公转 -> 停顿 -> 对撞 -> 爆炸”的节奏播放。
- 逻辑层只给结果，这里负责把视觉过程播出来。
- 当前补位表现支持按位移距离自适应时长，斜滑距离越远，落下时间越长。

#### `src/ui/hudView.js`
- 渲染顶部关卡信息和目标列表。
- 更新步数、目标进度、状态文案。
- 管理关卡完成/失败弹层。

### `src/demo/`

#### `src/demo/windmillShowcase.js`
- 独立特效展示页脚本。
- 当前同时维护 `风车` 与 `双光球` 两个页签的播放、调参、循环播放、参数写回。
- 双光球页签支持单独调 `orbitDuration`、`orbitSpeed`，确保时长和速度互不绑定。

#### `index.html` / `styles.css` 中新增的 Energy UI
- 新增底部 `collection-tray-panel`，当前作为光球能量面板使用。
- 面板内部显示一条 `Energy Meter`，用于展示距离下一个自动光球还差多少特殊道具充能。

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
2. `src/main.js` 的 `bootstrap()` 收集首个出场关卡的首屏资源清单。
3. 使用 `Image()` 逐张预加载，并更新进度条。
4. 图片加载完成后先关闭 loading overlay，再调用 `initialize()`。
5. `initialize()` 内部首次 `resetBoard()` 会正常播放首屏棋盘入场动画。
6. 用户可以看到原本的棋盘生成过程，而不是在 loading 层后面播完。

当前首屏资源清单来源：

- 固定资源：`assets/HandPointer.png`
- 当前首个出场关卡（现为 `id: 1`）的 `goals`
- 当前首个出场关卡（现为 `id: 1`）的棋盘里实际出现的 tile 种类

这样做的好处：

- zip 包拆资源后，避免首屏看到缺图或半加载状态。
- 不需要等待后续关卡资源，首开速度更可控。
- 进度条基于显式资源清单，用户感知比浏览器默认空白等待更好。

### 点击规则 Click Rule

- 点击普通花或 `grass`：直接移除该 tile，并立刻进入下落、补位和后续自动连锁。
- 点击风车 / 光球：继续沿用特殊块触发逻辑。
- 普通点击消除、普通三消、普通自动连锁都不会给底部能量条充能。
- 只有特殊道具被触发时才会充能；当前项目里已接入的是风车与炸弹，光球不参与充能。
- 当前基础值：`风车 = +1`，`大风车 = +1`，`炸弹 = +2`，`光球 = +0`。
- 连锁倍率：只看“同一次特殊道具使用一共触发了多少个特殊道具”。
- 例如：只触发自己时是 `x1`；A 触发 B 时是 `x2`；A 触发 B、C 时是 `x3`。
- 下落补位后形成的普通自动消除，不算这里的“连锁触发”，只算后续消除。
- 能量累计到 `10` 时，会自动生成一个 `光球 Lightball`。
- 自动光球会替换棋盘上一个随机的、非特殊的普通 tile；优先替换花，若没有花才会回退到 `grass`。

### 消除规则 Match Rule

- 只看正交四方向连接，不看对角线。
- 同色连通块数量达到 `3` 就会整体消除。
- 这意味着局面思考重点是“点击后让哪些块掉下来连成团”，而不是传统直线交换。

### 特殊块规则 Special Tiles

- `风车 Windmill`
  - 由恰好 4 个普通同色连通块生成。
  - 触发时会清掉自己，以及上下左右各 `1` 格，形成一个十字范围。
  - 如果风车的清除范围打到另一个风车，会把对方继续作为普通特殊道具连锁触发。
  - 双风车合体生成“大风车”的入口当前已屏蔽；`mergedWindmill` 仍有遗留常量和表现兼容代码，但正常流程不会再进入。

- `光球 Lightball`
  - 由 5 个及以上普通同色连通块生成。
  - 点击后会从当前棋盘随机抽取一种场上花色。
  - 表现层会先让光球转圈蓄力，再对所有目标花打出电流连线，全部锁定后统一消除。
  - 统一消除后目标花会直接飞向顶部目标栏；普通花只做普通飞散表现，不给能量条充能。
  - 随后清除全盘该花色，并进入正常的掉落、补位与后续自动连锁。
  - 当前版本不会被风车等其他特殊块被动触发；只响应玩家主动点击。
  - 光球本身不参与反向充能，避免形成自循环。

- `特殊充能表现 Special Charge FX`
  - 风车 / 大风车 / 炸弹在自己的触发动画完成后，会从 origin 位置发出能量光点，沿曲线飞向底部 `Energy Meter`。
  - 每个光点到达时，`recycleChargePreview` 会立即 `+1`，让进度条先做实时预览，再在 `resolveRecycleProgress()` 中结转成真实能量。
  - 光球不会发这类能量光点，也不会为能量条提供充能值。

### 镂空规则 Holes

- `holes` 用 `[x, y]` 数组定义，坐标从 `0` 开始。
- 镂空格不渲染底板、不生成 tile、不可点击。
- 掉落时采用“穿透式重力”：上方 tile 可以穿过镂空落到下方可用格。
- 当 `holes` 连成一整列时，视觉和连通性上都会把棋盘切成左右两区。

### 砖块规则 Bricks

- `bricks` 用 `[x, y]` 数组定义，坐标从 `0` 开始。
- 砖块本身不属于普通消除物件，不写入 `tileKinds`，也不参与目标计数。
- 砖块所在格初始没有 tile。
- 当前版本里，砖墙经常被设计成一整排或双排，用来封住下方区域。
- 当砖块上方或侧方的四邻格发生消除时，砖块会累计 `1` 次受击。
- 累计受击 `2` 次后砖块破碎；第 `1` 次受击显示裂纹贴图，第 `2` 次后格子重新开放。

### 下落规则 Gravity Rule

- 当前版本使用接近传统三消的“先正下、再斜下”的补位逻辑。
- 遍历顺序是从底往上逐格稳定结算，而不是一次性预判整条路径。
- 对某个空格，优先尝试让正上方 tile 直落补入。
- 如果正上方不可补入，再尝试左上或右上 tile 斜向滑入。
- 左右斜滑优先顺序会做平衡，避免整个棋盘长期向单侧倾斜。
- 砖墙开口后，下方空区会因此形成类似金字塔 / 漏斗的倾泻分布。

## 当前关卡配置摘要 Current Level Summary

1. `Level 1-3`
固定教学盘 + 低颜色池基础盘，先教“点击单格 -> 下落成团 -> 自动连锁”。

2. `Level 4-10`
进入稳定通关与爽感建立阶段，穿插短步数爽快关，并开始用单排砖墙让玩家理解“先破墙，再倾泻补位”。

3. `Level 11-20`
开始引入虚线列切分、虚线横切、十字连接、中央天井以及双排砖墙等可规划障碍。

4. `Level 21-30`
进入长线挑战段，使用更大盘面、更多目标和更复杂的多区压力组合，并叠加整排砖墙来制造更强的分层下落压力。

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
