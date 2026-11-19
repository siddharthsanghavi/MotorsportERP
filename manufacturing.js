// Manufacturing (machine-shop.html): anyone can request a part to be machined; each job runs through the
// shop checklist; tooling and consumables have order links (main + alternate) and ping the manufacturing
// lead when they run low. Loaded after vehicles.js.

const mfgLeads = () => read("team").filter((m) => (m.leads || []).includes("Manufacturing"));
const isMfgLead = (u = me()) => !!u.id && ((u.leads || []).includes("Manufacturing") || has("Admin", u));
const isShopBoss = (u = me()) => isMfgLead(u) || has("Shop Lead", u);
const partLeadIds = (job) => {
  const p = read("parts").find((x) => x.id === job.partId); if (!p) return [];
  return read("team").filter((m) => (m.leads || []).some((t) => SUBTEAMS[t]?.subsystem === p.subsystem)).map((m) => m.id);
};

// [text, who can tick: "lead" = manufacturing lead only, "shop" = machinist or lead]
const JOB_STEPS = [
  ["Manufacturing lead fills out the job (machinist, machine, material, tolerances)", "lead"],
  ["Add the part to Fusion Hub in its own folder (or the existing part folder)", "shop"],
  ["CAM the part and get it approved by the manufacturing lead (in the dev parts folder)", "lead"],
  ["Run the jobs on the associated machine", "shop"],
  ["Deburr and check each one is in tolerance", "shop"],
  ["Put in a labelled bag in the middle red cabinet", "shop"],
  ["Tell the responsible lead/engineer and the manufacturing lead in part-update that it's done", "shop"]
];
// Status follows the checklist: running the job starts it, the tolerance check is QC, the last step completes it.
const STATUS_AT = { 3: "In Progress", 4: "Quality Check", 6: "Complete" };

const jobDone = (job) => (job.checklist || []).filter(Boolean).length;
function canTick(job, k, u = me()) {
  if (!u.id) return false;
  if (JOB_STEPS[k][1] === "lead") return isShopBoss(u);
  return job.ownerId === u.id || isShopBoss(u);
}
function jobChecklistCell(job) {
  const done = jobDone(job); const nextK = (job.checklist || []).findIndex((x) => !x); const cur = nextK < 0 ? (job.checklist || []).length : nextK;
  const items = JOB_STEPS.map(([text, who], k) => {
    const s = (job.checklist || [])[k]; const mine = !s && k === cur && canTick(job, k);
    return `<li class="${s ? "done" : ""}${k === cur ? " current" : ""}"><button class="tick" ${mine || (s && canTick(job, k) && k === cur - 1) ? "" : "disabled"} data-op="job-step" data-id="${job.id}" data-step="${k}" aria-label="${s ? "Undo" : "Mark done"}">${s ? "✓" : ""}</button><span>${esc(text)}${who === "lead" ? ' <span class="pill">lead</span>' : ""}${s ? `<small>${esc(memberName(s.by))} · ${esc(s.at.slice(0, 10))}</small>` : ""}</span></li>`;
  }).join("");
  return `<details class="job-check"><summary><span class="progress"><i style="width:${done / JOB_STEPS.length * 100}%"></i></span>${done}/${JOB_STEPS.length}</summary><ol>${items}</ol></details>`;
}
OPS["job-step"] = (b) => {
  const jobs = read("jobs"); const job = jobs.find((j) => j.id === b.dataset.id); const k = Number(b.dataset.step); if (!job) return;
  job.checklist = JOB_STEPS.map((_, i) => (job.checklist || [])[i] || null);
  if (!canTick(job, k)) return flash(JOB_STEPS[k][1] === "lead" ? "Only the manufacturing lead can sign off this step." : "Only the machinist or the manufacturing lead can tick this.");
  if (job.checklist[k]) { job.checklist[k] = null; logEvent(`unticked "${JOB_STEPS[k][0]}" on ${job.name}`); }
  else {
    if (k > 0 && !job.checklist[k - 1]) return flash("Do the steps in order.");
    if (k === 0 && !job.ownerId) return flash("Assign a machinist first (Edit the job).");
    if (k === 3) { const err = EXT.before.map((f) => f("advance", "jobs", { ...job, status: "Queued" })).find(Boolean); if (err) return flash(err); }
    job.checklist[k] = { by: me().id, at: new Date().toISOString() }; logEvent(`ticked "${JOB_STEPS[k][0]}" on ${job.name}`);
    if (k === 0 && job.ownerId) notify(job.ownerId, `You're machining ${job.name}`);
    if (k === 2) notify(job.ownerId, `CAM approved for ${job.name}. Go ahead and run it.`);
    if (k === 6) notify([job.createdBy, ...partLeadIds(job), ...mfgLeads().map((m) => m.id)], `part-update: ${job.name} is done and in the middle red cabinet`);
  }
  const last = job.checklist.reduce((m, s, i) => (s ? i : m), -1);
  job.status = Object.entries(STATUS_AT).reduce((s, [i, st]) => (last >= Number(i) ? st : s), "Queued");
  write("jobs", jobs); renderAll();
};

// New requests go to the manufacturing lead.
function notifyNewRequests() {
  const jobs = read("jobs"); const fresh = jobs.filter((j) => !j.leadNotified); if (!fresh.length) return;
  fresh.forEach((j) => { j.leadNotified = true; if (j.createdBy) notify(mfgLeads().map((m) => m.id), `Machining request: ${j.name} from ${memberName(j.createdBy)}${j.dueDate ? `, needed by ${j.dueDate}` : ""}`); });
  write("jobs", jobs);
}
EXT.inbox.push((u) => [
  ...(isMfgLead(u) ? read("jobs").filter((j) => j.status !== "Complete" && !(j.checklist || [])[0]).map((j) => `Manufacturing: fill out the request for ${j.name}`) : []),
  ...(isMfgLead(u) ? read("jobs").filter((j) => (j.checklist || [])[1] && !(j.checklist || [])[2]).map((j) => `Manufacturing: approve the CAM for ${j.name}`) : []),
  ...read("jobs").filter((j) => j.ownerId === u.id && j.status !== "Complete" && (j.checklist || [])[0]).map((j) => `Machining: ${j.name} is at step ${jobDone(j) + 1} of ${JOB_STEPS.length}`),
  ...(isMfgLead(u) ? lowItems().filter((i) => !i.reorderPurchaseId).map((i) => `Low stock: ${i.name} (${i.qty} left, min ${i.minQty})`) : [])
]);
// Leaders can edit jobs too (to assign the machinist and machine).
const _canEdit = canEdit;
canEdit = (key, row) => (key === "jobs" && row && isShopBoss()) || _canEdit(key, row);
EXT.can.push((action, key) => (key === "jobs" && action === "advance" && isShopBoss()) ? true : undefined);

// ---------------------------------------------------------------------
// Tooling & consumables.
// ---------------------------------------------------------------------
const COUNTED = (i) => !["Tool", "Safety gear"].includes(i.kind);
const lowItems = () => read("stock").filter((i) => COUNTED(i) && Number(i.minQty) && Number(i.qty) <= Number(i.minQty));
const link = (url, text) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text);
function renderMfgStock() {
  const items = read("stock").filter((i) => ["Tooling", "Consumable"].includes(i.kind)).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  $("#mfg-stock-body").innerHTML = items.map((i) => {
    const low = Number(i.minQty) && Number(i.qty) <= Number(i.minQty);
    const order = [i.vendor || i.orderUrl ? link(i.orderUrl, i.vendor || "Order") : "", i.altVendor || i.altUrl ? `<span class="hint">alt: ${link(i.altUrl, i.altVendor || "link")}</span>` : ""].filter(Boolean).join("<br>") || '<span class="hint">—</span>';
    const acts = [`<button class="link" data-op="use" data-id="${i.id}">Use</button>`, low && !i.reorderPurchaseId ? `<button class="link" data-op="reorder" data-id="${i.id}">Reorder</button>` : "", canEdit("stock", i) ? `<button class="link" data-op="edit" data-key="stock" data-id="${i.id}">Edit</button>` : ""].join("");
    return `<tr><td><strong>${esc(i.name)}</strong></td><td>${esc(i.kind)}</td><td>${esc(i.location || "—")}</td><td class="mono ${low ? "overdue-text" : ""}">${esc(i.qty)}${i.minQty ? ` <span class="hint">/ min ${esc(i.minQty)}</span>` : ""}${i.reorderPurchaseId ? `<div class="hint">reorder requested</div>` : ""}</td><td>${order}</td><td>${acts}</td></tr>`;
  }).join("");
  $("#mfg-stock-empty").style.display = items.length ? "none" : "block";
  $("#mfg-stock-form").classList.toggle("hidden", !can("create", "stock"));
}
// Ping the manufacturing lead once when an item drops to its minimum; reset when it's back above.
function checkLowStock() {
  const list = read("stock"); let changed = false;
  list.forEach((i) => {
    const low = COUNTED(i) && Number(i.minQty) && Number(i.qty) <= Number(i.minQty);
    if (low && !i.lowPinged) { i.lowPinged = true; changed = true; notify(mfgLeads().map((m) => m.id), `Low stock: ${i.name} is down to ${i.qty} (min ${i.minQty}). Reorder from ${i.vendor || "the usual vendor"}${i.altVendor ? ` or ${i.altVendor}` : ""}.`); }
    if (!low && i.lowPinged) { i.lowPinged = false; changed = true; }
  });
  if (changed) write("stock", list);
}
$("#mfg-stock-form").addEventListener("submit", (e) => {
  e.preventDefault(); if (!can("create", "stock")) return;
  const v = Object.fromEntries(new FormData(e.target));
  write("stock", [...read("stock"), { ...v, id: id(), checkouts: [], training: "", createdBy: me().id, createdAt: new Date().toISOString() }]);
  logEvent(`added ${v.name} to ${v.kind.toLowerCase()}`); e.target.reset(); renderAll();
});
const _stockFields = EDIT_FIELDS.stock;
EDIT_FIELDS.stock = (row) => _stockFields(row).map((f) => f[0] === "kind" ? ["kind", "Kind", "select", ["Tool", "Tooling", "Consumable", "Spare part", "Safety gear"]] : f).concat([["orderUrl", "Order link", "url"], ["altVendor", "Alternate vendor", "text"], ["altUrl", "Alternate order link", "url"]]);

// Demo: order links on the shop consumables, some tooling, and the checklist part-way through on the demo jobs.
EXT.seeds.push((team) => {
  const stock = read("stock"); const by = mfgLeads()[0]?.id || team[0].id;
  const extra = { "M6×20 12.9 bolts": ["Fastenal", "McMaster-Carr"], "Safety wire 0.032\"": ["McMaster-Carr", "Aircraft supply shop"], "Nitrile gloves (box)": ["", "Hardware store"] };
  stock.forEach((i) => { const x = extra[i.name]; if (x) { i.altVendor = x[1]; } });
  stock.push(...[["6 mm 3-flute carbide end mill", "4", "3", "Tooling drawer T1"], ["10 mm 3-flute carbide end mill", "2", "2", "Tooling drawer T1"], ["CCMT 06 turning inserts (10)", "5", "2", "Lathe drawer"], ["M5 nyloc nuts", "120", "50", "Bin F-04"]].map(([name, qty, minQty, location], k) => ({ id: id(), name, kind: k < 3 ? "Tooling" : "Consumable", qty, minQty, location, unitCost: k < 3 ? "24" : "0.08", vendor: k < 3 ? "Tooling supplier" : "Fastenal", altVendor: k < 3 ? "Industrial supply" : "McMaster-Carr", training: "", checkouts: [], createdBy: by, createdAt: new Date().toISOString() })));
  write("stock", stock);
  const jobs = read("jobs"); const at = (d) => ({ by, at: new Date(Date.now() - d * 864e5).toISOString() });
  jobs.forEach((j, n) => { const steps = [4, 0, 5][n] ?? 0; j.checklist = JOB_STEPS.map((_, k) => (k < steps ? at(6 - k) : null)); j.leadNotified = true; j.status = Object.entries(STATUS_AT).reduce((s, [i, st]) => (steps - 1 >= Number(i) ? st : s), "Queued"); });
  write("jobs", jobs);
});

EXT.renders.push(() => { notifyNewRequests(); checkLowStock(); }, ["#mfg-stock-body", renderMfgStock]);
