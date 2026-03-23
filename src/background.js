/**
 * Background Service Worker - Agent Loop 核心
 *
 * 职责：
 * 1. 接收 sidepanel 的用户消息
 * 2. 运行 Agent Loop（调用 DeepSeek API + 工具）
 * 3. 工具执行：navigate/new_tab 由自己处理，DOM 操作转发给 content.js
 * 4. 将进度实时推送回 sidepanel（让用户看到 AI 在做什么）
 */

// ── 后台多语言字符串 ──────────────────────────────────────────

const BG_STRINGS = {
  en: {
    stopped: "Stopped.",
    task_done: "Task complete!",
    max_turns: (n) => `Reached the maximum step limit (${n} steps). Task not complete. Please check the page and try again.`,
    api_error: (msg) => `API call failed: ${msg}`,
    agent_error: (msg) => `Agent error: ${msg}`,
    nav_loop: (url) => `Operation stuck in a loop, repeatedly navigating to: ${url}\n\nPossible causes: page requires login, or operation cannot continue.`,
    nav_loop_warn: (url, n) => `⚠️ Navigation loop detected (navigated to the same URL ${n} times), stopped automatically`,
    same_page_warn: (n) => `⚠️ Page unchanged for ${n} consecutive reads, stopped automatically`,
    same_page: (url) => `Page has not changed. The task may be stuck.\nCurrent page: ${url}\n\nPlease check the page and try again.`,
    login_required: "This site requires login. Please log in manually and try again.",
    captcha: "Encountered a CAPTCHA. Please solve it manually and try again.",
    done_turns: (n) => `Done (${n} steps)`,
    step_read: "📖 Reading page...",
    step_navigate: (url) => `🌐 Navigate to ${url}`,
    step_new_tab: (url) => `🆕 Open in new tab: ${url}`,
    step_click: (desc, id) => `👆 Click: ${desc || `element #${id}`}`,
    step_hover: (desc, id) => `🖱️ Hover: ${desc || `element #${id}`}`,
    step_type: (text) => `⌨️ Type: "${text}"`,
    step_key: (key) => `⌨️ Press ${key}`,
    step_scroll: (dir) => `📜 Scroll ${dir === "down" ? "down" : "up"}`,
    step_wait: (s) => `⏳ Wait ${s}s`,
    step_url: "🔍 Get current URL",
    step_fill: (n) => `📝 Fill ${n} field(s)`,
    step_api: (url) => `🔌 Call API: ${url}`,
    step_unknown: (name) => `🔧 Execute ${name}`,
    reply_lang: "Always reply to the user in English.",
  },
  "zh-CN": {
    stopped: "已停止。",
    task_done: "任务完成！",
    max_turns: (n) => `已达到最大步数限制（${n} 轮），任务未完成。请检查页面状态后重试。`,
    api_error: (msg) => `API 调用失败: ${msg}`,
    agent_error: (msg) => `Agent 出错: ${msg}`,
    nav_loop: (url) => `操作陷入循环，反复导航到：${url}\n\n可能原因：页面需要登录、或操作无法继续。`,
    nav_loop_warn: (url, n) => `⚠️ 检测到导航循环（反复跳转到相同 URL ${n} 次），已自动停止`,
    same_page_warn: (n) => `⚠️ 页面连续 ${n} 次未变化，已自动停止`,
    same_page: (url) => `页面没有发生变化，任务可能卡住了。\n当前页面：${url}\n\n请检查页面状态后重试。`,
    login_required: "该网站需要登录，请先手动登录后再试。",
    captcha: "遇到验证码，需要手动处理后再试。",
    done_turns: (n) => `完成（共 ${n} 轮）`,
    step_read: "📖 读取页面内容...",
    step_navigate: (url) => `🌐 导航到 ${url}`,
    step_new_tab: (url) => `🆕 新标签打开 ${url}`,
    step_click: (desc, id) => `👆 点击: ${desc || `元素 #${id}`}`,
    step_hover: (desc, id) => `🖱️ 悬浮: ${desc || `元素 #${id}`}`,
    step_type: (text) => `⌨️ 输入: "${text}"`,
    step_key: (key) => `⌨️ 按下 ${key}`,
    step_scroll: (dir) => `📜 向${dir === "down" ? "下" : "上"}滚动`,
    step_wait: (s) => `⏳ 等待 ${s} 秒`,
    step_url: "🔍 获取当前 URL",
    step_fill: (n) => `📝 批量填写 ${n} 个字段`,
    step_api: (url) => `🔌 调用 API: ${url}`,
    step_unknown: (name) => `🔧 执行 ${name}`,
    reply_lang: "始终用简体中文回复用户。",
  },
  "zh-TW": {
    stopped: "已停止。",
    task_done: "任務完成！",
    max_turns: (n) => `已達到最大步數限制（${n} 輪），任務未完成。請檢查頁面狀態後重試。`,
    api_error: (msg) => `API 呼叫失敗: ${msg}`,
    agent_error: (msg) => `Agent 出錯: ${msg}`,
    nav_loop: (url) => `操作陷入迴圈，反覆導航到：${url}\n\n可能原因：頁面需要登入、或操作無法繼續。`,
    nav_loop_warn: (url, n) => `⚠️ 偵測到導航迴圈（反覆跳轉到相同 URL ${n} 次），已自動停止`,
    same_page_warn: (n) => `⚠️ 頁面連續 ${n} 次未變化，已自動停止`,
    same_page: (url) => `頁面沒有發生變化，任務可能卡住了。\n目前頁面：${url}\n\n請檢查頁面狀態後重試。`,
    login_required: "該網站需要登入，請先手動登入後再試。",
    captcha: "遇到驗證碼，需要手動處理後再試。",
    done_turns: (n) => `完成（共 ${n} 輪）`,
    step_read: "📖 讀取頁面內容...",
    step_navigate: (url) => `🌐 導航到 ${url}`,
    step_new_tab: (url) => `🆕 新分頁開啟 ${url}`,
    step_click: (desc, id) => `👆 點擊: ${desc || `元素 #${id}`}`,
    step_hover: (desc, id) => `🖱️ 懸浮: ${desc || `元素 #${id}`}`,
    step_type: (text) => `⌨️ 輸入: "${text}"`,
    step_key: (key) => `⌨️ 按下 ${key}`,
    step_scroll: (dir) => `📜 向${dir === "down" ? "下" : "上"}捲動`,
    step_wait: (s) => `⏳ 等待 ${s} 秒`,
    step_url: "🔍 取得目前 URL",
    step_fill: (n) => `📝 批次填寫 ${n} 個欄位`,
    step_api: (url) => `🔌 呼叫 API: ${url}`,
    step_unknown: (name) => `🔧 執行 ${name}`,
    reply_lang: "始終用繁體中文回覆用戶。",
  },
  ja: {
    stopped: "停止しました。",
    task_done: "タスク完了！",
    max_turns: (n) => `最大ステップ数（${n}ステップ）に達しました。タスクは未完了です。ページの状態を確認して再試行してください。`,
    api_error: (msg) => `API呼び出し失敗: ${msg}`,
    agent_error: (msg) => `エージェントエラー: ${msg}`,
    nav_loop: (url) => `操作がループに陥りました。同じURLへの繰り返しナビゲーション：${url}\n\n原因：ログインが必要か、操作を続行できない可能性があります。`,
    nav_loop_warn: (url, n) => `⚠️ ナビゲーションループを検出（同じURLに${n}回ナビゲート）、自動停止しました`,
    same_page_warn: (n) => `⚠️ ページが${n}回連続で変化なし、自動停止しました`,
    same_page: (url) => `ページに変化がありません。タスクが止まっている可能性があります。\n現在のページ：${url}\n\nページの状態を確認して再試行してください。`,
    login_required: "このサイトはログインが必要です。手動でログインしてから再試行してください。",
    captcha: "CAPTCHAが検出されました。手動で解決してから再試行してください。",
    done_turns: (n) => `完了（${n}ステップ）`,
    step_read: "📖 ページを読み込み中...",
    step_navigate: (url) => `🌐 ${url} に移動`,
    step_new_tab: (url) => `🆕 新しいタブで開く: ${url}`,
    step_click: (desc, id) => `👆 クリック: ${desc || `要素 #${id}`}`,
    step_hover: (desc, id) => `🖱️ ホバー: ${desc || `要素 #${id}`}`,
    step_type: (text) => `⌨️ 入力: "${text}"`,
    step_key: (key) => `⌨️ ${key}キーを押す`,
    step_scroll: (dir) => `📜 ${dir === "down" ? "下" : "上"}にスクロール`,
    step_wait: (s) => `⏳ ${s}秒待機`,
    step_url: "🔍 現在のURLを取得",
    step_fill: (n) => `📝 ${n}個のフィールドを一括入力`,
    step_api: (url) => `🔌 API呼び出し: ${url}`,
    step_unknown: (name) => `🔧 ${name}を実行`,
    reply_lang: "常に日本語でユーザーに返答してください。",
  },
  ko: {
    stopped: "중지되었습니다.",
    task_done: "작업 완료!",
    max_turns: (n) => `최대 단계 수(${n}단계)에 도달했습니다. 작업이 완료되지 않았습니다. 페이지 상태를 확인하고 다시 시도하세요.`,
    api_error: (msg) => `API 호출 실패: ${msg}`,
    agent_error: (msg) => `에이전트 오류: ${msg}`,
    nav_loop: (url) => `작업이 루프에 빠졌습니다. 같은 URL로 반복 이동: ${url}\n\n원인: 로그인이 필요하거나 작업을 계속할 수 없을 수 있습니다.`,
    nav_loop_warn: (url, n) => `⚠️ 내비게이션 루프 감지 (같은 URL로 ${n}회 이동), 자동 중지됨`,
    same_page_warn: (n) => `⚠️ 페이지가 ${n}회 연속 변경되지 않아 자동 중지됨`,
    same_page: (url) => `페이지에 변화가 없습니다. 작업이 멈춘 것 같습니다.\n현재 페이지: ${url}\n\n페이지 상태를 확인하고 다시 시도하세요.`,
    login_required: "이 사이트는 로그인이 필요합니다. 먼저 수동으로 로그인하고 다시 시도하세요.",
    captcha: "CAPTCHA가 감지되었습니다. 수동으로 해결한 후 다시 시도하세요.",
    done_turns: (n) => `완료 (총 ${n}단계)`,
    step_read: "📖 페이지 읽는 중...",
    step_navigate: (url) => `🌐 ${url}(으)로 이동`,
    step_new_tab: (url) => `🆕 새 탭에서 열기: ${url}`,
    step_click: (desc, id) => `👆 클릭: ${desc || `요소 #${id}`}`,
    step_hover: (desc, id) => `🖱️ 호버: ${desc || `요소 #${id}`}`,
    step_type: (text) => `⌨️ 입력: "${text}"`,
    step_key: (key) => `⌨️ ${key} 키 누르기`,
    step_scroll: (dir) => `📜 ${dir === "down" ? "아래로" : "위로"} 스크롤`,
    step_wait: (s) => `⏳ ${s}초 대기`,
    step_url: "🔍 현재 URL 가져오기",
    step_fill: (n) => `📝 ${n}개 필드 일괄 입력`,
    step_api: (url) => `🔌 API 호출: ${url}`,
    step_unknown: (name) => `🔧 ${name} 실행`,
    reply_lang: "항상 한국어로 사용자에게 답변하세요.",
  },
};

/** 获取后台字符串，找不到语言时回退到 zh-CN */
function bgT(lang) {
  return BG_STRINGS[lang] || BG_STRINGS["zh-CN"];
}

// ── System Prompts（每种语言一套完整 prompt） ─────────────────

const SYSTEM_PROMPTS = {
  "zh-CN": `你是一个能操控浏览器的 AI 助手，可以帮用户完成任何网页操作。

工作流程：
1. 先用 read_page 读取当前页面内容和所有可交互元素
2. 根据用户需求决定操作（导航/点击/输入/滚动）
3. 点击或输入后，再次 read_page 确认结果
4. 重复直到任务完成

终止规则（必须遵守）：
- 遇到登录页面（URL 包含 /login /signin，且页面主体只有登录表单）：停止并告知用户
- 只是弹出登录提示框/浮层（页面主体内容仍在，URL 没变）：尝试关闭提示框后继续任务，不要停止
- 遇到验证码/人机验证：立即停止，回复"遇到验证码，需要手动处理"
- 连续 3 次 read_page 结果相同（页面没变化）：立即停止并告知用户卡住了
- 找不到目标内容：最多 scroll_page + read_page 尝试 2 次，仍找不到就停止告知用户
- 每次操作后必须评估进展，如果没有朝目标前进，立即停止

操作规则：
- 每次 click_element 或 type_text 前，必须先 read_page 获取最新元素编号
- 元素编号（id）在每次 read_page 后会重新分配，不要复用旧编号
- 导航后必须等待页面加载，再 read_page
- 用简洁的中文向用户说明你在做什么

【批量填写表单】：
- 页面上有多个输入框需要填写时（如检测数据录入、表单填写），优先使用 fill_form 一次性填完所有字段
- fill_form 比多次 type_text 效率高得多，能大幅减少步骤数
- 使用前先 read_page 获取所有输入框的编号，然后一次 fill_form 搞定
- 只有在填完后需要观察变化（如下拉联动）时，才逐个 type_text

【输入框操作流程】：
- 输入前先点击：type_text 前必须先 click_element 点击该输入框，再 read_page 观察：
  · 弹出了搜索面板/弹框且其中有新输入框 → 在新出现的输入框中 type_text，而非原始输入框
  · 出现了下拉/候选列表 → click_element 选择正确选项（不要继续输入）
  · 无变化 → 直接 type_text 在原输入框中输入
- type_text 完成后 read_page 观察，再决定下一步：
  · 有搜索/查询/提交按钮 → click_element 点击该按钮（优先于按 Enter）
  · 出现了下拉/候选列表 → click_element 选择正确选项（不要按 Enter）
  · 无搜索按钮 → press_key("Enter") 提交
  · 还有其他必填字段未填 → 继续填写下一个字段
- 永远不要跳过观察步骤直接假设行为

探索规则：
- read_page 返回的 interactive_elements 包含页面上所有可点击的元素，根据 text 内容判断用途
- 导航菜单通常排在 interactive_elements 列表靠前位置
- 如果点击某元素后页面内容更新但 URL 没变（单页应用），等待 1 秒再 read_page
- 如果需要找某类信息，先通读 interactive_elements 列表，选择最相关的入口点击

【悬浮菜单 / 悬浮按钮处理规则】：
- 部分导航菜单（如 Element UI 的 el-submenu）是鼠标悬浮展开的，不是点击展开
- 遇到这类菜单时：用 hover_element 悬浮在菜单项上 → wait 1秒 → read_page 查看子菜单项 → click_element 点击目标子项
- 不要直接 click_element 点击悬浮菜单的父项，否则可能触发导航跳转而非展开子菜单
- 部分界面（如 GitLab / GitHub 代码评审）的操作按钮仅在鼠标悬浮到某行时才显示（CSS :hover）
- 处理方式：hover_element 悬浮在目标行的某个可见元素上 → read_page（此时隐藏按钮已被强制显示）→ click_element 点击目标按钮
- hover_element 的 id 可以是目标行内任何已识别的元素（如行号、文件名链接等），不必是按钮本身

【导航与重复操作规则】：
- 如果目标 URL 已知或可以直接推断（例如"打开 GitHub 的 sazima 用户首页"→ https://github.com/sazima），直接 navigate 到该 URL，不要先去网站首页再用搜索框搜索
- 每次 navigate 后必须 read_page 确认页面内容，再决定下一步，绝对不能连续 navigate 两次
- 已经在目标网站/页面上时（read_page 的 url 包含目标域名），直接操作页面上的表单/按钮，不要再 navigate 或 new_tab 到同一 URL
- 搜索/预订表单（机票/酒店/火车票等）：页面上已有出发地、目的地、日期输入框时，直接点击对应字段填写，不要跳转到其他页面
- get_current_url 只用于不确定当前 URL 时，不要在刚 navigate 后立即调用（刚 navigate 后 URL 已知）`,

  "zh-TW": `你是一個能操控瀏覽器的 AI 助手，可以幫用戶完成任何網頁操作。

工作流程：
1. 先用 read_page 讀取當前頁面內容和所有可交互元素
2. 根據用戶需求決定操作（導航/點擊/輸入/捲動）
3. 點擊或輸入後，再次 read_page 確認結果
4. 重複直到任務完成

終止規則（必須遵守）：
- 遇到登入頁面（URL 包含 /login /signin，且頁面主體只有登入表單）：停止並告知用戶
- 只是彈出登入提示框/浮層（頁面主體內容仍在，URL 沒變）：嘗試關閉提示框後繼續任務，不要停止
- 遇到驗證碼/人機驗證：立即停止，回覆「遇到驗證碼，需要手動處理」
- 連續 3 次 read_page 結果相同（頁面沒變化）：立即停止並告知用戶卡住了
- 找不到目標內容：最多 scroll_page + read_page 嘗試 2 次，仍找不到就停止告知用戶
- 每次操作後必須評估進展，如果沒有朝目標前進，立即停止

操作規則：
- 每次 click_element 或 type_text 前，必須先 read_page 獲取最新元素編號
- 元素編號（id）在每次 read_page 後會重新分配，不要復用舊編號
- 導航後必須等待頁面載入，再 read_page
- 用簡潔的繁體中文向用戶說明你在做什麼

【批量填寫表單】：
- 頁面上有多個輸入框需要填寫時，優先使用 fill_form 一次性填完所有欄位
- fill_form 比多次 type_text 效率高得多，能大幅減少步驟數
- 使用前先 read_page 獲取所有輸入框的編號，然後一次 fill_form 搞定
- 只有在填完後需要觀察變化（如下拉聯動）時，才逐個 type_text

【輸入框操作流程】：
- 輸入前先點擊：type_text 前必須先 click_element 點擊該輸入框，再 read_page 觀察：
  · 彈出了搜尋面板/彈框且其中有新輸入框 → 在新出現的輸入框中 type_text，而非原始輸入框
  · 出現了下拉/候選清單 → click_element 選擇正確選項（不要繼續輸入）
  · 無變化 → 直接 type_text 在原輸入框中輸入
- type_text 完成後 read_page 觀察，再決定下一步：
  · 有搜尋/查詢/提交按鈕 → click_element 點擊該按鈕（優先於按 Enter）
  · 出現了下拉/候選清單 → click_element 選擇正確選項（不要按 Enter）
  · 無搜尋按鈕 → press_key("Enter") 提交
  · 還有其他必填欄位未填 → 繼續填寫下一個欄位
- 永遠不要跳過觀察步驟直接假設行為

探索規則：
- read_page 返回的 interactive_elements 包含頁面上所有可點擊的元素，根據 text 內容判斷用途
- 導航選單通常排在 interactive_elements 列表靠前位置
- 如果點擊某元素後頁面內容更新但 URL 沒變（單頁應用），等待 1 秒再 read_page
- 如果需要找某類資訊，先通讀 interactive_elements 列表，選擇最相關的入口點擊

【懸浮選單 / 懸浮按鈕處理規則】：
- 部分導航選單（如 Element UI 的 el-submenu）是滑鼠懸浮展開的，不是點擊展開
- 遇到這類選單時：用 hover_element 懸浮在選單項上 → wait 1秒 → read_page 查看子選單項 → click_element 點擊目標子項
- 不要直接 click_element 點擊懸浮選單的父項，否則可能觸發導航跳轉而非展開子選單
- 部分介面（如 GitLab / GitHub 程式碼審查）的操作按鈕僅在滑鼠懸浮到某行時才顯示（CSS :hover）
- 處理方式：hover_element 懸浮在目標行的某個可見元素上 → read_page（此時隱藏按鈕已被強制顯示）→ click_element 點擊目標按鈕
- hover_element 的 id 可以是目標行內任何已識別的元素（如行號、檔案名連結等），不必是按鈕本身

【導航與重複操作規則】：
- 如果目標 URL 已知或可以直接推斷，直接 navigate 到該 URL，不要先去網站首頁再用搜尋框搜尋
- 每次 navigate 後必須 read_page 確認頁面內容，再決定下一步，絕對不能連續 navigate 兩次
- 已經在目標網站/頁面上時，直接操作頁面上的表單/按鈕，不要再 navigate 或 new_tab 到同一 URL
- 搜尋/預訂表單：頁面上已有對應輸入框時，直接點擊對應欄位填寫，不要跳轉到其他頁面
- get_current_url 只用於不確定當前 URL 時，不要在剛 navigate 後立即調用`,

  en: `You are an AI assistant that controls the browser and helps users complete any web task.

Workflow:
1. Use read_page first to read the current page content and all interactive elements
2. Decide on actions based on user needs (navigate / click / type / scroll)
3. After clicking or typing, use read_page again to confirm the result
4. Repeat until the task is complete

Termination rules (must follow):
- Login page encountered (URL contains /login or /signin, and page body only has a login form): stop and inform the user
- A login popup/overlay appears (page body still present, URL unchanged): try to close the popup and continue, do not stop
- CAPTCHA / human verification encountered: stop immediately and reply "Encountered a CAPTCHA, please handle it manually"
- 3 consecutive read_page results are identical (page unchanged): stop immediately and inform the user it is stuck
- Cannot find target content: try at most scroll_page + read_page 2 times; if still not found, stop and inform the user
- After each action, evaluate progress; if not moving toward the goal, stop immediately

Operation rules:
- Before each click_element or type_text, always call read_page first to get the latest element IDs
- Element IDs are reassigned after every read_page — do not reuse old IDs
- After navigation, wait for the page to load, then call read_page
- Briefly explain to the user in English what you are doing

[Bulk form filling]:
- When there are multiple input fields to fill (e.g. data entry, form filling), prefer fill_form to complete all fields at once
- fill_form is far more efficient than multiple type_text calls and greatly reduces the number of steps
- First call read_page to get all input field IDs, then complete everything with one fill_form call
- Only use individual type_text calls when you need to observe changes after each input (e.g. cascading dropdowns)

[Input field workflow]:
- Before typing, always click first: click_element on the input field, then read_page to observe:
  · A search panel / modal appeared with a new input box → type_text into the new input box, not the original
  · A dropdown / suggestion list appeared → click_element to select the correct option (do not type)
  · No change → type_text directly into the original input field
- After type_text, read_page to observe, then decide next step:
  · A search / query / submit button is visible → click_element on that button (preferred over pressing Enter)
  · A dropdown / suggestion list appeared → click_element to select the correct option (do not press Enter)
  · No search button → press_key("Enter") to submit
  · Other required fields are not yet filled → continue filling the next field
- Never skip the observation step and assume behavior

Exploration rules:
- interactive_elements returned by read_page contains all clickable elements; judge their purpose from the text content
- Navigation menus usually appear near the top of the interactive_elements list
- If clicking an element updates page content but the URL does not change (SPA), wait 1 second then call read_page
- When looking for certain information, first read through the interactive_elements list and choose the most relevant entry point

[Hover menu / hover button handling rules]:
- Some navigation menus (e.g. Element UI's el-submenu) expand on mouse hover, not on click
- For these menus: hover_element on the menu item → wait 1 second → read_page to see submenu items → click_element to select the target item
- Do NOT directly click_element on a hover menu's parent item — clicking may trigger navigation instead of expanding the submenu
- Some interfaces (e.g. GitLab / GitHub code review) only show action buttons when hovering over a row (CSS :hover)
- Approach: hover_element on any visible element in the target row → read_page (hidden buttons are now force-revealed) → click_element on the target button
- The id for hover_element can be any already-identified element in that row (e.g. a line number link, file name); it does not need to be the button itself

[Navigation and repeated operation rules]:
- If the target URL is known or can be directly inferred (e.g. "open GitHub user sazima's homepage" → https://github.com/sazima), navigate directly to that URL; do not go to the site homepage first and then use the search box
- After each navigate, call read_page to confirm page content before deciding the next step; never call navigate twice in a row
- When already on the target site / page (the url in read_page contains the target domain), operate the forms / buttons directly; do not navigate or new_tab to the same URL again
- Search / booking forms (flights, hotels, trains, etc.): when departure, destination, and date fields are already on the page, click the corresponding fields directly to fill them in; do not jump to another page
- Use get_current_url only when unsure of the current URL; do not call it immediately after navigate (the URL is already known after navigate)`,

  ja: `あなたはブラウザを操作できるAIアシスタントで、ユーザーがあらゆるWeb操作を完了するのを支援します。

ワークフロー：
1. まず read_page を使って現在のページ内容とすべてのインタラクティブ要素を読み取る
2. ユーザーの要求に基づいて操作を決定する（ナビゲート／クリック／入力／スクロール）
3. クリックまたは入力後、再度 read_page で結果を確認する
4. タスク完了まで繰り返す

終了ルール（必ず守ること）：
- ログインページに遭遇した場合（URLに /login /signin が含まれ、ページ本体がログインフォームのみ）：停止してユーザーに知らせる
- ログインポップアップ／オーバーレイが表示されただけの場合（ページ本体は表示中、URLは変わらない）：ポップアップを閉じてタスクを継続する、停止しない
- CAPTCHA／人間確認に遭遇した場合：即座に停止し「CAPTCHAが表示されました、手動で対処してください」と返答する
- 3回連続で read_page の結果が同じ場合（ページ変化なし）：即座に停止しユーザーに詰まっていることを知らせる
- 目的のコンテンツが見つからない場合：scroll_page + read_page を最大2回試み、それでも見つからなければ停止してユーザーに知らせる
- 各操作後に進捗を評価し、目標に向かって進んでいなければ即座に停止する

操作ルール：
- click_element または type_text の前に、必ず read_page を呼んで最新の要素IDを取得する
- 要素ID（id）は read_page のたびに再割り当てされる。古いIDを再使用しないこと
- ナビゲート後はページの読み込みを待ってから read_page を呼ぶ
- 何をしているかを簡潔な日本語でユーザーに説明する

【一括フォーム入力】：
- ページに複数の入力フィールドがある場合（データ入力、フォーム記入など）、fill_form を優先してすべてのフィールドを一度に入力する
- fill_form は複数回の type_text より大幅に効率的でステップ数を削減できる
- 事前に read_page で全入力フィールドのIDを取得し、1回の fill_form で完了させる
- 入力後に変化を観察する必要がある場合（例：連動ドロップダウン）のみ個別に type_text を使う

【入力フィールドの操作フロー】：
- 入力前に必ずクリック：type_text の前に click_element で入力フィールドをクリックし、read_page で観察する：
  · 検索パネル／モーダルが開いて新しい入力ボックスがある場合 → 元の入力フィールドではなく新しい入力ボックスに type_text
  · ドロップダウン／候補リストが出現した場合 → click_element で正しいオプションを選択する（入力を続けない）
  · 変化なし → 元の入力フィールドに直接 type_text
- type_text 完了後に read_page で観察し、次のステップを決定する：
  · 検索／照会／送信ボタンがある場合 → click_element でそのボタンをクリック（Enterより優先）
  · ドロップダウン／候補リストが出現した場合 → click_element で正しいオプションを選択する（Enterは押さない）
  · 検索ボタンがない場合 → press_key("Enter") で送信する
  · 他の必須フィールドが未入力の場合 → 次のフィールドの入力を続ける
- 観察ステップを飛ばして動作を仮定しないこと

探索ルール：
- read_page が返す interactive_elements にはページ上のすべてのクリック可能な要素が含まれる。テキスト内容から用途を判断する
- ナビゲーションメニューは通常 interactive_elements リストの先頭付近に表示される
- 要素をクリックしてページ内容が更新されたがURLが変わらない場合（SPA）、1秒待ってから read_page を呼ぶ
- 特定の情報を探す場合、まず interactive_elements リストを通読し、最も関連性の高い入口を選ぶ

【ホバーメニュー / ホバーボタンの処理ルール】：
- 一部のナビゲーションメニュー（Element UI の el-submenu など）はマウスホバーで展開する。クリックでは展開しない
- この種のメニューは：hover_element でホバー → 1秒待機 → read_page でサブメニュー項目を確認 → click_element で目的の項目を選択
- ホバーメニューの親項目を直接 click_element でクリックしない（クリックするとサブメニュー展開でなく画面遷移する可能性がある）
- 一部のUI（GitLab / GitHub のコードレビューなど）では、行にホバーしたときだけ操作ボタンが表示される（CSS :hover）
- 対処法：対象行の任意の可視要素に hover_element でホバー → read_page（隠しボタンが強制表示される）→ click_element でボタンをクリック
- hover_element の id は対象行内の任意の識別済み要素でよい（行番号リンク、ファイル名など）。ボタン自体でなくてもよい

【ナビゲーションと繰り返し操作のルール】：
- 目的のURLが既知または直接推測可能な場合、そのURLに直接 navigate する。サイトのトップページに行ってから検索ボックスを使わないこと
- navigate のたびに read_page でページ内容を確認してから次のステップを決定する。連続して2回 navigate しないこと
- すでに目的のサイト／ページにいる場合（read_page の url が目的ドメインを含む）、ページ上のフォーム／ボタンを直接操作する。同じURLに navigate や new_tab をしないこと
- 検索／予約フォーム（航空券、ホテル、電車など）：出発地、目的地、日付の入力欄がすでにページにある場合、対応フィールドを直接クリックして入力する。他のページに移動しないこと
- get_current_url は現在のURLが不明な場合のみ使用する。navigate の直後に呼ばないこと（navigate 後のURLは既知）`,

  ko: `당신은 브라우저를 제어할 수 있는 AI 어시스턴트로, 사용자가 모든 웹 작업을 완료하도록 돕습니다.

워크플로우：
1. 먼저 read_page를 사용하여 현재 페이지 내용과 모든 인터랙티브 요소를 읽는다
2. 사용자 요구에 따라 작업을 결정한다（탐색 / 클릭 / 입력 / 스크롤）
3. 클릭하거나 입력한 후 read_page를 다시 호출하여 결과를 확인한다
4. 작업이 완료될 때까지 반복한다

종료 규칙（반드시 준수）：
- 로그인 페이지를 만난 경우（URL에 /login /signin이 포함되고 페이지 본문이 로그인 폼만 있음）：중지하고 사용자에게 알린다
- 로그인 팝업 / 오버레이만 나타난 경우（페이지 본문은 표시 중, URL 변화 없음）：팝업을 닫고 작업을 계속한다, 중지하지 않는다
- CAPTCHA / 사람 인증을 만난 경우：즉시 중지하고 「CAPTCHA가 표시되었습니다. 수동으로 처리해 주세요」라고 답한다
- read_page 결과가 3회 연속 동일한 경우（페이지 변화 없음）：즉시 중지하고 사용자에게 막혔음을 알린다
- 목표 콘텐츠를 찾을 수 없는 경우：scroll_page + read_page를 최대 2회 시도하고 그래도 없으면 중지하고 사용자에게 알린다
- 각 작업 후 진행 상황을 평가하고 목표를 향해 나아가지 않으면 즉시 중지한다

조작 규칙：
- click_element 또는 type_text 전에 반드시 read_page를 먼저 호출하여 최신 요소 ID를 가져온다
- 요소 ID（id）는 read_page 후마다 재할당된다. 이전 ID를 재사용하지 않는다
- 탐색 후 페이지 로드를 기다린 후 read_page를 호출한다
- 무엇을 하고 있는지 간결한 한국어로 사용자에게 설명한다

【일괄 양식 작성】：
- 페이지에 여러 입력 필드가 있는 경우（데이터 입력, 양식 작성 등）fill_form을 우선 사용하여 모든 필드를 한 번에 입력한다
- fill_form은 여러 번의 type_text보다 훨씬 효율적이며 단계 수를 크게 줄인다
- 먼저 read_page로 모든 입력 필드 ID를 가져온 후 한 번의 fill_form으로 완료한다
- 입력 후 변화를 관찰해야 하는 경우（예: 연동 드롭다운）에만 개별 type_text를 사용한다

【입력 필드 조작 흐름】：
- 입력 전에 반드시 클릭：type_text 전에 click_element로 입력 필드를 클릭하고 read_page로 관찰한다：
  · 검색 패널 / 모달이 열리고 새 입력 상자가 있는 경우 → 원래 입력 필드가 아닌 새 입력 상자에 type_text
  · 드롭다운 / 후보 목록이 나타난 경우 → click_element로 올바른 옵션을 선택한다（입력을 계속하지 않는다）
  · 변화 없음 → 원래 입력 필드에 직접 type_text
- type_text 완료 후 read_page로 관찰하고 다음 단계를 결정한다：
  · 검색 / 조회 / 제출 버튼이 있는 경우 → click_element로 그 버튼을 클릭한다（Enter보다 우선）
  · 드롭다운 / 후보 목록이 나타난 경우 → click_element로 올바른 옵션을 선택한다（Enter 키를 누르지 않는다）
  · 검색 버튼이 없는 경우 → press_key("Enter")로 제출한다
  · 다른 필수 필드가 아직 입력되지 않은 경우 → 다음 필드 입력을 계속한다
- 관찰 단계를 건너뛰고 동작을 가정하지 않는다

탐색 규칙：
- read_page가 반환하는 interactive_elements에는 페이지의 모든 클릭 가능한 요소가 포함된다. 텍스트 내용으로 용도를 판단한다
- 탐색 메뉴는 일반적으로 interactive_elements 목록의 앞부분에 표시된다
- 요소를 클릭하여 페이지 내용이 업데이트되었지만 URL이 변하지 않은 경우（SPA）1초 기다린 후 read_page를 호출한다
- 특정 정보를 찾는 경우 먼저 interactive_elements 목록을 통독하고 가장 관련성 높은 진입점을 선택한다

【호버 메뉴 / 호버 버튼 처리 규칙】：
- 일부 탐색 메뉴（Element UI의 el-submenu 등）는 마우스 호버로 펼쳐진다. 클릭으로는 열리지 않는다
- 이런 메뉴는: hover_element로 호버 → 1초 대기 → read_page로 서브메뉴 항목 확인 → click_element로 목적 항목 선택
- 호버 메뉴의 부모 항목을 직접 click_element로 클릭하지 않는다（클릭하면 서브메뉴 펼침 대신 페이지 이동이 발생할 수 있다）
- 일부 UI（GitLab / GitHub 코드 리뷰 등）는 행에 호버할 때만 동작 버튼이 표시된다（CSS :hover）
- 처리 방법: 대상 행의 임의 가시 요소에 hover_element로 호버 → read_page（숨겨진 버튼이 강제로 표시됨）→ click_element로 버튼 클릭
- hover_element의 id는 해당 행에서 이미 식별된 임의 요소여도 된다（행 번호 링크, 파일명 등）. 버튼 자체일 필요는 없다

【탐색 및 반복 조작 규칙】：
- 목적 URL을 알고 있거나 직접 추론 가능한 경우 해당 URL로 직접 navigate한다. 사이트 홈페이지로 먼저 가서 검색 상자를 사용하지 않는다
- navigate 후 read_page로 페이지 내용을 확인한 후 다음 단계를 결정한다. 연속으로 두 번 navigate하지 않는다
- 이미 목표 사이트 / 페이지에 있는 경우（read_page의 url에 목표 도메인이 포함됨）페이지의 양식 / 버튼을 직접 조작한다. 같은 URL로 navigate 또는 new_tab하지 않는다
- 검색 / 예약 양식（항공권, 호텔, 기차 등）：출발지, 목적지, 날짜 입력란이 이미 페이지에 있는 경우 해당 필드를 직접 클릭하여 입력한다. 다른 페이지로 이동하지 않는다
- get_current_url은 현재 URL을 모를 때만 사용한다. navigate 직후에는 호출하지 않는다（navigate 후 URL은 이미 알고 있음）`,
};

function getSystemPrompt(lang) {
  return SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS["zh-CN"];
}

// ── 工具定义（发给 LLM 的 JSON Schema） ──────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "read_page",
      description:
        "读取当前标签页的内容：页面标题、URL、正文文字、所有可交互元素（按钮/链接/输入框）及其编号。" +
        "每次操作前必须先调用此工具获取最新页面状态和元素编号，再决定点击或输入。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "在当前标签页导航到指定 URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "完整 URL，例如 https://github.com" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "new_tab",
      description: "在新标签页打开指定 URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "完整 URL" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click_element",
      description:
        "点击页面上指定编号的元素。元素编号来自 read_page 返回的 interactive_elements 列表中的 id 字段。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "元素编号（来自 read_page 结果）" },
          description: { type: "string", description: "你要点击什么（用于日志显示）" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hover_element",
        description:
        "将鼠标悬浮在指定编号的元素上（只触发 hover 事件，不点击）。" +
        "用途1：展开 hover 触发的下拉菜单（如导航栏子菜单）——先 hover_element 展开，再 read_page，再 click_element。" +
        "用途2：显示 CSS :hover 才出现的隐藏按钮（如 GitLab/GitHub 代码行旁的【添加评论】按钮）——hover_element 悬浮在目标行的任意可见元素上，再 read_page 即可看到并点击这些按钮。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "元素编号（来自 read_page 结果）" },
          description: { type: "string", description: "你要悬浮在什么元素上（用于日志显示）" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "在指定编号的输入框中输入文字",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "输入框的元素编号（来自 read_page 结果）" },
          text: { type: "string", description: "要输入的文字" },
          clear_first: {
            type: "boolean",
            description: "输入前是否先清空，默认 true",
          },
        },
        required: ["id", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "press_key",
      description: "按下键盘按键，常用于提交搜索（Enter）",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: '按键名称，例如: "Enter", "Tab", "Escape"',
          },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll_page",
      description: "滚动当前页面",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down"],
            description: "滚动方向",
          },
          pixels: {
            type: "number",
            description: "滚动像素数，默认 500",
          },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wait",
      description: "等待页面加载或操作完成",
      parameters: {
        type: "object",
        properties: {
          seconds: {
            type: "number",
            description: "等待秒数（1-10）",
          },
        },
        required: ["seconds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_url",
      description: "获取当前标签页的 URL，用于确认导航是否成功",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "fill_form",
      description:
        "批量填写表单：一次性填写多个输入框，比多次调用 type_text 更高效。" +
        "适合页面上有多个输入框需要填写的场景（检测数据、表单录入等）。" +
        "fields 数组中每项包含 id（来自 read_page 的元素编号）和 value（要填入的值）。",
      parameters: {
        type: "object",
        properties: {
          fields: {
            type: "array",
            description: "要填写的字段列表",
            items: {
              type: "object",
              properties: {
                id:    { type: "number", description: "元素编号（来自 read_page）" },
                value: { type: "string", description: "要填入的值" },
              },
              required: ["id", "value"],
            },
          },
        },
        required: ["fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_api",
      description:
        "在当前页面的浏览器上下文中发起 fetch 请求，自动携带当前用户的 Session Cookie 和 CSRF Token，无需手动配置认证。" +
        "适用场景：调用 GitLab / GitHub 等网站的 REST API（获取 MR diff、提交行内评论等），或调用当前页面所属网站的任意接口。" +
        "注意：只能访问与当前页面同源（same-origin）的 URL。",
      parameters: {
        type: "object",
        properties: {
          url:    { type: "string",  description: "请求 URL（可用相对路径，如 /api/v4/projects/...）" },
          method: { type: "string",  enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "HTTP 方法，默认 GET" },
          body:   { type: "object",  description: "请求体（POST/PUT/PATCH 时使用，自动序列化为 JSON）" },
        },
        required: ["url"],
      },
    },
  },
];

// ── 辅助函数 ──────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 向 content.js 发送消息，执行 DOM 操作
 */
/**
 * 带超时的 sendMessage 封装
 * read_page 在重型 SPA 页面可能耗时较长，给 12 秒；其他操作 8 秒
 */
function sendMessageWithTimeout(tabId, payload, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[AI] sendMessage timeout after ${timeoutMs}ms`, payload.action);
      resolve(null);
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, payload, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        console.warn(`[AI] sendMessage error:`, chrome.runtime.lastError.message);
        resolve(null);
      } else {
        resolve(response || { success: false, error: "无响应" });
      }
    });
  });
}

async function executeInPage(tabId, action, params = {}) {
  // 每次单独尝试的超时：read_page 允许更长（页面可能渲染中）
  const attemptTimeout = action === "read_page" ? 12000 : 6000;
  const MAX_ATTEMPTS = 3;
  const t0 = Date.now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[AI] executeInPage attempt ${attempt}/${MAX_ATTEMPTS}: ${action}`);
    const result = await sendMessageWithTimeout(tabId, { action, params }, attemptTimeout);
    const elapsed = Date.now() - t0;

    if (result !== null) {
      if (attempt > 1) console.log(`[AI] executeInPage succeeded on attempt ${attempt} (${elapsed}ms)`);
      return result;
    }

    console.warn(`[AI] executeInPage attempt ${attempt} timed out (${elapsed}ms)`);

    if (attempt < MAX_ATTEMPTS) {
      // 在下一次重试前，尝试重新注入 content.js（可能 crash 了或者页面刚加载完）
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
        await sleep(300);
      } catch (_) { /* 已注入时会报错，忽略 */ }
    }
  }

  const total = Date.now() - t0;
  console.error(`[AI] executeInPage failed after ${MAX_ATTEMPTS} attempts (${total}ms): ${action}`);
  return { success: false, error: `操作超时（已自动重试 ${MAX_ATTEMPTS} 次，共等待 ${Math.round(total / 1000)}s）` };
}

/**
 * 等待页面加载完成
 */
async function waitForPageLoad(tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return true;
    await sleep(300);
  }
  return false;
}

/**
 * 向 sidepanel 发送进度消息（用于实时显示 AI 在做什么）
 */
function sendProgress(type, content, tabId) {
  chrome.runtime.sendMessage({ type, content }).catch(() => {});
  // 任务结束时清除页面上的元素编号覆盖层
  if ((type === "reply" || type === "error") && tabId) {
    chrome.tabs.sendMessage(tabId, { action: "clear_overlay" }).catch(() => {});
  }
}

/**
 * 执行工具调用
 */
async function executeTool(toolName, params, tabId) {
  switch (toolName) {
    case "read_page": {
      const result = await executeInPage(tabId, "read_page", {});
      console.log(`[read_page] elements=${result.interactive_elements?.length ?? "?"} total=${result.total_elements ?? "?"} modal=${!!result.active_modal} url=${result.url}`);
      return JSON.stringify(result, null, 2);
    }

    case "navigate": {
      await chrome.tabs.update(tabId, { url: params.url });
      await sleep(500);
      await waitForPageLoad(tabId);
      await sleep(800); // 额外等待动态内容加载
      return JSON.stringify({ success: true, message: `已导航到: ${params.url}` });
    }

    case "new_tab": {
      const tab = await chrome.tabs.create({ url: params.url });
      // 切换焦点到新标签
      await sleep(500);
      await waitForPageLoad(tab.id);
      await sleep(800);
      // 更新 tabId（后续操作在新标签页进行）
      return JSON.stringify({
        success: true,
        message: `已在新标签页打开: ${params.url}`,
        new_tab_id: tab.id,
      });
    }

    case "hover_element": {
      const result = await executeInPage(tabId, "hover_element", { id: params.id });
      await sleep(600); // 等待 hover 触发的动画/菜单展开
      return JSON.stringify(result);
    }

    case "click_element": {
      const result = await executeInPage(tabId, "click_element", { id: params.id });
      await sleep(800); // 等待点击后的页面响应
      return JSON.stringify(result);
    }

    case "type_text": {
      // 输入前等待 200ms：点击触发的弹框/下拉需要时间渲染，焦点转移需要稍等
      await sleep(200);
      const result = await executeInPage(tabId, "type_text", {
        id: params.id,
        text: params.text,
        clear_first: params.clear_first !== false,
      });
      return JSON.stringify(result);
    }

    case "press_key": {
      const result = await executeInPage(tabId, "press_key", { key: params.key });
      if (params.key === "Enter") {
        await sleep(1500); // Enter 后等待页面响应
        await waitForPageLoad(tabId);
      }
      return JSON.stringify(result);
    }

    case "scroll_page": {
      const result = await executeInPage(tabId, "scroll_page", {
        direction: params.direction,
        pixels: params.pixels || 500,
      });
      await sleep(300);
      return JSON.stringify(result);
    }

    case "wait": {
      const seconds = Math.min(Math.max(params.seconds || 1, 1), 10);
      await sleep(seconds * 1000);
      return JSON.stringify({ success: true, message: `等待了 ${seconds} 秒` });
    }

    case "get_current_url": {
      const tab = await chrome.tabs.get(tabId);
      return JSON.stringify({ url: tab.url, title: tab.title });
    }

    case "fill_form": {
      const result = await executeInPage(tabId, "fill_form", { fields: params.fields });
      return JSON.stringify(result);
    }

    case "call_api": {
      const result = await executeInPage(tabId, "call_api", {
        url: params.url,
        method: params.method || "GET",
        body: params.body || null,
      });
      return JSON.stringify(result);
    }

    default:
      return JSON.stringify({ success: false, error: `未知工具: ${toolName}` });
  }
}

// ── Agent Loop 核心 ───────────────────────────────────────────

// 全局停止标志（用户点击停止按钮时设为 true）
let stopRequested = false;
// 当前 API 请求的 AbortController，停止时用于立即中断 fetch
let currentAbortController = null;

/**
 * 检测是否是登录/验证页面
 */
function isLoginPage(pageResult) {
  try {
    const data = typeof pageResult === "string" ? JSON.parse(pageResult) : pageResult;
    const url = (data.url || "").toLowerCase();
    const title = (data.title || "").toLowerCase();

    // 只用 URL 和标题判断——这两个是真正被重定向到登录页的可靠信号
    // 不用 body_text：正常页面上的登录浮层/提示也会包含"请登录"字样，误判率太高
    const loginUrlPatterns = ["/login", "/signin", "/sign-in", "/passport", "/account/login"];
    const urlMatch = loginUrlPatterns.some((p) => url.includes(p));

    // 标题必须"纯粹"是登录页，不能只是包含"登录"二字
    // 例如"用户登录 - 携程"算，"机票搜索 | 登录享优惠"不算
    const loginTitles = ["用户登录", "账号登录", "登录 -", "- 登录", "login -", "- login", "sign in"];
    const titleMatch = loginTitles.some((p) => title.includes(p));

    return urlMatch || titleMatch;
  } catch {
    return false;
  }
}

async function runAgentLoop(userMessage, tabId, apiKey, baseUrl, model, maxTurnsConfig, language = "zh-CN", conversationHistory = []) {
  stopRequested = false;
  const s = bgT(language);

  const systemPrompt = getSystemPrompt(language);

  // 取最近 5 轮（10 条）历史，只保留 user/assistant，跳过 error
  const MAX_HISTORY_TURNS = 5;
  const historyMessages = conversationHistory
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_HISTORY_TURNS * 2)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: userMessage },
  ];

  const apiBase = (baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "");
  const modelName = model || "deepseek-chat";
  const maxTurns = Math.max(1, Math.min(parseInt(maxTurnsConfig) ?? 60, 100));
  console.log(`[AI助手] baseUrl=${apiBase} model=${modelName} maxTurns=${maxTurns}`);

  // tabId 可能在 click_element 触发新标签页后更新，用 let 允许重新赋值
  let currentTabId = tabId;

  let turn = 0;

  // 卡死检测：只统计 navigate/new_tab 后到达的 URL，不统计 read_page 里的 URL
  // 这样正常在同一页面多次 read_page 不会误触发
  const navigatedUrls = [];   // 每次 navigate/new_tab 后追加
  const MAX_NAV_REPEATS = 3;  // 同一 URL 被导航 3 次才算循环

  // 页面内容不变检测（连续 read_page 返回相同内容，且期间没有任何交互）
  let lastReadPageHash = null;
  let samePageCount = 0;
  const MAX_SAME_PAGE = 4;
  let actionSinceLastRead = false; // 两次 read_page 之间是否有过点击/输入等操作

  while (turn < maxTurns) {
    // 检查用户是否点击了停止
    if (stopRequested) {
      sendProgress("reply", s.stopped, currentTabId);
      return;
    }

    turn++;

    // ── Context 压缩：保留最近 2 次 read_page 的完整内容，更早的替换为摘要 ──
    // 防止 context 无限增长导致 LLM 越来越慢（read_page 每次约 +7k tokens）
    // ── Context 压缩：动态决定保留最近 1 次或 2 次的完整内容 ──
    // 防止 context 无限增长导致 LLM 越来越慢，同时避免超大页面撑爆 Token 限制
    {
      const readPageIndices = messages.reduce((acc, m, i) => {
        if (m._is_read_page) acc.push(i);
        return acc;
      },[]);

      // 动态判断保留次数：
      // 如果最新一次读取的页面数据极大（字符串长度 > 80000，约合 2万+ Tokens）
      // 则强行只保留 1 次，防止触发 128k Token 上限；否则保留正常的 2 次
      let keepCount = 2;
      if (readPageIndices.length > 0) {
        const lastReadMsg = messages[readPageIndices[readPageIndices.length - 1]];
        if (lastReadMsg && lastReadMsg.content && lastReadMsg.content.length > 80000) {
          keepCount = 1;
          console.log(`[CTX] 页面极庞大 (约 ${Math.round(lastReadMsg.content.length/1000)}k 字符)，启动防爆破机制：仅保留最新 1 次快照`);
        }
      }

      const toSummarize = readPageIndices.slice(0, -keepCount);
      for (const idx of toSummarize) {
        const msg = messages[idx];
        if (msg._summarized) continue; // 已压缩过，跳过
        try {
          const parsed = JSON.parse(msg.content);
          // 只保留 url、title、total_elements，丢弃 body_text 和 interactive_elements
          msg.content = JSON.stringify({
            url: parsed.url,
            title: parsed.title,
            total_elements: parsed.total_elements,
            _note: "[已压缩，仅保留页面基本信息]",
          });
          msg._summarized = true;
        } catch { /* JSON 解析失败则保持原样 */ }
      }
      if (toSummarize.length > 0) {
        console.log(`[CTX] 压缩了 ${toSummarize.length} 条旧 read_page 结果，当前保留 ${keepCount} 条`);
      }
    }

    // 调用 DeepSeek API
    let response;
    try {
      currentAbortController = new AbortController();
      const llmLabel = `[LLM] turn=${turn} msgs=${messages.length}`;
      console.time(llmLabel);
      const resp = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        signal: currentAbortController.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: 2000,
        }),
      });

      if (!resp.ok) {
        console.timeEnd(llmLabel);
        const err = await resp.text();
        throw new Error(`API 错误 ${resp.status}: ${err}`);
      }

      response = await resp.json();
      const choice = response.choices?.[0];
      console.timeEnd(llmLabel);
      console.log(`[LLM] turn=${turn} finish=${choice?.finish_reason} tools=${choice?.message?.tool_calls?.length ?? 0} tokens=${response.usage?.total_tokens ?? "?"}`);
    } catch (e) {
      // AbortError 是用户主动停止，不算错误，静默退出
      if (e.name === "AbortError" || stopRequested) return;
      sendProgress("error", s.api_error(e.message), currentTabId);
      return;
    }

    // 再次检查停止（API 调用耗时，期间用户可能点了停止）
    if (stopRequested) {
      sendProgress("reply", s.stopped, currentTabId);
      return;
    }

    const choice = response.choices[0];
    const msg = choice.message;
    const stopReason = choice.finish_reason;

    messages.push(msg);

    // LLM 在调用工具前可能有文字分析，发给 sidepanel 让用户可以查看
    if (msg.content && msg.content.trim()) {
      sendProgress("thinking", msg.content.trim());
    }

    // ── 有工具调用 ──
    if (stopReason === "tool_calls" && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        if (stopRequested) {
          sendProgress("reply", s.stopped, currentTabId);
          return;
        }

        const name = toolCall.function.name;
        const params = JSON.parse(toolCall.function.arguments || "{}");

        // 向 sidepanel 推送进度
        const stepLabel = formatStepLabel(name, params, s);
        sendProgress("step", stepLabel);

        // 执行工具（click_element 前先记录标签页快照，用于检测是否触发了新标签页）
        let result;
        let tabsBeforeClick = null;
        if (name === "click_element") {
          try {
            const currentTab = await chrome.tabs.get(currentTabId);
            const allTabs = await chrome.tabs.query({ windowId: currentTab.windowId });
            tabsBeforeClick = new Set(allTabs.map((t) => t.id));
          } catch { /* 忽略 */ }
        }

        try {
          result = await executeTool(name, params, currentTabId);
        } catch (e) {
          result = JSON.stringify({ success: false, error: e.message });
        }

        // click_element 后检测是否打开了新标签页
        if (name === "click_element" && tabsBeforeClick) {
          try {
            const currentTab = await chrome.tabs.get(currentTabId);
            const allTabsAfter = await chrome.tabs.query({ windowId: currentTab.windowId });
            const newTab = allTabsAfter.find((t) => !tabsBeforeClick.has(t.id));
            if (newTab) {
              console.log(`[AI] click 触发新标签页: ${newTab.id} url=${newTab.url}`);
              await waitForPageLoad(newTab.id);
              await sleep(800);
              currentTabId = newTab.id;
              // 把新标签页切换到前台，让用户看到
              await chrome.tabs.update(currentTabId, { active: true });
              // 在工具结果里注入提示，让 LLM 知道已切换标签页
              try {
                const r = JSON.parse(result);
                r._new_tab_opened = true;
                r._hint = `点击操作触发了新标签页，已自动切换到新标签页（id=${currentTabId}）。请立即调用 read_page 读取新页面内容。`;
                result = JSON.stringify(r);
              } catch { /* 忽略 */ }
              sendProgress("step", `↗ 新标签页已打开，已切换`);
            }
          } catch { /* 忽略 */ }
        }

        // 任何交互操作都标记"已有操作"，防止卡死检测误判
        if (name !== "read_page" && name !== "get_current_url" && name !== "wait") {
          actionSinceLastRead = true;
        }

        // ── type_text 后强制提示观察 ──
        // 在工具返回结果里追加提示，让 LLM 知道必须先 read_page 再决定下一步
        if (name === "type_text") {
          try {
            const r = JSON.parse(result);
            r._next_step_hint = "输入完成。请立即调用 read_page 观察页面变化（下拉、按钮、其他输入框等），再根据观察结果决定下一步操作。不要跳过观察直接假设行为。";
            result = JSON.stringify(r);
          } catch { /* 忽略 */ }
        }

        // ── navigate 后的 URL 循环检测（不含 new_tab，new_tab 是主动开新标签，性质不同）──
        if (name === "navigate") {
          try {
            const destUrl = params.url || "";
            navigatedUrls.push(destUrl);
            if (navigatedUrls.length > 12) navigatedUrls.shift();
            const navCount = navigatedUrls.filter((u) => u === destUrl).length;
            if (navCount >= MAX_NAV_REPEATS) {
              sendProgress("warn", s.nav_loop_warn(destUrl, navCount));
              sendProgress("reply", s.nav_loop(destUrl), currentTabId);
              return;
            }
          } catch {
            // 忽略
          }
        }

        // ── navigate 后在工具结果里注入当前页面状态提示，防止 AI 重复导航 ──
        if (name === "navigate") {
          try {
            const r = JSON.parse(result);
            if (r.success) {
              const currentTab = await chrome.tabs.get(currentTabId);
              r._hint = `已成功导航到此页面。请立即调用 read_page 读取当前页面内容，确认页面状态后再决定下一步操作。不要再次导航到相同 URL。`;
              result = JSON.stringify(r);
            }
          } catch { /* 忽略 */ }
        }

        // ── 登录页检测 ──
        if (name === "read_page") {
          try {
            const parsed = JSON.parse(result);

            // 登录页检测
            if (isLoginPage(parsed)) {
              sendProgress("warn", "⚠️ 检测到登录页面，已自动停止");
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result + "\n\n[系统提示：当前页面是登录页，请立即停止任务并告知用户需要手动登录]",
              });
              // 注入一条 user 消息强制 AI 终止
              messages.push({
                role: "user",
                content: "遇到了登录页面，请停止操作，告诉我需要先手动登录。",
              });
              // 跳过后续工具，直接让 AI 回复
              goto_reply: {
                console.time("[LLM] login-stop reply");
                const finalResp = await fetch(`${apiBase}/chat/completions`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                  body: JSON.stringify({ model: "deepseek-chat", messages, max_tokens: 300 }),
                });
                console.timeEnd("[LLM] login-stop reply");
                if (finalResp.ok) {
                  const finalData = await finalResp.json();
                  const finalMsg = finalData.choices[0]?.message?.content;
                  sendProgress("reply", finalMsg || s.login_required, currentTabId);
                } else {
                  sendProgress("reply", s.login_required, currentTabId);
                }
              }
              return;
            }

            // 卡死检测：连续 read_page 内容相同，且期间没有发生任何交互操作
            // 注意：只有 read_page 之间没有其他操作时才计数，表单操作中读页面不算卡死
            const pageHash = `${parsed.url}::${parsed.body_text?.slice(0, 200)}`;
            if (pageHash === lastReadPageHash && !actionSinceLastRead) {
              samePageCount++;
              if (samePageCount >= MAX_SAME_PAGE) {
                sendProgress("warn", s.same_page_warn(MAX_SAME_PAGE));
                sendProgress("reply", s.same_page(parsed.url), currentTabId);
                return;
              }
            } else {
              samePageCount = 0;
              lastReadPageHash = pageHash;
            }
            actionSinceLastRead = false; // 重置：下次 read_page 前是否有操作

            // URL 循环检测在 navigate/new_tab 工具里处理，此处不重复
          } catch {
            // JSON 解析失败，忽略检测
          }
        }

        const toolMsg = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        };
        // 标记 read_page 结果，后续压缩旧快照时用
        if (name === "read_page") toolMsg._is_read_page = true;
        messages.push(toolMsg);
      }
      continue;
    }

    // ── 最终回复 ──
    if (stopReason === "stop") {
      sendProgress("reply", msg.content || s.task_done, currentTabId);
      return;
    }

    // 异常情况
    sendProgress("reply", s.done_turns(turn), currentTabId);
    return;
  }

  sendProgress("reply", s.max_turns(maxTurns), currentTabId);
}

/**
 * 格式化步骤说明（显示给用户），s 为当前语言字符串对象
 */
function formatStepLabel(toolName, params, s) {
  const labels = {
    read_page: s.step_read,
    navigate: s.step_navigate(params.url),
    new_tab: s.step_new_tab(params.url),
    click_element: s.step_click(params.description, params.id),
    hover_element: s.step_hover(params.description, params.id),
    type_text: s.step_type(params.text),
    press_key: s.step_key(params.key),
    scroll_page: s.step_scroll(params.direction),
    wait: s.step_wait(params.seconds),
    get_current_url: s.step_url,
    fill_form: s.step_fill(params.fields?.length ?? 0),
    call_api: s.step_api(params.url),
  };
  return labels[toolName] || s.step_unknown(toolName);
}

// ── 消息监听器 ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "run_agent") {
    const { userMessage, tabId, apiKey, baseUrl, model, maxTurns, language, conversationHistory } = message;
    runAgentLoop(userMessage, tabId, apiKey, baseUrl, model, maxTurns, language, conversationHistory || []).catch((e) => {
      sendProgress("error", bgT(language).agent_error(e.message), tabId);
    });
    sendResponse({ started: true });
    return true;
  }

  if (message.type === "stop_agent") {
    stopRequested = true;
    // 立即中断正在进行的 API fetch，无需等待超时
    currentAbortController?.abort();
    currentAbortController = null;
    sendResponse({ stopped: true });
    return true;
  }

  if (message.type === "open_side_panel") {
    chrome.sidePanel.open({ windowId: message.windowId });
    sendResponse({});
    return true;
  }
});

// 点击扩展图标 → 打开侧边栏
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
