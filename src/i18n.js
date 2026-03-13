/**
 * i18n - 国际化翻译表
 * 支持：en / zh-CN / zh-TW / ja / ko
 */

const TRANSLATIONS = {
  en: {
    "app.title": "AI Browser Assistant",
    "settings.title": "Settings",
    "settings.apikey.label": "API Key",
    "settings.apikey.placeholder": "sk-xxxxxxxxxxxxxxxx",
    "settings.apikey.hint": "Compatible with OpenAI format (DeepSeek / OpenAI / others)",
    "settings.baseurl.label": "API Base URL",
    "settings.baseurl.placeholder": "https://api.deepseek.com/v1",
    "settings.baseurl.hint": "Leave blank to use https://api.deepseek.com/v1",
    "settings.model.label": "Model",
    "settings.model.placeholder": "deepseek-chat",
    "settings.model.hint": "e.g. deepseek-chat, gpt-4o, qwen-plus. Leave blank for default.",
    "settings.maxturns.label": "Max Steps",
    "settings.maxturns.hint": "Max steps before auto-stop (default 60)",
    "settings.language.label": "Language",
    "settings.save": "Save",
    "welcome.title": "Hello! I'm your AI Browser Assistant",
    "welcome.desc": "I can automate any web task, for example:",
    "welcome.example1": "Open GitHub user sazima's profile page and Star one of their repos",
    "welcome.example2": "Check the weather in Singapore",
    "input.placeholder": "Tell me what you want to do...",
    "input.hint": "Press Enter to send, Shift+Enter for newline",
    "input.running": "AI is controlling the browser... Click ■ to stop",
    "no.apikey.hint": "Please set your API Key first",
    "no.apikey.btn": "Set now",
    "save.success": "Settings saved ✓",
    "apikey.empty": "Please enter an API Key",
    "thinking.label": "AI is analyzing...",
    "stopped": "Stopped.",
    "error.no.tab": "Cannot get current tab",
    "favorites.title": "Saved Prompts",
    "favorites.save": "+ Save",
    "favorites.empty": "No saved prompts yet",
    "favorites.saved": "Saved ✓",
    "favorites.duplicate": "Already saved",
    "copy.success": "Copied ✓",
    "chat.clear": "Chat cleared",
    "chat.clear.title": "Clear chat",
  },

  "zh-CN": {
    "app.title": "AI 浏览器助手",
    "settings.title": "设置",
    "settings.apikey.label": "API Key",
    "settings.apikey.placeholder": "sk-xxxxxxxxxxxxxxxx",
    "settings.apikey.hint": "兼容 OpenAI 格式的 Key（DeepSeek / OpenAI / 其他）",
    "settings.baseurl.label": "API Base URL",
    "settings.baseurl.placeholder": "https://api.deepseek.com/v1",
    "settings.baseurl.hint": "留空则使用 https://api.deepseek.com/v1",
    "settings.model.label": "模型",
    "settings.model.placeholder": "deepseek-chat",
    "settings.model.hint": "如 deepseek-chat、gpt-4o、qwen-plus，留空使用默认值",
    "settings.maxturns.label": "最大轮数",
    "settings.maxturns.hint": "AI 最多执行多少步后强制停止（默认 60）",
    "settings.language.label": "语言",
    "settings.save": "保存",
    "welcome.title": "你好！我是 AI 浏览器助手",
    "welcome.desc": "我可以帮你自动完成任何网页操作，例如：",
    "welcome.example1": "帮我打开 GitHub 的 sazima 用户首页，并 Star 他的其中一个仓库",
    "welcome.example2": "帮我查询新加坡的天气",
    "input.placeholder": "告诉我你想做什么...",
    "input.hint": "按 Enter 发送，Shift+Enter 换行",
    "input.running": "AI 正在操作浏览器... 点击 ■ 停止",
    "no.apikey.hint": "请先设置 DeepSeek API Key",
    "no.apikey.btn": "点此设置",
    "save.success": "设置已保存 ✓",
    "apikey.empty": "请输入 API Key",
    "thinking.label": "AI 正在分析...",
    "stopped": "已停止。",
    "error.no.tab": "无法获取当前标签页",
    "favorites.title": "常用指令",
    "favorites.save": "+ 保存",
    "favorites.empty": "暂无保存的指令",
    "favorites.saved": "已保存 ✓",
    "favorites.duplicate": "已存在",
    "copy.success": "已复制 ✓",
    "chat.clear": "聊天记录已清除",
    "chat.clear.title": "清除记录",
  },

  "zh-TW": {
    "app.title": "AI 瀏覽器助手",
    "settings.title": "設定",
    "settings.apikey.label": "API Key",
    "settings.apikey.placeholder": "sk-xxxxxxxxxxxxxxxx",
    "settings.apikey.hint": "相容 OpenAI 格式的 Key（DeepSeek / OpenAI / 其他）",
    "settings.baseurl.label": "API Base URL",
    "settings.baseurl.placeholder": "https://api.deepseek.com/v1",
    "settings.baseurl.hint": "留空則使用 https://api.deepseek.com/v1",
    "settings.model.label": "模型",
    "settings.model.placeholder": "deepseek-chat",
    "settings.model.hint": "如 deepseek-chat、gpt-4o、qwen-plus，留空使用預設值",
    "settings.maxturns.label": "最大回合數",
    "settings.maxturns.hint": "AI 最多執行幾步後強制停止（預設 60）",
    "settings.language.label": "語言",
    "settings.save": "儲存",
    "welcome.title": "你好！我是 AI 瀏覽器助手",
    "welcome.desc": "我可以幫你自動完成任何網頁操作，例如：",
    "welcome.example1": "幫我打開 GitHub 的 sazima 用戶首頁，並 Star 他的其中一個倉庫",
    "welcome.example2": "幫我查詢新加坡的天氣",
    "input.placeholder": "告訴我你想做什麼...",
    "input.hint": "按 Enter 傳送，Shift+Enter 換行",
    "input.running": "AI 正在操控瀏覽器... 點擊 ■ 停止",
    "no.apikey.hint": "請先設定 API Key",
    "no.apikey.btn": "點此設定",
    "save.success": "設定已儲存 ✓",
    "apikey.empty": "請輸入 API Key",
    "thinking.label": "AI 正在分析...",
    "stopped": "已停止。",
    "error.no.tab": "無法取得目前分頁",
    "favorites.title": "常用指令",
    "favorites.save": "+ 儲存",
    "favorites.empty": "尚無儲存的指令",
    "favorites.saved": "已儲存 ✓",
    "favorites.duplicate": "已存在",
    "copy.success": "已複製 ✓",
    "chat.clear": "對話記錄已清除",
    "chat.clear.title": "清除記錄",
  },

  ja: {
    "app.title": "AI ブラウザアシスタント",
    "settings.title": "設定",
    "settings.apikey.label": "API Key",
    "settings.apikey.placeholder": "sk-xxxxxxxxxxxxxxxx",
    "settings.apikey.hint": "OpenAI形式のKey（DeepSeek / OpenAI / その他）",
    "settings.baseurl.label": "API Base URL",
    "settings.baseurl.placeholder": "https://api.deepseek.com/v1",
    "settings.baseurl.hint": "空欄の場合は https://api.deepseek.com/v1 を使用",
    "settings.model.label": "モデル",
    "settings.model.placeholder": "deepseek-chat",
    "settings.model.hint": "例: deepseek-chat、gpt-4o、qwen-plus。空欄でデフォルト使用",
    "settings.maxturns.label": "最大ステップ数",
    "settings.maxturns.hint": "自動停止までの最大ステップ数（デフォルト 60）",
    "settings.language.label": "言語",
    "settings.save": "保存",
    "welcome.title": "こんにちは！AIブラウザアシスタントです",
    "welcome.desc": "あらゆるウェブ操作を自動化できます。例えば：",
    "welcome.example1": "GitHubのsazimaユーザーページを開いて、リポジトリの一つにStarをつける",
    "welcome.example2": "シンガポールの天気を調べる",
    "input.placeholder": "何をしたいか教えてください...",
    "input.hint": "Enterで送信、Shift+Enterで改行",
    "input.running": "AIがブラウザを操作中... ■をクリックして停止",
    "no.apikey.hint": "まずAPI Keyを設定してください",
    "no.apikey.btn": "ここで設定",
    "save.success": "設定を保存しました ✓",
    "apikey.empty": "API Keyを入力してください",
    "thinking.label": "AIが分析中...",
    "stopped": "停止しました。",
    "error.no.tab": "現在のタブを取得できません",
    "favorites.title": "よく使う指示",
    "favorites.save": "+ 保存",
    "favorites.empty": "保存された指示はありません",
    "favorites.saved": "保存しました ✓",
    "favorites.duplicate": "すでに保存済み",
    "copy.success": "コピーしました ✓",
    "chat.clear": "チャット履歴を削除しました",
    "chat.clear.title": "履歴を削除",
  },

  ko: {
    "app.title": "AI 브라우저 어시스턴트",
    "settings.title": "설정",
    "settings.apikey.label": "API Key",
    "settings.apikey.placeholder": "sk-xxxxxxxxxxxxxxxx",
    "settings.apikey.hint": "OpenAI 형식의 Key（DeepSeek / OpenAI / 기타）",
    "settings.baseurl.label": "API Base URL",
    "settings.baseurl.placeholder": "https://api.deepseek.com/v1",
    "settings.baseurl.hint": "비워두면 https://api.deepseek.com/v1 사용",
    "settings.model.label": "모델",
    "settings.model.placeholder": "deepseek-chat",
    "settings.model.hint": "예: deepseek-chat, gpt-4o, qwen-plus. 비워두면 기본값 사용",
    "settings.maxturns.label": "최대 단계 수",
    "settings.maxturns.hint": "자동 중지 전 최대 단계 수 (기본값 60)",
    "settings.language.label": "언어",
    "settings.save": "저장",
    "welcome.title": "안녕하세요! AI 브라우저 어시스턴트입니다",
    "welcome.desc": "모든 웹 작업을 자동화할 수 있습니다. 예를 들어:",
    "welcome.example1": "GitHub의 sazima 사용자 페이지를 열고 저장소 중 하나에 Star 주기",
    "welcome.example2": "싱가포르 날씨 확인",
    "input.placeholder": "무엇을 하고 싶은지 알려주세요...",
    "input.hint": "Enter로 전송, Shift+Enter로 줄바꿈",
    "input.running": "AI가 브라우저를 제어 중... ■을 클릭하여 중지",
    "no.apikey.hint": "API Key를 먼저 설정해주세요",
    "no.apikey.btn": "여기서 설정",
    "save.success": "설정이 저장되었습니다 ✓",
    "apikey.empty": "API Key를 입력해주세요",
    "thinking.label": "AI가 분석 중...",
    "stopped": "중지되었습니다.",
    "error.no.tab": "현재 탭을 가져올 수 없습니다",
    "favorites.title": "자주 쓰는 명령",
    "favorites.save": "+ 저장",
    "favorites.empty": "저장된 명령이 없습니다",
    "favorites.saved": "저장됨 ✓",
    "favorites.duplicate": "이미 저장됨",
    "copy.success": "복사됨 ✓",
    "chat.clear": "대화 기록이 삭제되었습니다",
    "chat.clear.title": "기록 삭제",
  },
};

// 浏览器语言 → 翻译表语言码的映射
function detectBrowserLang() {
  const lang = (navigator.language || "en").toLowerCase();
  if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk") || lang.startsWith("zh-mo")) return "zh-TW";
  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("ko")) return "ko";
  return "en";
}

// 当前语言（init() 后设置）
let currentLang = "zh-CN";

/**
 * 翻译函数：t("key") 返回当前语言的文本，找不到时 fallback 到 en
 */
function t(key) {
  return TRANSLATIONS[currentLang]?.[key]
    ?? TRANSLATIONS["en"]?.[key]
    ?? key;
}

/**
 * 初始化语言：从 storage 读取，没有则检测浏览器语言
 */
async function initLang() {
  const { language } = await chrome.storage.local.get("language");
  currentLang = language || detectBrowserLang();
  applyTranslations();
}

/**
 * 将翻译应用到 DOM（处理 data-i18n 和 data-i18n-placeholder 属性）
 */
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
