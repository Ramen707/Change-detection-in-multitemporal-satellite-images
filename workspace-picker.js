(() => {
  const button = document.querySelector(".workspace-switch");
  const intro = document.querySelector(".intro-copy");
  if (!button || !intro) return;

  const descriptions = {
    "Earth observation": "Compare satellite images from two points in time. Find where the landscape shifted, pixel by pixel.",
    "Urban growth": "Compare two dates to spot new construction, expanding neighborhoods and changing built-up areas.",
    "Forest monitoring": "Compare two dates to highlight clearing, regrowth and broader vegetation change.",
    "Coastal change": "Compare two dates to spot shoreline shifts, new land or water, and coastal development."
  };
  const picker = document.createElement("div");
  picker.className = "workspace-picker";
  button.parentNode.insertBefore(picker, button);
  picker.append(button);
  button.id = "workspace-switch";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "workspace-menu");

  const style = document.createElement("style");
  style.textContent = [
    ".workspace-picker{position:relative;width:100%}",
    ".workspace-menu{position:absolute;z-index:20;top:calc(100% + 7px);left:0;width:100%;min-width:212px;padding:7px;border:1px solid #dce2d8;border-radius:9px;background:#fff;box-shadow:0 14px 32px #24301e24}",
    ".workspace-menu-note{margin:4px 6px 7px;color:#798371;font:9px DM Mono,monospace;letter-spacing:.5px}",
    ".workspace-option{display:flex;width:100%;align-items:center;gap:9px;padding:8px 7px;border:0;border-radius:6px;background:transparent;text-align:left;cursor:pointer}",
    ".workspace-option:hover,.workspace-option.selected{background:#eff4e8}",
    ".workspace-option-avatar{display:grid;width:27px;height:27px;flex:0 0 auto;place-items:center;border-radius:6px;color:#526c2c;background:#e6efd4;font:700 11px Manrope,sans-serif}",
    ".workspace-option-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}",
    ".workspace-option-copy strong{color:#2f382a;font-size:12px;font-weight:600}",
    ".workspace-option-copy small{color:#788170;font-size:10px}",
    ".workspace-check{color:#587b2d;font-size:13px;opacity:0}",
    ".workspace-option.selected .workspace-check{opacity:1}",
    "@media(max-width:820px){.workspace-menu{top:0;left:calc(100% + 8px)}}"
  ].join("");
  document.head.append(style);

  const menu = document.createElement("div");
  menu.className = "workspace-menu";
  menu.id = "workspace-menu";
  menu.hidden = true;
  menu.innerHTML = '<p class="workspace-menu-note">FOCUS AREAS · SAME ANALYSIS TOOL</p>';
  const labels = [
    ["Earth observation", "General land change"],
    ["Urban growth", "Buildings and expansion"],
    ["Forest monitoring", "Clearing and regrowth"],
    ["Coastal change", "Shoreline and water shifts"]
  ];
  const options = labels.map(([name, detail]) => {
    const item = document.createElement("button");
    item.className = "workspace-option";
    item.type = "button";
    item.dataset.workspace = name;
    item.setAttribute("aria-pressed", "false");
    item.innerHTML = '<span class="workspace-option-avatar">' + name[0] + '</span><span class="workspace-option-copy"><strong>' + name + '</strong><small>' + detail + '</small></span><span class="workspace-check" aria-hidden="true">✓</span>';
    menu.append(item);
    return item;
  });
  picker.append(menu);

  const setWorkspace = (name, save = true) => {
    if (!descriptions[name]) return;
    button.querySelector(".workspace-name").textContent = name;
    button.querySelector(".workspace-avatar").textContent = name[0];
    intro.textContent = descriptions[name];
    options.forEach((item) => {
      const selected = item.dataset.workspace === name;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    if (save) {
      try { localStorage.setItem("groundtruth-workspace", name); } catch { /* Use this page session only. */ }
    }
  };
  const close = (restoreFocus = false) => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
  };
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    menu.hidden = open;
  });
  options.forEach((item) => item.addEventListener("click", () => {
    setWorkspace(item.dataset.workspace);
    close(true);
  }));
  document.addEventListener("click", (event) => {
    if (!picker.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) close(true);
  });
  try { setWorkspace(localStorage.getItem("groundtruth-workspace") || "Earth observation", false); }
  catch { setWorkspace("Earth observation", false); }
})();
