/**
 * Content Script - 注入到每个页面，负责实际的 DOM 操作
 *
 * 工作方式：
 * 1. 监听来自 background.js 的消息
 * 2. 执行 DOM 操作（点击、输入、读取、滚动）
 * 3. 返回操作结果
 *
 * 关键设计：用编号而非 CSS Selector 定位元素，更可靠
 */

// 防止 content script 被重复注入时报"already declared"错误
// manifest 自动注入 + background.js 手动注入会各执行一次
if (window.__aiAssistantLoaded) {
  // 已经初始化过，跳过整个文件
  throw new Error("__aiAssistantLoaded: skip");
}
window.__aiAssistantLoaded = true;

// 存储元素编号 → DOM 元素 的映射（每次 read_page 后重建）
const elementMap = new Map();

// ── 覆盖层（Overlay）──────────────────────────────────────────

const OVERLAY_ID = "__ai_overlay__";

/**
 * 清除页面上的所有标注覆盖层
 */
function clearOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

/**
 * 在页面上渲染所有可交互元素的编号标注框
 * 每次 read_page 后调用，让用户直观看到 AI 能操作哪些元素
 */
function renderOverlay(elementEntries) {
  clearOverlay();

  const container = document.createElement("div");
  container.id = OVERLAY_ID;
  // 覆盖层本身不拦截鼠标事件，用户仍可正常操作页面
  container.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483646;";
  document.documentElement.appendChild(container);

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  elementEntries.forEach(({ el, id, info }) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = rect.left + scrollX;
    const y = rect.top + scrollY;
    const w = rect.width;
    const h = rect.height;

    // 元素高亮框
    const box = document.createElement("div");
    box.style.cssText = `
      position:absolute;
      left:${x}px; top:${y}px;
      width:${w}px; height:${h}px;
      border:1.5px solid rgba(99,102,241,0.7);
      background:rgba(99,102,241,0.04);
      box-sizing:border-box;
      pointer-events:none;
    `;
    container.appendChild(box);

    // 编号徽章
    const badge = document.createElement("div");
    // 徽章贴在元素左上角，若元素在顶部附近则显示在元素内部
    const badgeTop = y > 18 ? y - 18 : y + 1;
    badge.style.cssText = `
      position:absolute;
      left:${x}px; top:${badgeTop}px;
      background:#6366f1;
      color:#fff;
      font:bold 10px/16px monospace;
      padding:0 3px;
      border-radius:3px;
      white-space:nowrap;
      pointer-events:none;
      opacity:0.9;
    `;
    // 显示编号 + 元素文字摘要（最多8个字）
    const label = info.text ? info.text.slice(0, 8) : info.tag;
    badge.textContent = `#${id} ${label}`;
    container.appendChild(badge);
  });
}

/**
 * 在被点击/操作的元素上显示"已操作"动画
 */
function flashElement(el, color = "#f59e0b") {
  const prev = el.style.outline;
  const prevBg = el.style.backgroundColor;
  el.style.outline = `3px solid ${color}`;
  el.style.backgroundColor = `${color}22`;
  setTimeout(() => {
    el.style.outline = prev;
    el.style.backgroundColor = prevBg;
  }, 1800);
}

// ── 工具函数 ──────────────────────────────────────────────────

/**
 * 判断元素是否可见
 */
function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

/**
 * 获取元素的描述文字
 */
function getElementText(el) {
  return (
    el.innerText?.trim() ||
    el.value?.trim() ||
    el.placeholder?.trim() ||
    el.getAttribute("aria-label")?.trim() ||
    el.getAttribute("title")?.trim() ||
    el.getAttribute("name")?.trim() ||
    el.getAttribute("alt")?.trim() ||
    el.getAttribute("data-testid")?.trim() ||
    ""
  ).slice(0, 120);
}

/**
 * 获取元素的字段标签（用于告诉 LLM 这个输入框/按钮代表什么）
 * 查找顺序：aria-label → <label for="id"> → 父容器里的 label → placeholder → 前置兄弟文本
 */
function getFieldLabel(el) {
  // 1. aria-label / aria-labelledby
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim().slice(0, 50);

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.innerText?.trim().slice(0, 50);
  }

  // 2. <label for="id">
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.innerText?.trim().slice(0, 50);
  }

  // 3. 包裹它的 <label>
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll("input,select,textarea,button").forEach((c) => c.remove());
    const t = clone.innerText?.trim();
    if (t) return t.slice(0, 50);
  }

  // 4. placeholder
  if (el.placeholder) return el.placeholder.trim().slice(0, 50);

  // 5. 前一个兄弟节点的文本（常见于"出发地 [input]"这种布局）
  let prev = el.previousElementSibling;
  while (prev) {
    const t = prev.innerText?.trim();
    if (t && t.length < 20) return t.slice(0, 50);
    prev = prev.previousElementSibling;
  }

  return "";
}

/**
 * 读取页面内容，返回结构化信息
 * AI 先调用这个，再决定点哪里
 */
/**
 * 检测页面上是否有弹窗/遮罩层覆盖，返回弹窗信息
 * 返回 null 表示无弹窗，否则返回弹窗元素列表（按钮等）
 */
function detectPopupsWithCounter(startId) {
  const popups = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // 只检测明确的弹窗角色或常见弹窗 class/id
  // 不做"备用全局扫描"——那会把导航栏、header 等误判为弹窗
  const candidates = document.querySelectorAll(
    '[role="dialog"], [role="alertdialog"], ' +
    '[class*="cookie"], [class*="consent"], [class*="gdpr"], ' +
    '[id*="cookie"], [id*="consent"], [id*="gdpr"]'
  );

  candidates.forEach((el) => {
    if (!isVisible(el)) return;
    const style = window.getComputedStyle(el);
    const pos = style.position;
    if (pos !== "fixed" && pos !== "absolute") return;

    const rect = el.getBoundingClientRect();
    // 宽度占视口 30%~95%，高度 > 100px，且不贴顶（top > 20px 或者高度不超 80% 说明不是导航栏）
    const isNotNavbar = rect.top > 20 || rect.height < vh * 0.8;
    if (rect.width > vw * 0.3 && rect.height > 100 && isNotNavbar) {
      popups.push(el);
    }
  });

  if (popups.length === 0) return null;

  // 提取弹窗中的可点击元素（关闭/接受按钮等）
  const popupButtons = [];
  let btnCounter = startId;
  popups.forEach((popup) => {
    popup.querySelectorAll('button, [role="button"], a').forEach((btn) => {
      if (!isVisible(btn)) return;
      const text = getElementText(btn);
      if (!text) return;
      elementMap.set(btnCounter, btn);
      btn.setAttribute("data-ai-id", btnCounter);
      popupButtons.push({ id: btnCounter, text });
      btnCounter++;
    });
  });

  return {
    detected: true,
    count: popups.length,
    buttons: popupButtons.slice(0, 10),
  };
}

function readPage() {
  const t0 = performance.now();
  const perf = (label) => {
    console.log(`[AI-readPage] ${label}: ${(performance.now() - t0).toFixed(1)}ms`);
  };

  elementMap.clear();
  let counter = 1;

  // 收集所有可交互元素
  const selectors = [
    "a[href]",
    "button",
    'input:not([type="hidden"])',
    "textarea",
    "select",
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="option"]',
    '[role="textbox"]',
    '[role="combobox"]',
    '[contenteditable="true"]',
    "[onclick]",
  ].join(",");

  // 分两类收集：语义导航区元素 优先，其余普通元素次之
  const navElements = [];
  const otherElements = [];

  // 原始元素超过 600 时提前截断，避免在 YouTube 等重页面上遍历数千元素卡死
  const RAW_CAP = 600;
  const rawList = Array.from(document.querySelectorAll(selectors));
  perf(`querySelectorAll done (${rawList.length} raw elements)`);
  const capped = rawList.length > RAW_CAP ? rawList.slice(0, RAW_CAP) : rawList;

  // 只对表单控件调用 getFieldLabel（含 cloneNode，开销大）
  const FORM_TAGS = new Set(["input", "textarea", "select"]);

  for (const el of capped) {
    if (!isVisible(el)) continue;

    const text = getElementText(el);
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") || "";
    const href = el.href || "";

    // label 只在表单控件或 contenteditable 上提取，其他跳过
    let label = "";
    if (FORM_TAGS.has(tag) || el.isContentEditable) {
      try { label = getFieldLabel(el); } catch { /* 忽略 */ }
    }

    const info = {
      tag, type,
      text: text || `(${tag})`,
      href: href ? href.slice(0, 80) : "",
      ...(label ? { label } : {}),
    };

    const inNav = el.closest('nav, [role="navigation"], header');
    if (inNav) {
      navElements.push({ el, info });
    } else {
      otherElements.push({ el, info });
    }
  }

  perf(`element loop done (nav=${navElements.length} other=${otherElements.length})`);

  // 先放导航区元素，再放其他元素，确保导航菜单不会被截断
  const allEntries = []; // { el, id, info }
  const elements = [];
  for (const { el, info } of [...navElements, ...otherElements]) {
    info.id = counter;
    elementMap.set(counter, el);
    el.setAttribute("data-ai-id", counter);
    elements.push(info);
    allEntries.push({ el, id: counter, info });
    counter++;
  }

  // 渲染覆盖层（异步，不阻塞 readPage 返回）
  setTimeout(() => {
    try { renderOverlay(allEntries.slice(0, 120)); } catch { /* 忽略渲染错误 */ }
  }, 0);

  perf("elementMap built");

  // 提取页面主要文本：用 textContent 避免触发整页 layout（innerText 会）
  const bodyText = (document.body.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
  perf("bodyText done");

  perf(`TOTAL (${elements.length} elements → returning ${Math.min(elements.length, 120)})`);
  return {
    url: window.location.href,
    title: document.title,
    body_text: bodyText,
    interactive_elements: elements.slice(0, 120),
    total_elements: elements.length,
  };
}

/**
 * 根据编号点击元素
 */
function clickElement(id) {
  const el = elementMap.get(id);
  if (!el) return { success: false, error: `元素 #${id} 不存在，请先调用 read_page` };

  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
    el.click();

    // 橙色闪烁：区别于 read_page 时的蓝色标注，让用户清楚看到点了哪里
    flashElement(el, "#f59e0b");

    return { success: true, message: `点击了: ${getElementText(el) || el.tagName}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 根据编号在输入框中输入文字
 */
function typeText(id, text, clearFirst = true) {
  const el = elementMap.get(id);
  if (!el) return { success: false, error: `元素 #${id} 不存在，请先调用 read_page` };

  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();

    const isContentEditable = el.isContentEditable;

    if (clearFirst) {
      if (isContentEditable) {
        el.textContent = "";
      } else {
        el.value = "";
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (isContentEditable) {
      // contenteditable（YouTube 评论框、Notion、富文本编辑器等）
      // 策略：先 focus 激活，再逐字符 dispatch KeyboardEvent + execCommand insertText
      // 参考 Playwright 的 type(text, { delay }) 实现，兼容监听 keydown/keypress/input 的框架
      el.focus();
      if (clearFirst) {
        document.execCommand("selectAll", false, null);
      }
      // 逐字符模拟，让富文本框的事件监听器感知到真实输入
      for (const char of text) {
        el.dispatchEvent(new KeyboardEvent("keydown",  { key: char, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
        document.execCommand("insertText", false, char);
        el.dispatchEvent(new KeyboardEvent("keyup",    { key: char, bubbles: true }));
      }
    } else {
      // 普通 input / textarea
      el.value = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

    // 绿色闪烁：表示正在输入
    flashElement(el, "#10b981");

    return { success: true, message: `在输入框输入了: "${text}"` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 模拟按下 Enter 或其他键
 */
function pressKey(key) {
  const focused = document.activeElement;
  if (!focused) return { success: false, error: "没有聚焦的元素" };

  const eventInit = { key, bubbles: true, cancelable: true };
  focused.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  focused.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  // 如果是 Enter，也尝试提交表单
  if (key === "Enter") {
    const form = focused.closest("form");
    if (form) form.submit();
  }

  return { success: true, message: `按下了 ${key}` };
}

/**
 * 滚动页面
 */
function scrollPage(direction, pixels = 500) {
  const amount = direction === "down" ? pixels : -pixels;
  window.scrollBy({ top: amount, behavior: "smooth" });
  return {
    success: true,
    message: `向${direction === "down" ? "下" : "上"}滚动了 ${pixels}px`,
  };
}

/**
 * 批量填写表单字段，一次完成所有输入，减少 LLM 调用次数
 */
function fillForm(fields) {
  const results = [];
  let successCount = 0;

  for (const { id, value } of fields) {
    const el = elementMap.get(id);
    if (!el) {
      results.push({ id, success: false, error: `元素 #${id} 不存在` });
      continue;
    }
    try {
      el.scrollIntoView({ behavior: "instant", block: "center" });
      el.focus();
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute("type") || "").toLowerCase();

      if (tag === "select") {
        // <select> 下拉：用 value 匹配，找不到则按文本匹配
        const strVal = String(value);
        const opt = Array.from(el.options).find(
          (o) => o.value === strVal || o.text === strVal
        );
        if (opt) el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (type === "checkbox" || type === "radio") {
        // checkbox/radio：按布尔值设置 checked 状态
        const checked = value === true || value === 1 || value === "true" || value === "1";
        if (el.checked !== checked) {
          el.checked = checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else if (el.isContentEditable) {
        // contenteditable（富文本框）：逐字符模拟输入
        document.execCommand("selectAll", false, null);
        for (const char of String(value)) {
          el.dispatchEvent(new KeyboardEvent("keydown",  { key: char, bubbles: true }));
          document.execCommand("insertText", false, char);
          el.dispatchEvent(new KeyboardEvent("keyup",    { key: char, bubbles: true }));
        }
      } else {
        // 普通 input / textarea
        el.value = "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.value = String(value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
      }

      flashElement(el, "#10b981");
      results.push({ id, success: true, value });
      successCount++;
    } catch (e) {
      results.push({ id, success: false, error: e.message });
    }
  }

  return {
    success: true,
    filled: successCount,
    total: fields.length,
    results,
    message: `批量填写完成：${successCount}/${fields.length} 个字段`,
  };
}

/**
 * 通过文字模糊匹配元素（read_page 之后使用）
 */
function findByText(text) {
  const lowerText = text.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  elementMap.forEach((el, id) => {
    const elText = getElementText(el).toLowerCase();
    if (elText.includes(lowerText) || lowerText.includes(elText)) {
      const score = elText === lowerText ? 2 : 1;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = id;
      }
    }
  });

  return bestMatch
    ? { success: true, element_id: bestMatch }
    : { success: false, error: `未找到包含"${text}"的元素` };
}

// 页面卸载时清除覆盖层（导航跳转后新页面不会保留旧标注）
window.addEventListener("pagehide", clearOverlay);

// ── 消息监听器 ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { action, params } = message;

  let result;
  switch (action) {
    case "read_page":
      result = readPage();
      break;
    case "click_element":
      result = clickElement(params.id);
      break;
    case "type_text":
      result = typeText(params.id, params.text, params.clear_first !== false);
      break;
    case "press_key":
      result = pressKey(params.key);
      break;
    case "scroll_page":
      result = scrollPage(params.direction, params.pixels);
      break;
    case "fill_form":
      result = fillForm(params.fields || []);
      break;
    case "find_by_text":
      result = findByText(params.text);
      break;
    default:
      result = { success: false, error: `未知 action: ${action}` };
  }

  sendResponse(result);
  return true; // 保持消息通道开放（异步）
});
