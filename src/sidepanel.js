/**
 * Side Panel UI - 聊天界面逻辑
 *
 * 职责：
 * 1. 显示聊天消息（用户 + AI 回复）
 * 2. 实时显示 AI 执行步骤（read_page / click / type 等）
 * 3. 发送用户消息给 background.js
 * 4. 管理 API Key 设置（存储在 chrome.storage.local）
 */

// ── DOM 引用 ────────────────────────────────────────────
const chatContainer = document.getElementById("chatContainer");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKey");
const baseUrlInput = document.getElementById("baseUrlInput");
const maxTurnsInput = document.getElementById("maxTurnsInput");
const inputHint = document.getElementById("inputHint");
const languageSelect = document.getElementById("languageSelect");

// ── 状态 ────────────────────────────────────────────────
let isRunning = false;
let currentStepsContainer = null; // 当前 AI 轮次的步骤容器
let currentThinking = null;       // 思考中动画元素

// ── 初始化 ──────────────────────────────────────────────

async function init() {
  // 先初始化语言（applyTranslations 需在 DOM 填充 storage 值之前运行）
  await initLang();

  const stored = await chrome.storage.local.get(["deepseekApiKey", "baseUrl", "maxTurns"]);

  if (stored.deepseekApiKey) {
    apiKeyInput.value = stored.deepseekApiKey;
  } else {
    showNoApiKeyHint();
  }
  if (stored.baseUrl) baseUrlInput.value = stored.baseUrl;
  if (stored.maxTurns) maxTurnsInput.value = stored.maxTurns;

  // 同步语言选择器显示当前语言
  languageSelect.value = currentLang;

  // 点击示例消息
  document.querySelectorAll(".welcome-examples li").forEach((li) => {
    li.addEventListener("click", () => {
      messageInput.value = li.textContent.replace(/^→ /, "").trim();
      messageInput.focus();
    });
  });
}

// ── 设置面板 ────────────────────────────────────────────

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("open");
});

saveApiKeyBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showToast(t("apikey.empty"));
    return;
  }
  const baseUrl = baseUrlInput.value.trim();
  const maxTurns = parseInt(maxTurnsInput.value) || 60;
  const language = languageSelect.value;

  await chrome.storage.local.set({
    deepseekApiKey: key,
    baseUrl: baseUrl || "",
    maxTurns,
    language,
  });

  // 如果语言变了，重新应用翻译
  if (language !== currentLang) {
    currentLang = language;
    applyTranslations();
    languageSelect.value = currentLang;
    // 同步更新动态文本
    if (!isRunning) {
      inputHint.textContent = t("input.hint");
    }
  }

  showToast(t("save.success"));
  settingsPanel.classList.remove("open");
  document.querySelector(".no-apikey-hint")?.remove();
});

function showNoApiKeyHint() {
  const hint = document.createElement("div");
  hint.className = "no-apikey-hint";
  hint.innerHTML = `${t("no.apikey.hint")} <button id="openSettingsHint">${t("no.apikey.btn")}</button>`;
  chatContainer.before(hint);
  hint.querySelector("#openSettingsHint").addEventListener("click", () => {
    settingsPanel.classList.add("open");
    apiKeyInput.focus();
  });
}

// ── 输入框自动扩展 ──────────────────────────────────────

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

// ── 停止按钮 ────────────────────────────────────────────
stopBtn.addEventListener("click", async () => {
  chrome.runtime.sendMessage({ type: "stop_agent" });
  stopBtn.disabled = true;
  stopBtn.textContent = "...";
  // setRunning(false) 会在收到 reply 消息时触发
});

// ── 发送消息 ────────────────────────────────────────────

async function sendMessage() {
  if (isRunning) return;

  const text = messageInput.value.trim();
  if (!text) return;

  const stored = await chrome.storage.local.get(["deepseekApiKey", "baseUrl", "maxTurns"]);
  if (!stored.deepseekApiKey) {
    settingsPanel.classList.add("open");
    apiKeyInput.focus();
    showToast(t("no.apikey.hint"));
    return;
  }

  // 清空输入框
  messageInput.value = "";
  messageInput.style.height = "auto";

  // 隐藏欢迎消息
  document.querySelector(".welcome")?.remove();

  // 显示用户消息
  appendUserMessage(text);

  // 开始 loading 状态
  setRunning(true);

  // 显示思考中动画
  currentThinking = appendThinking();

  // 创建步骤容器（实时追加步骤）
  currentStepsContainer = createStepsContainer();
  currentThinkingBlock = null;

  // 获取当前标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    removeThinking();
    appendError(t("error.no.tab"));
    setRunning(false);
    return;
  }

  // 发送给 background.js 启动 Agent Loop
  chrome.runtime.sendMessage({
    type: "run_agent",
    userMessage: text,
    tabId: tab.id,
    apiKey: stored.deepseekApiKey,
    baseUrl: stored.baseUrl || "",
    maxTurns: stored.maxTurns ?? 60,
    language: currentLang,
  });
}

// ── 接收 background.js 进度消息 ─────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  const { type, content } = message;

  switch (type) {
    case "step": {
      // AI 正在执行某个操作（read_page / click / navigate 等）
      removeThinking();
      appendStep(content, true);
      scrollToBottom();
      break;
    }

    case "thinking": {
      // LLM 的文字分析（工具调用前的推理过程）
      appendThinkingContent(content);
      scrollToBottom();
      break;
    }

    case "warn": {
      // 自动检测警告（登录页、卡死等）
      removeThinking();
      appendWarn(content);
      scrollToBottom();
      break;
    }

    case "reply": {
      // AI 最终回复
      removeThinking();
      finalizeSteps();
      appendAssistantMessage(content);
      setRunning(false);
      currentStepsContainer = null;
      scrollToBottom();
      break;
    }

    case "error": {
      removeThinking();
      finalizeSteps();
      appendError(content);
      setRunning(false);
      currentStepsContainer = null;
      scrollToBottom();
      break;
    }
  }
});

// ── UI 组件构建函数 ──────────────────────────────────────

function appendUserMessage(text) {
  const div = document.createElement("div");
  div.className = "message user";
  div.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
  chatContainer.appendChild(div);
  scrollToBottom();
}

function appendAssistantMessage(text) {
  const div = document.createElement("div");
  div.className = "message assistant";
  div.innerHTML = `<div class="message-bubble markdown">${renderMarkdown(text)}</div>`;
  chatContainer.appendChild(div);
}

/**
 * 轻量 Markdown 渲染器（不依赖外部库）
 * 支持：代码块、行内代码、标题、加粗、斜体、列表、链接、水平线、段落
 */
function renderMarkdown(text) {
  // 先处理代码块（防止内部内容被其他规则误处理）
  const codeBlocks = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // 按段落拆分（双换行）
  const paragraphs = text.split(/\n{2,}/);

  const rendered = paragraphs.map((block) => {
    // 还原代码块占位符
    if (/^\x00CODE\d+\x00$/.test(block.trim())) {
      return codeBlocks[parseInt(block.match(/\d+/)[0])];
    }

    // 水平线
    if (/^[-*_]{3,}$/.test(block.trim())) return "<hr>";

    // 标题
    if (/^#{1,4} /.test(block)) {
      return block.replace(/^(#{1,4}) (.+)$/m, (_, hashes, content) => {
        const level = Math.min(hashes.length + 2, 6); // h3–h6，适合侧边栏
        return `<h${level}>${inlineMarkdown(content)}</h${level}>`;
      });
    }

    // 无序列表
    if (/^[-*+] /m.test(block)) {
      const items = block.split("\n").filter(Boolean).map((line) =>
        line.replace(/^[-*+] (.+)/, (_, content) => `<li>${inlineMarkdown(content)}</li>`)
      );
      return `<ul>${items.join("")}</ul>`;
    }

    // 有序列表
    if (/^\d+\. /m.test(block)) {
      const items = block.split("\n").filter(Boolean).map((line) =>
        line.replace(/^\d+\. (.+)/, (_, content) => `<li>${inlineMarkdown(content)}</li>`)
      );
      return `<ol>${items.join("")}</ol>`;
    }

    // 普通段落（保留单换行为 <br>）
    const lines = block.split("\n").map(inlineMarkdown).join("<br>");
    return `<p>${lines}</p>`;
  });

  // 还原可能残留的代码块占位符
  return rendered.join("").replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);
}

/** 处理行内元素：代码、加粗、斜体、链接 */
function inlineMarkdown(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")  // 先转义 HTML
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function appendThinking() {
  const div = document.createElement("div");
  div.className = "message assistant";
  div.innerHTML = `
    <div class="thinking">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span>${t("thinking.label")}</span>
    </div>
  `;
  chatContainer.appendChild(div);
  scrollToBottom();
  return div;
}

function removeThinking() {
  if (currentThinking) {
    currentThinking.remove();
    currentThinking = null;
  }
}

function createStepsContainer() {
  const div = document.createElement("div");
  div.className = "steps-container";
  chatContainer.appendChild(div);
  return div;
}

function appendStep(text, active = false) {
  if (!currentStepsContainer) return;

  // 把之前活跃的步骤标记为完成
  const prev = currentStepsContainer.querySelector(".step-item.active");
  if (prev) {
    prev.classList.remove("active");
    const spinner = prev.querySelector(".step-spinner");
    if (spinner) {
      spinner.outerHTML = `<span class="step-done">✓</span>`;
    }
  }

  const item = document.createElement("div");
  item.className = `step-item${active ? " active" : ""}`;
  item.innerHTML = `
    ${active ? '<div class="step-spinner"></div>' : '<span class="step-done">✓</span>'}
    <span>${escapeHtml(text)}</span>
  `;
  currentStepsContainer.appendChild(item);
}

function finalizeSteps() {
  if (!currentStepsContainer) return;
  // 把最后活跃的步骤也标记完成
  const active = currentStepsContainer.querySelector(".step-item.active");
  if (active) {
    active.classList.remove("active");
    const spinner = active.querySelector(".step-spinner");
    if (spinner) {
      spinner.outerHTML = `<span class="step-done">✓</span>`;
    }
  }
}

function appendError(text) {
  const div = document.createElement("div");
  div.className = "message assistant";
  div.innerHTML = `
    <div class="error-message">
      <span>⚠️</span>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
  chatContainer.appendChild(div);
}

function appendWarn(text) {
  if (!currentStepsContainer) return;
  const item = document.createElement("div");
  item.className = "warn-message";
  item.textContent = text;
  currentStepsContainer.appendChild(item);
}

// 当前 thinking 块（可折叠的 LLM 推理内容）
let currentThinkingBlock = null;

function appendThinkingContent(text) {
  if (!currentStepsContainer) return;

  // 每轮工具调用只保留最新的 thinking，更新已有的块而非重复追加
  if (currentThinkingBlock) {
    currentThinkingBlock.querySelector(".thinking-body").textContent = text;
    return;
  }

  const block = document.createElement("div");
  block.className = "thinking-block";
  block.innerHTML = `
    <div class="thinking-header">
      <span class="thinking-icon">💭</span>
      <span>${t("thinking.label")}</span>
      <span class="thinking-toggle">▶</span>
    </div>
    <div class="thinking-body" style="display:none;">${escapeHtml(text)}</div>
  `;
  block.querySelector(".thinking-header").addEventListener("click", () => {
    const body = block.querySelector(".thinking-body");
    const toggle = block.querySelector(".thinking-toggle");
    const expanded = body.style.display !== "none";
    body.style.display = expanded ? "none" : "block";
    toggle.textContent = expanded ? "▶" : "▼";
  });

  currentStepsContainer.appendChild(block);
  currentThinkingBlock = block;
}

// ── 状态管理 ────────────────────────────────────────────

function setRunning(running) {
  isRunning = running;
  sendBtn.disabled = running;
  messageInput.disabled = running;

  if (running) {
    sendBtn.style.display = "none";
    stopBtn.style.display = "flex";
    stopBtn.disabled = false;
    stopBtn.textContent = "■";
    inputHint.textContent = t("input.running");
  } else {
    sendBtn.style.display = "flex";
    stopBtn.style.display = "none";
    sendBtn.innerHTML = `<span>➤</span>`;
    inputHint.textContent = t("input.hint");
  }
}

// ── 工具函数 ────────────────────────────────────────────

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    background: #27272a; color: #e8e8e8; padding: 8px 16px;
    border-radius: 20px; font-size: 12px; z-index: 999;
    border: 1px solid #3f3f46; animation: fadeIn 0.2s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ── 启动 ──────────────────────────────────────────────
init();
