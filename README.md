# AI Browser Assistant

A Chrome extension that automates browser tasks using AI. Just describe what you want to do in natural language — the AI controls the browser and gets it done.

[![Watch the demo](https://img.youtube.com/vi/pFfuBNW9FmA/maxresdefault.jpg)](https://www.youtube.com/watch?v=pFfuBNW9FmA)

## Features

- **Natural language control** — Tell the AI what to do, it handles the rest
- **Works on any website** — No site-specific setup required
- **Real-time step display** — Watch exactly what the AI is doing
- **Smart form filling** — Fills multiple fields at once
- **Visual element overlay** — All interactive elements are numbered on-screen
- **Auto-stop protection** — Detects login walls, infinite loops, and stuck pages
- **Bring your own API key** — Works with DeepSeek, OpenAI, or any OpenAI-compatible API
- **Multilingual UI** — English, 简体中文, 繁體中文, 日本語, 한국어

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Install (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the extension folder

## Setup

1. Click the extension icon → open the side panel
2. Click ⚙️ **Settings**
3. Enter your API Key (DeepSeek / OpenAI / any OpenAI-compatible key)
4. Optionally set a custom **API Base URL** (default: `https://api.deepseek.com/v1`)
5. Click **Save**

## Usage

Open any webpage, then type your task in the chat box:

```
Open GitHub user sazima's profile page and star one of their repos
Check the weather in Singapore
Search for the cheapest flight from Beijing to Shanghai tomorrow
Fill out the registration form on this page
```

The AI will show each step it's taking in real time. Click **■** to stop at any time.

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your OpenAI-compatible API key | — |
| API Base URL | API endpoint | `https://api.deepseek.com/v1` |
| Max Steps | Maximum steps before auto-stop | 25 |
| Language | UI and AI response language | Browser language |

## Permissions

| Permission | Reason |
|------------|--------|
| `<all_urls>` | Read and interact with any website the user wants to automate |
| `activeTab` | Access the currently active tab |
| `scripting` | Inject content script to interact with page elements |
| `sidePanel` | Display the chat interface in Chrome's side panel |
| `storage` | Save API key and settings locally on your device |
| `tabs` | Query the active tab's ID and URL |

Your API key is stored locally and never sent anywhere except the AI API endpoint you configure.

## License

MIT
