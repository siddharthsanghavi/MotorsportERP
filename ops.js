// Operations modules: notifications, record editing, backup/restore, testing sessions, part life & inspections,
// stock & tool check-out with QR labels, training sign-offs, season timeline, and the cost report.
// Loaded after app.js and plugs into its EXT hooks.
Object.assign(KEYS, {
  notifications: "motorsport-erp-notifications", sessions: "motorsport-erp-sessions", failures: "motorsport-erp-failures",
  stock: "motorsport-erp-stock", trainings: "motorsport-erp-trainings", signoffs: "motorsport-erp-signoffs",
  milestones: "motorsport-erp-milestones", settings: "motorsport-erp-settings"
});
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const getSettings = () => { try { return JSON.parse(localStorage.getItem(KEYS.settings)) || {}; } catch { return {}; } };
const setSettings = (patch) => localStorage.setItem(KEYS.settings, JSON.stringify({ ...getSettings(), ...patch }));
const isTrainer = (u = me()) => u.roles.includes("Admin") || u.roles.includes("Shop Lead") || u.title === "Chief Mechanic";
const teamSorted = () => [...read("team")].sort((a, b) => a.name.localeCompare(b.name));
const memberSelect = (selected = "", blank = "— Select —") => `<option value="">${esc(blank)}</option>` + teamSorted().map((m) => `<option value="${m.id}" ${m.id === selected ? "selected" : ""}>${esc(m.name)}</option>`).join("");

// =====================================================================
// Notifications (in-app). Events that involve someone else drop a note in their bell.
// =====================================================================
function notify(userIds, text) {
  const ids = [...new Set([].concat(userIds).filter((x) => x && x !== me().id))];
  if (!ids.length) return;
  const at = new Date().toISOString();
  write("notifications", [...read("notifications"), ...ids.map((userId) => ({ id: id(), userId, text, at, read: false, by: me().name }))].slice(-600));
}
function remindDueTasks() {
  // One reminder per task when it's due within two days (or overdue) and still open.
  const u = me(); if (!u.id) return;
  const soon = daysFromNow(2); const notes = read("notifications"); let changed = false;
  read("tasks").filter((t) => t.assigneeId === u.id && t.status !== "Done" && t.dueDate && t.dueDate <= soon).forEach((t) => {
    const tag = `due:${t.id}:${t.dueDate}`;
    if (!notes.some((n) => n.tag === tag)) { notes.push({ id: id(), userId: u.id, tag, text: `Task "${t.title}" is ${t.dueDate < todayISO() ? "overdue" : "due " + t.dueDate}`, at: new Date().toISOString(), read: false, by: "Reminder" }); changed = true; }
  });
  if (changed) write("notifications", notes.slice(-600));
}
function renderBell() {
  remindDueTasks();
  const mine = read("notifications").filter((n) => n.userId === me().id).reverse();
  const unread = mine.filter((n) => !n.read).length;
  $("#bell-count").textContent = unread || "";
  $("#bell").classList.toggle("has-unread", unread > 0);
  $("#bell-panel").innerHTML = `<div class="bell-head"><strong>Notifications</strong>${unread ? `<button class="link" id="bell-read">Mark all read</button>` : ""}</div>` +
    (mine.length ? mine.slice(0, 25).map((n) => `<div class="bell-item${n.read ? "" : " unread"}"><span>${esc(n.text)}</span><small>${esc(n.by || "")} · ${new Date(n.at).toLocaleString()}</small></div>`).join("") : `<p class="empty">Nothing yet.</p>`);
}
$("#bell").addEventListener("click", (e) => { e.stopPropagation(); $("#bell-panel").classList.toggle("hidden"); });
document.addEventListener("click", (e) => {
  if (e.target.id === "bell-read") { write("notifications", read("notifications").map((n) => (n.userId === me().id ? { ...n, read: true } : n))); renderBell(); return; }
  if (!e.target.closest(".bell-wrap")) $("#bell-panel").classList.add("hidden");
});
// Who hears about what.
EXT.after.push((action, key, row, from) => {
  const by = me().name;
  if (action === "advance" && key === "purchases") notify(row.createdBy, `${by} moved your purchase "${row.item}" to ${row.status}`);
  if (action === "advance" && key === "approvals") notify(row.createdBy, `${by} marked your design review "${row.name}" ${row.status}`);
  if (action === "advance" && key === "jobs") notify([row.ownerId, row.createdBy], `Shop job "${row.name}" is now ${row.status}`);
  if (action === "advance" && key === "tasks") { const p = projectOf(row); if (p) notify([p.pocId, row.assigneeId], `Task "${row.title}" (${p.name}) is now ${row.status}`); }
  if (action === "advance" && key === "docs") {
    if (row.status === "In Review") notify(read("team").filter((m) => (m.leads || []).includes(row.subteam)).map((m) => m.id), `${row.number} "${row.title}" Rev ${row.revision} is ready for review`);
    if (row.status === "Released") notify(row.ownerId, `${row.number} "${row.title}" Rev ${row.revision} was released by ${by}`);
  }
  if (action === "advance" && key === "projects") notify([row.createdBy, row.pocId, ...(row.assignees || [])], from === "Proposed" ? `Project "${row.name}" was approved by ${by}` : `Project "${row.name}" moved to ${row.status}`);
  if (action === "reject" && key === "projects") notify(row.createdBy, `Your proposal "${row.name}" was rejected by ${by}`);
});

// =====================================================================
// Generic form dialog: used for editing records and logging inspections/failures.
// fields: [name, label, type, options?]  type: text | number | date | textarea | select | checkbox | member
// =====================================================================
let dialogSave = null;
function openForm(title, fields, values, onSave) {
  const input = ([name, label, type, options]) => {
    const v = values[name] ?? "";
    if (type === "textarea") return `<label class="wide">${esc(label)}<textarea name="${name}" rows="3">${esc(v)}</textarea></label>`;
    if (type === "checkbox") return `<label class="check"><input type="checkbox" name="${name}" ${v ? "checked" : ""} />${esc(label)}</label>`;
    if (type === "member") return `<label>${esc(label)}<select name="${name}">${memberSelect(v, "— None —")}</select></label>`;
    if (type === "select") return `<label>${esc(label)}<select name="${name}">${options.map((o) => { const [val, text] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? "selected" : ""}>${esc(text)}</option>`; }).join("")}</select></label>`;
    return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(v)}" ${type === "number" ? 'step="any" min="0"' : ""} /></label>`;
  };
  $("#editor").innerHTML = `<form method="dialog" id="editor-form"><h2>${esc(title)}</h2><div class="form-grid">${fields.map(input).join("")}</div><div class="dialog-actions"><button type="button" class="ghost" id="editor-cancel">Cancel</button><button type="submit">Save</button></div></form>`;
  dialogSave = (form) => { const out = {}; fields.forEach(([name, , type]) => { out[name] = type === "checkbox" ? form.elements[name].checked : form.elements[name].value; }); onSave(out); };
  $("#editor").showModal();
}
document.addEventListener("submit", (e) => { if (e.target.id !== "editor-form") return; e.preventDefault(); dialogSave?.(e.target); $("#editor").close(); });
document.addEventListener("click", (e) => { if (e.target.id === "editor-cancel") $("#editor").close(); });

// ----- Record editing -----
const MACHINES = { "": "", "Manual mill": "manual-mill", "Manual lathe": "manual-lathe", "CNC mill": "cnc-mill", "Waterjet": "waterjet", "TIG welder": "tig", "Composites layup": "composites", "3D printer": "safety", "Bandsaw / hand tools": "safety" };
const opts = {
  parts: () => read("parts").map((p) => p.name).filter((v, i, a) => a.indexOf(v) === i).sort(),
  budgets: () => [["", "— None —"], ...read("budgets").map((b) => [b.category, b.category])],
  partIds: () => [["", "— None —"], ...[...read("parts")].sort((a, b) => a.name.localeCompare(b.name)).map((p) => [p.id, `${p.name}${p.partNumber ? ` (${p.partNumber})` : ""}`])],
  projectIds: () => [["", "— None —"], ...read("projects").filter((p) => p.status !== "Rejected").map((p) => [p.id, p.name])],
  trainings: () => [["", "None"], ...read("trainings").map((t) => [t.id, t.name])]
};
const EDIT_FIELDS = {
  parts: (row) => [["partNumber", "Part number", "text"], ["name", "Name", "text"], ["subsystem", "Subsystem", "select", [...SUBSYSTEMS, "Other"]], ["platform", "Used on", "select", ["Both", "EV", "ICE"]], ["parent", "Parent assembly", "select", [["", "— Top level —"], ...opts.parts().map((n) => [n, n])]], ["quantity", "Quantity", "number"], ["location", "Location", "text"], ["material", "Material", "text"], ["supplier", "Supplier", "select", vendorOptions(row?.supplier)], ["unitCost", "Material cost each ($)", "number"], ["processCost", "Process cost each ($)", "number"], ["fastenerCost", "Fasteners each ($)", "number"], ["toolingCost", "Tooling (one-off, $)", "number"], ["safetyCritical", "Safety-critical part", "checkbox"], ["lifeLimitKm", "Life limit (km)", "number"], ["inspectEveryKm", "Inspect every (km)", "number"], ["kmUsed", "Km used so far", "number"]],
  purchases: (row) => [["item", "Item", "text"], ["vendor", "Vendor", "select", vendorOptions(row?.vendor)], ["amount", "Amount ($)", "number"], ["neededBy", "Needed by", "date"], ["category", "Budget", "select", opts.budgets()], ["partId", "For part", "select", opts.partIds()], ["projectId", "For project", "select", opts.projectIds()]],
  jobs: () => [["name", "Part / job", "text"], ["qty", "Quantity", "number"], ["cadUrl", "Drawing / CAD link", "url"], ["notes", "Notes", "textarea"], ["ownerId", "Machinist", "member"], ["machine", "Machine", "select", Object.keys(MACHINES)], ["material", "Material", "text"], ["dueDate", "Due", "date"], ["priority", "Priority", "select", ["Normal", "High", "Critical"]], ["hours", "Machine hours", "number"], ["partId", "For part", "select", opts.partIds()], ["projectId", "For project", "select", opts.projectIds()]],
  projects: () => [["name", "Project name", "text"], ["estCost", "Estimated cost ($)", "number"], ["targetDate", "Target date", "date"], ["summary", "Summary", "textarea"]],
  stock: (row) => [["name", "Name", "text"], ["kind", "Kind", "select", ["Tool", "Consumable", "Spare part", "Safety gear"]], ["qty", "Quantity", "number"], ["minQty", "Reorder at (min)", "number"], ["location", "Location / bin", "text"], ["unitCost", "Unit cost ($)", "number"], ["vendor", "Usual vendor", "select", vendorOptions(row?.vendor)], ["training", "Training needed", "select", opts.trainings()]]
};
function canEdit(key, row) {
  const u = me(); if (!u.id || !row) return false;
  if (key === "parts") return leads(row.subsystem) || own(row);
  if (key === "purchases") return has("Purchasing Approver") || (own(row) && row.status === "Requested");
  if (key === "jobs") return has("Shop Lead") || own(row);
  if (key === "projects") return row.pocId === u.id || ledSub(row.subteam) || isLeader(u) || (own(row) && row.status === "Proposed");
  if (key === "stock") return isTrainer(u) || isLeader(u) || own(row);
  return false;
}
function editRecord(key, recId) {
  const rows = read(key); const row = rows.find((r) => r.id === recId); if (!row || !canEdit(key, row)) return flash("You can't edit this.");
  openForm(`Edit ${nouns[key] || "item"}`, EDIT_FIELDS[key](row), key === "parts" ? partFormValues(row) : row, (vals) => {
    if (key === "parts") prepPartEdit(row, vals);
    const changed = Object.keys(vals).filter((k) => String(vals[k] ?? "") !== String(row[k] ?? ""));
    if (key === "parts" && vals.parent && createsCycle(rows, row.id, vals.parent)) return flash("That parent would create a loop in the parts tree.");
    Object.assign(row, vals, { updatedAt: new Date().toISOString() }); if (key === "parts") syncPart(row); write(key, rows); if (key === "parts") ensureAssemblies();
    if (changed.length) logEvent(`edited ${nouns[key] || key} "${labelOf(key, row)}" (${changed.join(", ")})`);
    renderAll();
  });
}
EXT.rowButtons.push((key, row) => canEdit(key, row) ? `<button class="link" data-op="edit" data-key="${key}" data-id="${row.id}">Edit</button>` : "");
EXT.rowButtons.push((key, row) => key === "parts" ? `<button class="link" data-op="order" data-id="${row.id}">Order</button>` : "");
EXT.projectExtras.push((p) => canEdit("projects", p) ? `<div class="assign-row"><button class="link" data-op="edit" data-key="projects" data-id="${p.id}">Edit details</button></div>` : "");
nouns.stock = "stock item"; nouns.sessions = "test session"; nouns.milestones = "milestone";

// "Order" on a part: jump to Purchasing with the form pre-filled.
function orderPart(partId) {
  const part = read("parts").find((p) => p.id === partId); if (!part) return;
  if (!onPage("#purchase-form")) { try { sessionStorage.setItem("merp-order-part", partId); } catch { /* storage blocked */ } location.href = PAGE_FILES.purchasing; return; }
  renderPurchaseLinks();
  const f = $("#purchase-form");
  f.elements.namedItem("item").value = `${part.name}${part.partNumber ? ` (${part.partNumber})` : ""}`;
  f.elements.vendor.value = part.supplier || "";
  if (part.unitCost) f.elements.amount.value = (Number(part.unitCost) * Number(part.quantity || 1)).toFixed(2);
  f.elements.partId.value = part.id;
  const budget = read("budgets").find((b) => b.category.toLowerCase().startsWith(String(part.subsystem).toLowerCase().slice(0, 5))); if (budget) f.elements.category.value = budget.category;
  f.closest(".card")?.classList.remove("collapsed"); f.elements.namedItem("item").focus(); flash("Purchase request pre-filled from the part. Check it and save.");
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-op]"); if (!b) return;
  const op = b.dataset.op;
  if (op === "edit") editRecord(b.dataset.key, b.dataset.id);
  else if (op === "order") orderPart(b.dataset.id);
  else if (OPS[op]) OPS[op](b);
});
const OPS = {};
OPS["team-all"] = () => { history.replaceState(null, "", location.pathname); teamSubteam = ""; trainingSubteam = ""; renderAll(); };

// Purchase & job forms: link selects and member owner.
function renderPurchaseLinks() {
  const fill = (sel, html) => { const el = $(sel); if (!el) return; const cur = el.value; el.innerHTML = html; el.value = cur; };
  const optHtml = (list) => list.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  fill("#purchase-category", optHtml(opts.budgets())); fill("#purchase-part", optHtml(opts.partIds())); fill("#purchase-project", optHtml(opts.projectIds()));
  fill("#job-part", optHtml(opts.partIds())); fill("#job-project", optHtml(opts.projectIds())); fill("#job-owner", memberSelect("", "— Select machinist —"));
  fill("#job-machine", Object.keys(MACHINES).map((m) => `<option value="${esc(m)}">${esc(m || "— None —")}</option>`).join(""));
}
EXT.renders.push(["#purchase-form, #job-form", renderPurchaseLinks]);

// Project spend from linked purchases.
EXT.projectExtras.push((p) => {
  const bought = read("purchases").filter((x) => x.projectId === p.id);
  const spent = bought.filter((x) => ["Ordered", "Received"].includes(x.status)).reduce((s, x) => s + Number(x.amount || 0), 0);
  const pending = bought.filter((x) => !["Ordered", "Received"].includes(x.status)).reduce((s, x) => s + Number(x.amount || 0), 0);
  const jobs = read("jobs").filter((j) => j.projectId === p.id);
  if (!bought.length && !jobs.length) return "";
  const over = p.estCost && spent > Number(p.estCost);
  return `<div class="people"><span class="label">Spend</span><span class="${over ? "warn-chip" : "person-chip"}">${money(spent)} spent${p.estCost ? ` of ${money(p.estCost)} est.` : ""}</span>${pending ? `<span class="person-chip">${money(pending)} pending</span>` : ""}${jobs.length ? `<span class="person-chip">${jobs.length} shop job${jobs.length > 1 ? "s" : ""}</span>` : ""}</div>`;
});

// =====================================================================
// Backup / restore. Everything lives in this browser, so make it easy to save a copy.
// =====================================================================
$("#backup-export").addEventListener("click", () => {
  const data = {}; Object.entries(KEYS).forEach(([k, storageKey]) => { if (k !== "me") { const v = localStorage.getItem(storageKey); if (v !== null) data[k] = JSON.parse(v); } });
  downloadFile(`motorsport-erp-backup-${todayISO()}.json`, JSON.stringify({ app: "MotorsportERP", version: 1, exportedAt: new Date().toISOString(), data }, null, 2), "application/json");
  logEvent("exported a workspace backup"); setSettings({ lastBackup: new Date().toISOString() }); renderBackupHint();
});
$("#backup-import").addEventListener("click", () => { if (!can("manage", "team")) return flash("Only an Admin can restore a backup."); $("#backup-file").click(); });
$("#backup-file").addEventListener("change", (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  f.text().then((text) => {
    let parsed; try { parsed = JSON.parse(text); } catch { return flash("That file isn't valid JSON."); }
    if (parsed?.app !== "MotorsportERP" || typeof parsed.data !== "object") return flash("That doesn't look like a MotorsportERP backup.");
    const keys = Object.keys(parsed.data).filter((k) => KEYS[k] && k !== "me");
    if (!confirm(`Replace this workspace with the backup from ${String(parsed.exportedAt || "").slice(0, 10)}? (${keys.length} data sets) Current data will be overwritten.`)) return;
    keys.forEach((k) => localStorage.setItem(KEYS[k], JSON.stringify(parsed.data[k])));
    logEvent(`restored a backup from ${String(parsed.exportedAt || "").slice(0, 10)}`); renderAll(); flash("Backup restored.");
  });
});
function renderBackupHint() {
  const last = getSettings().lastBackup; const days = last ? Math.floor((Date.now() - new Date(last)) / 864e5) : null;
  $("#backup-hint").textContent = last ? `Last backup ${days === 0 ? "today" : days + " days ago"}` : "No backup yet";
  $("#backup-hint").classList.toggle("stale", days === null || days > 7);
}
EXT.renders.push(renderBackupHint, renderBell);

// =====================================================================
// Testing sessions. Logging km adds wear to every part installed on that car; issues become project tasks.
// =====================================================================
const SESSION_TYPES = ["Shakedown", "Skidpad", "Acceleration", "Autocross", "Endurance", "Brake test", "Tilt / rain", "Driver training"];
EXT.can.push((action, key, row, u) => {
  if (key === "sessions") { if (action === "create") return true; if (action === "delete") return isLeader(u) || own(row); }
  if (key === "stock") { if (action === "create") return isTrainer(u) || isLeader(u) || (u.leads || []).length > 0; if (action === "delete") return isTrainer(u) || isLeader(u); }
  if (key === "milestones") { if (action === "create" || action === "delete") return isLeader(u); }
  return undefined;
});
function applyWear(car, km) {
  const parts = read("parts"); let n = 0;
  parts.forEach((p) => { if (p.status === "Installed" && [car, "Both"].includes(p.platform || "Both")) { p.kmUsed = String(Math.round((Number(p.kmUsed || 0) + km) * 10) / 10); n++; } });
  write("parts", parts); return n;
}
function renderSessionForm() {
  const fill = (sel, html) => { const el = $(sel); const cur = el.value; el.innerHTML = html; el.value = cur; };
  fill("#session-type", SESSION_TYPES.map((t) => `<option>${t}</option>`).join(""));
  fill("#session-driver", memberSelect("", "— Driver —"));
  fill("#session-project", `<option value="">— Don't create tasks —</option>` + read("projects").filter((p) => !["Rejected", "Complete"].includes(p.status)).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(""));
  if (!$("#session-form").elements.date.value) $("#session-form").elements.date.value = todayISO();
}
function renderSessions() {
  const sessions = [...read("sessions")].sort((a, b) => b.date.localeCompare(a.date));
  const kmBy = (car) => sessions.filter((s) => s.car === car).reduce((t, s) => t + Number(s.km || 0), 0);
  const drivers = {}; sessions.forEach((s) => { if (s.driverId) drivers[s.driverId] = (drivers[s.driverId] || 0) + Number(s.km || 0); });
  const topDrivers = Object.entries(drivers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, km]) => `${memberName(d)} ${Math.round(km)} km`).join(" · ");
  $("#session-stats").innerHTML = [[carName("EV"), `${Math.round(kmBy("EV"))} km`], [carName("ICE"), `${Math.round(kmBy("ICE"))} km`], ["Sessions", sessions.length], ["Top drivers", topDrivers || "—"]].map(([l, v]) => `<div class="mini-stat"><span>${l}</span><strong>${esc(v)}</strong></div>`).join("");
  $("#sessions-body").innerHTML = sessions.map((s) => {
    const url = safeUrl(s.dataUrl);
    return `<tr><td class="mono">${esc(s.date)}</td><td><span class="plat ${s.car.toLowerCase()}">${esc(carName(s.car))}</span></td><td>${esc(s.type)}<div class="hint">${esc(s.location || "")}</div></td><td>${esc(memberName(s.driverId))}</td><td class="mono">${esc(s.laps || "—")}</td><td class="mono">${esc(s.km)} km</td><td>${s.notes ? `<div class="notes">${esc(s.notes)}</div>` : ""}${(s.issues || []).length ? `<div class="hint">${s.issues.length} issue${s.issues.length > 1 ? "s" : ""}${s.taskProjectId ? ` → tasks in ${esc(read("projects").find((p) => p.id === s.taskProjectId)?.name || "?")}` : ""}: ${esc(s.issues.join("; "))}</div>` : ""}</td><td><button class="link" data-op="car-log" data-id="${s.id}">${s.log ? "Car log" : "Start car log"}</button>${url ? `<a class="link-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Data</a>` : ""}${can("delete", "sessions", s) ? `<button class="link danger" data-action="delete" data-key="sessions" data-id="${s.id}">Delete</button>` : ""}</td></tr>`;
  }).join("");
  $("#sessions-empty").style.display = sessions.length ? "none" : "block";
}
$("#session-form").addEventListener("submit", (e) => {
  e.preventDefault(); const v = formValues(e.target);
  if (v.dataUrl && !safeUrl(v.dataUrl)) return flash("Data links must start with https://, http:// or file:");
  const km = Number(v.km) || 0; const issues = String(v.issues || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const s = { id: id(), date: v.date, car: v.car, type: v.type, location: v.location, driverId: v.driverId, laps: v.laps, km: String(km), notes: v.notes, dataUrl: v.dataUrl, issues, taskProjectId: issues.length ? v.taskProjectId : "", eventId: v.eventId || "", createdBy: me().id, createdAt: new Date().toISOString() };
  write("sessions", [...read("sessions"), s]);
  const worn = km ? applyWear(v.car, km) : 0;
  if (issues.length && v.taskProjectId) {
    const p = read("projects").find((x) => x.id === v.taskProjectId); const assignee = p.pocId || me().id;
    write("tasks", [...read("tasks"), ...issues.map((title) => ({ id: id(), projectId: p.id, title: `[Test ${v.date}] ${title}`, assigneeId: assignee, dueDate: daysFromNow(7), status: "To Do", createdBy: me().id, createdAt: new Date().toISOString() }))]);
    notify(assignee, `${issues.length} issue${issues.length > 1 ? "s" : ""} from the ${v.date} ${v.type} session were added to "${p.name}"`);
  }
  logEvent(`logged a ${v.car} ${v.type} session (${km} km${worn ? `, wear added to ${worn} parts` : ""}${issues.length ? `, ${issues.length} issues` : ""})`);
  e.target.reset(); renderAll();
});
EXT.renders.push(["#session-form", renderSessionForm], ["#sessions-body", renderSessions]);

// =====================================================================
// Part life & inspections, failure log.
// =====================================================================
function lifeState(p) {
  const used = Number(p.kmUsed || 0); const limit = Number(p.lifeLimitKm || 0); const every = Number(p.inspectEveryKm || 0);
  const nextAt = every ? Number(p.lastInspectedKm || 0) + every : null;
  if (limit && used >= limit) return { cls: "bad", text: "Life exceeded — replace", nextAt };
  if (nextAt !== null && used >= nextAt) return { cls: "bad", text: "Inspection overdue", nextAt };
  if (limit && used >= limit * 0.85) return { cls: "warn", text: "Near life limit", nextAt };
  if (nextAt !== null && used >= nextAt - every * 0.15) return { cls: "warn", text: "Inspection due soon", nextAt };
  return { cls: "ok", text: "OK", nextAt };
}
const tracked = () => read("parts").filter((p) => p.safetyCritical || Number(p.lifeLimitKm) || Number(p.inspectEveryKm));
function renderLife() {
  const rows = tracked().sort((a, b) => ({ bad: 0, warn: 1, ok: 2 })[lifeState(a).cls] - ({ bad: 0, warn: 1, ok: 2 })[lifeState(b).cls]);
  $("#life-body").innerHTML = rows.map((p) => {
    const st = lifeState(p); const used = Number(p.kmUsed || 0); const limit = Number(p.lifeLimitKm || 0);
    const canAct = leads(p.subsystem) || isTrainer();
    return `<tr><td class="mono">${esc(p.partNumber || "—")}</td><td>${esc(p.name)}${p.safetyCritical ? ` <span class="sc-chip" title="Safety-critical">SC</span>` : ""}<div class="hint">${esc((p.vehicles || []).join(" · "))} · ${esc(p.system || p.subsystem)} › ${esc(p.assembly || "")}</div></td><td>${limit ? `<div class="progress-row"><div class="progress ${st.cls}"><i style="width:${Math.min(100, used / limit * 100)}%"></i></div><span>${Math.round(used)}/${limit} km</span></div>` : `<span class="mono">${Math.round(used)} km</span>`}</td><td class="mono">${st.nextAt !== null ? `${st.nextAt} km` : "—"}${p.lastInspectedAt ? `<div class="hint">last ${esc(p.lastInspectedAt.slice(0, 10))}</div>` : ""}</td><td><span class="life ${st.cls}">${st.text}</span></td><td>${canAct ? `<button class="link" data-op="inspect" data-id="${p.id}">Log inspection</button><button class="link" data-op="replace" data-id="${p.id}">Replaced</button>` : ""}<button class="link danger" data-op="fail" data-id="${p.id}">Log failure</button></td></tr>`;
  }).join("");
  $("#life-empty").style.display = rows.length ? "none" : "block";
  const fails = [...read("failures")].reverse();
  $("#failures-body").innerHTML = fails.map((f) => `<tr><td class="mono">${esc(f.date)}</td><td>${esc(read("parts").find((p) => p.id === f.partId)?.name || f.partName || "?")}</td><td><span class="life ${f.severity === "Critical" ? "bad" : f.severity === "Major" ? "warn" : "ok"}">${esc(f.severity)}</span></td><td>${esc(f.description)}${f.km ? `<div class="hint">at ${esc(f.km)} km</div>` : ""}</td><td>${esc(memberName(f.by))}</td></tr>`).join("");
  $("#failures-empty").style.display = fails.length ? "none" : "block";
}
OPS.inspect = (b) => {
  const parts = read("parts"); const p = parts.find((x) => x.id === b.dataset.id); if (!p) return;
  openForm(`Log inspection: ${p.name}`, [["result", "Result", "select", ["Pass", "Pass with notes", "Fail — replace"]], ["notes", "Notes", "textarea"]], {}, (v) => {
    p.lastInspectedKm = String(Number(p.kmUsed || 0)); p.lastInspectedAt = new Date().toISOString(); p.lastInspectedBy = me().id;
    if (v.result === "Fail — replace") p.status = "Damaged";
    write("parts", parts); logEvent(`inspected ${p.name} at ${Math.round(p.kmUsed || 0)} km: ${v.result}${v.notes ? ` (${v.notes})` : ""}`); renderAll();
  });
};
OPS.replace = (b) => {
  const parts = read("parts"); const p = parts.find((x) => x.id === b.dataset.id); if (!p) return;
  if (!confirm(`Mark ${p.name} as replaced? This resets its km to 0.`)) return;
  p.kmUsed = "0"; p.lastInspectedKm = "0"; p.lastInspectedAt = new Date().toISOString(); p.status = "Installed";
  write("parts", parts); logEvent(`replaced ${p.name}; life reset`); renderAll();
};
OPS.fail = (b) => {
  const parts = read("parts"); const p = parts.find((x) => x.id === b.dataset.id); if (!p) return;
  openForm(`Log failure: ${p.name}`, [["severity", "Severity", "select", ["Minor", "Major", "Critical"]], ["description", "What happened", "textarea"], ["markDamaged", "Mark the part Damaged", "checkbox"]], { markDamaged: true }, (v) => {
    write("failures", [...read("failures"), { id: id(), partId: p.id, partName: p.name, severity: v.severity, description: v.description, km: p.kmUsed || "", date: todayISO(), by: me().id }]);
    if (v.markDamaged) { p.status = "Damaged"; write("parts", parts); }
    notify(read("team").filter((m) => leads(p.subsystem, m) && !m.roles.includes("Admin") || (m.leads || []).some((t) => SUBTEAMS[t]?.subsystem === p.subsystem)).map((m) => m.id), `${v.severity} failure logged on ${p.name}: ${v.description}`);
    logEvent(`logged a ${v.severity.toLowerCase()} failure on ${p.name}`); renderAll();
  });
};
EXT.renders.push(["#life-body", renderLife]);

// =====================================================================
// Training sign-offs. Machines and some tools need a sign-off before use.
// =====================================================================
const DEFAULT_TRAININGS = [["safety", "Shop safety orientation"], ["manual-mill", "Manual mill"], ["manual-lathe", "Manual lathe"], ["cnc-mill", "CNC mill"], ["waterjet", "Waterjet"], ["tig", "TIG welding"], ["composites", "Composites layup"], ["hv", "HV safety (EV)"], ["torque", "Torque & safety-wire"]];
function ensureTrainings() { if (!read("trainings").length) write("trainings", DEFAULT_TRAININGS.map(([tid, name]) => ({ id: tid, name }))); }
const trained = (memberId, trainingId) => !trainingId || read("signoffs").some((s) => s.memberId === memberId && s.trainingId === trainingId);
let trainingSubteam = SUBTEAMS[new URLSearchParams(location.search).get("subteam")] ? new URLSearchParams(location.search).get("subteam") : "";
function renderTraining() {
  const trainings = read("trainings"); const signoffs = read("signoffs"); const canSign = isTrainer();
  const sel = $("#training-subteam"); sel.innerHTML = `<option value="">Everyone</option>` + Object.keys(SUBTEAMS).map((t) => `<option ${t === trainingSubteam ? "selected" : ""}>${esc(t)}</option>`).join("");
  const people = teamSorted().filter((m) => !trainingSubteam || (m.subteams || []).includes(trainingSubteam));
  $("#training-head").innerHTML = `<tr><th>Member</th>${trainings.map((t) => `<th class="rot"><span>${esc(t.name)}</span></th>`).join("")}</tr>`;
  $("#training-body").innerHTML = people.map((m) => `<tr><td>${esc(m.name)}</td>${trainings.map((t) => { const s = signoffs.find((x) => x.memberId === m.id && x.trainingId === t.id); return `<td class="cell">${canSign ? `<button class="tcell${s ? " on" : ""}" data-op="signoff" data-member="${m.id}" data-training="${t.id}" title="${s ? `Signed off by ${esc(memberName(s.by))} on ${esc(s.at.slice(0, 10))}` : "Not signed off"}">${s ? "✓" : ""}</button>` : s ? `<span class="tcell on" title="${esc(s.at.slice(0, 10))}">✓</span>` : `<span class="tcell"></span>`}</td>`; }).join("")}</tr>`).join("");
  $("#training-note").textContent = canSign ? "Click a cell to sign someone off (or remove a sign-off)." : "Shop Leads and the Chief Mechanic sign people off.";
}
$("#training-subteam").addEventListener("change", (e) => { trainingSubteam = e.target.value; renderTraining(); });
OPS.signoff = (b) => {
  if (!isTrainer()) return flash("Only Shop Leads, the Chief Mechanic or an Admin can sign people off.");
  const { member, training } = b.dataset; const list = read("signoffs"); const i = list.findIndex((s) => s.memberId === member && s.trainingId === training);
  const tName = read("trainings").find((t) => t.id === training)?.name;
  if (i >= 0) { list.splice(i, 1); logEvent(`removed ${memberName(member)}'s ${tName} sign-off`); }
  else { list.push({ memberId: member, trainingId: training, by: me().id, at: new Date().toISOString() }); logEvent(`signed off ${memberName(member)} on ${tName}`); notify(member, `You were signed off on ${tName}`); }
  write("signoffs", list); renderAll();
};
// A shop job can't start until its machinist is signed off on the machine.
EXT.before.push((action, key, row) => {
  if (action === "advance" && key === "jobs" && row.status === "Queued" && row.machine && MACHINES[row.machine]) {
    if (!row.ownerId) return "Assign a machinist before starting this job.";
    if (!trained(row.ownerId, MACHINES[row.machine])) return `${memberName(row.ownerId)} isn't signed off on the ${row.machine} yet.`;
  }
  return "";
});
EXT.renders.push(["#training-body", renderTraining]);

// =====================================================================
// Stock & tools: check-out / check-in, consumable use, reorder requests, QR labels.
// =====================================================================
const available = (item) => Number(item.qty || 0) - (item.kind === "Tool" || item.kind === "Safety gear" ? (item.checkouts || []).length : 0);
let stockQuery = ""; let stockKind = "";
function renderStock() {
  const items = read("stock").filter((i) => (!stockKind || i.kind === stockKind) && (!stockQuery || [i.name, i.location, i.kind].join(" ").toLowerCase().includes(stockQuery)));
  const u = me();
  $("#stock-body").innerHTML = items.map((i) => {
    const lendable = i.kind === "Tool" || i.kind === "Safety gear"; const low = !lendable && Number(i.minQty) && Number(i.qty) <= Number(i.minQty);
    const out = (i.checkouts || []).map((c) => `<span class="person-chip${c.memberId === u.id ? " poc" : ""}" title="since ${esc(c.at.slice(0, 10))}">${esc(memberName(c.memberId))}${c.dueBack && c.dueBack < todayISO() ? " · overdue" : ""}</span>`).join(" ");
    const acts = [];
    if (lendable && available(i) > 0) acts.push(`<button class="link" data-op="checkout" data-id="${i.id}">Check out</button>`);
    if (lendable && (i.checkouts || []).some((c) => c.memberId === u.id)) acts.push(`<button class="link" data-op="checkin" data-id="${i.id}">Check in</button>`);
    if (lendable && (i.checkouts || []).length && isTrainer(u)) acts.push(`<button class="link" data-op="checkin-any" data-id="${i.id}">Return…</button>`);
    if (!lendable) acts.push(`<button class="link" data-op="use" data-id="${i.id}">Use</button>`);
    if (low && !i.reorderPurchaseId) acts.push(`<button class="link" data-op="reorder" data-id="${i.id}">Reorder</button>`);
    if (canEdit("stock", i)) acts.push(`<button class="link" data-op="edit" data-key="stock" data-id="${i.id}">Edit</button>`);
    if (can("delete", "stock", i)) acts.push(`<button class="link danger" data-action="delete" data-key="stock" data-id="${i.id}">Delete</button>`);
    const tr = i.training && read("trainings").find((t) => t.id === i.training);
    return `<tr id="stock-${i.id}"><td><input type="checkbox" class="label-pick" value="${i.id}" aria-label="Select for label" /></td><td><strong>${esc(i.name)}</strong>${tr ? `<div class="hint">needs ${esc(tr.name)}</div>` : ""}</td><td>${esc(i.kind)}</td><td>${esc(i.location || "—")}</td><td class="mono ${low ? "overdue-text" : ""}">${lendable ? `${available(i)}/${esc(i.qty)}` : esc(i.qty)}${low ? `<div class="hint bad">at/below min ${esc(i.minQty)}</div>` : ""}${i.reorderPurchaseId ? `<div class="hint">reorder requested</div>` : ""}</td><td>${out || "—"}</td><td>${acts.join("")}</td></tr>`;
  }).join("");
  $("#stock-empty").style.display = items.length ? "none" : "block";
  const all = read("stock");
  $("#stock-summary").innerHTML = [["Items", all.length], ["Checked out", all.reduce((n, i) => n + (i.checkouts || []).length, 0)], ["Low stock", all.filter((i) => i.kind !== "Tool" && i.kind !== "Safety gear" && Number(i.minQty) && Number(i.qty) <= Number(i.minQty)).length], ["Overdue returns", all.reduce((n, i) => n + (i.checkouts || []).filter((c) => c.dueBack && c.dueBack < todayISO()).length, 0)]].map(([l, v]) => `<div class="mini-stat"><span>${l}</span><strong>${v}</strong></div>`).join("");
  $("#stock-form-card").classList.toggle("hidden", !can("create", "stock"));
}
function stockUpdate(itemId, fn) { const list = read("stock"); const i = list.find((x) => x.id === itemId); if (!i) return; fn(i); write("stock", list); renderAll(); }
OPS.checkout = (b) => {
  const item = read("stock").find((x) => x.id === b.dataset.id); const u = me();
  if (!trained(u.id, "safety")) return flash("Complete the shop safety orientation before checking out tools.");
  if (item.training && !trained(u.id, item.training)) return flash(`You need the ${read("trainings").find((t) => t.id === item.training)?.name} sign-off for this.`);
  stockUpdate(item.id, (i) => { i.checkouts = [...(i.checkouts || []), { memberId: u.id, at: new Date().toISOString(), dueBack: daysFromNow(3) }]; });
  logEvent(`checked out ${item.name}`);
};
OPS.checkin = (b) => stockUpdate(b.dataset.id, (i) => { const k = (i.checkouts || []).findIndex((c) => c.memberId === me().id); if (k >= 0) i.checkouts.splice(k, 1); logEvent(`checked in ${i.name}`); });
OPS["checkin-any"] = (b) => {
  const item = read("stock").find((x) => x.id === b.dataset.id);
  openForm(`Return ${item.name}`, [["memberId", "Returned by", "select", (item.checkouts || []).map((c) => [c.memberId, memberName(c.memberId)])]], {}, (v) => stockUpdate(item.id, (i) => { const k = i.checkouts.findIndex((c) => c.memberId === v.memberId); if (k >= 0) i.checkouts.splice(k, 1); logEvent(`checked in ${i.name} for ${memberName(v.memberId)}`); }));
};
OPS.use = (b) => {
  const item = read("stock").find((x) => x.id === b.dataset.id);
  openForm(`Use ${item.name}`, [["amount", `How many (have ${item.qty})`, "number"]], { amount: 1 }, (v) => {
    const n = Number(v.amount) || 0; if (n <= 0) return;
    stockUpdate(item.id, (i) => { i.qty = String(Math.max(0, Number(i.qty) - n)); }); logEvent(`used ${n} × ${item.name}`);
  });
};
OPS.reorder = (b) => {
  const list = read("stock"); const i = list.find((x) => x.id === b.dataset.id);
  const qty = Math.max(1, Number(i.minQty) * 2 - Number(i.qty));
  const req = { id: id(), item: `Restock: ${i.name} × ${qty}`, vendor: i.vendor || "TBD", amount: String((Number(i.unitCost || 0) * qty).toFixed(2)), neededBy: daysFromNow(10), status: "Requested", category: "", stockId: i.id, createdBy: me().id, createdAt: new Date().toISOString() };
  write("purchases", [...read("purchases"), req]); i.reorderPurchaseId = req.id; write("stock", list);
  logEvent(`requested a restock of ${i.name} (${qty})`); flash("Purchase request created in Purchasing."); renderAll();
};
// When a restock purchase is received, add it to stock.
EXT.after.push((action, key, row) => {
  if (action === "advance" && key === "purchases" && row.status === "Received" && row.stockId) {
    const n = parseInt(String(row.item).split("×").pop(), 10) || 0;
    stockUpdate(row.stockId, (i) => { i.qty = String(Number(i.qty) + n); i.reorderPurchaseId = ""; });
    logEvent(`received restock: ${row.item}`);
  }
});
$("#stock-form").addEventListener("submit", (e) => {
  e.preventDefault(); if (!can("create", "stock")) return;
  const v = formValues(e.target);
  write("stock", [...read("stock"), { ...v, id: id(), checkouts: [], createdBy: me().id, createdAt: new Date().toISOString() }]);
  logEvent(`added ${v.name} to stock`); e.target.reset(); renderAll();
});
$("#stock-search").addEventListener("input", (e) => { stockQuery = e.target.value.trim().toLowerCase(); renderStock(); });
$("#stock-kind").addEventListener("change", (e) => { stockKind = e.target.value; renderStock(); });
function renderStockForm() { const el = $("#stock-training"); const cur = el.value; el.innerHTML = opts.trainings().map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join(""); el.value = cur; }
EXT.renders.push(["#stock-training", renderStockForm], ["#stock-body", renderStock]);
EXT.inbox.push((u) => [
  ...read("stock").flatMap((i) => (i.checkouts || []).filter((c) => c.memberId === u.id && c.dueBack && c.dueBack < todayISO()).map(() => `Return ${i.name} to ${i.location || "the shop"} (overdue)`)),
  ...(isTrainer(u) ? read("stock").filter((i) => i.kind !== "Tool" && i.kind !== "Safety gear" && Number(i.minQty) && Number(i.qty) <= Number(i.minQty) && !i.reorderPurchaseId).map((i) => `Stock: ${i.name} is low (${i.qty} left)`) : [])
]);

// QR labels. Codes read "MERP:stock:<id>" / "MERP:part:<id>"; a USB/Bluetooth scanner types them into the scan box.
function qrSvg(text) {
  if (typeof qrcode !== "function") return `<div class="noqr">QR library didn't load (needs an internet connection)</div>`;
  const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
}
function printLabels(items) {
  if (!items.length) return flash("Pick at least one item to label.");
  const w = window.open("", "_blank"); if (!w) return flash("Allow pop-ups to print labels.");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>body{font-family:Inter,system-ui,sans-serif;margin:12mm}.grid{display:grid;grid-template-columns:repeat(3,62mm);gap:6mm}.label{border:1px dashed #999;border-radius:3mm;padding:3mm;display:grid;grid-template-columns:22mm 1fr;gap:3mm;align-items:center;break-inside:avoid}.label svg{width:22mm;height:22mm}.name{font-weight:700;font-size:10pt}.meta{font-size:8pt;color:#555;margin-top:1mm}.code{font:7pt monospace;color:#888;margin-top:1mm;word-break:break-all}</style></head><body><div class="grid">${items.map((i) => `<div class="label">${qrSvg(i.code)}<div><div class="name">${esc(i.title)}</div><div class="meta">${esc(i.sub)}</div><div class="code">${esc(i.code)}</div></div></div>`).join("")}</div><script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
$("#stock-labels").addEventListener("click", () => {
  const picked = [...document.querySelectorAll(".label-pick:checked")].map((c) => c.value);
  const list = read("stock").filter((i) => !picked.length || picked.includes(i.id));
  printLabels(list.map((i) => ({ code: `MERP:stock:${i.id}`, title: i.name, sub: `${i.kind}${i.location ? " · " + i.location : ""}` })));
});
$("#part-labels").addEventListener("click", () => printLabels(read("parts").filter((p) => p.partNumber).map((p) => ({ code: `MERP:part:${p.id}`, title: p.name, sub: `${p.partNumber} · ${p.assembly || p.subsystem}` }))));
$("#scan-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return; const code = e.target.value.trim(); e.target.value = "";
  const m = code.match(/^MERP:(stock|part):(.+)$/); if (!m) return flash("Not a MotorsportERP label.");
  if (m[1] === "stock") { const row = $(`#stock-${CSS.escape(m[2])}`); if (!row) return flash("That item isn't in stock any more."); stockKind = ""; stockQuery = ""; row.scrollIntoView({ block: "center" }); row.classList.add("flash-row"); setTimeout(() => row.classList.remove("flash-row"), 2000); }
  else { const p = read("parts").find((x) => x.id === m[2]); if (!p) return flash("That part isn't in the BOM any more."); if (!onPage("#parts-body")) { location.href = `${PAGE_FILES.parts}?find=${encodeURIComponent(p.partNumber || p.name)}`; return; } $("#part-search").value = p.partNumber || p.name; renderParts(); }
});

// =====================================================================
// Demo data for the modules above.
// =====================================================================
EXT.seeds.push((team) => {
  const byName = (n) => team.find((m) => m.name === n); const parts = read("parts"); const part = (n) => parts.find((p) => p.name === n);
  // Part life limits and inspection intervals.
  const life = { "Front upright": [3000, 500, true], "Wheel hub": [0, 400, true], "Halfshafts": [2000, 300, true], "Brake rotor": [1500, 0, true], "Rocker": [0, 600, true], "Steering rack": [0, 500, true], "Damper": [0, 800, false], "Chain & sprockets": [900, 250, false], "Wishbone set": [0, 500, true], "Master cylinder": [0, 0, true] };
  parts.forEach((p) => { const l = life[p.name]; if (l) { p.lifeLimitKm = l[0] ? String(l[0]) : ""; p.inspectEveryKm = l[1] ? String(l[1]) : ""; p.safetyCritical = l[2]; p.kmUsed = "0"; p.lastInspectedKm = "0"; } if (["Front upright", "Rocker", "Wishbone set"].includes(p.name)) { p.processCost = "45"; p.fastenerCost = "6"; } if (p.name === "Steel spaceframe") { p.unitCost = "1850"; p.processCost = "900"; p.toolingCost = "400"; } if (p.name === "Front wing" || p.name === "Rear wing") { p.unitCost = "640"; p.toolingCost = "300"; } });
  // Several parts on the cars are installed even though the demo BOM lists them elsewhere; make wear land on the tracked ones.
  ["Front upright", "Rocker", "Chain & sprockets"].forEach((n) => parts.filter((p) => p.name === n).forEach((p) => { p.status = "Installed"; }));
  write("parts", parts);
  // Test sessions (wear is applied as they're logged).
  const drivers = team.filter((m) => (m.subteams || []).includes("Vehicle Dynamics")).slice(0, 3);
  const sessions = [[-38, "ICE", "Shakedown", 18, 22], [-31, "EV", "Shakedown", 14, 15], [-24, "ICE", "Skidpad", 40, 31], [-17, "EV", "Autocross", 22, 64], [-10, "ICE", "Endurance", 22, 88], [-4, "EV", "Endurance", 22, 96]];
  write("sessions", sessions.map(([d, car, type, laps, km], i) => { applyWear(car, km); return { id: id(), date: daysFromNow(d), car, type, location: i % 2 ? "Campus lot" : "Regional kart track", driverId: drivers[i % drivers.length]?.id || "", laps: String(laps), km: String(km), notes: ["Baseline setup, ride heights checked", "Inverter derate after 6 laps", "Front-limited mid corner; try +1 click rebound", "Good pace; brake bias 58% front", "Oil temp high in last third", "Accumulator held under 52 °C"][i], dataUrl: "", issues: i === 1 ? ["Inverter derates when hot"] : i === 4 ? ["Oil temp high in last third of endurance"] : [], taskProjectId: "", createdBy: drivers[0]?.id || team[0].id, createdAt: new Date().toISOString() }; }));
  const p2 = read("parts"); const ins = p2.find((p) => p.name === "Halfshafts"); if (ins) { ins.lastInspectedKm = "150"; ins.lastInspectedAt = new Date(Date.now() - 20 * 864e5).toISOString(); } write("parts", p2);
  write("failures", [{ id: id(), partId: part("Chain & sprockets")?.id || "", partName: "Chain & sprockets", severity: "Major", description: "Chain stretched past limit; rear sprocket teeth hooked", km: "160", date: daysFromNow(-10), by: drivers[0]?.id || team[0].id }]);
  // Trainings + sign-offs.
  ensureTrainings(); const shopLead = byName("Ava Patel")?.id || team[0].id; const sign = [];
  team.forEach((m, i) => {
    const has2 = (t) => (m.subteams || []).includes(t); const add = (tid) => sign.push({ memberId: m.id, trainingId: tid, by: shopLead, at: new Date(Date.now() - (i % 40 + 5) * 864e5).toISOString() });
    if (i % 7 !== 3) add("safety");
    if (has2("Manufacturing") || m.title === "Chief Mechanic") { add("manual-mill"); add("manual-lathe"); add("cnc-mill"); }
    if (has2("Frame") && i % 2) add("tig"); if (has2("Suspension") && i % 3 === 0) add("manual-mill");
    if (has2("Composites") || has2("Aerodynamics") && i % 2) add("composites");
    if (has2("EV Powertrain") || has2("Low Voltage")) add("hv");
    if (i % 4 === 0) add("torque");
  });
  write("signoffs", sign);
  // Shop jobs: machinists, machines, hours, and part links.
  const jobs = read("jobs"); const jmap = { "Rear rocker set": ["Ava Patel", "CNC mill", 6, "Rocker"], "Steering shaft spacer": ["Sam Ortiz", "Manual lathe", 1.5, "Steering rack"], "Brake caliper bracket": ["Ava Patel", "Manual mill", 3, "Caliper"] };
  jobs.forEach((j) => { const m = jmap[j.name]; if (m) { j.ownerId = byName(m[0])?.id || ""; j.machine = m[1]; j.hours = String(m[2]); j.partId = part(m[3])?.id || ""; } });
  write("jobs", jobs);
  // Purchases: budgets + project links.
  const projects = read("projects"); const proj = (n) => projects.find((p) => p.name === n)?.id || "";
  const purchases = read("purchases"); const pmap = { "7075-T6 plate, 12 mm": ["Suspension", "Lightweight front upright", "Front upright"], "M8 titanium fastener kit": ["Suspension", "", ""], "High-voltage gloves": ["Safety equipment", "", ""] };
  purchases.forEach((x) => { const m = pmap[x.item]; if (m) { x.category = m[0]; x.projectId = proj(m[1]); x.partId = part(m[2])?.id || ""; } });
  purchases.push({ id: id(), item: "Accumulator duct fans (×4)", vendor: "Digi-Key", amount: "184", neededBy: daysFromNow(9), status: "Received", category: "Electrical", projectId: proj("Accumulator cooling redesign"), partId: part("Accumulator")?.id || "", createdBy: byName("Priya Singh")?.id || "", createdAt: new Date().toISOString() });
  purchases.push({ id: id(), item: "Carbon pre-preg roll, 5 m²", vendor: "Composites supplier", amount: "720", neededBy: daysFromNow(21), status: "Quoted", category: "", projectId: proj("Carbon steering wheel"), partId: "", createdBy: team.find((m) => (m.leads || []).includes("Composites"))?.id || "", createdAt: new Date().toISOString() });
  write("purchases", purchases);
  // Stock & tools.
  const sid = () => id();
  write("stock", [
    { id: sid(), name: "Torque wrench 10–60 Nm", kind: "Tool", qty: "2", minQty: "", location: "Tool wall A3", unitCost: "180", vendor: "", training: "torque", checkouts: [{ memberId: drivers[0]?.id || team[8].id, at: new Date(Date.now() - 5 * 864e5).toISOString(), dueBack: daysFromNow(-2) }] },
    { id: sid(), name: "Digital calipers 150 mm", kind: "Tool", qty: "4", minQty: "", location: "Metrology drawer", unitCost: "35", vendor: "", training: "", checkouts: [{ memberId: team[12].id, at: new Date().toISOString(), dueBack: daysFromNow(3) }] },
    { id: sid(), name: "Safety-wire pliers", kind: "Tool", qty: "3", minQty: "", location: "Tool wall A1", unitCost: "28", vendor: "", training: "torque", checkouts: [] },
    { id: sid(), name: "HV insulated gloves (Class 0)", kind: "Safety gear", qty: "3", minQty: "", location: "HV cabinet", unitCost: "96", vendor: "McMaster-Carr", training: "hv", checkouts: [] },
    { id: sid(), name: "Insulation tester", kind: "Tool", qty: "1", minQty: "", location: "HV cabinet", unitCost: "420", vendor: "", training: "hv", checkouts: [] },
    { id: sid(), name: "M6×20 12.9 bolts", kind: "Consumable", qty: "38", minQty: "50", location: "Bin F-06", unitCost: "0.42", vendor: "Fastenal", training: "", checkouts: [] },
    { id: sid(), name: "Safety wire 0.032\"", kind: "Consumable", qty: "3", minQty: "2", location: "Bin F-20", unitCost: "14", vendor: "McMaster-Carr", training: "", checkouts: [] },
    { id: sid(), name: "DOT 4 brake fluid (1 L)", kind: "Consumable", qty: "1", minQty: "2", location: "Fluids shelf", unitCost: "18", vendor: "Auto parts store", training: "", checkouts: [] },
    { id: sid(), name: "Carbon pre-preg (m²)", kind: "Consumable", qty: "6", minQty: "4", location: "Freezer", unitCost: "144", vendor: "Composites supplier", training: "composites", checkouts: [] },
    { id: sid(), name: "Rod end M8 (spare)", kind: "Spare part", qty: "6", minQty: "4", location: "Bin S-02", unitCost: "22", vendor: "", training: "", checkouts: [] },
    { id: sid(), name: "CAN node board (spare)", kind: "Spare part", qty: "2", minQty: "2", location: "Electronics lab", unitCost: "35", vendor: "", training: "", checkouts: [] },
    { id: sid(), name: "Nitrile gloves (box)", kind: "Consumable", qty: "9", minQty: "4", location: "Entry shelf", unitCost: "12", vendor: "", training: "", checkouts: [] }
  ].map((x) => ({ ...x, createdBy: shopLead, createdAt: new Date().toISOString() })));
  // Backdate approved projects so the timeline shows real bars.
  write("projects", read("projects").map((p, i) => (p.status === "Proposed" || p.status === "Rejected" ? p : { ...p, approvedAt: new Date(Date.now() - (25 + i * 9) * 864e5).toISOString() })));
  write("notifications", [
    { id: id(), userId: team[0].id, text: "Project \"Carbon steering wheel\" needs approval", at: new Date(Date.now() - 36e5).toISOString(), read: false, by: "System" },
    { id: id(), userId: team[0].id, text: "Restock needed: M6×20 12.9 bolts", at: new Date(Date.now() - 72e5).toISOString(), read: true, by: "System" }
  ]);
});

ensureTrainings();
// Arrivals from another page: a pending "Order" or a scanned part. Called from boot.js after the first render.
function handleArrivals() {
try { const pending = sessionStorage.getItem("merp-order-part"); if (pending && onPage("#purchase-form")) { sessionStorage.removeItem("merp-order-part"); orderPart(pending); } } catch { /* storage blocked */ }
const findParam = new URLSearchParams(location.search).get("find");
if (findParam && onPage("#part-search")) { $("#part-search").value = findParam; renderParts(); }
}
