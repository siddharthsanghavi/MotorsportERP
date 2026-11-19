// Funding accounts and purchase attribution. Every purchase records its submit date, the budget it counts
// against and the fund (account) the money comes from; an Admin approves the funds before it can be ordered.
// Budget spend comes only from purchases. Loaded after carlog.js.
Object.assign(KEYS, { funds: "motorsport-erp-funds" });
nouns.funds = "funding account";
const DEFAULT_FUNDS = ["KSU Foundation", "Fund 1300", "Johnson", "Department", "Team total", "PayPal"];
const SPENT = ["Ordered", "Received"];

const funds = () => read("funds");
const fundName = (fid) => funds().find((f) => f.id === fid)?.name || "";
const canManageFunds = (u = me()) => has("Admin", u) || has("Budget Manager", u);
function ensureFunds() { if (!read("funds").length) write("funds", DEFAULT_FUNDS.map((name) => ({ id: id(), name, balance: "", notes: "" }))); }
const sum = (rows) => rows.reduce((t, x) => t + Number(x.amount || 0), 0);

// Purchase form: submit date, budget, fund.
function renderPurchaseExtras() {
  ensureFunds(); const f = $("#purchase-form"); if (!f.elements.submittedAt.value) f.elements.submittedAt.value = todayISO();
  const sel = $("#purchase-fund"); const cur = sel.value; sel.innerHTML = `<option value="">— Pick a fund —</option>` + funds().map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join(""); sel.value = cur;
}
renderPurchases = function () {
  const rows = [...read("purchases")].sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt))); const today = todayISO();
  $("#purchases-body").innerHTML = rows.map((p) => {
    const fundLine = p.fundId ? `${esc(fundName(p.fundId))} ${p.fundApprovedBy ? `<span class="status ok" title="Approved by ${esc(memberName(p.fundApprovedBy))}">funds approved</span>` : `<span class="status warn">awaiting funds</span>`}` : `<span class="hint">no fund</span>`;
    return `<tr><td class="mono">${esc((p.submittedAt || p.createdAt || "").slice(0, 10))}</td><td>${esc(p.item)}${linkLine(p)}<div class="hint">${esc(p.vendor)} · ${esc(memberName(p.createdBy))}</div></td><td>${money(p.amount)}${Number(p.amount) > PURCHASE_LEADERSHIP_LIMIT && ["Requested", "Quoted"].includes(p.status) ? `<div class="hint">needs leadership</div>` : ""}</td><td>${esc(p.category || "—")}<div>${fundLine}</div></td><td class="${p.neededBy && p.neededBy < today && p.status !== "Received" ? "overdue-text" : ""}">${esc(p.neededBy || "")}</td><td><span class="status">${esc(p.status)}</span></td><td>${actions("purchases", p)}</td></tr>`;
  }).join("");
  $("#purchases-empty").style.display = rows.length ? "none" : "block";
  $("#vendor-count").textContent = `${new Set(rows.map((x) => x.vendor)).size} vendors`;
};
// Admin approves the funds; a purchase can't be ordered until then.
EXT.rowButtons.push((key, row) => key === "purchases" && has("Admin") && row.fundId && !row.fundApprovedBy && row.status !== "Received" ? `<button class="link" data-op="approve-funds" data-id="${row.id}">Approve funds</button>` : "");
OPS["approve-funds"] = (b) => {
  if (!has("Admin")) return flash("Only an Admin can approve funds.");
  const list = read("purchases"); const p = list.find((x) => x.id === b.dataset.id); if (!p) return;
  const f = fundAccount(p.fundId); if (f.balance !== "" && f.remaining - Number(p.amount) < 0 && !confirm(`${f.name} would go ${money(f.remaining - Number(p.amount))}. Approve anyway?`)) return;
  p.fundApprovedBy = me().id; p.fundApprovedAt = new Date().toISOString(); write("purchases", list);
  logEvent(`approved ${money(p.amount)} from ${fundName(p.fundId)} for ${p.item}`); notify(p.createdBy, `Funds approved from ${fundName(p.fundId)} for ${p.item}`); renderAll();
};
EXT.before.push((action, key, row) => {
  if (action !== "advance" || key !== "purchases" || !row) return "";
  if (row.status === "Approved" && !row.fundId) return "Pick the fund this comes from (Edit) before ordering.";
  if (row.status === "Approved" && !row.fundApprovedBy) return `Waiting on an Admin to approve the funds from ${fundName(row.fundId)}.`;
  return "";
});
EXT.inbox.push((u) => has("Admin", u) ? read("purchases").filter((p) => p.fundId && !p.fundApprovedBy && ["Quoted", "Approved"].includes(p.status)).map((p) => `Funds: approve ${money(p.amount)} from ${fundName(p.fundId)} for ${p.item}`) : []);
const _purchaseFields = EDIT_FIELDS.purchases;
EDIT_FIELDS.purchases = (row) => [..._purchaseFields(row), ["submittedAt", "Submitted", "date"], ["fundId", "Fund", "select", [["", "— None —"], ...funds().map((f) => [f.id, f.name])]]];

// ---------------------------------------------------------------------
// Budget page: funding accounts + budget categories, spend from purchases only.
// ---------------------------------------------------------------------
function fundAccount(fid) {
  const f = funds().find((x) => x.id === fid) || { name: "?", balance: "" }; const ps = read("purchases").filter((p) => p.fundId === fid);
  const spent = sum(ps.filter((p) => SPENT.includes(p.status))); const committed = sum(ps.filter((p) => p.fundApprovedBy && !SPENT.includes(p.status)));
  return { ...f, spent, committed, remaining: Number(f.balance || 0) - spent - committed, count: ps.length };
}
function renderFunds() {
  ensureFunds(); const list = funds().map((f) => fundAccount(f.id)); const manage = canManageFunds();
  $("#funds-body").innerHTML = list.map((f) => `<tr><td><strong>${esc(f.name)}</strong>${f.notes ? `<div class="hint">${esc(f.notes)}</div>` : ""}</td><td class="mono">${f.balance !== "" ? money(f.balance) : '<span class="hint">not set</span>'}</td><td class="mono">${money(f.spent)}</td><td class="mono">${money(f.committed)}</td><td class="mono ${f.balance !== "" && f.remaining < 0 ? "overdue-text" : ""}">${f.balance !== "" ? money(f.remaining) : "—"}</td><td>${manage ? `<button class="link" data-op="edit-fund" data-id="${f.id}">Edit</button>` : ""}</td></tr>`).join("");
  const tot = list.reduce((t, f) => ({ balance: t.balance + Number(f.balance || 0), spent: t.spent + f.spent, committed: t.committed + f.committed }), { balance: 0, spent: 0, committed: 0 });
  $("#funds-total").innerHTML = `<td><strong>All accounts</strong></td><td class="mono">${money(tot.balance)}</td><td class="mono">${money(tot.spent)}</td><td class="mono">${money(tot.committed)}</td><td class="mono">${money(tot.balance - tot.spent - tot.committed)}</td><td></td>`;
  $("#fund-add").classList.toggle("hidden", !manage);
}
OPS["edit-fund"] = (b) => { if (!canManageFunds()) return; const list = funds(); const f = list.find((x) => x.id === b.dataset.id); openForm(`Edit ${f.name}`, [["name", "Account name", "text"], ["balance", "Available ($)", "number"], ["notes", "Notes", "textarea"]], f, (v) => { Object.assign(f, v); write("funds", list); logEvent(`updated funding account ${f.name}`); renderAll(); }); };
OPS["add-fund"] = () => { if (!canManageFunds()) return; openForm("Add a funding account", [["name", "Account name", "text"], ["balance", "Available ($)", "number"], ["notes", "Notes", "textarea"]], {}, (v) => { if (!v.name.trim()) return; write("funds", [...funds(), { id: id(), ...v }]); logEvent(`added funding account ${v.name}`); renderAll(); }); };

// Budget categories: spend is only what's been ordered or received against them.
renderBudgets = function () {
  const rows = read("budgets"); const purchases = read("purchases");
  $("#budget-list").innerHTML = rows.map((b) => {
    const mine = purchases.filter((x) => x.category === b.category); const spent = sum(mine.filter((x) => SPENT.includes(x.status))); const committed = sum(mine.filter((x) => x.status === "Approved"));
    const remaining = Number(b.budget) - spent; const percent = Math.min(100, spent / Math.max(1, Number(b.budget)) * 100);
    return `<div class="budget-row${remaining < 0 ? " over" : ""}"><div><strong>${esc(b.category)}</strong><span>${money(spent)} spent of ${money(b.budget)} · ${money(remaining)} remaining · ${mine.filter((x) => SPENT.includes(x.status)).length} purchases${committed ? ` · ${money(committed)} approved, not yet ordered` : ""}</span></div><div class="progress"><i style="width:${percent}%"></i></div>${can("delete", "budgets", b) ? `<button class="link danger" data-action="delete" data-key="budgets" data-id="${b.id}">Remove</button>` : "<span></span>"}</div>`;
  }).join("");
  $("#budget-empty").style.display = rows.length ? "none" : "block";
};

// Demo: balances, and every demo purchase attributed to a fund with a submit date.
EXT.seeds.push((team) => {
  write("funds", [["KSU Foundation", 15000, "Donations held by the foundation"], ["Fund 1300", 8000, "University student-org fund"], ["Johnson", 5000, "Named gift fund"], ["Department", 6000, "Department support"], ["Team total", 2500, "Team dues and fundraising"], ["PayPal", 1200, "Online donations"]].map(([name, balance, notes]) => ({ id: id(), name, balance: String(balance), notes })));
  const F = Object.fromEntries(funds().map((f) => [f.name, f.id])); const admin = team.find((m) => m.roles.includes("Admin"))?.id || team[0].id;
  const pick = { Powertrain: "KSU Foundation", Electrical: "Fund 1300", Suspension: "Johnson", "Safety equipment": "Department" };
  const list = read("purchases");
  [["Brake pads (2 sets)", "Brake supplier", "180", "Suspension", "Received", 30], ["Inverter cooling plate", "Online Metals", "640", "Powertrain", "Received", 26], ["Steel tube for frame jig", "Online Metals", "1220", "Powertrain", "Received", 40], ["LV wiring harness connectors", "Digi-Key", "312", "Electrical", "Ordered", 12], ["Fire extinguishers (2)", "Safety supply", "150", "Safety equipment", "Received", 20], ["Team shirts", "Print shop", "420", "", "Received", 34]]
    .forEach(([item, vendor, amount, category, status, d]) => list.push({ id: id(), item, vendor, amount, category, status, neededBy: daysFromNow(-d + 10), createdBy: team[(d * 3) % team.length].id, createdAt: new Date(Date.now() - d * 864e5).toISOString() }));
  list.forEach((p, i) => {
    p.submittedAt = p.submittedAt || (p.createdAt || new Date().toISOString()).slice(0, 10);
    if (i < 3) p.submittedAt = daysFromNow(-(i + 2));
    p.fundId = p.item === "Team shirts" ? F.PayPal : F[pick[p.category] || "Team total"];
    if (SPENT.includes(p.status)) { p.fundApprovedBy = admin; p.fundApprovedAt = p.createdAt; }
  });
  write("purchases", list);
});

ensureFunds();
EXT.renders.push(["#purchase-fund", renderPurchaseExtras], ["#funds-body", renderFunds]);
