# Vocab Memorier (词记)

<div align="center">

![React 19](https://img.shields.io/badge/React-19.0.0-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6.2.1-646CFF?logo=vite&logoColor=white)
![Material 3](https://img.shields.io/badge/Design-Material%203-757575?logo=materialdesign&logoColor=white)
![Offline First](https://img.shields.io/badge/Storage-IndexedDB%20%2F%20Dexie-009688)
![License](https://img.shields.io/badge/License-MIT-green)

**现代高效、纯本地离线、组循环抗遗忘的英文单词速背 Web 应用**

[在线预览与体验](#快速开始) · [核心特性](#-核心特性) · [速背机制](#-速背机制详解) · [技术栈](#-技术架构) · [快捷键指南](#-键盘快捷键)

</div>

---

## 📖 项目简介

**Vocab Memorier** 是一款专注于高强度、短周期、高保留率的现代化单词速记系统。应用专为攻克专四/专八、考研英语、雅思、托福及 GRE 等大容量词表设计，彻底告别传统背词软件“前背后忘、大队拖沓、依赖云端”的痛点。

系统严格贯彻 **Local-First（本地优先）** 架构哲学，全量内置离线牛津高阶词典与 MDX 字典流式解析引擎，数据完全存放于本地浏览器的 IndexedDB 数据库中，**零云端依赖、零隐私泄露、无网环境下秒级响应**。

---

## ✨ 核心特性

### 1. 📚 内置权威牛津高阶双解词库 (OALDPE)
- **开箱即用**：内置精装版牛津高阶英汉双解词典（V2025 最新版本）。
- **完整收录**：覆盖 **69,981** 条实体核心词条与 **544,105** 条屈折变形与跳转映射（如动词过去式、复数变化、英美拼写变体等秒级解析跳转）。
- **极速响应**：首创客户端透明 Gzip 流式分块解码入库，本地毫秒级索引查询，展示标准英/美音标、权威词性分类与精炼中文释义。

### 2. 🗂️ 自定义 MDX 词库无缝扩展与追加
- **通用 MDX 解码**：纯前端实现高性能 MDict (v1.2 / v2.0) 二进制解析引擎，支持 UTF-8 / UTF-16 / GBK 多重编码。
- **ZIP 拖拽热加载**：支持在「设置」中直接拖入或上传包含 `.mdx` 的 `.zip` 压缩包，自动解压、提取释义并实时载入本地数据库。
- **增量加法合并**：词典更新采用增量策略，自动保留现有词条并剔除重复词，避免暴力清空。

### 3. 🧠 科学组循环 (20 词/组) 速记引擎
- **20 词黄金分批 (Group Cycle)**：自动将大词表切分为每组 20 词的紧凑单元，避免整表无底洞式疲劳。未攻克当前组前绝不进入下一组。
- **阶段一：初学识记 (Initial Learning)**：
  - 采用 6 词微批次穿插推进，即时触发小回测。
  - 遇到不认识/模糊卡片即刻插入队列后方重新加权，杜绝连续立即重现，强化工作记忆。
- **阶段二：集中独立测试 (Intensive Testing)**：
  - 全组初学完成后统一进入乱序闭卷复测。
  - **严格 OR 独立性判定**：卡片通关必须满足连续两次独立答对，且单张卡片答对之间必须满足「间隔 8 张其他卡片」或「物理冷却满 90 秒」，彻底消除瞬时视觉残影带来的伪记忆。

### 4. ⚡ 零闪烁丝滑卡片过渡
- 深度优化状态流转与 DOM 渲染管线，采用数据预读取与单一状态原子提交机制，切词时无白屏、无高度跳变、无折叠闪屏。

### 5. 📥 智能导入与全量本地数据备份
- **文本/表格导入**：支持 `.txt` 与 `.csv` 格式，支持自定义标注（如 `convert（已认识）` 或自定义释义）。
- **智能去重过滤**：导入多份文件时自动识别重复单词，增量追加新词。
- **离线安全备份**：随时一键导出包含全部学习进度、打卡记录、卡片状态的 JSON 备份文件，并支持跨浏览器安全恢复。

### 6. 🎨 Material Design 3 Expressive 质感设计
- 采用 Google Material You (M3) 设计语言，提供充满呼吸感的圆角、柔和容器色阶与自适应排版。
- 完整支持 **深色主题 (Dark Mode)**、**浅色主题 (Light Mode)** 及 **跟随系统 (System)** 实时无缝切换。

---

## 🔁 速背机制详解

```mermaid
flowchart TD
    A[导入词表] --> B[分批划组 (每组 20 词)]
    B --> C["阶段一：初学识记 (6 词微批循环)"]
    C -- 评分 AGAIN/HARD --> D[回退队列第 3-4 位复测]
    C -- 评分 GOOD --> E[初学队列推进]
    D --> C
    E --> F{全组 20 词初学完成?}
    F -- 否 --> C
    F -- 是 --> G["阶段二：独立测试 (打乱测试池)"]
    G -- "第 1 次答对" --> H["进入连对 1 次 (启动冷却锁)"]
    H -- "未满 8 张卡片且 < 90s" --> I[保护期答对不累加连对]
    H -- "间隔 >= 8 卡片 或 >= 90s (第 2 次答对)" --> J[🎉 本词通关 (Mastered)]
    G -- 答错 / 模糊 --> K[连对清零 / 踢回强化]
    K --> G
    J --> L{本组全部通关?}
    L -- 否 --> G
    L -- 是 --> M[🏆 本组通关！进入下一组速背]
```

---

## ⌨️ 键盘快捷键

为了实现高速背词体验，应用全程支持免鼠标沉浸式纯键盘操作：

| 快捷键 | 所在界面 / 状态 | 功能说明 |
|:---|:---|:---|
| <kbd>Space</kbd> / <kbd>Enter</kbd> | 题目状态（未翻面） | **揭示答案**（显示音标、词性与中文释义） |
| <kbd>Space</kbd> / <kbd>Enter</kbd> | 答案状态（已翻面） | 评定为 **认识 (Good)** |
| <kbd>1</kbd> | 答案状态（已翻面） | 评定为 **不认识 (Again)**，重新排入短期强化池 |
| <kbd>2</kbd> | 答案状态（已翻面） | 评定为 **模糊 (Hard)**，重新排入短期强化池 |
| <kbd>3</kbd> | 答案状态（已翻面） | 评定为 **认识 (Good)**，累计通关进度 |
| <kbd>Z</kbd> | 任意答题状态 | **撤销上一步操作**（回退卡片状态、队列与历史日志） |

---

## 🛠️ 技术架构

```
vocab-memorier/
├── src/
│   ├── core/                      # 核心领域逻辑
│   │   ├── dict/                  # MDX 词典二进制流解析器与加解密引擎
│   │   ├── importer/              # TXT/CSV 文本清洗、去重与解析器
│   │   └── scheduler/             # 20 词组循环调度器、状态机与间隔规则
│   ├── data/                      # 本地数据持久化
│   │   ├── backup/                # JSON 备份导出与校验恢复
│   │   ├── db/                    # Dexie (IndexedDB) 数据库表定义
│   │   ├── repos/                 # 词典、词本、卡片、日志仓储访问层
│   │   └── dictLoader.ts          # 离线词典 Gzip 解码与预载引擎
│   ├── features/                  # 业务功能页面
│   │   ├── decks/                 # 单词本列表管理与新建
│   │   ├── import/                # 词表导入、去重预览与匹配
│   │   ├── settings/              # 词典切换、MDX 上传、主题与备份
│   │   ├── stats/                 # 阶段学习报表与数据统计
│   │   └── study/                 # 核心背词交互、无闪烁卡片与快捷键
│   ├── hooks/                     # 状态与副作用封装 (useStudySession 等)
│   └── ui/                        # Material 3 Expressive UI 组件原子库
├── public/
│   └── dict/                      # 内置 Oxford 高阶精装词典数据包与清单
├── tests/                         # 自动化测试套件
│   ├── unit/                      # 核心算法与工具类单测 (Vitest)
│   ├── integration/               # 仓储与事务持久化集成测试
│   └── e2e/                       # 真实浏览器全流程与 20+1 组循环测试 (Playwright)
└── tools/                         # 离线字典编译与格式转换脚本
```

### 核心技术选型
- **构建与开发**：Vite 6.2 + TypeScript 5.8 (Strict Mode)
- **UI 框架**：React 19 + React Router v7
- **UI 规范**：Material Design 3 (M3 Expressive Tokens, `@material/material-color-utilities`)
- **本地存储**：Dexie.js (IndexedDB 极速异步查询)
- **压缩与解密**：fflate (高性能跨平台无依赖压缩解压)
- **自动化测试**：Vitest 3.0 (单元测试) + Playwright 1.51 (端到端仿真)

---

## 🚀 快速开始

### 运行环境准备
确保本地已安装 [Node.js](https://nodejs.org/) (推荐 Node 20 及以上版本) 与 npm。

### 1. 克隆项目与安装依赖
```bash
git clone https://github.com/Sunny090623/vocab-memorier.git
cd vocab-memorier
npm install
```

### 2. 启动本地开发服务
```bash
npm run dev
```
启动后在浏览器中访问：`http://localhost:5173`。

### 3. 构建生产包与本地预览
```bash
# 类型检查并编译打包
npm run build

# 本地运行打包预览服务
npm run preview
```

### 4. 运行测试
```bash
# 执行全部单元测试 (42 项测试全部通过)
npm test

# 运行真实浏览器 Playwright 端到端全链路测试
node tests/e2e/e2e_full_user_journey.mjs
node tests/e2e/e2e_batch_cycle_21words.mjs
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
内置词典数据与测试词库仅供个人学术研究与背诵学习使用。
