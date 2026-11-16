// Vendors: one list of suppliers that purchase requests, stock items and parts pick from,
// plus the Vendors page with contacts, lead times and spend per vendor. Loaded after ops.js.
Object.assign(KEYS, { vendors: "motorsport-erp-vendors" });
nouns.vendors = "vendor";
const VENDOR_CATEGORIES = ["Raw material", "Fasteners", "Hardware & tools", "Electronics", "Composites", "Machining & fabrication", "Tyres & wheels", "Consumables", "Safety equipment", "Events & fees", "Other"];
const NEW_VENDOR = "__new__";
const SPENT_STATUSES = ["Ordered", "Received"];
const OPEN_STATUSES = ["Requested", "Quoted", "Approved", "Ordered"];

const vendorsSorted = () => [...read("vendors")].sort((a, b) => a.name.localeCompare(b.name));
const vendorByName = (name) => read("vendors").find((v) => v.name.toLowerCase() === String(name || "").trim().toLowerCase());
const canManageVendors = (u = me()) => !!u.id && (has("Purchasing Approver", u) || has("Budget Manager", u) || isLeader(u));
// Options for the edit dialogs in ops.js (purchases, stock, parts).
function vendorOptions(current = "") {
  const names = vendorsSorted().map((v) => v.name);
  if (current && !names.some((n) => n.toLowerCase() === String(current).toLowerCase())) names.unshift(current);
  return [["", "— Select vendor —"], ...names.map((n) => [n, n])];
}

// Any vendor name already used on a purchase, stock item or part gets a vendor record, so old data shows up on the page.
function syncVendors() {
  const vendors = read("vendors"); const known = new Set(vendors.map((v) => v.name.toLowerCase())); let added = 0;
  const names = [...read("purchases").map((p) => p.vendor), ...read("stock").map((s) => s.vendor), ...read("parts").map((p) => p.supplier)];
  names.forEach((n) => { const name = String(n || "").trim(); if (name && name !== "TBD" && !known.has(name.toLowerCase())) { known.add(name.toLowerCase()); vendors.push({ id: id(), name, category: "Other", contactName: "", email: "", phone: "", website: "", leadTimeDays: "", terms: "", notes: "", preferred: false, createdBy: "", createdAt: new Date().toISOString() }); added++; } });
  if (added) write("vendors", vendors);
}

EXT.can.push((action, key, row, u) => {
  if (key !== "vendors") return undefined;
  if (action === "create") return true; // anyone raising a purchase can add a supplier
  if (action === "delete") return canManageVendors(u);
  return false;
});

const VENDOR_FIELDS = () => [["name", "Vendor name", "text"], ["category", "Category", "select", VENDOR_CATEGORIES], ["contactName", "Contact name", "text"], ["email", "Email", "text"], ["phone", "Phone", "text"], ["website", "Website", "text"], ["leadTimeDays", "Typical lead time (days)", "number"], ["terms", "Terms / account notes", "text"], ["preferred", "Preferred vendor", "checkbox"], ["notes", "Notes", "textarea"]];
function saveVendor(values, existing) {
  const name = String(values.name || "").trim(); if (!name) { flash("A vendor needs a name."); return null; }
  const clash = vendorByName(name); if (clash && clash.id !== existing?.id) { flash(`${clash.name} is already in the vendor list.`); return null; }
  if (values.website && !safeUrl(values.website) && !/^[\w.-]+\.[a-z]{2,}/i.test(values.website)) { flash("The website should look like example.com or start with https://"); return null; }
  const list = read("vendors");
  if (existing) {
    const row = list.find((v) => v.id === existing.id); const oldName = row.name; Object.assign(row, values, { name, updatedAt: new Date().toISOString() }); write("vendors", list);
    // Renaming a vendor carries the new name onto everything that used the old one.
    if (oldName !== name) {
      write("purchases", read("purchases").map((p) => (p.vendor === oldName ? { ...p, vendor: name } : p)));
      write("stock", read("stock").map((s) => (s.vendor === oldName ? { ...s, vendor: name } : s)));
      write("parts", read("parts").map((p) => (p.supplier === oldName ? { ...p, supplier: name } : p)));
    }
    logEvent(`edited vendor "${name}"`); return row;
  }
  const row = { id: id(), ...values, name, createdBy: me().id, createdAt: new Date().toISOString() };
  write("vendors", [...list, row]); logEvent(`added vendor "${name}"`); return row;
}
const vendorUrl = (w) => { const s = String(w || "").trim(); if (!s) return ""; return safeUrl(s) || (/^[\w.-]+\.[a-z]{2,}/i.test(s) ? `https://${s}` : ""); };

// ----- Dropdowns on the Purchasing and Stock forms -----
function renderVendorSelects() {
  document.querySelectorAll("select[data-vendor-select]").forEach((sel) => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">— Select vendor —</option>` + vendorsSorted().map((v) => `<option value="${esc(v.name)}">${esc(v.name)}${v.preferred ? " ★" : ""}${v.category && v.category !== "Other" ? ` · ${esc(v.category)}` : ""}</option>`).join("") + `<option value="${NEW_VENDOR}">+ Add a new vendor…</option>`;
    sel.value = cur && cur !== NEW_VENDOR ? cur : "";
  });
}
document.addEventListener("change", (e) => {
  const sel = e.target; if (!sel.matches?.("select[data-vendor-select]") || sel.value !== NEW_VENDOR) return;
  sel.value = "";
  openForm("Add a vendor", VENDOR_FIELDS(), { category: "Other" }, (v) => { const row = saveVendor(v); if (!row) return; renderAll(); sel.value = row.name; });
});
EXT.renders.push(["select[data-vendor-select]", renderVendorSelects]);

// ----- Vendors page -----
let vendorQuery = ""; let vendorCategory = "";
function vendorStats(name) {
  const rows = read("purchases").filter((p) => String(p.vendor || "").toLowerCase() === name.toLowerCase());
  const spent = rows.filter((p) => SPENT_STATUSES.includes(p.status)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const open = rows.filter((p) => OPEN_STATUSES.includes(p.status));
  const last = rows.map((p) => (p.createdAt || "").slice(0, 10)).filter(Boolean).sort().pop() || "";
  return { rows, spent, open, last };
}
function renderVendors() {
  const all = vendorsSorted(); const mgr = canManageVendors();
  const list = all.filter((v) => (!vendorCategory || v.category === vendorCategory) && (!vendorQuery || [v.name, v.category, v.contactName, v.email, v.notes].join(" ").toLowerCase().includes(vendorQuery)));
  const stats = all.map((v) => ({ v, ...vendorStats(v.name) }));
  const totalSpent = stats.reduce((s, x) => s + x.spent, 0); const top = [...stats].sort((a, b) => b.spent - a.spent)[0];
  $("#vendor-stats").innerHTML = [["Vendors", all.length], ["Spent with vendors", money(totalSpent)], ["Open orders", stats.reduce((n, x) => n + x.open.length, 0)], ["Top vendor", top && top.spent ? `${top.v.name} · ${money(top.spent)}` : "—"]].map(([l, val]) => `<div class="mini-stat"><span>${l}</span><strong>${esc(val)}</strong></div>`).join("");
  const catSel = $("#vendor-category"); catSel.innerHTML = `<option value="">All categories</option>` + VENDOR_CATEGORIES.map((c) => `<option ${c === vendorCategory ? "selected" : ""}>${esc(c)}</option>`).join("");
  $("#vendors-body").innerHTML = list.map((v) => {
    const s = stats.find((x) => x.v.id === v.id); const url = vendorUrl(v.website);
    const contact = [v.contactName && esc(v.contactName), v.email && `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>`, v.phone && esc(v.phone)].filter(Boolean).join("<br>");
    const history = s.rows.length ? `<details class="vendor-history"><summary>${s.rows.length} purchase${s.rows.length > 1 ? "s" : ""}</summary><ul>${[...s.rows].reverse().slice(0, 8).map((p) => `<li><span>${esc(p.item)}</span><span class="mono">${money(p.amount)}</span><span class="status">${esc(p.status)}</span></li>`).join("")}</ul></details>` : `<span class="hint">No purchases yet</span>`;
    const acts = [mgr || own(v) ? `<button class="link" data-op="vendor-edit" data-id="${v.id}">Edit</button>` : "", `<a class="link-btn" href="purchasing.html" data-op="vendor-order" data-id="${v.id}">Order</a>`, can("delete", "vendors", v) ? `<button class="link danger" data-op="vendor-delete" data-id="${v.id}">Delete</button>` : ""].join("");
    return `<tr><td><strong>${esc(v.name)}</strong>${v.preferred ? ` <span class="pref" title="Preferred vendor">★</span>` : ""}${url ? `<div><a class="hint" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(String(v.website).replace(/^https?:\/\//, ""))}</a></div>` : ""}${v.notes ? `<div class="hint">${esc(v.notes)}</div>` : ""}</td><td>${esc(v.category || "—")}</td><td class="contact">${contact || `<span class="hint">—</span>`}</td><td class="mono">${v.leadTimeDays ? `${esc(v.leadTimeDays)} d` : "—"}${v.terms ? `<div class="hint">${esc(v.terms)}</div>` : ""}</td><td class="mono">${money(s.spent)}${s.open.length ? `<div class="hint">${s.open.length} open · ${money(s.open.reduce((t, p) => t + Number(p.amount || 0), 0))}</div>` : ""}</td><td>${history}${s.last ? `<div class="hint">last ${esc(s.last)}</div>` : ""}</td><td class="actions">${acts}</td></tr>`;
  }).join("");
  $("#vendors-empty").style.display = list.length ? "none" : "block";
  $("#vendor-count").textContent = `${all.length} vendor${all.length === 1 ? "" : "s"}`;
}
EXT.renders.push(["#vendors-body", renderVendors]);
$("#vendor-search").addEventListener("input", (e) => { vendorQuery = e.target.value.trim().toLowerCase(); renderVendors(); });
$("#vendor-category").addEventListener("change", (e) => { vendorCategory = e.target.value; renderVendors(); });
$("#vendor-form").addEventListener("submit", (e) => {
  e.preventDefault(); const v = formValues(e.target); v.preferred = !!e.target.elements.preferred?.checked;
  if (saveVendor(v)) { e.target.reset(); renderAll(); }
});
OPS["vendor-edit"] = (b) => {
  const v = read("vendors").find((x) => x.id === b.dataset.id); if (!v || !(canManageVendors() || own(v))) return flash("Only a Purchasing Approver, Budget Manager or leadership can edit vendors.");
  openForm(`Edit vendor: ${v.name}`, VENDOR_FIELDS(), v, (vals) => { if (saveVendor(vals, v)) renderAll(); });
};
OPS["vendor-delete"] = (b) => {
  const v = read("vendors").find((x) => x.id === b.dataset.id); if (!v || !can("delete", "vendors", v)) return;
  const used = vendorStats(v.name).rows.length;
  if (!confirm(`Delete vendor "${v.name}"?${used ? ` ${used} purchase request${used > 1 ? "s" : ""} keep the name but it won't be in the dropdown.` : ""}`)) return;
  write("vendors", read("vendors").filter((x) => x.id !== v.id)); logEvent(`deleted vendor "${v.name}"`); renderAll();
};
// "Order" on a vendor opens Purchasing with that vendor picked.
OPS["vendor-order"] = (b) => { const v = read("vendors").find((x) => x.id === b.dataset.id); try { sessionStorage.setItem("merp-order-vendor", v.name); } catch { /* storage blocked */ } };
document.addEventListener("click", (e) => { const a = e.target.closest('a[data-op="vendor-order"]'); if (a) OPS["vendor-order"](a); }, true);
function applyPendingVendor() {
  try { const name = sessionStorage.getItem("merp-order-vendor"); if (!name || !onPage("#purchase-form")) return; sessionStorage.removeItem("merp-order-vendor"); const f = $("#purchase-form"); f.closest(".card")?.classList.remove("collapsed"); f.elements.vendor.value = name; f.elements.namedItem("item").focus(); } catch { /* storage blocked */ }
}

EXT.after.push((action, key) => { if (key === "purchases") syncVendors(); });

// ----- Demo vendors (fictional contacts; example.com addresses) -----
EXT.seeds.push(() => {
  const v = (name, category, contactName, leadTimeDays, extra = {}) => ({ id: id(), name, category, contactName, email: contactName ? `${contactName.split(" ")[0].toLowerCase()}@example.com` : "", phone: "", website: "", leadTimeDays: String(leadTimeDays || ""), terms: "", notes: "", preferred: false, createdBy: "", createdAt: new Date().toISOString(), ...extra });
  write("vendors", [
    v("Online Metals", "Raw material", "Jordan Reyes", 5, { website: "onlinemetals.com", preferred: true, notes: "Cut-to-size aluminium and steel." }),
    v("Fastenal", "Fasteners", "Casey Lin", 2, { preferred: true, terms: "Team account, net 30" }),
    v("McMaster-Carr", "Hardware & tools", "", 2, { website: "mcmaster.com", notes: "Next-day for most stock items." }),
    v("Digi-Key", "Electronics", "Morgan Ellis", 3, { website: "digikey.com", preferred: true }),
    v("Composites supplier", "Composites", "Taylor Brooks", 14, { notes: "Pre-preg ships frozen; order two weeks ahead." }),
    v("Auto parts store", "Consumables", "", 1),
    v("Local machine shop", "Machining & fabrication", "Riley Morgan", 10, { notes: "Outsourced 5-axis and anodising." }),
    v("Tyre distributor", "Tyres & wheels", "Avery Quinn", 21, { terms: "Order before the season discount ends." }),
    v("Event organizer", "Events & fees", "", 0)
  ]);
  syncVendors();
});

syncVendors();
