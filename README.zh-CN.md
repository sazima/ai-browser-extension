# Buddy AI - AI 浏览器智能体：用自然语言自动化完成多步骤任务

一款 Chrome 扩展，让 AI 帮你自动完成任何浏览器操作。用自然语言描述你想做的事，AI 会控制浏览器帮你搞定。

[English](./README.md) | 简体中文 | [繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md)




https://github.com/user-attachments/assets/d07743f3-d033-450f-990c-80d5e0c423c8




## 功能特性

- **自然语言控制** — 告诉 AI 你想做什么，它来完成
- **支持任意网站** — 无需针对特定网站配置
- **实时步骤展示** — 随时看到 AI 在执行哪一步
- **批量填写表单** — 一次性填写所有字段
- **元素可视化标注** — 页面所有可交互元素都会显示编号
- **自动保护机制** — 自动检测登录墙、死循环、页面卡死
- **使用自己的 API Key** — 兼容 DeepSeek、OpenAI 及任何 OpenAI 格式的接口
- **多语言界面** — English、简体中文、繁體中文、日本語、한국어

## 安装方法

### 从 Chrome 应用商店安装

[https://chromewebstore.google.com/detail/ai-browser-assistant/iaknpppnnijhjnglammebnaclcklkgcj](https://chromewebstore.google.com/detail/ai-browser-assistant/iaknpppnnijhjnglammebnaclcklkgcj)

### 手动安装（开发者模式）

1. **下载代码** — 点击本页右上角绿色的 **Code** 按钮 → **Download ZIP**，下载后解压。或者使用 Git：`git clone <仓库地址>`
2. 打开 Chrome，地址栏输入 **`chrome://extensions`** 并回车
3. 打开右上角的 **开发者模式** 开关
4. 点击 **加载已解压的扩展程序**
5. 选择解压后目录中的 **`src`** 文件夹（注意不是根目录）
6. 扩展图标会出现在 Chrome 工具栏，点击即可打开侧边栏

## 初始配置

1. 点击扩展图标，打开侧边栏
2. 点击 ⚙️ **设置**
3. 填入你的 API Key（DeepSeek / OpenAI / 其他兼容接口均可）
4. 可选：填写自定义 **API Base URL**（默认：`https://api.deepseek.com/v1`）
5. 点击 **保存**

## 使用示例

打开任意网页，在输入框输入你的任务：

```
帮我打开 GitHub 的 sazima 用户首页，并 Star 他的其中一个仓库
帮我查询新加坡的天气
去油管打开一个github教程，点赞并评论表示感谢。 然后查一下新加坡的天气。 然后打开github的sazima用户的test仓库， 创建添加一个催更的issue, 注意issue中附上刚刚的教程连接和当地（新加坡）的天气
```

AI 会实时展示每一步操作。点击 **■** 随时停止。

## 配置说明

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | 你的 OpenAI 兼容 API Key | — |
| API Base URL | API 接口地址 | `https://api.deepseek.com/v1` |
| 最大步数 | 自动停止前最多执行的步骤数 | 60 |
| 语言 | 界面和 AI 回复语言 | 跟随浏览器语言 |

## 权限说明

| 权限 | 用途 |
|------|------|
| `<all_urls>` | 在用户指定的任意网站读取页面内容并与元素交互 |
| `activeTab` | 访问当前活动标签页 |
| `scripting` | 向页面注入脚本以操控元素 |
| `sidePanel` | 在 Chrome 侧边栏中显示聊天界面 |
| `storage` | 在本地保存 API Key 和设置 |
| `tabs` | 获取当前标签页的 ID 和 URL |

你的 API Key 仅保存在本地，除你配置的 AI 接口地址外，不会发送到任何第三方服务器。

## License

MIT
