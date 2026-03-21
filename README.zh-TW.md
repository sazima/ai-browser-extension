# Buddy AI - AI 瀏覽器智能體：用自然語言自動化完成多步驟任務

一款 Chrome 擴充功能，讓 AI 幫你自動完成任何瀏覽器操作。用自然語言描述你想做的事，AI 會控制瀏覽器幫你搞定。

[English](./README.md) | [简体中文](./README.zh-CN.md) | 繁體中文 | [日本語](./README.ja.md) | [한국어](./README.ko.md)




https://github.com/user-attachments/assets/d07743f3-d033-450f-990c-80d5e0c423c8




## 功能特性

- **自然語言控制** — 告訴 AI 你想做什麼，它來完成
- **支援任意網站** — 無需針對特定網站設定
- **即時步驟展示** — 隨時看到 AI 在執行哪一步
- **批次填寫表單** — 一次性填寫所有欄位
- **元素視覺化標註** — 頁面所有可互動元素都會顯示編號
- **自動保護機制** — 自動偵測登入牆、無窮迴圈、頁面卡死
- **使用自己的 API Key** — 相容 DeepSeek、OpenAI 及任何 OpenAI 格式的介面
- **多語言介面** — English、简体中文、繁體中文、日本語、한국어

## 安裝方法

### 從 Chrome 線上應用程式商店安裝

[https://chromewebstore.google.com/detail/ai-browser-assistant/iaknpppnnijhjnglammebnaclcklkgcj](https://chromewebstore.google.com/detail/ai-browser-assistant/iaknpppnnijhjnglammebnaclcklkgcj)

### 手動安裝（開發人員模式）

1. **下載程式碼** — 點擊本頁右上角綠色的 **Code** 按鈕 → **Download ZIP**，下載後解壓縮。或者使用 Git：`git clone <倉庫地址>`
2. 打開 Chrome，網址列輸入 **`chrome://extensions`** 並按下 Enter
3. 打開右上角的 **開發人員模式** 開關
4. 點擊 **載入未封裝項目**
5. 選擇解壓縮後目錄中的 **`src`** 資料夾（注意不是根目錄）
6. 擴充功能圖示會出現在 Chrome 工具列，點擊即可打開側邊欄

## 初始設定

1. 點擊擴充功能圖示，打開側邊欄
2. 點擊 ⚙️ **設定**
3. 填入你的 API Key（DeepSeek / OpenAI / 其他相容介面均可）
4. 選填：填寫自訂 **API Base URL**（預設：`https://api.deepseek.com/v1`）
5. 點擊 **儲存**

## 使用範例

打開任意網頁，在輸入框輸入你的任務：

```
幫我打開 GitHub 的 sazima 用戶首頁，並 Star 他的其中一個倉庫
幫我查詢新加坡的天氣
去 YouTube 打開一個 GitHub 教學，按讚並評論表示感謝。 然後查一下新加坡的天氣。 然後打開 GitHub 的 sazima 用戶的 test 倉庫， 建立並添加一個催更的 issue, 注意 issue 中附上剛剛的教學連結和當地（新加坡）的天氣
```

AI 會即時展示每一步操作。點擊 **■** 隨時停止。

## 設定說明

| 設定項 | 說明 | 預設值 |
|--------|------|--------|
| API Key | 你的 OpenAI 相容 API Key | — |
| API Base URL | API 介面地址 | `https://api.deepseek.com/v1` |
| 最大步數 | 自動停止前最多執行的步驟數 | 60 |
| 語言 | 介面和 AI 回覆語言 | 跟隨瀏覽器語言 |

## 權限說明

| 權限 | 用途 |
|------|------|
| `<all_urls>` | 在用戶指定的任意網站讀取頁面內容並與元素互動 |
| `activeTab` | 存取當前活動分頁 |
| `scripting` | 向頁面注入腳本以操控元素 |
| `sidePanel` | 在 Chrome 側邊欄中顯示聊天介面 |
| `storage` | 在本地儲存 API Key 和設定 |
| `tabs` | 獲取當前分頁的 ID 和 URL |

你的 API Key 僅儲存在本地，除你設定的 AI 介面地址外，不會發送到任何第三方伺服器。

## License

MIT
