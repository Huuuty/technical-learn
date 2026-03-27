# 技术日知录 - SPEC.md

## 1. Project Overview

**项目名称**: 技术日知录
**类型**: 单页Web应用 (纯前端)
**核心功能**: 每天由AI（DeepSeek）实时生成10个相互关联的技术知识点，覆盖计算机网络、云计算、部署、大数据、AI五大领域。同时提供丰富的场景练习模块，将知识点串联到实际业务场景中，所有AI解释均调用真实大模型。
**目标用户**: 售前工程师，需要向非技术背景客户解释复杂技术概念

---

## 2. Visual & Rendering Specification

### 页面布局
- **整体风格**: 简约白色主题，干净清爽
- **配色方案**:
  - 背景: #ffffff (纯白)
  - 卡片背景: #fafafa
  - 强调色: 各领域独立色彩（蓝色#2563eb、绿色#059669、橙色#d97706、红色#dc2626、紫色#7c3aed）
  - 文字: #1a1a1a (主文字), #666 (次要文字), #999 (辅助文字)

### 字体
- 标题: "Noto Sans SC", sans-serif (支持中文)
- 代码/技术术语: "JetBrains Mono", monospace

### 页面结构
1. **顶部区域**: 应用标题 + 副标题 + 生成按钮
2. **API Key设置区**: DeepSeek API Key配置
3. **知识卡片区域**: 10张卡片（AI实时生成）
4. **场景练习区域**: 10个实际业务场景（AI实时生成，含详细技术串联）
5. **底部**: 版权信息

### 动效
- 卡片入场: 淡入上浮，交错延迟80ms
- 悬停: 卡片边框变色 + 轻微阴影
- 场景展开: 平滑高度过渡
- 加载状态: 旋转spinner动画

---

## 3. AI Generation Specification

### AI模型
- **模型**: DeepSeek Chat (deepseek-chat)
- **API Endpoint**: https://api.deepseek.com/chat/completions
- **Temperature**: 0.7-0.8（保证内容质量的同时有一定创意）

### 知识卡片生成
- 每个选定领域生成3个知识点（动态数量）
- 确保覆盖选择的领域
- 每个知识点包含: title, analogy, core, connection, keywords, domain
- 由AI逐个生成，每生成一个即显示一个（无模态框阻塞）
- 知识卡片尺寸放大1.5倍
- 由AI直接生成，返回JSON格式

### 场景练习生成
- 每次生成10个场景
- 每个场景包含:
  - title: 场景标题
  - background: 详细背景描述
  - challenge: 技术挑战/业务痛点
  - scenario: 具体问题场景
  - relatedKnowledge: 涉及的核心知识点
  - relatedDomains: 涉及的领域
  - technicalFlow: **技术原理串联** - 详细解释知识点如何衔接配合

### AI解释功能
- **知识卡片**: 点击"让AI进一步解释"调用DeepSeek，生成详细解读
- **场景练习**: 点击"让AI详细解释"调用DeepSeek，生成深度分析
- 解释内容包括: 技术架构解析、知识点串联、客户价值、常见问题、实施建议

---

## 4. Data Domains

### 五大领域
1. **计算机网络** - 颜色: #2563eb (蓝色)
2. **云计算** - 颜色: #059669 (绿色)
3. **部署** - 颜色: #d97706 (橙色)
4. **大数据** - 颜色: #dc2626 (红色)
5. **AI** - 颜色: #7c3aed (紫色)

---

## 5. Interaction Specification

### 用户交互
- **配置API Key**: 输入AI API Key并保存（持久化到localStorage）
- **重新生成卡片**: 点击知识卡片区域的"重新生成"按钮，逐个生成并显示卡片
- **生成场景**: 点击场景区域的"生成场景"按钮，生成业务场景练习
- **卡片点击**: 展开详细解释模态框
- **标签筛选**: 点击顶部领域标签筛选卡片
- **场景展开**: 点击场景标题展开详情
- **AI解释**: 知识卡片详情的AI解释按钮调用AI真实API
- **按钮效果**: 点击时无放大效果，保持原尺寸

### API Key管理
- API Key保存到localStorage，刷新页面后保留
- 连接状态实时显示（未配置/已连接）
- 支持输入框回车保存

### 场景内容格式化
- 自动检测JSON格式并以代码块样式显示
- 自动检测Markdown格式（##标题、**粗体**）并转换显示
- 纯文本直接显示

### 响应式设计
- 桌面端: 1-2卡片横向排列（卡片尺寸1.5倍）
- 平板端: 1-2列网格
- 手机端: 单列纵向滚动

---

## 6. Technical Implementation

### 技术栈
- 纯HTML + CSS + JavaScript
- 无数据库，所有数据由AI实时生成
- CSS Grid/Flexbox布局
- Fetch API调用DeepSeek

### 数据结构
```javascript
// 知识卡片 (AI生成)
{
  id: number,
  domain: "network" | "cloud" | "deployment" | "bigdata" | "ai",
  domainName: string,
  title: string,
  analogy: string,
  core: string,
  connection: string,
  keywords: string[]
}

// 场景练习 (AI生成)
{
  title: string,
  background: string,
  challenge: string,
  scenario: string,
  relatedKnowledge: string,
  relatedDomains: string[],
  technicalFlow: string
}
```

---

## 7. Acceptance Criteria

1. 页面显示API Key配置区域
2. 配置API Key后，点击"生成今日内容"按钮
3. AI生成10个知识卡片，覆盖5大领域
4. AI生成10个场景练习，每个场景包含详细的technicalFlow
5. 点击知识卡片可展开详情，点击"让AI进一步解释"调用DeepSeek
6. 点击场景中的"让AI详细解释"调用DeepSeek生成深度分析
7. 不显示固定的66个知识点（全部由AI实时生成）
8. 不显示"今日剩余知识"数量
9. 不显示底部的"知识领域链路"
10. 适配桌面端和移动端
