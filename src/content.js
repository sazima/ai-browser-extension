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

// hover_element 强制显示的元素列表（下次 read_page 或 click 时恢复原样）
let hoverRevealedEls = [];

function restoreHoverRevealed() {
  for (const { el, orig } of hoverRevealedEls) {
    el.style.display       = orig.display;
    el.style.opacity       = orig.opacity;
    el.style.visibility    = orig.visibility;
    el.style.pointerEvents = orig.pointerEvents;
    if (orig.ariaLabel === null) el.removeAttribute("aria-label");
    else if (orig.ariaLabel !== undefined) el.setAttribute("aria-label", orig.ariaLabel);
  }
  hoverRevealedEls = [];
}

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
 * 优先用 checkVisibility()（Chrome 105+），避免 getComputedStyle + getBoundingClientRect
 * 批量调用时触发的强制 layout reflow 是 readPage 卡顿的主要原因
 */
function isVisible(el) {
  if (!el) return false;
  // checkVisibility 是浏览器原生实现，不触发 JS 侧 reflow，比手动检查快 10x 以上
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  }
  // 降级：offsetParent 为 null 表示 display:none（不含 fixed 元素）
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  return true;
}

/**
 * 获取元素的描述文字
 */
function getElementText(el) {
  return (
    el.innerText?.trim() ||
    (typeof el.value === "string" ? el.value.trim() : "") ||
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

  // 若上次 hover_element 强制显示了某些元素，read_page 时保持显示状态，
  // 使 AI 可以在列表中看到并点击它们（点击后 clickElement 会自动恢复）
  // 注意：不在此处调用 restoreHoverRevealed()，让已显示的按钮继续可见

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

  // ── 优先扫描富文本编辑器（TinyMCE iframe + ProseMirror/Quill contenteditable）──
  // 这类编辑器在复杂表单页面中往往排在 120 个名额之后被截断，提前加入 otherElements 保证可见
  function getRichEditorLabel(el) {
    const parent = el.closest('[class*="field"], [class*="editor"], [class*="form"], .control, .field-group, td, li, .description');
    if (!parent) return "";
    const lbl = parent.querySelector('label, .label, legend, th');
    return lbl?.innerText?.trim() || "";
  }

  // 1. TinyMCE iframe
  try {
    const iframeSelectors = [
      'iframe[id$="_ifr"]', 'iframe.mce-content-iframe',
      'iframe[title*="Rich"]', 'iframe[title*="Editor"]', 'iframe[title*="editor"]',
    ].join(",");
    for (const iframe of document.querySelectorAll(iframeSelectors)) {
      try {
        const iframeBody = iframe.contentDocument?.body;
        if (!iframeBody || !iframeBody.isContentEditable) continue;
        const lbl = getRichEditorLabel(iframe);
        otherElements.push({ el: iframe, info: {
          tag: "iframe", type: "richeditor",
          text: lbl || "(rich text editor)", href: "",
          ...(lbl ? { label: lbl } : {}),
        }});
      } catch { /* 跨域 iframe 跳过 */ }
    }
  } catch { /* 忽略 */ }

  // 2. ProseMirror / Quill / Atlassian Editor（contenteditable div）
  // 普通 [contenteditable="true"] 已在主选择器里，但会被 600 cap 或 120 返回 cap 截断
  // 这里单独扫描「外层编辑区容器」并优先加入列表
  try {
    const ceSelectors = [
      '.ProseMirror[contenteditable]',
      '.ql-editor[contenteditable]',
      '.ak-editor-content-area[contenteditable]',
      '[data-editor][contenteditable]',
      '[class*="editor"][contenteditable="true"]',
      '[class*="Editor"][contenteditable="true"]',
      '[role="textbox"][aria-multiline="true"]',
    ].join(",");
    for (const el of document.querySelectorAll(ceSelectors)) {
      if (!el.isContentEditable) continue;
      if (!isVisible(el)) continue;
      const lbl = getRichEditorLabel(el);
      otherElements.push({ el, info: {
        tag: el.tagName.toLowerCase(), type: "richeditor",
        text: lbl || el.innerText?.trim().slice(0, 40) || "(rich text editor)",
        href: "",
        ...(lbl ? { label: lbl } : {}),
      }});
    }
  } catch { /* 忽略 */ }

  perf(`richEditor pre-scan: ${otherElements.length}`);

  // 通用模态框检测：方案一（z-index最大值）+ 方案二（body overflow:hidden）
  // 不依赖任何框架 class 名，适配 JIRA、Ant Design、Element UI、自定义弹窗等
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  function detectActiveModal() {
    // 方案二：body overflow:hidden 是"有模态框打开"的强信号
    const bodyOverflow = window.getComputedStyle(document.body).overflow;
    const htmlOverflow = window.getComputedStyle(document.documentElement).overflow;
    const hasModalSignal = bodyOverflow === "hidden" || htmlOverflow === "hidden";

    // 方案一：找 z-index 最高的、足够大的、包含交互元素的定位元素
    let best = null;
    let bestZ = 0;
    // 只扫描可能是弹窗容器的元素，避免遍历整个 DOM
    const candidates = document.querySelectorAll(
      'body > *, body > * > *, [style*="z-index"], [class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"], [class*="layer"], [role="dialog"]'
    );
    for (const el of candidates) {
      const style = window.getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "absolute") continue;
      if (style.display === "none" || style.visibility === "hidden") continue;
      const z = parseInt(style.zIndex) || 0;
      if (z <= bestZ) continue;
      const r = el.getBoundingClientRect();
      // 足够大（宽高各超过视口的 25%）才认为是弹窗
      if (r.width < vw * 0.25 || r.height < vh * 0.25) continue;
      // 必须包含至少一个交互元素
      if (!el.querySelector("input, button, textarea, select, a[href]")) continue;
      best = el;
      bestZ = z;
    }

    // 只有满足以下任一条件才返回模态框：
    // 1. body 有 overflow:hidden 且找到了候选元素
    // 2. 候选元素 z-index 极高（>= 1000），即便没有 overflow:hidden 信号
    if (best && (hasModalSignal || bestZ >= 1000)) return best;
    return null;
  }

  let activeModal = null;
  try { activeModal = detectActiveModal(); } catch { /* 忽略 */ }

  // 检测页面中存在的可滚动子容器（DataTables、虚拟列表等固定高度+overflow:auto的区域）
  // 这些容器本身在视口内时，容器内部超出容器可视高度的元素也应纳入识别
  // 只扫描常见的容器标签，避免遍历整个 DOM
  const scrollContainers = [];
  try {
    const scrollCandidates = document.querySelectorAll(
      "div, section, article, main, aside, ul, ol, tbody, table, " +
      '[class*="scroll"], [class*="table-body"], [class*="list-wrap"], [class*="grid-body"]'
    );
    for (const el of scrollCandidates) {
      if (!isVisible(el)) continue;
      const s = window.getComputedStyle(el);
      const overflowY = s.overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      // 容器实际内容超出自身高度（确实可滚动），且容器本身有一定高度
      if (el.scrollHeight <= el.clientHeight + 20) continue;
      if (el.clientHeight < 100) continue;
      // 容器本身须在浏览器视口内
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
      scrollContainers.push(el);
    }
  } catch { /* 忽略 */ }

  function isInViewport(el) {
    // 模态框内的元素：不做视口过滤，全部纳入
    if (activeModal && activeModal.contains(el)) return true;
    // 可滚动子容器（DataTables等）内的元素：只要容器本身在视口内就纳入，
    // 避免容器内超出视口部分的行被误过滤
    for (const sc of scrollContainers) {
      if (sc.contains(el)) return true;
    }
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  }

  const rawList = Array.from(document.querySelectorAll(selectors));
  perf(`querySelectorAll done (${rawList.length} raw elements, modal=${!!activeModal})`);

  // 只对表单控件调用 getFieldLabel（含 cloneNode，开销大）
  const FORM_TAGS = new Set(["input", "textarea", "select"]);
  // 预扫描已加入的元素集合，避免重复
  const preScannedSet = new Set(otherElements.map((e) => e.el));

  for (const el of rawList) {
    if (preScannedSet.has(el)) continue; // 富文本编辑器已优先加入，跳过
    if (!isVisible(el)) continue;
    if (!isInViewport(el)) continue;    // 视口过滤（模态框内元素豁免）

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

  // ── 补充扫描：分两步捕获主选择器漏掉的可点击元素 ──────────────
  const capturedSet = new Set(rawList);
  const suppElements = [];

  // 第一步：优先扫描浮动容器（下拉菜单、弹窗等动态追加到 body 末尾的层）
  // Element UI / Ant Design 等框架的 dropdown 都是 position:fixed/absolute 高层级浮层
  const floatContainers = document.querySelectorAll(
    '[class*="dropdown"], [class*="popper"], [class*="picker__panel"], ' +
    '[class*="select-dropdown"], [role="listbox"], [role="menu"], [role="tooltip"]'
  );
  for (const container of floatContainers) {
    if (!isVisible(container)) continue;
    const cStyle = window.getComputedStyle(container);
    if (cStyle.position !== "fixed" && cStyle.position !== "absolute") continue;
    for (const el of container.querySelectorAll("li, [class*='item'], [class*='option']")) {
      if (capturedSet.has(el)) continue;
      if (!isVisible(el)) continue;
      if (!isInViewport(el)) continue;
      const text = el.innerText?.trim() || "";
      if (!text || text.length > 100) continue;
      suppElements.push({ el, info: {
        tag: el.tagName.toLowerCase(), type: "", text: text.slice(0, 120), href: "",
      }});
      if (suppElements.length >= 80) break;
    }
    if (suppElements.length >= 80) break;
  }

  // 第二步：常规 cursor:pointer 扫描（处理 Vue/React JS 绑定事件的普通可点击元素）
  const capturedSetFull = new Set([...rawList, ...suppElements.map((e) => e.el)]);
  const suppNodeList = document.querySelectorAll("span, div, li, td, p");
  let suppChecked = 0;
  for (const el of suppNodeList) {
    if (suppChecked >= 400) break;
    if (capturedSetFull.has(el)) continue;
    if (!isVisible(el)) continue;
    if (!isInViewport(el)) continue;
    const text = el.innerText?.trim() || "";
    const firstLine = text.split("\n")[0].trim();
    if (firstLine.length > 80) continue;
    suppChecked++;
    if (window.getComputedStyle(el).cursor === "pointer") {
      const displayText = firstLine
        || el.getAttribute("data-placeholder")?.trim()
        || el.getAttribute("placeholder")?.trim()
        || el.getAttribute("aria-label")?.trim()
        || `(${el.tagName.toLowerCase()})`;
      suppElements.push({ el, info: {
        tag: el.tagName.toLowerCase(), type: "", text: displayText.slice(0, 120), href: "",
      }});
      if (suppElements.length >= 100) break;
    }
  }
  perf(`supp scan done (float=${floatContainers.length} checked=${suppChecked} found=${suppElements.length})`);

  // 先放导航区元素，再放其他元素，最后放补充元素
  const allEntries = []; // { el, id, info }
  const elements = [];
  for (const { el, info } of [...navElements, ...otherElements, ...suppElements]) {
    info.id = counter;
    elementMap.set(counter, el);
    el.setAttribute("data-ai-id", counter);
    elements.push(info);
    allEntries.push({ el, id: counter, info });
    counter++;
  }

  // 渲染覆盖层（异步，不阻塞 readPage 返回）
  setTimeout(() => {
    try { renderOverlay(allEntries); } catch { /* 忽略渲染错误 */ }
  }, 0);

  perf("elementMap built");

  perf("elementMap built");
  // 提取页面主要文本：优先取语义主内容区，避免导航/广告/SVG路径噪音
  const mainEl =
    document.querySelector("main, [role='main'], article, #content, #main") ||
    document.body;
  const textClone = mainEl.cloneNode(true);
  textClone.querySelectorAll("script, style, noscript, svg, nav, header, footer").forEach((el) => el.remove());
  const bodyText = (textClone.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  perf("bodyText done");

  perf(`TOTAL elements=${elements.length} modal=${!!activeModal}`);
  return {
    url: window.location.href,
    title: document.title,
    body_text: bodyText,
    interactive_elements: elements,
    total_elements: elements.length,
    active_modal: activeModal ? true : false,
  };
}

/**
 * 根据编号点击元素
 */
function clickElement(id) {
  const el = elementMap.get(id);
  if (!el) return { success: false, error: `元素 #${id} 不存在，请先调用 read_page` };

  // 点击后恢复之前 hover 强制显示的元素（避免页面 DOM 残留异常样式）
  restoreHoverRevealed();

  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();

    const rect2 = el.getBoundingClientRect();
    const cx = Math.round(rect2.left + rect2.width / 2);
    const cy = Math.round(rect2.top  + rect2.height / 2);

    // 派发完整的鼠标/指针事件序列，确保各类框架（Vue/React/原生）都能响应
    // 部分组件（如 BlueKing bk-select）只监听 mousedown，不监听 click
    const base = { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy };

    // 模拟鼠标从元素左上角移动到中心的轨迹（3步），让依赖 mousemove 的组件正确响应
    const startX = Math.round(rect2.left + 2);
    const startY = Math.round(rect2.top  + 2);
    for (let i = 1; i <= 3; i++) {
      const mx = Math.round(startX + (cx - startX) * i / 3);
      const my = Math.round(startY + (cy - startY) * i / 3);
      el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, composed: true, clientX: mx, clientY: my }));
    }

    el.dispatchEvent(new MouseEvent("mouseover",    { ...base }));
    el.dispatchEvent(new MouseEvent("mouseenter",   { ...base, bubbles: false }));
    el.dispatchEvent(new PointerEvent("pointerover",  { ...base, pointerId: 1 }));
    el.dispatchEvent(new PointerEvent("pointerdown",  { ...base, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown",    { ...base }));
    el.dispatchEvent(new PointerEvent("pointerup",    { ...base, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mouseup",      { ...base }));
    el.dispatchEvent(new MouseEvent("click",        { ...base }));

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

    // 输入前先派发完整点击序列（与 clickElement 一致）
    // 目的：触发输入框 click 时可能出现的弹框/下拉/搜索面板，
    // 使后续输入发生在正确的上下文中
    const r2 = el.getBoundingClientRect();
    const cx2 = Math.round(r2.left + r2.width / 2);
    const cy2 = Math.round(r2.top  + r2.height / 2);
    const base2 = { bubbles: true, cancelable: true, composed: true, clientX: cx2, clientY: cy2 };
    el.dispatchEvent(new MouseEvent("mouseover",   { ...base2 }));
    el.dispatchEvent(new PointerEvent("pointerdown", { ...base2, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown",   { ...base2 }));
    el.dispatchEvent(new PointerEvent("pointerup",   { ...base2, pointerId: 1 }));
    el.dispatchEvent(new MouseEvent("mouseup",     { ...base2 }));
    el.dispatchEvent(new MouseEvent("click",       { ...base2 }));

    // 点击后检查焦点是否转移到了新元素（如弹框里的搜索框）
    // 若焦点已落在另一个可输入元素上，优先对该元素输入，而非原始元素
    const focusedEl = document.activeElement;
    const isFocusable = (e) => e && (
      e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable
    );
    const target = (isFocusable(focusedEl) && focusedEl !== el && focusedEl !== document.body)
      ? focusedEl
      : el;

    target.focus();

    const isContentEditable = target.isContentEditable;
    const isRichEditorIframe = el.tagName.toLowerCase() === "iframe";

    if (isRichEditorIframe) {
      // TinyMCE / 其他富文本编辑器 iframe
      // 直接操作 iframe 的 contentDocument.body（contenteditable 区域）
      const iframeBody = el.contentDocument?.body;
      if (!iframeBody) return { success: false, error: "无法访问 iframe 内容，可能是跨域限制" };
      iframeBody.focus();
      if (clearFirst) {
        iframeBody.ownerDocument.execCommand("selectAll", false, null);
        iframeBody.ownerDocument.execCommand("delete", false, null);
      }
      for (const char of text) {
        iframeBody.dispatchEvent(new KeyboardEvent("keydown",  { key: char, bubbles: true }));
        iframeBody.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
        iframeBody.ownerDocument.execCommand("insertText", false, char);
        iframeBody.dispatchEvent(new KeyboardEvent("keyup",    { key: char, bubbles: true }));
      }
      iframeBody.dispatchEvent(new Event("input", { bubbles: true }));
      flashElement(el, "#10b981");
      return { success: true, message: `在富文本编辑器(iframe)中输入了: "${text}"` };
    }

    if (clearFirst) {
      if (isContentEditable) {
        target.textContent = "";
      } else {
        target.value = "";
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (isContentEditable) {
      // contenteditable（YouTube 评论框、Notion、富文本编辑器等）
      target.focus();
      if (clearFirst) {
        document.execCommand("selectAll", false, null);
      }
      for (const char of text) {
        target.dispatchEvent(new KeyboardEvent("keydown",  { key: char, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
        document.execCommand("insertText", false, char);
        target.dispatchEvent(new KeyboardEvent("keyup",    { key: char, bubbles: true }));
      }
    } else {
      // 普通 input / textarea
      target.value = text;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

    // 绿色闪烁：表示正在输入
    flashElement(target, "#10b981");

    const redirected = target !== el ? ` (焦点已转移到弹框内的输入框)` : "";
    return { success: true, message: `在输入框输入了: "${text}"${redirected}` };
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
      } else if (tag === "iframe") {
        // TinyMCE 等富文本编辑器 iframe
        const iframeBody = el.contentDocument?.body;
        if (iframeBody) {
          iframeBody.focus();
          iframeBody.ownerDocument.execCommand("selectAll", false, null);
          iframeBody.ownerDocument.execCommand("delete", false, null);
          for (const char of String(value)) {
            iframeBody.ownerDocument.execCommand("insertText", false, char);
          }
          iframeBody.dispatchEvent(new Event("input", { bubbles: true }));
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
 * 悬浮在元素上（只触发 hover 事件，不点击）
 * 用于展开 hover 触发的下拉菜单，再 read_page 查看子项后点击目标
 *
 * 额外处理：CSS :hover 伪类无法被 JS 事件触发，因此在派发事件后，
 * 主动扫描悬浮目标所在行/容器内被隐藏的交互元素，通过内联 style 强制显示，
 * 使后续 read_page 能检测到这些按钮（如 GitLab 的"添加评论"按钮）。
 */
function hoverElement(id) {
  const el = elementMap.get(id);
  if (!el) return { success: false, error: `元素 #${id} 不存在，请先调用 read_page` };

  // 先恢复上次 hover 强制显示的元素
  restoreHoverRevealed();

  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    // 带坐标的鼠标事件（某些框架用 clientX/Y 定位）
    const rect = el.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top  + rect.height / 2);
    const evInit = { bubbles: true, cancelable: true, composed: true, clientX: cx, clientY: cy };
    el.dispatchEvent(new MouseEvent("mouseover",  evInit));
    el.dispatchEvent(new MouseEvent("mouseenter", { ...evInit, bubbles: false }));
    el.dispatchEvent(new MouseEvent("mousemove",  evInit));

    // ── CSS :hover 补偿：强制显示附近被隐藏的交互元素 ──────────────
    // GitLab / GitHub 等平台的"添加评论"按钮通过 CSS tr:hover .btn { display:block }
    // 实现，JS 事件无法触发该状态，因此手动把隐藏按钮显示出来。
    //
    // 通用方案：沿 DOM 向上走，找"高度仍在行级范围内"的最大祖先容器。
    // 阈值 = max(元素自身高度 × 5, 100px)。
    // 超过此高度说明已经是区块/面板级容器，停止，不继续向上。
    // 这样无需硬编码任何标签名或 class，适用于任何页面结构。
    const ROW_MAX_H = Math.max(rect.height * 5, 100);
    let container = el.parentElement;
    let probe = el.parentElement;
    while (probe && probe !== document.body) {
      const r = probe.getBoundingClientRect();
      if (r.height > 0 && r.height > ROW_MAX_H) break; // 容器太高，停止向上
      if (r.height > 0) container = probe;              // 仍在行级范围，记录为候选
      probe = probe.parentElement;
    }
    // 尝试从容器内提取"行号"信息，用于标注 reveal 出来的按钮，让 AI 知道操作的是哪一行
    // 策略：找容器内第一个纯数字文本节点（行号格式），与任何具体框架无关
    let lineLabel = "";
    if (container) {
      // 遍历容器内所有文本节点/元素，找纯数字（行号）
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (/^\d+$/.test(t) && parseInt(t) < 100000) { lineLabel = `line ${t}`; break; }
      }
    }

    if (container) {
      const candidates = container.querySelectorAll(
        "button, a, [role='button'], [onclick], [class*='btn'], [class*='comment'], [class*='note']"
      );
      for (const btn of candidates) {
        if (btn === el) continue;
        const s = window.getComputedStyle(btn);
        const hidden =
          s.display === "none" ||
          s.opacity === "0" ||
          s.visibility === "hidden" ||
          parseFloat(s.opacity) < 0.05;
        if (!hidden) continue;
        // 保存内联样式原始值（只保存内联，不影响 CSS 规则）
        hoverRevealedEls.push({
          el: btn,
          orig: {
            display:       btn.style.display,
            opacity:       btn.style.opacity,
            visibility:    btn.style.visibility,
            pointerEvents: btn.style.pointerEvents,
            ariaLabel:     btn.getAttribute("aria-label"),
          },
        });
        btn.style.display       = "inline-block";
        btn.style.opacity       = "1";
        btn.style.visibility    = "visible";
        btn.style.pointerEvents = "auto";
        // 注入行号上下文：让 AI 在 read_page 时能识别这是哪一行的按钮
        if (lineLabel && !btn.getAttribute("aria-label")) {
          btn.setAttribute("aria-label", `hover-revealed button (${lineLabel})`);
        }
      }
    }

    flashElement(el, "#818cf8"); // 紫色闪烁，区别于点击的橙色
    return {
      success: true,
      message: `悬浮在: ${getElementText(el) || el.tagName}${lineLabel ? ` [${lineLabel}]` : ""}`,
      revealed: hoverRevealedEls.length,
      line_context: lineLabel || null,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
    case "hover_element":
      result = hoverElement(params.id);
      break;
    case "find_by_text":
      result = findByText(params.text);
      break;
    case "clear_overlay":
      clearOverlay();
      result = { success: true };
      break;
    default:
      result = { success: false, error: `未知 action: ${action}` };
  }

  sendResponse(result);
  return true; // 保持消息通道开放（异步）
});
