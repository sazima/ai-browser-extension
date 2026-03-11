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
    step_type: (text) => `⌨️ Type: "${text}"`,
    step_key: (key) => `⌨️ Press ${key}`,
    step_scroll: (dir) => `📜 Scroll ${dir === "down" ? "down" : "up"}`,
    step_wait: (s) => `⏳ Wait ${s}s`,
    step_url: "🔍 Get current URL",
    step_fill: (n) => `📝 Fill ${n} field(s)`,
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
    step_type: (text) => `⌨️ 输入: "${text}"`,
    step_key: (key) => `⌨️ 按下 ${key}`,
    step_scroll: (dir) => `📜 向${dir === "down" ? "下" : "上"}滚动`,
    step_wait: (s) => `⏳ 等待 ${s} 秒`,
    step_url: "🔍 获取当前 URL",
    step_fill: (n) => `📝 批量填写 ${n} 个字段`,
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
    step_type: (text) => `⌨️ 輸入: "${text}"`,
    step_key: (key) => `⌨️ 按下 ${key}`,
    step_scroll: (dir) => `📜 向${dir === "down" ? "下" : "上"}捲動`,
    step_wait: (s) => `⏳ 等待 ${s} 秒`,
    step_url: "🔍 取得目前 URL",
    step_fill: (n) => `📝 批次填寫 ${n} 個欄位`,
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
    step_type: (text) => `⌨️ 入力: "${text}"`,
    step_key: (key) => `⌨️ ${key}キーを押す`,
    step_scroll: (dir) => `📜 ${dir === "down" ? "下" : "上"}にスクロール`,
    step_wait: (s) => `⏳ ${s}秒待機`,
    step_url: "🔍 現在のURLを取得",
    step_fill: (n) => `📝 ${n}個のフィールドを一括入力`,
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
    step_type: (text) => `⌨️ 입력: "${text}"`,
    step_key: (key) => `⌨️ ${key} 키 누르기`,
    step_scroll: (dir) => `📜 ${dir === "down" ? "아래로" : "위로"} 스크롤`,
    step_wait: (s) => `⏳ ${s}초 대기`,
    step_url: "🔍 현재 URL 가져오기",
    step_fill: (n) => `📝 ${n}개 필드 일괄 입력`,
    step_unknown: (name) => `🔧 ${name} 실행`,
    reply_lang: "항상 한국어로 사용자에게 답변하세요.",
  },
};

/** 获取后台字符串，找不到语言时回退到 zh-CN */
function bgT(lang) {
  return BG_STRINGS[lang] || BG_STRINGS["zh-CN"];
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
  const timeoutMs = action === "read_page" ? 20000 : 8000;
  console.log(`[AI] executeInPage start: ${action}`);
  const t0 = Date.now();

  // 先尝试直接发消息（manifest 已自动注入 content.js 的情况）
  const direct = await sendMessageWithTimeout(tabId, { action, params }, timeoutMs);
  console.log(`[AI] executeInPage first attempt: ${Date.now() - t0}ms, got=${direct !== null}`);

  if (direct !== null) return direct;

  // 无响应时手动注入一次（页面在扩展安装前就打开了）
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
  } catch (e) {
    return { success: false, error: `无法注入脚本: ${e.message}` };
  }

  // 注入后重试，超时缩短为 5s（第一次已经等过了，说明页面可能真的卡死）
  const retried = await sendMessageWithTimeout(tabId, { action, params }, 5000);
  console.log(`[AI] executeInPage retry: ${Date.now() - t0}ms total, got=${retried !== null}`);
  return retried ?? { success: false, error: "content script 无响应（超时）" };
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
function sendProgress(type, content) {
  chrome.runtime.sendMessage({ type, content }).catch(() => {});
}

/**
 * 执行工具调用
 */
async function executeTool(toolName, params, tabId) {
  switch (toolName) {
    case "read_page": {
      const result = await executeInPage(tabId, "read_page", {});
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

    case "click_element": {
      const result = await executeInPage(tabId, "click_element", { id: params.id });
      await sleep(800); // 等待点击后的页面响应
      return JSON.stringify(result);
    }

    case "type_text": {
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

    default:
      return JSON.stringify({ success: false, error: `未知工具: ${toolName}` });
  }
}

// ── Agent Loop 核心 ───────────────────────────────────────────

// 全局停止标志（用户点击停止按钮时设为 true）
let stopRequested = false;

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

async function runAgentLoop(userMessage, tabId, apiKey, baseUrl, maxTurnsConfig, language = "zh-CN") {
  stopRequested = false;
  const s = bgT(language);

  const systemPrompt = `你是一个能操控浏览器的 AI 助手，可以帮用户完成任何网页操作。

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

【输入后必须先观察，再决定下一步】：
- 每次 type_text 之后，必须先 read_page 观察页面发生了什么变化，再决定下一步操作
- 不要在没有观察的情况下假设"输完就按 Enter"或"输完就点按钮"
- 根据 read_page 结果决定：
  · 新出现了下拉/候选列表 → 从中 click_element 选择正确选项（不要按 Enter）
  · 页面没变化且有搜索/查询按钮 → click_element 点那个按钮
  · 还有其他必填字段未填 → 继续填写下一个字段
  · 所有字段已填完且有提交按钮 → click_element 点击提交
  · 只有一个搜索框且焦点在其中 → press_key("Enter") 提交
- 永远不要跳过观察步骤直接假设行为

探索规则：
- read_page 返回的 interactive_elements 包含页面上所有可点击的元素，根据 text 内容判断用途
- 导航菜单通常排在 interactive_elements 列表靠前位置
- 如果点击某元素后页面内容更新但 URL 没变（单页应用），等待 1 秒再 read_page
- 如果需要找某类信息，先通读 interactive_elements 列表，选择最相关的入口点击

【导航与重复操作规则】：
- 如果目标 URL 已知或可以直接推断（例如"打开 GitHub 的 sazima 用户首页"→ https://github.com/sazima），直接 navigate 到该 URL，不要先去网站首页再用搜索框搜索
- 每次 navigate 后必须 read_page 确认页面内容，再决定下一步，绝对不能连续 navigate 两次
- 已经在目标网站/页面上时（read_page 的 url 包含目标域名），直接操作页面上的表单/按钮，不要再 navigate 或 new_tab 到同一 URL
- 搜索/预订表单（机票/酒店/火车票等）：页面上已有出发地、目的地、日期输入框时，直接点击对应字段填写，不要跳转到其他页面
- get_current_url 只用于不确定当前 URL 时，不要在刚 navigate 后立即调用（刚 navigate 后 URL 已知）

【语言规则】：
${s.reply_lang}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const apiBase = (baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "");
  const maxTurns = Math.max(1, Math.min(parseInt(maxTurnsConfig) ?? 60, 100));
  console.log(`[AI助手] baseUrl=${apiBase} maxTurns=${maxTurns}`);

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
      sendProgress("reply", s.stopped);
      return;
    }

    turn++;

    // 调用 DeepSeek API
    let response;
    try {
      const resp = await fetch(`${apiBase}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: 2000,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`API 错误 ${resp.status}: ${err}`);
      }

      response = await resp.json();
    } catch (e) {
      sendProgress("error", s.api_error(e.message));
      return;
    }

    // 再次检查停止（API 调用耗时，期间用户可能点了停止）
    if (stopRequested) {
      sendProgress("reply", s.stopped);
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
          sendProgress("reply", s.stopped);
          return;
        }

        const name = toolCall.function.name;
        const params = JSON.parse(toolCall.function.arguments || "{}");

        // 向 sidepanel 推送进度
        const stepLabel = formatStepLabel(name, params, s);
        sendProgress("step", stepLabel);

        // 执行工具
        let result;
        try {
          result = await executeTool(name, params, tabId);
        } catch (e) {
          result = JSON.stringify({ success: false, error: e.message });
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
              sendProgress("reply", s.nav_loop(destUrl));
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
              const currentTab = await chrome.tabs.get(tabId);
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
                const finalResp = await fetch(`${apiBase}/chat/completions`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                  body: JSON.stringify({ model: "deepseek-chat", messages, max_tokens: 300 }),
                });
                if (finalResp.ok) {
                  const finalData = await finalResp.json();
                  const finalMsg = finalData.choices[0]?.message?.content;
                  sendProgress("reply", finalMsg || s.login_required);
                } else {
                  sendProgress("reply", s.login_required);
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
                sendProgress("reply", s.same_page(parsed.url));
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

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      continue;
    }

    // ── 最终回复 ──
    if (stopReason === "stop") {
      sendProgress("reply", msg.content || s.task_done);
      return;
    }

    // 异常情况
    sendProgress("reply", s.done_turns(turn));
    return;
  }

  sendProgress("reply", s.max_turns(maxTurns));
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
    type_text: s.step_type(params.text),
    press_key: s.step_key(params.key),
    scroll_page: s.step_scroll(params.direction),
    wait: s.step_wait(params.seconds),
    get_current_url: s.step_url,
    fill_form: s.step_fill(params.fields?.length ?? 0),
  };
  return labels[toolName] || s.step_unknown(toolName);
}

// ── 消息监听器 ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "run_agent") {
    const { userMessage, tabId, apiKey, baseUrl, maxTurns, language } = message;
    runAgentLoop(userMessage, tabId, apiKey, baseUrl, maxTurns, language).catch((e) => {
      sendProgress("error", bgT(language).agent_error(e.message));
    });
    sendResponse({ started: true });
    return true;
  }

  if (message.type === "stop_agent") {
    stopRequested = true;
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
