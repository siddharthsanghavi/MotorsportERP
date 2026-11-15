const KEYS = { parts: "motorsport-erp-parts", purchases: "motorsport-erp-purchases", jobs: "motorsport-erp-jobs", budgets: "motorsport-erp-budgets", approvals: "motorsport-erp-approvals", team: "motorsport-erp-team", log: "motorsport-erp-log", me: "motorsport-erp-current-user" };
const $ = (selector) => document.querySelector(selector);
const read = (key) => { try { return JSON.parse(localStorage.getItem(KEYS[key])) || []; } catch { return []; } };
const write = (key, value) => localStorage.setItem(KEYS[key], JSON.stringify(value));
const id = () => crypto.randomUUID();
const formValues = (form) => Object.fromEntries(new FormData(form).entries());
const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
const SUBSYSTEMS = ["Powertrain", "Suspension", "Brakes", "Electronics", "Chassis", "Aero"];

// ---------- Roles & permissions ----------
// A member holds any number of roles. Everyone can submit work (parts, purchase requests, shop jobs, design reviews);
// roles unlock approving, managing, and deleting.
const ROLES = {
  "Admin": "Manages the team roster and can do everything",
  "Purchasing Approver": "Approves, orders, and receives purchase requests",
  "Design Review Approver": "Signs off design reviews (not their own)",
  "Subteam Lead": "Owns parts and reviews in their subteam; edits the parts tree",
  "Budget Manager": "Sets and removes budget allocations",
  "Shop Lead": "Runs the machine shop queue"
};
const me = () => { const team = read("team"); return team.find((m) => m.id === localStorage.getItem(KEYS.me)) || team[0] || { id: "", name: "Guest", roles: [] }; };
const has = (role, user = me()) => user.roles.includes("Admin") || user.roles.includes(role);
const leads = (subsystem, user = me()) => user.roles.includes("Admin") || (user.roles.includes("Subteam Lead") && user.subsystem === subsystem);
const own = (row, user = me()) => row.createdBy && row.createdBy === user.id;

function can(action, key, row) {
  const u = me();
  if (!u.id) return false;
  const isAdmin = u.roles.includes("Admin");
  switch (`${action}:${key}`) {
    case "create:parts": case "create:purchases": case "create:jobs": case "create:approvals": return true;
    case "create:budgets": case "delete:budgets": return has("Budget Manager");
    case "advance:parts": return true;
    case "delete:parts": case "reparent:parts": return row ? leads(row.subsystem) : SUBSYSTEMS.some((s) => leads(s));
    case "advance:purchases": return has("Purchasing Approver") && (isAdmin || !own(row));
    case "delete:purchases": return has("Purchasing Approver") || (own(row) && row.status === "Requested");
    case "advance:jobs": case "delete:jobs": return has("Shop Lead");
    case "advance:approvals": return has("Design Review Approver") && (isAdmin || !own(row));
    case "delete:approvals": return leads(row?.subsystem) || (own(row) && row.status === "Pending Review");
    case "manage:team": return isAdmin;
    default: return false;
  }
}
const whyNot = { "advance:purchases": "Needs Purchasing Approver (and not your own request)", "advance:approvals": "Needs Design Review Approver (and not your own submission)", "advance:jobs": "Needs Shop Lead", "create:budgets": "Needs Budget Manager" };

function logEvent(text) {
  write("log", [...read("log"), { id: id(), who: me().name, text, at: new Date().toISOString() }].slice(-200));
}

// ---------- Demo data ----------
const demoTeam = [
  { name: "Maya Chen", roles: ["Admin", "Subteam Lead"], subsystem: "Suspension" },
  { name: "Noah Williams", roles: ["Purchasing Approver", "Budget Manager"], subsystem: "" },
  { name: "Dr. Kim", roles: ["Design Review Approver"], subsystem: "" },
  { name: "Jordan Lee", roles: ["Design Review Approver", "Subteam Lead"], subsystem: "Chassis" },
  { name: "Priya Singh", roles: ["Subteam Lead"], subsystem: "Powertrain" },
  { name: "Ava Patel", roles: ["Shop Lead"], subsystem: "" },
  { name: "Sam Ortiz", roles: [], subsystem: "Electronics" }
];
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
  ].map(([name, subsystem, parent, platform, quantity, location, status]) => ({ name, subsystem, parent, platform, quantity: String(quantity), location, status, by: "Priya Singh" })),
  purchases: [
    { item: "7075-T6 plate, 12 mm", vendor: "Online Metals", amount: "486.5", neededBy: "2026-11-28", status: "Ordered", by: "Maya Chen" },
    { item: "M8 titanium fastener kit", vendor: "Fastenal", amount: "218.75", neededBy: "2026-11-20", status: "Quoted", by: "Jordan Lee" },
    { item: "High-voltage gloves", vendor: "McMaster-Carr", amount: "96", neededBy: "2026-12-05", status: "Requested", by: "Sam Ortiz" }
  ],
  jobs: [
    { name: "Rear rocker set", owner: "Maya Chen", material: "7075-T6", dueDate: "2026-11-23", priority: "High", status: "In Progress", by: "Maya Chen" },
    { name: "Steering shaft spacer", owner: "Noah Williams", material: "4140 steel", dueDate: "2026-11-19", priority: "Normal", status: "Queued", by: "Jordan Lee" },
    { name: "Brake caliper bracket", owner: "Ava Patel", material: "6061-T6", dueDate: "2026-11-15", priority: "Critical", status: "Quality Check", by: "Ava Patel" }
  ],
  budgets: [
    { category: "Powertrain", budget: "12000", spent: "8460", by: "Noah Williams" },
    { category: "Suspension", budget: "8500", spent: "5125", by: "Noah Williams" },
    { category: "Electrical", budget: "6500", spent: "5980", by: "Noah Williams" },
    { category: "Safety equipment", budget: "3000", spent: "1240", by: "Noah Williams" }
  ],
  approvals: [
    { name: "Accumulator enclosure drawing", subsystem: "Powertrain", reviewer: "Dr. Kim", revision: "Rev C", status: "Pending Review", by: "Priya Singh" },
    { name: "Front suspension FEA report", subsystem: "Suspension", reviewer: "Jordan Lee", revision: "Rev B", status: "Changes Requested", by: "Maya Chen" },
    { name: "Shutdown circuit schematic", subsystem: "Electronics", reviewer: "Dr. Kim", revision: "Rev A", status: "Approved", by: "Sam Ortiz" }
  ]
};

// ---------- Navigation ----------
function showView(view) {
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  if (view === "assembly") renderFlow();
  renderProcesses();
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));

function loadDemoData() {
  const team = demoTeam.map((m) => ({ ...m, id: id() }));
  write("team", team);
  const idByName = Object.fromEntries(team.map((m) => [m.name, m.id]));
  Object.entries(demoData).forEach(([key, rows]) => write(key, rows.map(({ by, ...row }) => ({ ...row, id: id(), createdAt: new Date().toISOString(), createdBy: idByName[by] || "" }))));
  localStorage.setItem(KEYS.me, team[0].id);
  write("log", []);
  logEvent("loaded demo data");
  renderAll();
}
function clearWorkspace() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  ensureTeam();
  renderAll();
}
function ensureTeam() {
  if (!read("team").length) write("team", [{ id: id(), name: "Team Admin", roles: ["Admin"], subsystem: "" }]);
}
$("#seed-data").addEventListener("click", loadDemoData);
$("#clear-data").addEventListener("click", clearWorkspace);
$("#user-select").addEventListener("change", (e) => { localStorage.setItem(KEYS.me, e.target.value); renderAll(); });

// ---------- Renderers ----------
const memberName = (memberId) => read("team").find((m) => m.id === memberId)?.name || "—";
const actions = (key, row, advanceLabel = "Advance") => {
  const out = [];
  if (can("advance", key, row)) out.push(`<button class="link" data-action="advance" data-key="${key}" data-id="${row.id}">${advanceLabel}</button>`);
  else if (whyNot[`advance:${key}`]) out.push(`<span class="locked" title="${esc(whyNot[`advance:${key}`])}">🔒</span>`);
  if (can("delete", key, row)) out.push(`<button class="link danger" data-action="delete" data-key="${key}" data-id="${row.id}">Delete</button>`);
  return out.join("");
};

function renderUser() {
  const team = read("team"); const u = me();
  $("#user-select").innerHTML = team.map((m) => `<option value="${m.id}" ${m.id === u.id ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  $("#user-roles").innerHTML = (u.roles.length ? u.roles : ["Member"]).map((r) => `<span class="role-chip">${esc(r)}${r === "Subteam Lead" && u.subsystem ? ` · ${esc(u.subsystem)}` : ""}</span>`).join("");
  document.querySelectorAll("[data-perm]").forEach((el) => { const [action, key] = el.dataset.perm.split(":"); const ok = can(action, key); el.querySelector("form")?.classList.toggle("hidden", !ok); el.querySelector(".no-perm")?.classList.toggle("hidden", ok); });
}
function renderParts() {
  const query = ($("#part-search")?.value || "").trim().toLowerCase();
  const rows = read("parts").filter((part) => Object.values(part).join(" ").toLowerCase().includes(query));
  $("#parts-body").innerHTML = rows.map((part) => `<tr><td>${esc(part.name)}</td><td>${esc(part.subsystem)}</td><td><span class="plat ${platformOf(part).toLowerCase()}">${esc(platformOf(part))}</span></td><td>${esc(part.quantity)}</td><td>${esc(part.location)}</td><td><span class="status">${esc(part.status)}</span></td><td>${actions("parts", part)}</td></tr>`).join("");
  $("#parts-empty").style.display = rows.length ? "none" : "block";
}
function renderPurchases() {
  const rows = read("purchases");
  $("#purchases-body").innerHTML = rows.map((item) => `<tr><td>${esc(item.item)}</td><td>${esc(item.vendor)}</td><td>${money(item.amount)}</td><td>${esc(item.neededBy)}</td><td>${esc(memberName(item.createdBy))}</td><td><span class="status">${esc(item.status)}</span></td><td>${actions("purchases", item)}</td></tr>`).join("");
  $("#purchases-empty").style.display = rows.length ? "none" : "block";
  $("#vendor-count").textContent = `${new Set(rows.map((item) => item.vendor)).size} vendors`;
}
function renderJobs() {
  const rows = read("jobs");
  $("#jobs-body").innerHTML = rows.map((job) => `<tr><td>${esc(job.name)}</td><td>${esc(job.owner)}</td><td>${esc(job.material)}</td><td>${esc(job.dueDate)}</td><td><span class="priority ${esc(String(job.priority).toLowerCase())}">${esc(job.priority)}</span></td><td>${esc(job.status)}</td><td>${actions("jobs", job)}</td></tr>`).join("");
  $("#jobs-empty").style.display = rows.length ? "none" : "block";
}
function renderBudgets() {
  const rows = read("budgets");
  $("#budget-list").innerHTML = rows.map((budget) => { const remaining = Number(budget.budget) - Number(budget.spent); const percent = Math.min(100, Number(budget.spent) / Math.max(1, Number(budget.budget)) * 100); return `<div class="budget-row"><div><strong>${esc(budget.category)}</strong><span>${money(budget.spent)} spent of ${money(budget.budget)} · ${money(remaining)} remaining</span></div><div class="progress"><i style="width:${percent}%"></i></div>${can("delete", "budgets", budget) ? `<button class="link danger" data-action="delete" data-key="budgets" data-id="${budget.id}">Remove</button>` : "<span></span>"}</div>`; }).join("");
  $("#budget-empty").style.display = rows.length ? "none" : "block";
}
function renderApprovals() {
  const rows = read("approvals");
  $("#approvals-body").innerHTML = rows.map((approval) => `<tr><td>${esc(approval.name)}</td><td>${esc(approval.subsystem)}</td><td>${esc(approval.revision)}</td><td>${esc(memberName(approval.createdBy))}</td><td>${esc(approval.reviewer)}</td><td><span class="status">${esc(approval.status)}</span></td><td>${actions("approvals", approval, "Review")}</td></tr>`).join("");
  $("#approvals-empty").style.display = rows.length ? "none" : "block";
}
function renderTeam() {
  const team = read("team"); const manage = can("manage", "team");
  $("#team-body").innerHTML = team.map((m) => `<tr><td><strong>${esc(m.name)}</strong></td><td>${(m.roles.length ? m.roles : ["Member"]).map((r) => `<span class="role-chip">${esc(r)}</span>`).join(" ")}</td><td>${esc(m.subsystem || "—")}</td><td>${manage && team.length > 1 && m.id !== me().id ? `<button class="link danger" data-action="remove-member" data-id="${m.id}">Remove</button>` : ""}</td></tr>`).join("");
  $("#role-guide").innerHTML = `<li><strong>Member</strong> (everyone): add parts, submit purchase requests, shop jobs, and design reviews</li>` + Object.entries(ROLES).map(([r, d]) => `<li><strong>${esc(r)}</strong>: ${esc(d)}</li>`).join("");
}
function renderOverview() {
  const purchases = read("purchases"); const jobs = read("jobs"); const approvals = read("approvals"); const parts = read("parts"); const u = me();
  $("#stats").innerHTML = [["Parts tracked", parts.length, "parts"], ["Open purchases", purchases.filter((x) => x.status !== "Received").length, "requests"], ["Shop queue", jobs.filter((x) => x.status !== "Complete").length, "jobs"], ["Pending approvals", approvals.filter((x) => x.status !== "Approved").length, "reviews"]].map(([label, value, suffix]) => `<div class="stat"><span>${label}</span><strong>${value}</strong><small>${suffix}</small></div>`).join("");
  const inbox = [
    ...purchases.filter((p) => p.status !== "Received" && can("advance", "purchases", p)).map((p) => `Purchase: ${p.item} (${money(p.amount)}) is ${p.status}`),
    ...approvals.filter((a) => a.status !== "Approved" && can("advance", "approvals", a)).map((a) => `Design review: ${a.name} ${a.revision} is ${a.status}`),
    ...jobs.filter((j) => j.status !== "Complete" && can("advance", "jobs", j)).map((j) => `Shop job: ${j.name} is ${j.status}`)
  ];
  $("#my-queue-title").textContent = `Waiting on ${u.name}`;
  $("#my-queue").innerHTML = inbox.length ? inbox.map((t) => `<div class="activity-row"><span>${esc(t)}</span></div>`).join("") : `<p class="empty">Nothing needs your sign-off.</p>`;
  const log = read("log").slice(-8).reverse();
  $("#activity").innerHTML = log.length ? log.map((x) => `<div class="activity-row"><span><strong>${esc(x.who)}</strong> ${esc(x.text)}</span><span class="when">${new Date(x.at).toLocaleString()}</span></div>`).join("") : `<p class="empty">No activity yet.</p>`;
}

// ---------- Assembly: tree, graph, Venn ----------
const platformOf = (part) => part.platform || "Both";
let treePlatform = "All";
let assemblyMode = "tree";
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
// Would making `parentName` the parent of the part `childId` create a loop?
function createsCycle(parts, childId, parentName) {
  const child = parts.find((p) => p.id === childId); let cursor = parentName; const seen = new Set();
  while (cursor && !seen.has(cursor)) { if (cursor === child.name) return true; seen.add(cursor); cursor = parts.find((p) => p.name === cursor)?.parent; }
  return false;
}
function reparent(childId, parentId) {
  const parts = read("parts"); const child = parts.find((p) => p.id === childId); const parent = parts.find((p) => p.id === parentId);
  if (!child || !parent) return;
  if (!can("reparent", "parts", child)) { flash(`Only the ${child.subsystem} Subteam Lead can move ${child.name}.`); return; }
  if (createsCycle(parts, childId, parent.name)) { flash(`Can't mount ${parent.name} under its own sub-part.`); return; }
  child.parent = parent.name; write("parts", parts); logEvent(`connected ${child.name} → ${parent.name}`); renderAll();
}
function renderFlow() {
  const box = $("#parts-flow");
  if (assemblyMode !== "graph" || !$("#assembly").classList.contains("active")) return;
  if (!window.MotorsportFlow?.available) { box.innerHTML = `<p class="empty">React Flow didn't load (it comes from a CDN, so this view needs an internet connection).</p>`; return; }
  window.MotorsportFlow.render(box, { parts: read("parts"), platform: treePlatform, canReparent: can("reparent", "parts"), onReparent: reparent });
}
function renderAssemblyMode() {
  $("#parts-tree-wrap").classList.toggle("hidden", assemblyMode !== "tree");
  $("#parts-flow-wrap").classList.toggle("hidden", assemblyMode !== "graph");
  $("#flow-hint").textContent = can("reparent", "parts") ? "Drag from a part's right handle to another part's left handle to connect them. Scroll to zoom, drag to pan." : "View only. Subteam Leads can connect parts in their subteam.";
  renderFlow();
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
document.querySelectorAll("#tree-filter button").forEach((b) => b.addEventListener("click", () => { treePlatform = b.dataset.platform; document.querySelectorAll("#tree-filter button").forEach((x) => x.classList.toggle("active", x === b)); renderTree(); renderFlow(); }));
document.querySelectorAll("#mode-toggle button").forEach((b) => b.addEventListener("click", () => { assemblyMode = b.dataset.mode; document.querySelectorAll("#mode-toggle button").forEach((x) => x.classList.toggle("active", x === b)); renderAssemblyMode(); }));

// ---------- Process maps (React Flow) ----------
// Each process: its stages in order, plus the role that moves an item out of each stage.
const PROCESSES = {
  purchases: { view: "purchasing", label: (r) => `${r.item} · ${money(r.amount)}`, role: "Purchasing Approver", loop: null },
  approvals: { view: "approvals", label: (r) => `${r.name} ${r.revision}`, role: "Design Review Approver", loop: "next revision" },
  jobs: { view: "machine-shop", label: (r) => r.name, role: "Shop Lead", loop: "rework" },
  parts: { view: "parts", label: (r) => r.name, role: "Anyone", loop: "rebuild" }
};
function renderProcess(key) {
  const box = $(`#process-${key}`); const cfg = PROCESSES[key];
  if (!box || !$(`#${cfg.view}`).classList.contains("active")) return;
  if (!window.MotorsportFlow?.available) { box.innerHTML = `<p class="empty">React Flow didn't load (needs an internet connection).</p>`; return; }
  const rows = read(key); const statuses = next[key];
  const mine = can("advance", key, { createdBy: "__nobody__", subsystem: me().subsystem });
  const stages = statuses.map((s, i) => ({ id: s, label: s, items: rows.filter((r) => r.status === s).map(cfg.label), final: i === statuses.length - 1 }));
  const edges = statuses.slice(0, -1).map((s, i) => ({ from: s, to: statuses[i + 1], label: cfg.role, mine }));
  if (cfg.loop) edges.push({ from: statuses[statuses.length - 1], to: statuses[0], label: cfg.loop, mine });
  window.MotorsportFlow.renderProcess(box, { stages, edges });
}
const renderProcesses = () => Object.keys(PROCESSES).forEach(renderProcess);

function flash(text) { const el = $("#toast"); el.textContent = text; el.classList.add("show"); clearTimeout(flash.t); flash.t = setTimeout(() => el.classList.remove("show"), 3200); }

const renderAll = () => { renderUser(); renderParentOptions(); renderTree(); renderVenn(); renderAssemblyMode(); renderParts(); renderPurchases(); renderJobs(); renderBudgets(); renderApprovals(); renderTeam(); renderOverview(); renderProcesses(); };

// ---------- Forms & actions ----------
const labelOf = (key, row) => row.name || row.item || row.category || "item";
const nouns = { parts: "part", purchases: "purchase request", jobs: "shop job", budgets: "budget allocation", approvals: "design review" };
const setupForm = (selector, key, defaults = {}) => $(selector).addEventListener("submit", (event) => {
  event.preventDefault();
  if (!can("create", key)) { flash("Your roles don't allow this."); return; }
  const values = { ...defaults, ...formValues(event.target) };
  const row = { ...values, id: id(), createdAt: new Date().toISOString(), createdBy: me().id, status: values.status || "Pending" };
  write(key, [...read(key), row]); logEvent(`added ${nouns[key]} "${labelOf(key, row)}"`); event.target.reset(); renderAll();
});
setupForm("#part-form", "parts"); setupForm("#purchase-form", "purchases", { status: "Requested" }); setupForm("#job-form", "jobs", { status: "Queued" }); setupForm("#budget-form", "budgets"); setupForm("#approval-form", "approvals", { status: "Pending Review" });
$("#member-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!can("manage", "team")) return;
  const form = new FormData(event.target);
  const member = { id: id(), name: form.get("name"), roles: form.getAll("roles"), subsystem: form.get("subsystem") || "" };
  write("team", [...read("team"), member]); logEvent(`added ${member.name} to the team`); event.target.reset(); renderAll();
});
$("#member-roles").innerHTML = Object.keys(ROLES).map((r) => `<label class="check"><input type="checkbox" name="roles" value="${esc(r)}" />${esc(r)}</label>`).join("");
$("#part-search").addEventListener("input", renderParts);

const next = { parts: ["In Design", "Manufacturing", "In Inventory", "Installed", "Damaged"], purchases: ["Requested", "Quoted", "Approved", "Ordered", "Received"], jobs: ["Queued", "In Progress", "Quality Check", "Complete"], approvals: ["Pending Review", "Changes Requested", "Approved"] };
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const { action, key } = button.dataset;
  if (action === "remove-member") {
    if (!can("manage", "team")) return;
    const team = read("team"); const m = team.find((x) => x.id === button.dataset.id);
    write("team", team.filter((x) => x.id !== button.dataset.id)); logEvent(`removed ${m?.name} from the team`); renderAll(); return;
  }
  const rows = read(key); const row = rows.find((r) => r.id === button.dataset.id); if (!row) return;
  if (!can(action, key, row)) { flash("Your roles don't allow this."); return; }
  if (action === "advance") {
    const statuses = next[key]; row.status = statuses[(statuses.indexOf(row.status) + 1) % statuses.length];
    write(key, rows); logEvent(`moved ${nouns[key]} "${labelOf(key, row)}" to ${row.status}`);
  } else if (action === "delete") {
    write(key, rows.filter((r) => r !== row)); logEvent(`deleted ${nouns[key]} "${labelOf(key, row)}"`);
  }
  renderAll();
});

ensureTeam();
renderAll();
