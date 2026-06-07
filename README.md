# 意大利面·42号混凝土

知识搅拌机 — 汇集实用小工具的本地 Web 应用。

## 工具

- **🔐 加密解密工具** — 以原文段为码本，将任意文本转译为搅拌机风格文案
- **🪙 抛硬币卜卦** — 手机陀螺仪模拟物理丢硬币，支持单枚、三枚、周易六爻卜卦，含 LLM 解卦
- **🎬 视频台词截图** — Chrome 扩展，按时间区间自动截取 B站 视频帧，拼接为纵向台词长图，支持半自动编辑（`video-subtitle-capture/`）

## 启动

```bash
pip install cryptography
python serve_https.py
```

浏览器打开 `https://<本机IP>:8443`（手机与电脑同局域网，陀螺仪功能需要）。

首次运行自动生成自签名证书 `server.pem`，也可手动生成：

```bash
openssl req -x509 -newkey rsa:2048 -keyout server.pem -out server.pem -days 365 -nodes -subj "/CN=localhost"
```

> 需 HTTPS：iOS/Android Chrome 79+ 禁止 HTTP 页面使用陀螺仪。
