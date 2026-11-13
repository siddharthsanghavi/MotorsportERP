const KEYS = { parts: "motorsport-erp-parts", purchases: "motorsport-erp-purchases", jobs: "motorsport-erp-jobs", budgets: "motorsport-erp-budgets", approvals: "motorsport-erp-approvals" };
const $ = (selector) => document.querySelector(selector);
const read = (key) => { try { return JSON.parse(localStorage.getItem(KEYS[key])) || []; } catch { return []; } };
const write = (key, value) => localStorage.setItem(KEYS[key], JSON.stringify(value));
const id = () => crypto.randomUUID();
const formValues = (form) => Object.fromEntries(new FormData(form).entries());
const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const demoData = {
  // [name, subsystem, parent, platform, qty, location, status]
  parts: [
    ["Chassis", "Chassis", "", "Both", 1, "Car", "Installed"],
    ["Steel spaceframe", "Chassis", "Chassis", "Both", 1, "Car", "Installed"],
    ["Front impact attenuator", "Chassis", "Chassis", "Both", 2, "Inventory", "In Inventory"],
    ["Driver seat", "Chassis", "Chassis", "Both", 1, "Car", "Installed"],
    ["Firewall", "Chassis", "Chassis", "Both", 1, "Car", "Installed"],
    ["Suspension", "Suspension", "", "Both", 1, "Car", "Installed"],
    ["Front upright", "Suspension", "Suspension", "Both", 2, "Inventory", "In Inventory"],
    ["Wheel hub", "Suspension", "Front upright", "Both", 4, "Car", "Installed"],
    ["Wheel bearing", "Suspension", "Wheel hub", "Both", 4, "Car", "Installed"],
    ["Wishbone set", "Suspension", "Suspension", "Both", 4, "Car", "Installed"],
    ["Rocker", "Suspension", "Suspension", "Both", 4, "Machine Shop", "Manufacturing"],
    ["Damper", "Suspension", "Rocker", "Both", 4, "Car", "Installed"],
    ["Brakes", "Brakes", "", "Both", 1, "Car", "Installed"],
    ["Brake pedal assembly", "Brakes", "Brakes", "Both", 1, "Machine Shop", "Manufacturing"],
    ["Master cylinder", "Brakes", "Brake pedal assembly", "Both", 2, "Car", "Installed"],
    ["Caliper", "Brakes", "Front upright", "Both", 4, "Car", "Installed"],
    ["Brake rotor", "Brakes", "Wheel hub", "Both", 4, "Car", "Installed"],
    ["Regen brake controller", "Brakes", "Brakes", "EV", 1, "Electronics Lab", "In Design"],
    ["Steering", "Chassis", "", "Both", 1, "Car", "Installed"],
    ["Steering rack", "Chassis", "Steering", "Both", 1, "Car", "Installed"],
    ["Steering wheel", "Chassis", "Steering", "Both", 1, "Car", "Installed"],
    ["ICE powertrain", "Powertrain", "", "ICE", 1, "Car", "Installed"],
    ["Engine (600cc)", "Powertrain", "ICE powertrain", "ICE", 1, "Car", "Installed"],
    ["Intake & restrictor", "Powertrain", "Engine (600cc)", "ICE", 1, "Car", "Installed"],
    ["Exhaust & muffler", "Powertrain", "Engine (600cc)", "ICE", 1, "Car", "Installed"],
    ["Fuel tank", "Powertrain", "ICE powertrain", "ICE", 1, "Car", "Installed"],
    ["Fuel pump", "Powertrain", "Fuel tank", "ICE", 1, "Car", "Installed"],
    ["ECU", "Electronics", "ICE powertrain", "ICE", 1, "Car", "Installed"],
    ["Radiator", "Powertrain", "ICE powertrain", "ICE", 1, "Car", "Installed"],
    ["Chain & sprockets", "Powertrain", "ICE powertrain", "ICE", 1, "Car", "Installed"],
    ["EV powertrain", "Powertrain", "", "EV", 1, "Car", "Installed"],
    ["Accumulator", "Powertrain", "EV powertrain", "EV", 1, "Car", "Installed"],
    ["Accumulator enclosure", "Powertrain", "Accumulator", "EV", 1, "Car", "Installed"],
    ["Cell modules", "Powertrain", "Accumulator", "EV", 6, "Car", "Installed"],
    ["BMS", "Electronics", "Accumulator", "EV", 1, "Electronics Lab", "In Design"],
    ["Inverter", "Powertrain", "EV powertrain", "EV", 1, "Car", "Installed"],
    ["Traction motor", "Powertrain", "EV powertrain", "EV", 1, "Car", "Installed"],
    ["HV harness", "Electronics", "EV powertrain", "EV", 1, "Car", "Installed"],
    ["Radiator", "Powertrain", "EV powertrain", "EV", 1, "Car", "Installed"],
    ["Chain & sprockets", "Powertrain", "EV powertrain", "EV", 1, "Car", "Installed"],
    ["Differential", "Powertrain", "", "Both", 1, "Car", "Installed"],
    ["Halfshafts", "Powertrain", "Differential", "Both", 2, "Car", "Installed"],
    ["Electronics", "Electronics", "", "Both", 1, "Car", "Installed"],
    ["LV battery", "Electronics", "Electronics", "Both", 1, "Car", "Installed"],
    ["CAN node board", "Electronics", "Electronics", "Both", 4, "Electronics Lab", "In Design"],
    ["Dash display", "Electronics", "Steering wheel", "Both", 1, "Car", "Installed"],
    ["Shutdown circuit", "Electronics", "Electronics", "Both", 1, "Car", "Installed"],
    ["Aero", "Aero", "", "Both", 1, "Car", "Installed"],
    ["Front wing", "Aero", "Aero", "Both", 1, "Car", "Installed"],
    ["Rear wing", "Aero", "Aero", "Both", 1, "Car", "Installed"],
    ["Undertray", "Aero", "Aero", "Both", 1, "Inventory", "In Inventory"]
  ].map(([name, subsystem, parent, platform, quantity, location, status]) => ({ name, subsystem, parent, platform, quantity: String(quantity), location, status })),
  purchases: [
    { item: "7075-T6 plate, 12 mm", vendor: "Online Metals", amount: "486.5", neededBy: "2026-11-28", status: "Ordered" },
    { item: "M8 titanium fastener kit", vendor: "Fastenal", amount: "218.75", neededBy: "2026-11-20", status: "Quoted" },
    { item: "High-voltage gloves", vendor: "McMaster-Carr", amount: "96", neededBy: "2026-12-05", status: "Requested" }
  ],
  jobs: [
    { name: "Rear rocker set", owner: "Maya Chen", material: "7075-T6", dueDate: "2026-11-23", priority: "High", status: "In Progress" },
    { name: "Steering shaft spacer", owner: "Noah Williams", material: "4140 steel", dueDate: "2026-11-19", priority: "Normal", status: "Queued" },
    { name: "Brake caliper bracket", owner: "Ava Patel", material: "6061-T6", dueDate: "2026-11-15", priority: "Critical", status: "Quality Check" }
  ],
  budgets: [
    { category: "Powertrain", budget: "12000", spent: "8460" },
    { category: "Suspension", budget: "8500", spent: "5125" },
    { category: "Electrical", budget: "6500", spent: "5980" },
    { category: "Safety equipment", budget: "3000", spent: "1240" }
  ],
  approvals: [
    { name: "Accumulator enclosure drawing", subsystem: "Powertrain", reviewer: "Dr. Kim", revision: "Rev C", status: "Pending Review" },
    { name: "Front suspension FEA report", subsystem: "Suspension", reviewer: "Jordan Lee", revision: "Rev B", status: "Changes Requested" },
    { name: "Shutdown circuit schematic", subsystem: "Electronics", reviewer: "Dr. Kim", revision: "Rev A", status: "Approved" }
  ]
};

function showView(view) {
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));
const withMetadata = (rows) => rows.map((row) => ({ ...row, id: id(), createdAt: new Date().toISOString() }));
function loadDemoData() {
  Object.entries(demoData).forEach(([key, rows]) => write(key, withMetadata(rows)));
  renderAll();
}
function clearWorkspace() {
  Object.keys(KEYS).forEach((key) => localStorage.removeItem(KEYS[key]));
  renderAll();
}
$("#seed-data").addEventListener("click", loadDemoData);
$("#clear-data").addEventListener("click", clearWorkspace);

function renderParts() {
  const query = ($("#part-search")?.value || "").trim().toLowerCase();
  const rows = read("parts").filter((part) => Object.values(part).join(" ").toLowerCase().includes(query));
  $("#parts-body").innerHTML = rows.map((part) => `<tr><td>${esc(part.name)}</td><td>${esc(part.subsystem)}</td><td><span class="plat ${platformOf(part).toLowerCase()}">${esc(platformOf(part))}</span></td><td>${part.quantity}</td><td>${esc(part.location)}</td><td><span class="status">${esc(part.status)}</span></td><td><button class="link" data-action="advance-part" data-id="${part.id}">Advance</button><button class="link danger" data-action="delete" data-key="parts" data-id="${part.id}">Delete</button></td></tr>`).join("");
  $("#parts-empty").style.display = rows.length ? "none" : "block";
}
function renderPurchases() {
  const rows = read("purchases");
  $("#purchases-body").innerHTML = rows.map((item) => `<tr><td>${esc(item.item)}</td><td>${esc(item.vendor)}</td><td>${money(item.amount)}</td><td>${esc(item.neededBy)}</td><td><span class="status">${esc(item.status)}</span></td><td><button class="link" data-action="advance-purchase" data-id="${item.id}">Advance</button><button class="link danger" data-action="delete" data-key="purchases" data-id="${item.id}">Delete</button></td></tr>`).join("");
  $("#purchases-empty").style.display = rows.length ? "none" : "block";
  $("#vendor-count").textContent = `${new Set(rows.map((item) => item.vendor)).size} vendors`;
}
function renderJobs() {
  const rows = read("jobs");
  $("#jobs-body").innerHTML = rows.map((job) => `<tr><td>${esc(job.name)}</td><td>${esc(job.owner)}</td><td>${esc(job.material)}</td><td>${esc(job.dueDate)}</td><td><span class="priority ${job.priority.toLowerCase()}">${esc(job.priority)}</span></td><td>${esc(job.status)}</td><td><button class="link" data-action="advance-job" data-id="${job.id}">Advance</button><button class="link danger" data-action="delete" data-key="jobs" data-id="${job.id}">Delete</button></td></tr>`).join("");
  $("#jobs-empty").style.display = rows.length ? "none" : "block";
}
function renderBudgets() {
  const rows = read("budgets");
  $("#budget-list").innerHTML = rows.map((budget) => { const remaining = Number(budget.budget) - Number(budget.spent); const percent = Math.min(100, Number(budget.spent) / Math.max(1, Number(budget.budget)) * 100); return `<div class="budget-row"><div><strong>${esc(budget.category)}</strong><span>${money(budget.spent)} spent of ${money(budget.budget)} · ${money(remaining)} remaining</span></div><div class="progress"><i style="width:${percent}%"></i></div><button class="link danger" data-action="delete" data-key="budgets" data-id="${budget.id}">Remove</button></div>`; }).join("");
  $("#budget-empty").style.display = rows.length ? "none" : "block";
}
function renderApprovals() {
  const rows = read("approvals");
  $("#approvals-body").innerHTML = rows.map((approval) => `<tr><td>${esc(approval.name)}</td><td>${esc(approval.subsystem)}</td><td>${esc(approval.revision)}</td><td>${esc(approval.reviewer)}</td><td><span class="status">${esc(approval.status)}</span></td><td><button class="link" data-action="advance-approval" data-id="${approval.id}">Update</button><button class="link danger" data-action="delete" data-key="approvals" data-id="${approval.id}">Delete</button></td></tr>`).join("");
  $("#approvals-empty").style.display = rows.length ? "none" : "block";
}
function renderOverview() {
  const purchases = read("purchases"); const jobs = read("jobs"); const approvals = read("approvals"); const parts = read("parts");
  $("#stats").innerHTML = [["Parts tracked", parts.length, "parts"], ["Open purchases", purchases.filter((x) => x.status !== "Received").length, "requests"], ["Shop queue", jobs.filter((x) => x.status !== "Complete").length, "jobs"], ["Pending approvals", approvals.filter((x) => x.status !== "Approved").length, "reviews"]].map(([label, value, suffix]) => `<div class="stat"><span>${label}</span><strong>${value}</strong><small>${suffix}</small></div>`).join("");
  const activity = [...purchases.map((x) => ({ text: `${x.item} requested from ${x.vendor}`, status: x.status })), ...jobs.map((x) => ({ text: `${x.name} is in the machine shop queue`, status: x.status })), ...approvals.map((x) => ({ text: `${x.name} submitted for design review`, status: x.status }))].slice(-6).reverse();
  $("#activity").innerHTML = activity.length ? activity.map((x) => `<div class="activity-row"><span>${esc(x.text)}</span><span class="status">${esc(x.status)}</span></div>`).join("") : `<p class="empty">Add a purchase, job, or approval to start your activity feed.</p>`;
}
const platformOf = (part) => part.platform || "Both";
let treePlatform = "All";
function renderParentOptions() {
  const select = $("#parent-select"); const current = select.value;
  const names = [...new Set(read("parts").map((p) => p.name))].sort();
  select.innerHTML = `<option value="">— Top level —</option>` + names.map((n) => `<option>${esc(n)}</option>`).join("");
  select.value = names.includes(current) ? current : "";
}
function renderTree() {
  const parts = read("parts");
  const names = new Set(parts.map((p) => p.name));
  const visible = (p) => treePlatform === "All" || [treePlatform, "Both"].includes(platformOf(p));
  const children = {};
  parts.forEach((p) => { const key = p.parent && names.has(p.parent) && p.parent !== p.name ? p.parent : ""; (children[key] ||= []).push(p); });
  const node = (p, seen) => {
    if (seen.has(p.name)) return "";
    const kids = (children[p.name] || []).filter(visible);
    const inner = kids.map((k) => node(k, new Set([...seen, p.name]))).join("");
    const label = `<span class="node"><strong>${esc(p.name)}</strong><span class="plat ${platformOf(p).toLowerCase()}">${esc(platformOf(p))}</span><small>×${esc(p.quantity)} · ${esc(p.status)}</small></span>`;
    return inner ? `<li><details open><summary>${label}<em>${kids.length}</em></summary><ul>${inner}</ul></details></li>` : `<li class="leaf">${label}</li>`;
  };
  const roots = (children[""] || []).filter(visible);
  $("#parts-tree").innerHTML = roots.length ? `<ul>${roots.map((r) => node(r, new Set())).join("")}</ul>` : "";
  $("#tree-empty").style.display = roots.length ? "none" : "block";
}
function renderVenn() {
  const byName = {};
  read("parts").forEach((p) => { const s = (byName[p.name] ||= new Set()); platformOf(p) === "Both" ? (s.add("EV"), s.add("ICE")) : s.add(platformOf(p)); });
  const groups = { EV: [], Both: [], ICE: [] };
  Object.entries(byName).forEach(([name, s]) => groups[s.size === 2 ? "Both" : [...s][0]].push(name));
  Object.values(groups).forEach((g) => g.sort());
  const total = Object.keys(byName).length;
  const pct = total ? Math.round(groups.Both.length / total * 100) : 0;
  const list = (key) => `<div class="venn-col ${key.toLowerCase()}"><h3>${{ EV: "EV only", Both: "Shared", ICE: "ICE only" }[key]} <span>${groups[key].length}</span></h3><ul>${groups[key].map((n) => `<li>${esc(n)}</li>`).join("") || "<li class='none'>None</li>"}</ul></div>`;
  $("#venn").innerHTML = total ? `
    <svg viewBox="0 0 520 260" class="venn-svg" role="img" aria-label="Venn diagram: ${groups.EV.length} EV-only, ${groups.Both.length} shared, ${groups.ICE.length} ICE-only parts">
      <circle cx="195" cy="130" r="115" class="c-ev" /><circle cx="325" cy="130" r="115" class="c-ice" />
      <text x="140" y="32" class="vt">EV car</text><text x="380" y="32" class="vt">ICE car</text>
      <text x="135" y="140" class="vn">${groups.EV.length}</text><text x="260" y="140" class="vn">${groups.Both.length}</text><text x="385" y="140" class="vn">${groups.ICE.length}</text>
      <text x="135" y="162" class="vs">EV only</text><text x="260" y="162" class="vs">shared</text><text x="385" y="162" class="vs">ICE only</text>
    </svg>
    <p class="hint center">${pct}% of unique parts (${groups.Both.length} of ${total}) are common to both cars.</p>
    <div class="venn-lists">${list("EV")}${list("Both")}${list("ICE")}</div>` : `<p class="empty">No parts yet.</p>`;
}
$("#tree-filter").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; treePlatform = b.dataset.platform; document.querySelectorAll("#tree-filter button").forEach((x) => x.classList.toggle("active", x === b)); renderTree(); });
const renderAll = () => { renderParentOptions(); renderTree(); renderVenn(); renderParts(); renderPurchases(); renderJobs(); renderBudgets(); renderApprovals(); renderOverview(); };

const setupForm = (selector, key, after = renderAll) => $(selector).addEventListener("submit", (event) => { event.preventDefault(); const values = formValues(event.target); write(key, [...read(key), { ...values, id: id(), createdAt: new Date().toISOString(), status: values.status || "Pending" }]); event.target.reset(); after(); });
setupForm("#part-form", "parts"); setupForm("#purchase-form", "purchases"); setupForm("#job-form", "jobs"); setupForm("#budget-form", "budgets"); setupForm("#approval-form", "approvals");
$("#part-search").addEventListener("input", renderParts);
const next = { parts: ["In Design", "Manufacturing", "In Inventory", "Installed", "Damaged"], purchases: ["Requested", "Quoted", "Approved", "Ordered", "Received"], jobs: ["Queued", "In Progress", "Quality Check", "Complete"], approvals: ["Pending Review", "Changes Requested", "Approved"] };
document.addEventListener("click", (event) => { const button = event.target.closest("[data-action]"); if (!button) return; const key = button.dataset.key; const rows = read(key); const index = rows.findIndex((row) => row.id === button.dataset.id); if (index < 0) { const actionKey = { "advance-part": "parts", "advance-purchase": "purchases", "advance-job": "jobs", "advance-approval": "approvals" }[button.dataset.action]; if (!actionKey) return; const items = read(actionKey); const itemIndex = items.findIndex((row) => row.id === button.dataset.id); if (itemIndex < 0) return; const statuses = next[actionKey]; items[itemIndex].status = statuses[(statuses.indexOf(items[itemIndex].status) + 1) % statuses.length]; write(actionKey, items); renderAll(); return; } rows.splice(index, 1); write(key, rows); renderAll(); });
renderAll();
