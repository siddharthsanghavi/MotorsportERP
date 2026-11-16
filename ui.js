// Layout helpers: "new item" forms and process maps fold away so each tab opens on the list you work with.
(function () {
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
  const cards = [];
  document.querySelectorAll("section.view > .card").forEach((card) => {
    const isProcess = !!card.querySelector(":scope .flow.short");
    const isForm = !!card.querySelector(":scope > form.form-grid, :scope > form");
    if (!isProcess && !isForm) return;
    const h2 = card.querySelector("h2"); if (!h2) return;
    const key = `ui-open:${card.closest("section").id}:${h2.textContent.trim()}`;
    card.classList.add("collapsible", isProcess ? "is-process" : "is-form");
    if (isProcess && !/^How it works/.test(h2.textContent)) h2.textContent = `How it works: ${h2.textContent.replace(/ process$| lifecycle$/i, "").toLowerCase()}`;
    h2.setAttribute("role", "button"); h2.tabIndex = 0;
    // Process maps are drawn (and React Flow fetched) only once they're opened.
    const set = (open) => { card.classList.toggle("collapsed", !open); h2.setAttribute("aria-expanded", String(open)); store.set(key, open ? "1" : "0"); if (open && isProcess && typeof renderProcesses === "function") renderProcesses(); };
    set(store.get(key) === "1");
    const toggle = () => set(card.classList.contains("collapsed"));
    h2.addEventListener("click", toggle);
    h2.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    cards.push({ card, set });
  });
  // Forms that get pre-filled from elsewhere (e.g. "Order" on a part) open themselves.
  document.addEventListener("focusin", (e) => { const c = e.target.closest?.(".collapsible.collapsed"); if (c) cards.find((x) => x.card === c)?.set(true); });
  // Close the workspace menu after picking something.
  document.addEventListener("click", (e) => { const m = document.querySelector("details.menu[open]"); if (m && (!m.contains(e.target) || e.target.closest(".menu-panel button"))) m.open = false; });
})();
