# LLM 解卦功能规划

## 概述
在六爻卜卦模式下，占卜完成后提供 LLM 解卦功能：用户输入所问之事，将占卜结果全文发送给 LLM 进行解卦分析。

## 功能点

### 1. LLM 设置面板
- **入口**：六爻模式下，开始抛掷按钮上方显示一个齿轮图标按钮（⚙️）或文字链接
- **面板内容**：
  - API 地址：文本输入框，默认 `https://api.openai.com/v1/chat/completions`
  - API Key：密码输入框
  - 模型名称：文本输入框，默认 `gpt-4o`
  - 保存/测试按钮
- **存储**：三个字段存入 localStorage，key 分别为 `iching_llm_api`、`iching_llm_key`、`iching_llm_model`
- **样式**：与现有 permission prompt 类似的模态弹窗，半透明深色背景，圆角

### 2. 占卜完成后询问用户问题
- **触发时机**：`showHexagramResult()` 执行后
- **UI**：在 hexagram-result 下方插入一段区域：
  - 提示文字 "您所卜何事？"
  - 文本输入框（多行 textarea，或单行 input）
  - "解卦" 按钮
- **状态**：
  - 默认：显示输入框 + 按钮
  - 加载中：按钮变为 loading 状态（"解卦中..."），禁用输入
  - 完成后：显示解卦结果，保留输入框供重新提问

### 3. LLM 请求
- **请求格式**（OpenAI 兼容 API）：
  ```json
  {
    "model": "<用户配置的模型>",
    "messages": [
      {
        "role": "system",
        "content": "你是一位精通周易的占卜解卦大师。请根据用户提供的六爻占卜结果，结合用户所问的具体问题，给出专业的解卦分析。你的回答应该包含：\n1. 本卦解读——本卦的卦辞含义及其对用户问题的启示\n2. 变爻分析——如有变爻，分析变爻爻辞及其吉凶变化\n3. 变卦解读——如有变卦，分析变卦的指引\n4. 综合建议——结合用户具体问题的行动建议\n请用简洁但全面的中文回答，避免冗长。"
      },
      {
        "role": "user",
        "content": "<占卜结果全文>\n\n用户所问：<用户输入的问题>"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 2000
  }
  ```
- **占卜结果全文**：复用已有的 `plainText`（line 920-928），包含卦名、卦辞、象曰、变卦、变爻
- **超时**：30 秒超时，超时显示错误提示
- **错误处理**：网络错误、API 返回错误（401/429/500 等）均显示友好提示

### 4. 解卦结果显示
- **位置**：在问题输入区域下方
- **内容**：LLM 返回的 `choices[0].message.content`
- **样式**：
  - 深色半透明面板，与 hexagram-result 风格一致
  - 文字稍大（14px），行高 1.6，方便阅读
  - 保留换行（white-space: pre-wrap）
- **复制按钮**：解卦结果右上角提供复制按钮

### 5. 解卦历史记录
- **存储**：localStorage key `iching_interpretations`，JSON 数组，最多 3 条
- **数据结构**：
  ```json
  [
    {
      "timestamp": 1717593600,
      "question": "我今年的事业运如何？",
      "hexagram_text": "䷊ 地天泰...\n卦辞：...",
      "interpretation": "LLM 返回的解卦内容"
    }
  ]
  ```
- **显示**：在解卦结果面板底部，折叠式列表：
  - 标题："历史解卦记录" + 展开/折叠箭头
  - 每条记录：时间 + 问题摘要 + 点击展开查看完整内容
- **新记录插入数组头部**，超过 3 条时删除最早的一条

### 6. 六爻行数据补充
- 当前 `plainText`（用于复制）仅包含卦名、卦辞、象曰、变卦、变爻
- 发给 LLM 的文本需要更详细，额外包含六爻详情：
  ```
  占卜结果：
  本卦：䷊ 地天泰 (Tài)
  卦辞：小往大来，吉亨。
  象曰：天地交，泰。后以财成天地之道...
  
  六爻详情：
  初爻：老阳（⚊→⚋）— 变爻
  二爻：少阴（⚋）— 不变
  ...
  
  变卦：䷋ 天地否 (Pǐ)（如有）
  变卦辞：...
  变爻：初爻（老阳→少阴）
  ```
- 实现：在 `showHexagramResult()` 中构建 `llmPromptText` 变量，包含六爻逐行详情

## 实现步骤

### Step 1: 添加设置按钮和模态弹窗
- HTML：在 controls 区域添加设置按钮
- CSS：模态弹窗样式（复用 permission prompt 风格）
- JS：读取/保存 localStorage，显示/隐藏弹窗

### Step 2: 增强 showHexagramResult() 生成 LLM 用文本
- 构建 `llmPromptText`（包含六爻逐行详情）
- 存储为全局变量供后续使用

### Step 3: 添加问题输入区域
- HTML：在 hexagram-result 下方动态插入
- CSS：深色半透明面板风格
- JS：输入验证（非空）、提交逻辑

### Step 4: 实现 LLM 调用逻辑
- JS 函数：`askLLMInterpretation(question)`
- 使用 `fetch()` POST 请求
- 处理 loading/error/success 状态
- 超时控制（AbortController）

### Step 5: 显示解卦结果 + 历史记录
- 结果面板 HTML 动态生成
- 历史记录读取/写入 localStorage
- 历史折叠展开交互

## 文件变更
- `flip-coin/index.html`：
  - 新增 CSS 约 80 行
  - 新增 HTML 约 30 行
  - 新增 JS 约 200 行
- 预计总行数：1280 → ~1550

## 注意事项
- 避免在非 hexagram 模式下显示设置入口（或始终显示但注明）
- API key 以密码字段展示，防止旁人窥屏
- 解卦中禁止重新抛掷（已有 gyroActive 机制）
- 桌面端同样支持（手动点击抛掷按钮）
