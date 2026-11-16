# Academic Polish MCP

一个轻量、保守的论文段落润色 MCP。它只提供一个工具：

- `polish_academic_text`：润色中英文论文段落，同时检查常见引文、数字、LaTeX 公式、URL、DOI 和指定术语是否被改动。默认检测到变化时保留原文，拒绝采用候选稿。

## 边界

- 提示模型保持事实、数据、结论和参考文献；自动检查不能替代语义和事实核验。
- 不替代导师或作者进行学术判断。
- 单次最多处理 12,000 个字符，建议按段落或小节调用。
- 需要一个兼容 OpenAI Chat Completions 的模型 API Key。
- 不包含全文文件解析、查重和翻译。支持轻度、标准、深度和压缩模式。

## 环境变量

| 变量 | 必填 | 默认值 |
| --- | --- | --- |
| `LLM_API_KEY` | 是 | 无 |
| `LLM_BASE_URL` | 否 | `https://api.deepseek.com` |
| `LLM_MODEL` | 否 | `deepseek-flash` |
| `LLM_TIMEOUT_MS` | 否 | `90000` |

模型默认值依据 [DeepSeek 官方接入文档](https://api-docs.deepseek.com/)。API 调用会消耗模型账户额度；论文段落将发往 `LLM_BASE_URL` 对应服务。代码不保存论文文本，但宿主平台和模型服务的日志策略由各自配置决定。

## 本地运行

需要 Node.js 20 或更高版本。

```sh
npm ci
npm test
npm start
```

测试使用本机模拟接口，不需要真实 Key，也不消耗模型额度。真实调用前须在进程环境中设置 `LLM_API_KEY`；`.env.example` 只是示例，不会自动加载。stdio MCP 启动后会等待宿主通过 stdin/stdout 通信，这是正常现象。

## 平台 npx 配置

平台须支持 Node.js 20+、npm 和 Git，并能访问 GitHub、npm 包源和模型接口。选择 `npx`，服务名填写“论文段落润色”，描述填写“润色论文段落，保留数字和引文，返回修改说明”。固定版本配置见 `mcp-config.example.json`：

```json
{
  "mcpServers": {
    "academic-polish": {
      "command": "npx",
      "args": ["-y", "git+https://github.com/212Yggg/academic-polish-mcp.git#v1.0.1"],
      "env": {
        "LLM_API_KEY": "REPLACE_IN_PLATFORM_ONLY",
        "LLM_BASE_URL": "https://api.deepseek.com",
        "LLM_MODEL": "deepseek-flash",
        "LLM_TIMEOUT_MS": "90000"
      }
    }
  }
}
```

仅在平台环境变量中替换 Key 占位符，再点击“保存并部署”。工具列表出现 `polish_academic_text` 后挂载到智能体。部署成功与真实模型调用成功需分别测试。GitHub 安装通过 `prepare` 编译 TypeScript，首次部署需要等待依赖安装。

## 工具输入示例

```json
{
  "text": "本研究使用100份问卷，结果表明该方法可能有效[1]。",
  "mode": "standard",
  "language": "zh-CN",
  "discipline": "教育学",
  "target_style": "硕士论文，正式且克制",
  "preserve_terms": ["100份问卷", "[1]"],
  "strict_preservation": true
}
```

返回值包括：

- `polished_text`
- `change_summary`
- `risk_flags`
- `preservation_check`：`passed`（自动检查未发现差异）、`blocked`（已保留原文）或 `not_checked`（用户关闭检查）
- `requires_human_review`

`requires_human_review` 始终为 `true`。自动检查无法覆盖所有单位、变量、专有名词及语义变化；`passed` 不表示事实已经核验。`language` 控制修改说明和风险提示的语言，正文保留原语种。

## 智能体调用规则

```text
用户提供自己的论文段落并要求润色、修改表述或压缩时，调用 polish_academic_text。
text 原样传入用户要修改的正文，默认 mode=standard、strict_preservation=true。
只展示工具返回的修改稿、主要修改说明和需要作者确认的问题，不自行补充研究事实。
如果 preservation_check=blocked，说明候选稿有受保护内容变化，当前返回原文。
如果调用失败，报告失败，不声称完成润色。不写入文献表，不自动修改原论文文件。
```

## 安全提醒

不要把 API Key 写入 GitHub 仓库或发送到聊天中。Key 只应填写在 MCP 平台受控的环境变量/密钥配置中；若只能在 JSON 的 `env` 中填写，确认只有授权管理员可查看。截图时将 Key 完全遮挡。`LLM_BASE_URL` 不应包含 `/chat/completions` 或凭据；远程接口必须使用 HTTPS。
