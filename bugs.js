// Bug reports for the app itself. A "Report a bug" button sits in the header on every page; reports keep the page
// they came from, and the list (Workspace ▾ → Bug reports) lets Admins triage them. Loaded after funds.js.
Object.assign(KEYS, { bugs: "motorsport-erp-bugs" });
nouns.bugs = "bug report";
const BUG_STATUSES = ["Open", "In progress", "Fixed", "Won't fix"];
const BUG_SEVERITY = ["Minor (cosmetic)", "Annoying (workaround exists)", "Blocking (can't do my work)"];
const ISSUES_URL = "https://github.com/siddharthsanghavi/MotorsportERP/issues/new";
const canTriage = (u = me()) => has("Admin", u);

// Header button + list dialog, added once on every page.
(function addBugUi() {
  const actions = document.querySelector(".hero-actions"); if (!actions || $("#bug-btn").id) return;
  actions.insertAdjacentHTML("afterbegin", `<button class="ghost bug-btn" id="bug-btn" data-op="bug-report" title="Report a bug in MotorsportERP"aria-label="Report a bug">🐞</button>`);
  document.querySelector(".menu-panel")?.insertAdjacentHTML("afterbegin", `<button class="secondary" data-op="bug-list">Bug reports <span id="bug-count" class="pill"></span></button>`);
  document.body.insertAdjacentHTML("beforeend", `<dialog id="bug-dialog" class="editor bug-dialog"></dialog>`);
})();

OPS["bug-report"] = () => openForm("Report a bug", [
  ["title", "What went wrong? (short)", "text"], ["severity", "How bad is it?", "select", BUG_SEVERITY],
  ["steps", "What were you doing? (steps to make it happen)", "textarea"], ["expected", "What did you expect to happen?", "textarea"]
], { severity: BUG_SEVERITY[0] }, (v) => {
  if (!String(v.title).trim()) return flash("Give the bug a short title.");
  const bug = { id: id(), ...v, title: v.title.trim(), page: document.title.split(" · ")[0], url: location.pathname.split("/").pop() + location.search, browser: navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] || "", status: "Open", createdBy: me().id, createdAt: new Date().toISOString() };
  write("bugs", [...read("bugs"), bug]); logEvent(`reported a bug: ${bug.title}`);
  notify(read("team").filter((m) => canTriage(m)).map((m) => m.id), `Bug reported on ${bug.page}: ${bug.title}`);
  flash("Thanks! Bug reported."); renderAll();
});

function issueLink(b) {
  const body = `**Page:** ${b.page} (${b.url})\n**Severity:** ${b.severity}\n**Browser:** ${b.browser}\n\n**Steps**\n${b.steps || "-"}\n\n**Expected**\n${b.expected || "-"}`;
  return `${ISSUES_URL}?title=${encodeURIComponent(b.title)}&body=${encodeURIComponent(body)}`;
}
function renderBugDialog() {
  const bugs = [...read("bugs")].sort((a, b) => (a.status === "Open" ? 0 : 1) - (b.status === "Open" ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)); const triage = canTriage();
  $("#bug-dialog").innerHTML = `<div class="list-header"><h2>Bug reports</h2><div class="row-actions">${triage && bugs.length ? `<button class="secondary" data-op="bug-export">Export CSV</button>` : ""}<button class="ghost" data-op="bug-close">Close</button></div></div>
    ${bugs.length ? `<div class="bug-list">${bugs.map((b) => `<div class="bug ${b.status === "Open" ? "open" : ""}">
      <div class="bug-top"><strong>${esc(b.title)}</strong>${triage ? `<select data-bug-status="${b.id}">${BUG_STATUSES.map((s) => `<option ${s === b.status ? "selected" : ""}>${s}</option>`).join("")}</select>` : `<span class="status">${esc(b.status)}</span>`}</div>
      <div class="hint">${esc(b.page)} · ${esc(b.severity)} · ${esc(memberName(b.createdBy))} · ${esc(b.createdAt.slice(0, 10))}</div>
      ${b.steps ? `<p><b>Steps:</b> ${esc(b.steps)}</p>` : ""}${b.expected ? `<p><b>Expected:</b> ${esc(b.expected)}</p>` : ""}
      <div class="row-actions">${triage ? `<a class="link" href="${esc(issueLink(b))}" target="_blank" rel="noopener">Open as GitHub issue</a>` : ""}${triage || own(b) ? `<button class="link danger" data-op="bug-delete" data-id="${b.id}">Delete</button>` : ""}</div></div>`).join("")}</div>` : `<p class="empty">No bugs reported. Nice.</p>`}`;
}
OPS["bug-list"] = () => { renderBugDialog(); document.querySelector("details.menu")?.removeAttribute("open"); $("#bug-dialog").showModal(); };
OPS["bug-close"] = () => $("#bug-dialog").close();
OPS["bug-delete"] = (b) => { const bug = read("bugs").find((x) => x.id === b.dataset.id); if (!bug || !(canTriage() || own(bug)) || !confirm(`Delete "${bug.title}"?`)) return; write("bugs", read("bugs").filter((x) => x.id !== bug.id)); renderBugDialog(); renderAll(); };
OPS["bug-export"] = () => { const cols = ["createdAt", "title", "severity", "status", "page", "url", "steps", "expected", "browser"]; downloadFile(`bug-reports-${todayISO()}.csv`, [["reported", ...cols.slice(1), "reportedBy"], ...read("bugs").map((b) => [...cols.map((c) => b[c]), memberName(b.createdBy)])].map((r) => r.map(csvCell).join(",")).join("\n")); };
document.addEventListener("change", (e) => {
  const sel = e.target.closest("[data-bug-status]"); if (!sel || !canTriage()) return;
  const list = read("bugs"); const b = list.find((x) => x.id === sel.dataset.bugStatus); b.status = sel.value; b.updatedBy = me().id; write("bugs", list);
  logEvent(`marked bug "${b.title}" ${b.status}`); if (["Fixed", "Won't fix"].includes(b.status)) notify(b.createdBy, `Your bug "${b.title}" was marked ${b.status}`); renderBugDialog(); renderAll();
});
EXT.inbox.push((u) => canTriage(u) ? read("bugs").filter((b) => b.status === "Open").map((b) => `Bug: ${b.title} (${b.page})`) : []);
EXT.renders.push(() => { const n = read("bugs").filter((b) => b.status === "Open").length; $("#bug-count").textContent = n || ""; });
