const KEYS = { parts: "motorsport-erp-parts", purchases: "motorsport-erp-purchases", jobs: "motorsport-erp-jobs", budgets: "motorsport-erp-budgets", approvals: "motorsport-erp-approvals", team: "motorsport-erp-team", projects: "motorsport-erp-projects", docs: "motorsport-erp-docs", deliverables: "motorsport-erp-deliverables", tasks: "motorsport-erp-tasks", log: "motorsport-erp-log", me: "motorsport-erp-current-user" };
const $ = (selector) => document.querySelector(selector) || document.createElement("div");
const onPage = (selector) => !!document.querySelector(selector);
// One HTML file per section. Overview is index.html.
const PAGE_FILES = { overview: "index.html", projects: "projects.html", events: "events.html", parts: "parts.html", assembly: "assembly.html", documents: "documents.html", approvals: "approvals.html", "machine-shop": "machine-shop.html", stock: "stock.html", testing: "testing.html", purchasing: "purchasing.html", vendors: "vendors.html", budget: "budget.html", team: "team.html" };
// Hooks that ops.js (loaded after this file) plugs into.
const EXT = { renders: [], seeds: [], can: [], before: [], after: [], inbox: [], projectExtras: [], rowButtons: [] };
// Stages an item can't advance past (no wrapping back to the start).
const FINAL = { purchases: "Received", jobs: "Complete", approvals: "Approved", projects: "Complete", docs: "Released" };
// Purchases above this amount need leadership (President / VP / Chief Mechanic) to approve the quote.
const PURCHASE_LEADERSHIP_LIMIT = 500;
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
// Org structure. `reportsTo` is the leadership title each subteam reports to; `subsystem` maps it onto part subsystems for permissions.
const SUBTEAMS = {
  "Low Voltage": { reportsTo: "Vice President", subsystem: "Electronics" },
  "EV Powertrain": { reportsTo: "Vice President", subsystem: "Powertrain" },
  "Vehicle Dynamics": { reportsTo: "Chief Mechanic", subsystem: "Suspension" },
  "Suspension": { reportsTo: "Chief Mechanic", subsystem: "Suspension" },
  "Driver Interface": { reportsTo: "Chief Mechanic", subsystem: "Chassis" },
  "Frame": { reportsTo: "Chief Mechanic", subsystem: "Chassis" },
  "Driveline": { reportsTo: "Chief Mechanic", subsystem: "Powertrain" },
  "Combustion": { reportsTo: "Chief Mechanic", subsystem: "Powertrain" },
  "Aerodynamics": { reportsTo: "Chief Mechanic", subsystem: "Aero" },
  "Composites": { reportsTo: "Chief Mechanic", subsystem: "Aero" },
  "Manufacturing": { reportsTo: "Chief Mechanic", subsystem: "Chassis" },
  "Business": { reportsTo: "Business Lead", subsystem: "" }
};
const TITLES = ["President", "Vice President", "Chief Mechanic", "Business Lead", "Faculty Advisor"];
const leads = (subsystem, user = me()) => user.roles.includes("Admin") || (user.roles.includes("Subteam Lead") && (user.subsystem === subsystem || (user.leads || []).some((t) => SUBTEAMS[t]?.subsystem === subsystem)));
const own = (row, user = me()) => row.createdBy && row.createdBy === user.id;

const isLeader = (u) => u.roles.includes("Admin") || ["President", "Vice President", "Chief Mechanic"].includes(u.title);
const ledSub = (subteam, u = me()) => !!subteam && (u.leads || []).includes(subteam);
const projectOf = (task) => task && read("projects").find((p) => p.id === task.projectId);
const onProject = (p, u = me()) => p.pocId === u.id || p.createdBy === u.id || (p.assignees || []).includes(u.id);

function can(action, key, row) {
  const u = me();
  if (!u.id) return false;
  if (action === "advance" && row && FINAL[key] && row.status === FINAL[key]) return false;
  const isAdmin = u.roles.includes("Admin");
  switch (`${action}:${key}`) {
    case "create:parts": case "create:purchases": case "create:jobs": case "create:approvals": return true;
    case "create:budgets": case "delete:budgets": return has("Budget Manager");
    case "advance:parts": return true;
    case "delete:parts": case "reparent:parts": return row ? leads(row.subsystem) : SUBSYSTEMS.some((s) => leads(s));
    case "advance:purchases":
      if (row && row.status === "Quoted" && Number(row.amount) > PURCHASE_LEADERSHIP_LIMIT) return isLeader(u) && (isAdmin || !own(row));
      return has("Purchasing Approver") && (isAdmin || !own(row));
    case "delete:purchases": return has("Purchasing Approver") || (own(row) && row.status === "Requested");
    case "advance:jobs": case "delete:jobs": return has("Shop Lead");
    case "advance:approvals": return has("Design Review Approver") && (isAdmin || !own(row));
    case "delete:approvals": return leads(row?.subsystem) || (own(row) && row.status === "Pending Review");
    // Projects: anyone proposes; leadership or the subteam's lead approves (not their own); owner/lead/leadership run it.
    case "create:projects": return true;
    case "advance:projects": {
      if (!row) return isLeader(u) || (u.leads || []).length > 0;
      if (row.status === "Complete") return false;
      if (row.status === "Rejected") return own(row) || isLeader(u);
      if (row.status === "Proposed") return (isLeader(u) || ledSub(row.subteam, u)) && (isAdmin || !own(row));
      return row.pocId === u.id || ledSub(row.subteam, u) || isLeader(u);
    }
    // The POC is picked by the subteam lead (or leadership); the POC can also adjust who is assigned.
    case "assignPoc:projects": return !!row && row.status !== "Rejected" && (ledSub(row.subteam, u) || isLeader(u));
    case "assign:projects": return !!row && row.status !== "Rejected" && (row.pocId === u.id || ledSub(row.subteam, u) || isLeader(u));
    case "reject:projects": return row?.status === "Proposed" && can("advance", "projects", row);
    case "delete:projects": return isLeader(u) || ledSub(row?.subteam, u) || (row && own(row) && ["Proposed", "Rejected"].includes(row.status));
    // Tasks: the project's people add them; assignee or project owner/lead moves them.
    case "create:tasks": return !!row && (onProject(row, u) || ledSub(row.subteam, u) || isLeader(u));
    case "advance:tasks": { const p = projectOf(row); return !!p && (row.assigneeId === u.id || p.pocId === u.id || ledSub(p.subteam, u) || isLeader(u)); }
    case "delete:tasks": { const p = projectOf(row); return !!p && (p.pocId === u.id || ledSub(p.subteam, u) || isLeader(u)); }
    // BOM import is a bulk change, so it's limited to leads.
    case "import:parts": return isAdmin || u.roles.includes("Subteam Lead");
    // Documents: anyone registers; author (or lead) sends for review; a Design Review Approver or the subteam lead releases (not the author).
    case "create:docs": return true;
    case "advance:docs": {
      if (!row) return true;
      if (row.status === "Draft") return row.ownerId === u.id || own(row) || ledSub(row.subteam, u) || isAdmin;
      if (row.status === "In Review") return (has("Design Review Approver") || ledSub(row.subteam, u)) && (isAdmin || (row.ownerId !== u.id && !own(row)));
      return false;
    }
    case "revise:docs": return row?.status === "Released" && (row.ownerId === u.id || ledSub(row.subteam, u) || isAdmin);
    case "delete:docs": return isAdmin || ledSub(row?.subteam, u) || (!!row && row.ownerId === u.id && row.status === "Draft");
    case "manage:team": return isAdmin;
    default: { for (const f of EXT.can) { const r = f(action, key, row, u); if (r !== undefined) return r; } return false; }
  }
}
const whyNot = { "advance:purchases": `Needs Purchasing Approver (and not your own request). Quotes over ${PURCHASE_LEADERSHIP_LIMIT} need the President, VP or Chief Mechanic.`, "advance:approvals": "Needs Design Review Approver (and not your own submission)", "advance:jobs": "Needs Shop Lead", "create:budgets": "Needs Budget Manager" };

function logEvent(text) {
  write("log", [...read("log"), { id: id(), who: me().name, text, at: new Date().toISOString() }].slice(-200));
}

// ---------- Demo data ----------
// Fictional roster: a fixed core (referenced by demo records) plus generated leads and members.
function buildDemoTeam() {
  let seed = 20262027;
  const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const first = ["Alex", "Bailey", "Casey", "Dana", "Eli", "Finley", "Gray", "Harper", "Indi", "Jules", "Kai", "Logan", "Morgan", "Nico", "Oakley", "Parker", "Quinn", "Reese", "Sage", "Taylor", "Uma", "Val", "Wren", "Xander", "Yara", "Zion", "Rowan", "Emery", "Skyler", "Arden", "Blair", "Cam", "Drew", "Ellis", "Hayden", "Jesse", "Kendall", "Lane", "Marlow", "Remy"];
  const last = ["Ashford", "Brightwater", "Calloway", "Dunmore", "Everly", "Fairbanks", "Galloway", "Hartwell", "Ironside", "Jessup", "Kingsley", "Lockridge", "Merriweather", "Northcott", "Oakhurst", "Pemberton", "Quill", "Ravenscroft", "Stonebridge", "Thornbury", "Underhill", "Vance", "Whitlock", "Yardley", "Zeller", "Ashworth", "Blackwood", "Castellan", "Delacroix", "Emberly", "Foxworth", "Greywell"];
  const used = new Set(["Maya Chen", "Noah Williams", "Dr. Kim", "Jordan Lee", "Priya Singh", "Ava Patel", "Sam Ortiz"]);
  const newName = () => { let n; do { n = `${pick(first)} ${pick(last)}`; } while (used.has(n)); used.add(n); return n; };
  const team = [
    { name: "Maya Chen", title: "President", roles: ["Admin"], subteams: ["Vehicle Dynamics"], leads: [] },
    { name: "Jordan Lee", title: "Vice President", roles: ["Design Review Approver"], subteams: ["Low Voltage"], leads: [] },
    { name: "Ava Patel", title: "Chief Mechanic", roles: ["Shop Lead", "Design Review Approver"], subteams: ["Manufacturing"], leads: [] },
    { name: "Noah Williams", title: "Business Lead", roles: ["Purchasing Approver", "Budget Manager"], subteams: ["Business"], leads: ["Business"] },
    { name: "Dr. Kim", title: "Faculty Advisor", roles: ["Design Review Approver"], subteams: [], leads: [] },
    { name: "Priya Singh", title: "", roles: [], subteams: ["EV Powertrain", "Low Voltage"], leads: ["EV Powertrain"] },
    { name: "Sam Ortiz", title: "", roles: [], subteams: ["Low Voltage", "Driver Interface"], leads: [] }
  ];
  const names = Object.keys(SUBTEAMS);
  names.filter((t) => !team.some((m) => m.leads.includes(t))).forEach((t) => {
    const extra = rand() < 0.35 ? [pick(names.filter((x) => x !== t))] : [];
    team.push({ name: newName(), title: "", roles: [], subteams: [t, ...extra], leads: [t] });
  });
  for (let i = 0; i < 36; i++) {
    const count = rand() < 0.55 ? 1 : rand() < 0.75 ? 2 : 3;
    const set = new Set(); while (set.size < count) set.add(pick(names));
    team.push({ name: newName(), title: "", roles: [], subteams: [...set], leads: [] });
  }
  return team.map((m) => ({
    ...m,
    roles: m.leads.length && !m.roles.includes("Subteam Lead") ? [...m.roles, "Subteam Lead"] : m.roles,
    subsystem: m.leads.length ? SUBTEAMS[m.leads[0]].subsystem : ""
  }));
}
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
  if (onPage(`section#${view}`)) return;
  location.href = PAGE_FILES[view] || "index.html";
}

// React Flow (React + ReactDOM + React Flow + flow.js) is only fetched when a map is actually on screen.
let flowLoading = null;
function ensureFlow() {
  if (window.MotorsportFlow?.available) return Promise.resolve(true);
  if (!flowLoading) {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/reactflow@11.11.4/dist/style.css"; document.head.appendChild(css);
    const load = (src) => new Promise((resolve, reject) => { const el = document.createElement("script"); el.src = src; el.onload = resolve; el.onerror = () => reject(new Error(src)); document.head.appendChild(el); });
    flowLoading = load("https://unpkg.com/react@18.3.1/umd/react.production.min.js")
      .then(() => load("https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"))
      .then(() => load("https://unpkg.com/reactflow@11.11.4/dist/umd/index.js"))
      .then(() => load("flow.js"))
      .then(() => !!window.MotorsportFlow?.available)
      .catch(() => false);
  }
  return flowLoading;
}
function withFlow(box, draw) {
  if (window.MotorsportFlow?.available) return draw();
  if (!box.dataset.loading) { box.dataset.loading = "1"; box.innerHTML = `<p class="empty">Loading map…</p>`; }
  ensureFlow().then((ok) => { delete box.dataset.loading; if (ok) draw(); else box.innerHTML = `<p class="empty">The map didn't load. React Flow comes from a CDN, so maps need an internet connection.</p>`; });
}

function loadDemoData() {
  const team = buildDemoTeam().map((m) => ({ ...m, id: id() }));
  write("team", team);
  const idByName = Object.fromEntries(team.map((m) => [m.name, m.id]));
  Object.entries(demoData).forEach(([key, rows]) => write(key, rows.map(({ by, ...row }) => ({ ...row, id: id(), createdAt: new Date().toISOString(), createdBy: idByName[by] || "" }))));
  seedProjects(team);
  seedDocs(team);
  EXT.seeds.forEach((f) => f(team));
  localStorage.setItem(KEYS.me, team[0].id);
  write("log", []);
  logEvent("loaded demo data");
  renderAll();
}
// Demo projects: people come from each project's subteam so assignments look realistic.
function seedProjects(team) {
  // [name, subteam, status, est. cost, target, summary, hasPoc, tasks: [title, status, due]]
  const demo = [
    ["Lightweight front upright", "Suspension", "In Progress", 640, "2027-01-20", "Topology-optimised 7075 upright to cut 180 g of unsprung mass per corner.", true,
      [["FEA load cases from VD", "Done", "2026-11-10"], ["Topology optimisation run", "Done", "2026-11-18"], ["Machining drawings", "In Progress", "2026-11-28"], ["CAM + fixture plan", "To Do", "2026-12-05"], ["Bearing press-fit test", "To Do", "2026-12-15"]]],
    ["Accumulator cooling redesign", "EV Powertrain", "Review", 1200, "2026-12-15", "Ducted airflow through the segments to keep cells under 55 °C in endurance.", true,
      [["CFD of duct inlet", "Done", "2026-10-30"], ["Thermal test on one segment", "Done", "2026-11-12"], ["Fan control logic", "Done", "2026-11-14"], ["Design review packet", "In Progress", "2026-11-20"]]],
    ["CAN telemetry dashboard", "Low Voltage", "Approved", 150, "2027-02-01", "Live pit-side view of CAN data over the radio link.", false, []],
    ["Carbon steering wheel", "Composites", "Proposed", 380, "2027-02-15", "Pre-preg wheel shell around the existing quick release; saves ~300 g.", false, []],
    ["Restrictor CFD study", "Combustion", "Proposed", 0, "2026-12-20", "Compare three converging-diverging profiles before machining a new restrictor.", false, []],
    ["Sponsor outreach packet", "Business", "In Progress", 90, "2026-12-01", "Updated deck and tier sheet for the spring sponsorship push.", true,
      [["Collect season photos", "Done", "2026-11-05"], ["Draft tier sheet", "Blocked", "2026-11-19"], ["Design deck", "To Do", "2026-11-26"]]],
    ["Differential mount v2", "Driveline", "Complete", 210, "2026-10-15", "Stiffer eccentric mounts for chain tensioning.", true,
      [["Redesign eccentric", "Done", "2026-09-20"], ["Machine mounts", "Done", "2026-10-02"], ["Fit check on car", "Done", "2026-10-10"]]],
    ["Active aero DRS flap", "Aerodynamics", "Rejected", 2400, "2027-03-01", "Driver-actuated rear wing flap. Rejected: outside budget this season.", false, []]
  ];
  const projects = []; const tasks = [];
  demo.forEach(([name, subteam, status, estCost, targetDate, summary, hasPoc, taskList], i) => {
    const lead = team.find((m) => (m.leads || []).includes(subteam));
    const members = team.filter((m) => (m.subteams || []).includes(subteam) && !(m.leads || []).includes(subteam));
    const assignees = members.slice(0, 2 + (i % 3)).map((m) => m.id);
    const proposer = members[members.length - 1] || lead;
    const pid = id();
    projects.push({ id: pid, name, subteam, status, estCost: String(estCost), targetDate, summary, assignees, pocId: hasPoc ? assignees[0] : "", createdBy: proposer.id, createdAt: new Date().toISOString(), approvedBy: !["Proposed", "Rejected"].includes(status) ? lead.id : "" });
    taskList.forEach(([title, tStatus, dueDate], k) => tasks.push({ id: id(), projectId: pid, title, status: tStatus, dueDate, assigneeId: assignees[k % assignees.length], createdBy: assignees[0], createdAt: new Date().toISOString() }));
  });
  write("projects", projects); write("tasks", tasks);
}
function seedDocs(team) {
  const parts = read("parts"); const projects = read("projects");
  const prefix = { Powertrain: "PWT", Suspension: "SUS", Brakes: "BRK", Electronics: "ELE", Chassis: "CHS", Aero: "AER", Other: "OTH" }; const counter = {};
  const costs = { "Wheel bearing": 42, "Damper": 410, "Master cylinder": 95, "Caliper": 260, "Brake rotor": 88, "Cell modules": 1450, "BMS": 620, "Inverter": 3900, "Traction motor": 5200, "Engine (600cc)": 2400, "Fuel pump": 140, "ECU": 1100, "Radiator": 180, "LV battery": 230, "CAN node board": 35, "Dash display": 310, "Halfshafts": 190, "Steering rack": 520, "Driver seat": 150 };
  parts.forEach((p) => { const pre = prefix[p.subsystem] || "OTH"; counter[pre] = (counter[pre] || 1000) + 10; p.partNumber = `${pre}-${counter[pre]}`; if (costs[p.name]) p.unitCost = String(costs[p.name]); });
  write("parts", parts);
  const partId = (n) => parts.find((p) => p.name === n)?.id || ""; const projId = (n) => projects.find((p) => p.name === n)?.id || "";
  const ownerFor = (sub, k) => { const m = team.filter((x) => (x.subteams || []).includes(sub) && !(x.leads || []).includes(sub)); return (m[k % Math.max(1, m.length)] || team.find((x) => (x.leads || []).includes(sub)) || team[0]).id; };
  const leadOf = (sub) => team.find((x) => (x.leads || []).includes(sub))?.id || "";
  // [title, type, revision, status, part, project, subteam, earlier released revisions]
  const demo = [
    ["Front upright drawing", "Drawing", "C", "Released", "Front upright", "Lightweight front upright", "Suspension", ["A", "B"]],
    ["Front upright FEA report", "Analysis (FEA/CFD)", "B", "In Review", "Front upright", "Lightweight front upright", "Suspension", ["A"]],
    ["Accumulator segment thermal test", "Test report", "A", "In Review", "Accumulator", "Accumulator cooling redesign", "EV Powertrain", []],
    ["Accumulator enclosure drawing", "Drawing", "C", "Released", "Accumulator enclosure", "", "EV Powertrain", ["A", "B"]],
    ["Shutdown circuit schematic", "Drawing", "A", "Released", "Shutdown circuit", "", "Low Voltage", []],
    ["Structural Equivalency Spreadsheet", "Rules compliance", "2", "Draft", "Steel spaceframe", "", "Frame", ["1"]],
    ["Impact attenuator test data", "Test report", "1", "Released", "Front impact attenuator", "", "Frame", []],
    ["Electrical System Form", "Rules compliance", "1", "In Review", "", "", "Low Voltage", []],
    ["Cost report 2026-27", "Cost report", "A", "Draft", "", "", "Business", []],
    ["Restrictor profile CFD comparison", "Analysis (FEA/CFD)", "A", "Draft", "Intake & restrictor", "Restrictor CFD study", "Combustion", []],
    ["Sponsor tier sheet", "Presentation", "A", "Draft", "", "Sponsor outreach packet", "Business", []],
    ["Torque wrench calibration SOP", "Procedure / SOP", "B", "Released", "", "", "Manufacturing", ["A"]],
    ["Inverter datasheet", "Datasheet", "A", "Released", "Inverter", "", "EV Powertrain", []]
  ];
  const now = Date.now();
  const docs = demo.map(([title, type, revision, status, part, project, subteam, prior], i) => ({
    id: id(), number: `DOC-${String(i + 1).padStart(4, "0")}`, title, type, revision, status, url: "", partId: partId(part), projectId: projId(project), subteam,
    ownerId: ownerFor(subteam, i), createdBy: ownerFor(subteam, i), releasedBy: status === "Released" ? leadOf(subteam) : "",
    history: prior.map((r) => ({ revision: r, status: "Released", at: "", by: leadOf(subteam) })),
    createdAt: new Date(now - (40 - i) * 864e5).toISOString(), updatedAt: new Date(now - (13 - i) * 864e5).toISOString()
  }));
  write("docs", docs);
  const day = (n) => new Date(now + n * 864e5).toISOString().slice(0, 10);
  const links = { "Structural Equivalency Spreadsheet (SES)": [5, "Structural Equivalency Spreadsheet"], "Impact Attenuator Data (IAD) report": [12, "Impact attenuator test data"], "Electrical System Form (ESF) — EV": [18, "Electrical System Form"], "Cost report": [40, "Cost report 2026-27"], "Team roster & insurance": [-2, ""], "FMEA — EV": [30, ""], "Design report": [60, ""], "Design spec sheet": [60, ""], "Business presentation": [75, "Sponsor tier sheet"] };
  write("deliverables", DEFAULT_DELIVERABLES.map((name) => ({ id: id(), name, dueDate: links[name] ? day(links[name][0]) : "", docId: links[name]?.[1] ? docs.find((d) => d.title === links[name][1])?.id || "" : "" })));
}
function clearWorkspace() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  ensureTeam(); ensureDeliverables();
  renderAll();
}
function ensureTeam() {
  if (!read("team").length) write("team", [{ id: id(), name: "Team Admin", roles: ["Admin"], subsystem: "" }]);
}
$("#seed-data").addEventListener("click", loadDemoData);
$("#clear-data").addEventListener("click", clearWorkspace);
$("#user-select").addEventListener("change", (e) => { localStorage.setItem(KEYS.me, e.target.value); renderAll(); });

// ---------- Renderers ----------
// "⚙ part · ◆ project · budget" line under a purchase or job.
const linkLine = (row) => { const part = row.partId && read("parts").find((x) => x.id === row.partId); const proj = row.projectId && read("projects").find((x) => x.id === row.projectId); const bits = [part && `⚙ ${part.name}`, proj && `◆ ${proj.name}`, row.category && `${row.category} budget`].filter(Boolean); return bits.length ? `<div class="hint">${esc(bits.join(" · "))}</div>` : ""; };
const memberName = (memberId) => read("team").find((m) => m.id === memberId)?.name || "—";
const actions = (key, row, advanceLabel = "Advance") => {
  const out = [];
  if (can("advance", key, row)) out.push(`<button class="link" data-action="advance" data-key="${key}" data-id="${row.id}">${advanceLabel}</button>`);
  else if (whyNot[`advance:${key}`]) out.push(`<span class="locked" title="${esc(whyNot[`advance:${key}`])}">🔒</span>`);
  EXT.rowButtons.forEach((f) => { const b = f(key, row); if (b) out.push(b); });
  if (can("delete", key, row)) out.push(`<button class="link danger" data-action="delete" data-key="${key}" data-id="${row.id}">Delete</button>`);
  return out.join("");
};

function renderUser() {
  const team = read("team"); const u = me();
  $("#user-select").innerHTML = team.map((m) => `<option value="${m.id}" ${m.id === u.id ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  const chips = [...(u.title ? [u.title] : []), ...(u.leads || []).map((t) => `★ ${t} Lead`), ...u.roles.filter((r) => r !== "Subteam Lead")];
  $("#user-roles").innerHTML = (chips.length ? chips : ["Member"]).map((r) => `<span class="role-chip">${esc(r)}</span>`).join("");
  document.querySelectorAll("[data-perm]").forEach((el) => { const [action, key] = el.dataset.perm.split(":"); const ok = can(action, key); el.querySelector("form")?.classList.toggle("hidden", !ok); el.querySelector(".no-perm")?.classList.toggle("hidden", ok); });
}
function renderParts() {
  const query = ($("#part-search")?.value || "").trim().toLowerCase();
  const rows = read("parts").filter((part) => Object.values(part).join(" ").toLowerCase().includes(query));
  $("#parts-body").innerHTML = rows.map((part) => `<tr><td class="mono">${esc(part.partNumber || "—")}</td><td>${esc(part.name)}</td><td>${esc(part.subsystem)}</td><td><span class="plat ${platformOf(part).toLowerCase()}">${esc(platformOf(part))}</span></td><td>${esc(part.quantity)}</td><td>${part.unitCost ? money(part.unitCost) : "—"}</td><td>${esc(part.location)}</td><td><span class="status">${esc(part.status)}</span></td><td>${actions("parts", part)}</td></tr>`).join("");
  $("#parts-empty").style.display = rows.length ? "none" : "block";
}
function renderPurchases() {
  const rows = read("purchases");
  const today = new Date().toISOString().slice(0, 10);
  $("#purchases-body").innerHTML = rows.map((item) => `<tr><td>${esc(item.item)}${linkLine(item)}</td><td>${esc(item.vendor)}</td><td>${money(item.amount)}${Number(item.amount) > PURCHASE_LEADERSHIP_LIMIT && ["Requested", "Quoted"].includes(item.status) ? `<div class="hint">needs leadership</div>` : ""}</td><td class="${item.neededBy && item.neededBy < today && !["Received"].includes(item.status) ? "overdue-text" : ""}">${esc(item.neededBy)}</td><td>${esc(memberName(item.createdBy))}</td><td><span class="status">${esc(item.status)}</span></td><td>${actions("purchases", item)}</td></tr>`).join("");
  $("#purchases-empty").style.display = rows.length ? "none" : "block";
  $("#vendor-count").textContent = `${new Set(rows.map((item) => item.vendor)).size} vendors`;
}
function renderJobs() {
  const rows = read("jobs");
  const today = new Date().toISOString().slice(0, 10);
  $("#jobs-body").innerHTML = rows.map((job) => `<tr><td>${esc(job.name)}${linkLine(job)}</td><td>${esc(job.ownerId ? memberName(job.ownerId) : job.owner || "—")}</td><td>${esc(job.machine || "—")}${job.hours ? `<div class="hint">${esc(job.hours)} h</div>` : ""}</td><td>${esc(job.material)}</td><td class="${job.dueDate && job.dueDate < today && job.status !== "Complete" ? "overdue-text" : ""}">${esc(job.dueDate)}</td><td><span class="priority ${esc(String(job.priority).toLowerCase())}">${esc(job.priority)}</span></td><td>${esc(job.status)}</td><td>${actions("jobs", job)}</td></tr>`).join("");
  $("#jobs-empty").style.display = rows.length ? "none" : "block";
}
function renderBudgets() {
  const rows = read("budgets");
  const purchases = read("purchases");
  $("#budget-list").innerHTML = rows.map((budget) => { const linked = purchases.filter((x) => x.category === budget.category && ["Ordered", "Received"].includes(x.status)); const committed = purchases.filter((x) => x.category === budget.category && ["Approved"].includes(x.status)).reduce((s2, x) => s2 + Number(x.amount || 0), 0); const spent = Number(budget.spent || 0) + linked.reduce((s2, x) => s2 + Number(x.amount || 0), 0); const remaining = Number(budget.budget) - spent; const percent = Math.min(100, spent / Math.max(1, Number(budget.budget)) * 100); return `<div class="budget-row${remaining < 0 ? " over" : ""}"><div><strong>${esc(budget.category)}</strong><span>${money(spent)} spent of ${money(budget.budget)} · ${money(remaining)} remaining${linked.length ? ` · incl. ${linked.length} linked purchase${linked.length > 1 ? "s" : ""}` : ""}${committed ? ` · ${money(committed)} approved, not yet ordered` : ""}</span></div><div class="progress"><i style="width:${percent}%"></i></div>${can("delete", "budgets", budget) ? `<button class="link danger" data-action="delete" data-key="budgets" data-id="${budget.id}">Remove</button>` : "<span></span>"}</div>`; }).join("");
  $("#budget-empty").style.display = rows.length ? "none" : "block";
}
function renderApprovals() {
  const rows = read("approvals");
  $("#approvals-body").innerHTML = rows.map((approval) => `<tr><td>${esc(approval.name)}</td><td>${esc(approval.subsystem)}</td><td>${esc(approval.revision)}</td><td>${esc(memberName(approval.createdBy))}</td><td>${esc(approval.reviewer)}</td><td><span class="status">${esc(approval.status)}</span></td><td>${actions("approvals", approval, "Review")}</td></tr>`).join("");
  $("#approvals-empty").style.display = rows.length ? "none" : "block";
}
function renderTeam() {
  const team = read("team"); const manage = can("manage", "team");
  $("#team-count").textContent = `${team.length} members · ${Object.keys(SUBTEAMS).length} subteams`;
  const subteamCell = (m) => (m.subteams || []).map((t) => `<span class="team-tag${(m.leads || []).includes(t) ? " lead" : ""}">${(m.leads || []).includes(t) ? "★ " : ""}${esc(t)}</span>`).join(" ") || "—";
  $("#team-body").innerHTML = team.map((m) => `<tr><td><strong>${esc(m.name)}</strong></td><td>${esc(m.title || ((m.leads || []).length ? "Subteam Lead" : "Member"))}</td><td>${subteamCell(m)}</td><td>${m.roles.filter((r) => r !== "Subteam Lead").map((r) => `<span class="role-chip">${esc(r)}</span>`).join(" ") || `<span class="hint">—</span>`}</td><td>${manage && team.length > 1 && m.id !== me().id ? `<button class="link danger" data-action="remove-member" data-id="${m.id}">Remove</button>` : ""}</td></tr>`).join("");
  $("#role-guide").innerHTML = `<li><strong>Member</strong> (everyone): add parts, submit purchase requests, shop jobs, and design reviews</li>` + Object.entries(ROLES).map(([r, d]) => `<li><strong>${esc(r)}</strong>: ${esc(d)}</li>`).join("");
}
function renderOverview() {
  const purchases = read("purchases"); const jobs = read("jobs"); const approvals = read("approvals"); const parts = read("parts"); const u = me();
  $("#stats").innerHTML = [["Parts tracked", parts.length, "parts"], ["Open purchases", purchases.filter((x) => x.status !== "Received").length, "requests"], ["Shop queue", jobs.filter((x) => x.status !== "Complete").length, "jobs"], ["Pending approvals", approvals.filter((x) => x.status !== "Approved").length, "reviews"]].map(([label, value, suffix]) => `<div class="stat"><span>${label}</span><strong>${value}</strong><small>${suffix}</small></div>`).join("");
  const projects = read("projects"); const projName = (pid) => projects.find((p) => p.id === pid)?.name || "?";
  const today = new Date().toISOString().slice(0, 10);
  const inbox = [
    ...EXT.inbox.flatMap((f) => f(u)),
    ...read("docs").filter((d) => d.status === "In Review" && can("advance", "docs", d)).map((d) => `Document: ${d.number} ${d.title} Rev ${d.revision} is ready to release`),
    ...(isLeader(u) ? read("deliverables").filter((x) => x.dueDate && x.dueDate <= new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10) && read("docs").find((d) => d.id === x.docId)?.status !== "Released").map((x) => `Deliverable: ${x.name} ${x.dueDate < today ? "is overdue" : "is due " + x.dueDate}`) : []),
    ...projects.filter((p) => p.status === "Proposed" && can("advance", "projects", p)).map((p) => `Project proposal: ${p.name} (${p.subteam}) needs approval`),
    ...projects.filter((p) => !p.pocId && !["Proposed", "Rejected", "Complete"].includes(p.status) && can("assignPoc", "projects", p)).map((p) => `Project: ${p.name} needs a POC`),
    ...read("tasks").filter((t) => t.assigneeId === u.id && t.status !== "Done").map((t) => `Task: ${t.title} (${projName(t.projectId)}) is ${t.status}${t.dueDate ? `, due ${t.dueDate}` : ""}`),
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
  if (!window.MotorsportFlow?.available) return withFlow(box, renderFlow);
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

// ---------- Projects & tasks ----------
// Lifecycle: Proposed → Approved → In Progress → Review → Complete (or Rejected at the proposal stage).
// Several people can be assigned; one of them is the POC, picked by the subteam lead (or leadership).
let projectFilter = "Active"; let projectMineOnly = false;
const stageClass = (s) => s.toLowerCase().replace(/\s+/g, "-");
const memberOpts = (ids, selected = "", blank = "") => {
  const team = read("team"); const first = ids.map((i) => team.find((m) => m.id === i)).filter(Boolean);
  const rest = team.filter((m) => !ids.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name));
  const opt = (m) => `<option value="${m.id}" ${m.id === selected ? "selected" : ""}>${esc(m.name)}</option>`;
  return (blank ? `<option value="">${esc(blank)}</option>` : "") + (first.length ? `<optgroup label="On this project">${first.map(opt).join("")}</optgroup><optgroup label="Everyone else">${rest.map(opt).join("")}</optgroup>` : rest.map(opt).join(""));
};
function renderProjectForm() {
  const sub = $("#project-subteam"); const cur = sub.value;
  sub.innerHTML = `<option value="">Select</option>` + Object.keys(SUBTEAMS).map((t) => `<option ${t === cur ? "selected" : ""}>${esc(t)}</option>`).join("");
  const people = $("#project-assignees"); const chosen = [...people.selectedOptions].map((o) => o.value);
  people.innerHTML = [...read("team")].sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<option value="${m.id}" ${chosen.includes(m.id) ? "selected" : ""}>${esc(m.name)}${(m.subteams || []).length ? ` · ${esc(m.subteams.join(", "))}` : ""}</option>`).join("");
}
function renderProjects() {
  const projects = read("projects"); const tasks = read("tasks"); const u = me();
  const shown = projects.filter((p) => {
    const f = projectFilter;
    const stageOk = f === "All" || (f === "Active" ? !["Complete", "Rejected"].includes(p.status) : p.status === f);
    return stageOk && (!projectMineOnly || onProject(p, u) || tasks.some((t) => t.projectId === p.id && t.assigneeId === u.id));
  });
  $("#project-counts").innerHTML = ["Proposed", "Approved", "In Progress", "Review", "Complete", "Rejected"].map((s) => `<span class="count-chip ${stageClass(s)}">${s} <b>${projects.filter((p) => p.status === s).length}</b></span>`).join("");
  $("#projects-list").innerHTML = shown.map((p) => {
    const pt = tasks.filter((t) => t.projectId === p.id); const done = pt.filter((t) => t.status === "Done").length; const pct = pt.length ? Math.round(done / pt.length * 100) : 0;
    const canAssign = can("assign", "projects", p);
    const people = (p.assignees || []).map((a) => `<span class="person-chip${a === p.pocId ? " poc" : ""}">${a === p.pocId ? "POC · " : ""}${esc(memberName(a))}${canAssign && a !== p.pocId ? `<button class="x" data-action="unassign" data-key="projects" data-id="${p.id}" data-member="${a}" title="Remove from project">×</button>` : ""}</span>`).join(" ") || `<span class="hint">Nobody yet</span>`;
    const btns = [];
    if (p.status === "Proposed" && can("advance", "projects", p)) btns.push(`<button class="small" data-action="advance" data-key="projects" data-id="${p.id}">Approve</button><button class="small secondary" data-action="reject" data-key="projects" data-id="${p.id}">Reject</button>`);
    else if (p.status === "Proposed") btns.push(`<span class="hint">Awaiting approval from the ${esc(p.subteam)} lead or leadership</span>`);
    else if (p.status === "Rejected" && can("advance", "projects", p)) btns.push(`<button class="small secondary" data-action="advance" data-key="projects" data-id="${p.id}">Resubmit</button>`);
    else if (can("advance", "projects", p)) btns.push(`<button class="small" data-action="advance" data-key="projects" data-id="${p.id}">Move to ${next.projects[next.projects.indexOf(p.status) + 1]}</button>`);
    if (can("delete", "projects", p)) btns.push(`<button class="link danger" data-action="delete" data-key="projects" data-id="${p.id}">Delete</button>`);
    const pocCtl = can("assignPoc", "projects", p) ? `<label class="inline small">POC <select data-poc="${p.id}">${memberOpts(p.assignees || [], p.pocId || "", "— Not set —")}</select></label>` : "";
    const addCtl = canAssign ? `<label class="inline small">Assign <select data-assign="${p.id}">${memberOpts([], "", "Add a person…")}</select></label>` : "";
    const taskRows = pt.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(memberName(t.assigneeId))}</td><td>${esc(t.dueDate || "—")}</td><td><span class="status task-${stageClass(t.status)}">${esc(t.status)}</span></td><td>${can("advance", "tasks", t) ? `<button class="link" data-action="advance" data-key="tasks" data-id="${t.id}">Advance</button>` : ""}${can("delete", "tasks", t) ? `<button class="link danger" data-action="delete" data-key="tasks" data-id="${t.id}">Delete</button>` : ""}</td></tr>`).join("");
    const taskForm = can("create", "tasks", p) && !["Rejected", "Complete"].includes(p.status) ? `<form class="task-form" data-project="${p.id}"><input name="title" placeholder="New task" required /><select name="assigneeId" required>${memberOpts(p.assignees || [], "", "Assign to…")}</select><input name="dueDate" type="date" /><button class="small">Add task</button></form>` : "";
    return `<article class="project stage-${stageClass(p.status)}">
      <header><div><h3>${esc(p.name)}</h3><div class="meta"><span class="team-tag">${esc(p.subteam)}</span><span>Proposed by ${esc(memberName(p.createdBy))}</span>${p.estCost ? `<span>${money(p.estCost)} est.</span>` : ""}${p.targetDate ? `<span>Target ${esc(p.targetDate)}</span>` : ""}</div></div><span class="stage-chip ${stageClass(p.status)}">${esc(p.status)}</span></header>
      ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ""}
      <div class="people"><span class="label">Team</span>${people}${p.pocId ? "" : `<span class="warn-chip">No POC yet</span>`}</div>
      ${pocCtl || addCtl ? `<div class="assign-row">${pocCtl}${addCtl}</div>` : ""}
      <div class="progress-row"><div class="progress"><i style="width:${pct}%"></i></div><span>${done}/${pt.length} tasks · ${pct}%</span></div>
      ${EXT.projectExtras.map((f) => f(p)).join("")}
      ${(() => { const pd = read("docs").filter((d) => d.projectId === p.id); return pd.length ? `<div class="people"><span class="label">Docs</span>${pd.map((d) => `<span class="doc-chip doc-${stageClass(d.status)}" title="${esc(d.title)}">${esc(d.number)} Rev ${esc(d.revision)} · ${esc(d.status)}</span>`).join(" ")}</div>` : ""; })()}
      <details ${pt.length && pt.length <= 6 && p.status !== "Proposed" ? "open" : ""}><summary>Tasks (${pt.length})</summary>${pt.length ? `<div class="table-wrap"><table class="compact"><thead><tr><th>Task</th><th>Assignee</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${taskRows}</tbody></table></div>` : `<p class="hint">No tasks yet.</p>`}${taskForm}</details>
      <footer>${btns.join("")}</footer></article>`;
  }).join("");
  $("#projects-empty").style.display = shown.length ? "none" : "block";
}
document.querySelectorAll("#project-filter button").forEach((b) => b.addEventListener("click", () => { projectFilter = b.dataset.filter; document.querySelectorAll("#project-filter button").forEach((x) => x.classList.toggle("active", x === b)); renderProjects(); }));
$("#project-mine").addEventListener("change", (e) => { projectMineOnly = e.target.checked; renderProjects(); });
document.addEventListener("change", (e) => {
  const poc = e.target.closest("[data-poc]"); const add = e.target.closest("[data-assign]");
  if (!poc && !add) return;
  const projects = read("projects"); const p = projects.find((x) => x.id === (poc ? poc.dataset.poc : add.dataset.assign)); if (!p) return;
  if (poc) {
    if (!can("assignPoc", "projects", p)) return flash("Only the subteam lead or leadership can set the POC.");
    p.pocId = poc.value; if (p.pocId && !(p.assignees || []).includes(p.pocId)) p.assignees = [...(p.assignees || []), p.pocId];
    logEvent(p.pocId ? `made ${memberName(p.pocId)} POC of "${p.name}"` : `cleared the POC of "${p.name}"`);
    if (p.pocId && typeof notify === "function") notify(p.pocId, `You're now POC of "${p.name}"`);
  } else {
    if (!add.value || !can("assign", "projects", p)) return;
    p.assignees = [...new Set([...(p.assignees || []), add.value])]; logEvent(`assigned ${memberName(add.value)} to "${p.name}"`);
    if (typeof notify === "function") notify(add.value, `You were added to project "${p.name}"`);
  }
  write("projects", projects); renderAll();
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest(".task-form"); if (!form) return;
  e.preventDefault();
  const p = read("projects").find((x) => x.id === form.dataset.project);
  if (!can("create", "tasks", p)) return flash("Only people on this project can add tasks.");
  const v = formValues(form);
  write("tasks", [...read("tasks"), { id: id(), projectId: p.id, title: v.title, assigneeId: v.assigneeId, dueDate: v.dueDate, status: "To Do", createdBy: me().id, createdAt: new Date().toISOString() }]);
  logEvent(`added task "${v.title}" to "${p.name}" for ${memberName(v.assigneeId)}`);
  if (typeof notify === "function") notify(v.assigneeId, `New task for you: "${v.title}" (${p.name})${v.dueDate ? `, due ${v.dueDate}` : ""}`);
  renderAll();
});
$("#project-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const project = { id: id(), name: form.get("name"), subteam: form.get("subteam"), summary: form.get("summary"), estCost: form.get("estCost"), targetDate: form.get("targetDate"), assignees: form.getAll("assignees"), pocId: "", status: "Proposed", createdBy: me().id, createdAt: new Date().toISOString() };
  write("projects", [...read("projects"), project]); logEvent(`proposed project "${project.name}" for ${project.subteam}`); e.target.reset(); renderAll();
});

// ---------- BOM import / export ----------
// Accepts CSV (file or paste) from a CAD/PLM export or spreadsheet. Columns are matched by header name and can be
// remapped in the preview. An indented BOM (a "Level" column) is turned into parent links automatically.
const BOM_FIELDS = {
  partNumber: ["part number", "part no", "part no.", "pn", "p/n", "part #", "number", "item number"],
  name: ["name", "part name", "description", "part", "item", "title"],
  quantity: ["qty", "quantity", "count", "qty per"],
  parent: ["parent", "assembly", "parent assembly", "next assy", "next assembly", "parent part"],
  level: ["level", "lvl", "indent", "bom level"],
  subsystem: ["subsystem", "system", "subteam", "category"],
  platform: ["platform", "car", "vehicle", "used on", "variant"],
  unitCost: ["unit cost", "cost", "price", "unit price", "cost each"],
  material: ["material", "mat'l"],
  supplier: ["supplier", "vendor", "source", "manufacturer"],
  location: ["location", "bin", "storage"],
  status: ["status", "state", "lifecycle"]
};
const BOM_LABELS = { partNumber: "Part number", name: "Name", quantity: "Qty", parent: "Parent", level: "Level", subsystem: "Subsystem", platform: "Used on", unitCost: "Unit cost", material: "Material", supplier: "Supplier", location: "Location", status: "Status" };
let bomPreview = null;

function parseCSV(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  const delim = (text.split("\n")[0].match(/\t/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell.trim()); if (row.some((c) => c !== "")) rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell.trim()); if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}
function guessMapping(headers) {
  const map = {};
  headers.forEach((h, i) => { const key = h.toLowerCase().replace(/\s+/g, " ").trim(); const field = Object.keys(BOM_FIELDS).find((f) => BOM_FIELDS[f].includes(key) && !(f in map)); if (field) map[field] = i; });
  return map;
}
const normPlatform = (v) => { const s = String(v || "").toLowerCase(); const ev = /\bev\b|electric/.test(s); const ice = /\bice\b|combustion|ic\b/.test(s); return ev && !ice ? "EV" : ice && !ev ? "ICE" : "Both"; };
const normSubsystem = (v) => { const s = String(v || "").trim(); const hit = [...SUBSYSTEMS, "Other"].find((x) => x.toLowerCase() === s.toLowerCase()); return hit || SUBTEAMS[Object.keys(SUBTEAMS).find((t) => t.toLowerCase() === s.toLowerCase())]?.subsystem || (s ? "Other" : "Other"); };
const normStatus = (v) => next.parts.find((x) => x.toLowerCase() === String(v || "").trim().toLowerCase()) || "In Design";

function bomRowsToParts(preview) {
  const { rows, mapping } = preview; const get = (r, f) => (mapping[f] !== undefined && mapping[f] !== "" ? r[mapping[f]] ?? "" : "");
  const stack = []; const out = [];
  rows.forEach((r) => {
    const name = get(r, "name") || get(r, "partNumber"); if (!name) return;
    let parent = get(r, "parent");
    if (!parent && mapping.level !== undefined && mapping.level !== "") {
      const lvl = Math.max(0, parseInt(get(r, "level"), 10) || 0);
      stack.length = lvl; parent = lvl > 0 ? stack[lvl - 1] || "" : ""; stack[lvl] = name;
    }
    out.push({ name, partNumber: get(r, "partNumber"), quantity: String(parseInt(get(r, "quantity"), 10) || 1), parent, subsystem: normSubsystem(get(r, "subsystem")), platform: normPlatform(get(r, "platform")), unitCost: String(parseFloat(String(get(r, "unitCost")).replace(/[^0-9.]/g, "")) || ""), material: get(r, "material"), supplier: get(r, "supplier"), location: get(r, "location") || "Unassigned", status: normStatus(get(r, "status")) });
  });
  // Parent may be given as a part number; translate to the part's name so the tree links up.
  const nameByPn = Object.fromEntries([...read("parts"), ...out].filter((p) => p.partNumber).map((p) => [p.partNumber, p.name]));
  out.forEach((p) => { if (p.parent && nameByPn[p.parent]) p.parent = nameByPn[p.parent]; });
  return out;
}
function loadBomText(text, source) {
  const rows = parseCSV(text);
  if (rows.length < 2) { flash("That BOM needs a header row and at least one part."); return; }
  const headers = rows[0]; bomPreview = { headers, rows: rows.slice(1), mapping: guessMapping(headers), source };
  renderBomPreview();
}
function renderBomPreview() {
  const box = $("#bom-preview");
  if (!bomPreview) { box.innerHTML = ""; return; }
  const { headers, mapping, source } = bomPreview; const parts = bomRowsToParts(bomPreview);
  const existing = read("parts"); const pnSet = new Set(existing.filter((p) => p.partNumber).map((p) => p.partNumber));
  const updates = parts.filter((p) => p.partNumber && pnSet.has(p.partNumber)).length;
  const missingParents = parts.filter((p) => p.parent && !parts.some((q) => q.name === p.parent) && !existing.some((q) => q.name === p.parent)).length;
  const selects = Object.keys(BOM_FIELDS).map((f) => `<label>${BOM_LABELS[f]}${f === "name" ? " *" : ""}<select data-bom-field="${f}"><option value="">— skip —</option>${headers.map((h, i) => `<option value="${i}" ${mapping[f] === i ? "selected" : ""}>${esc(h)}</option>`).join("")}</select></label>`).join("");
  const total = parts.reduce((s, p) => s + (Number(p.unitCost) || 0) * Number(p.quantity), 0);
  box.innerHTML = `
    <div class="bom-summary"><strong>${parts.length} parts</strong> from ${esc(source)} · ${updates} match existing part numbers · BOM cost ${money(total)}${missingParents ? ` · <span class="warn-chip">${missingParents} parent${missingParents > 1 ? "s" : ""} not found (they'll sit at top level)</span>` : ""}</div>
    <details open><summary>Column mapping</summary><div class="form-grid bom-map">${selects}</div></details>
    <div class="table-wrap"><table class="compact"><thead><tr><th>P/N</th><th>Name</th><th>Parent</th><th>Qty</th><th>Subsystem</th><th>Used on</th><th>Unit cost</th></tr></thead><tbody>${parts.slice(0, 12).map((p) => `<tr><td>${esc(p.partNumber || "—")}</td><td>${esc(p.name)}</td><td>${esc(p.parent || "—")}</td><td>${esc(p.quantity)}</td><td>${esc(p.subsystem)}</td><td><span class="plat ${p.platform.toLowerCase()}">${p.platform}</span></td><td>${p.unitCost ? money(p.unitCost) : "—"}</td></tr>`).join("")}</tbody></table></div>
    ${parts.length > 12 ? `<p class="hint">…and ${parts.length - 12} more</p>` : ""}
    <div class="bom-actions"><label class="check"><input type="checkbox" id="bom-merge" checked />Update parts whose part number already exists (otherwise add everything as new)</label><button id="bom-import" ${parts.length ? "" : "disabled"}>Import ${parts.length} parts</button><button class="ghost" id="bom-cancel">Cancel</button></div>`;
}
function importBom() {
  if (!can("import", "parts")) { flash("Only Subteam Leads or an Admin can bulk-import a BOM."); return; }
  const incoming = bomRowsToParts(bomPreview); const merge = $("#bom-merge").checked; const parts = read("parts");
  let added = 0, updated = 0;
  incoming.forEach((p) => {
    const hit = merge && p.partNumber && parts.find((x) => x.partNumber === p.partNumber);
    if (hit) { Object.entries(p).forEach(([k, v]) => { if (v !== "" && !(k === "location" && v === "Unassigned")) hit[k] = v; }); updated++; }
    else { parts.push({ ...p, id: id(), createdAt: new Date().toISOString(), createdBy: me().id }); added++; }
  });
  write("parts", parts); logEvent(`imported a BOM from ${bomPreview.source}: ${added} added, ${updated} updated`);
  flash(`BOM imported: ${added} added, ${updated} updated.`); bomPreview = null; renderAll();
}
function downloadFile(name, text, type = "text/csv") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v) => /[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "");
function exportBom() {
  const cols = ["partNumber", "name", "parent", "quantity", "subsystem", "platform", "unitCost", "material", "supplier", "location", "status"];
  const lines = [cols.map((c) => BOM_LABELS[c] || c).join(","), ...read("parts").map((p) => cols.map((c) => csvCell(p[c])).join(","))];
  downloadFile(`bom-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n")); logEvent("exported the BOM");
}
const BOM_TEMPLATE = "Level,Part Number,Description,Qty,Subsystem,Used On,Unit Cost,Material,Supplier\n0,SUS-1000,Front suspension assembly,1,Suspension,Both,,,\n1,SUS-1100,Front upright,2,Suspension,Both,320,7075-T6,In-house\n2,SUS-1110,Wheel bearing,2,Suspension,Both,45,,SKF-style vendor\n1,SUS-1200,Upper wishbone,2,Suspension,Both,60,4130 tube,In-house\n";
$("#bom-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => loadBomText(t, f.name)); e.target.value = ""; });
$("#bom-paste-go").addEventListener("click", () => { const t = $("#bom-paste").value.trim(); if (t) loadBomText(t, "pasted text"); });
$("#bom-template").addEventListener("click", () => downloadFile("bom-template.csv", BOM_TEMPLATE));
$("#bom-export").addEventListener("click", exportBom);
document.addEventListener("change", (e) => { const sel = e.target.closest("[data-bom-field]"); if (!sel || !bomPreview) return; const f = sel.dataset.bomField; if (sel.value === "") delete bomPreview.mapping[f]; else bomPreview.mapping[f] = Number(sel.value); renderBomPreview(); });
document.addEventListener("click", (e) => { if (e.target.id === "bom-import") importBom(); if (e.target.id === "bom-cancel") { bomPreview = null; renderBomPreview(); } });

// ---------- Documents ----------
// A register of controlled documents (drawings, analyses, test reports, rules paperwork...). Files live wherever the team
// keeps them (Drive, OneDrive, PDM); this tracks number, revision, status, owner, and what part/project each belongs to.
const DOC_TYPES = ["Drawing", "CAD model", "Analysis (FEA/CFD)", "Test report", "Design spec", "Rules compliance", "Cost report", "Procedure / SOP", "Datasheet", "Quote / invoice", "Sponsor agreement", "Presentation"];
let docQuery = ""; let docType = "";
const nextRev = (r) => { const s = String(r || "A").trim(); const m = s.match(/^(.*?)(\d+)$/); if (m) return m[1] + (Number(m[2]) + 1); const l = s.match(/^(.*?)([A-Y])$/i); return l ? l[1] + String.fromCharCode(l[2].charCodeAt(0) + 1) : s + "-1"; };
const docNumber = () => `DOC-${String(read("docs").reduce((n, d) => Math.max(n, parseInt(String(d.number).replace(/\D/g, ""), 10) || 0), 0) + 1).padStart(4, "0")}`;
const docLinkLabel = (d) => { const part = d.partId && read("parts").find((p) => p.id === d.partId); const proj = d.projectId && read("projects").find((p) => p.id === d.projectId); return [part && `⚙ ${part.name}`, proj && `◆ ${proj.name}`].filter(Boolean).join(" · ") || "—"; };
const safeUrl = (u) => /^(https?:|file:|mailto:)/i.test(String(u || "").trim()) ? String(u).trim() : "";
function renderDocForm() {
  const fill = (sel, html) => { const el = $(sel); const cur = el.value; el.innerHTML = html; el.value = cur; };
  fill("#doc-type", DOC_TYPES.map((t) => `<option>${esc(t)}</option>`).join(""));
  fill("#doc-subteam", `<option value="">—</option>` + Object.keys(SUBTEAMS).map((t) => `<option>${esc(t)}</option>`).join(""));
  fill("#doc-part", `<option value="">— None —</option>` + [...read("parts")].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${p.id}">${esc(p.name)}${p.partNumber ? ` (${esc(p.partNumber)})` : ""}</option>`).join(""));
  fill("#doc-project", `<option value="">— None —</option>` + read("projects").map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join(""));
  fill("#doc-filter-type", `<option value="">All types</option>` + DOC_TYPES.map((t) => `<option>${esc(t)}</option>`).join(""));
}
function renderDocs() {
  const docs = read("docs").filter((d) => (!docType || d.type === docType) && (!docQuery || [d.number, d.title, d.type, docLinkLabel(d), memberName(d.ownerId)].join(" ").toLowerCase().includes(docQuery)));
  $("#docs-body").innerHTML = docs.map((d) => {
    const url = safeUrl(d.url); const acts = [];
    if (url) acts.push(`<a class="link-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open</a>`);
    if (d.status !== "Released" && can("advance", "docs", d)) acts.push(`<button class="link" data-action="advance" data-key="docs" data-id="${d.id}">${d.status === "Draft" ? "Send for review" : "Release"}</button>`);
    else if (d.status === "In Review") acts.push(`<span class="locked" title="Needs a Design Review Approver or the subteam lead (not the author)">🔒</span>`);
    if (d.status === "Released" && can("revise", "docs", d)) acts.push(`<button class="link" data-action="revise" data-key="docs" data-id="${d.id}">New rev</button>`);
    if (can("delete", "docs", d)) acts.push(`<button class="link danger" data-action="delete" data-key="docs" data-id="${d.id}">Delete</button>`);
    const hist = (d.history || []).map((h) => `${h.revision} ${h.status}`).join(" → ");
    return `<tr><td class="mono">${esc(d.number)}</td><td><strong>${esc(d.title)}</strong>${hist ? `<div class="hint">History: ${esc(hist)}</div>` : ""}</td><td>${esc(d.type)}</td><td class="mono">${esc(d.revision)}</td><td>${esc(docLinkLabel(d))}</td><td>${esc(memberName(d.ownerId))}</td><td><span class="status doc-${stageClass(d.status)}">${esc(d.status)}</span></td><td class="mono">${esc((d.updatedAt || "").slice(0, 10))}</td><td>${acts.join("")}</td></tr>`;
  }).join("");
  $("#docs-empty").style.display = docs.length ? "none" : "block";
  $("#docs-count").textContent = `${read("docs").length} documents`;
}
$("#doc-search").addEventListener("input", (e) => { docQuery = e.target.value.trim().toLowerCase(); renderDocs(); });
$("#doc-filter-type").addEventListener("change", (e) => { docType = e.target.value; renderDocs(); });
$("#doc-form").addEventListener("submit", (e) => {
  e.preventDefault(); const v = formValues(e.target);
  if (v.url && !safeUrl(v.url)) { flash("Links must start with https://, http://, file: or mailto:"); return; }
  const doc = { id: id(), number: docNumber(), title: v.title, type: v.type, revision: v.revision || "A", url: v.url, partId: v.partId, projectId: v.projectId, subteam: v.subteam, ownerId: me().id, status: "Draft", history: [], createdBy: me().id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  write("docs", [...read("docs"), doc]); logEvent(`registered ${doc.number} "${doc.title}" Rev ${doc.revision}`); e.target.reset(); renderAll();
});

// ---------- Competition deliverables ----------
// Checklist of paperwork due for competition; each item points at a document in the register and shows whether it's released.
const DEFAULT_DELIVERABLES = ["Structural Equivalency Spreadsheet (SES)", "Impact Attenuator Data (IAD) report", "Electrical System Form (ESF) — EV", "FMEA — EV", "Cost report", "Design report", "Design spec sheet", "Business presentation", "Team roster & insurance"];
function renderDeliverables() {
  const list = read("deliverables"); const docs = read("docs"); const manage = isLeader(me()) || (me().leads || []).length > 0; const today = new Date().toISOString().slice(0, 10);
  $("#deliverables-body").innerHTML = list.map((x) => {
    const doc = docs.find((d) => d.id === x.docId);
    const state = !doc ? "Missing" : doc.status === "Released" ? "Ready" : doc.status;
    const days = x.dueDate ? Math.round((new Date(x.dueDate) - new Date(today)) / 864e5) : null;
    const dueCls = state !== "Ready" && days !== null ? (days < 0 ? "overdue" : days <= 21 ? "soon" : "") : "";
    const docCell = manage ? `<select data-deliv-doc="${x.id}"><option value="">— Link a document —</option>${docs.map((d) => `<option value="${d.id}" ${d.id === x.docId ? "selected" : ""}>${esc(d.number)} · ${esc(d.title)}</option>`).join("")}</select>` : doc ? `${esc(doc.number)} · ${esc(doc.title)}` : "—";
    const dueCell = manage ? `<input type="date" data-deliv-due="${x.id}" value="${esc(x.dueDate || "")}" />` : esc(x.dueDate || "—");
    return `<tr><td><strong>${esc(x.name)}</strong></td><td>${docCell}</td><td class="${dueCls}">${dueCell}${dueCls === "overdue" ? `<div class="hint bad">${-days} days overdue</div>` : dueCls === "soon" ? `<div class="hint warn">due in ${days} days</div>` : ""}</td><td><span class="deliv ${stageClass(state)}">${esc(state)}${doc ? ` · Rev ${esc(doc.revision)}` : ""}</span></td></tr>`;
  }).join("");
  const ready = list.filter((x) => docs.find((d) => d.id === x.docId)?.status === "Released").length;
  $("#deliverables-progress").innerHTML = `<div class="progress"><i style="width:${list.length ? ready / list.length * 100 : 0}%"></i></div><span>${ready}/${list.length} ready</span>`;
}
document.addEventListener("change", (e) => {
  const d = e.target.closest("[data-deliv-doc], [data-deliv-due]"); if (!d) return;
  if (!(isLeader(me()) || (me().leads || []).length)) return flash("Only leads and leadership can edit deliverables.");
  const list = read("deliverables"); const x = list.find((i) => i.id === (d.dataset.delivDoc || d.dataset.delivDue)); if (!x) return;
  if (d.dataset.delivDoc !== undefined) { x.docId = d.value; logEvent(`linked "${x.name}" to ${read("docs").find((doc) => doc.id === d.value)?.number || "nothing"}`); }
  else { x.dueDate = d.value; logEvent(`set "${x.name}" due ${d.value || "(none)"}`); }
  write("deliverables", list); renderAll();
});
function ensureDeliverables() { if (!read("deliverables").length) write("deliverables", DEFAULT_DELIVERABLES.map((name) => ({ id: id(), name, docId: "", dueDate: "" }))); }

// ---------- Process maps (React Flow) ----------
// Each process: its stages in order, plus the role that moves an item out of each stage.
const PROCESSES = {
  purchases: { view: "purchasing", label: (r) => `${r.item} · ${money(r.amount)}`, role: "Purchasing Approver", loop: null },
  approvals: { view: "approvals", label: (r) => `${r.name} ${r.revision}`, role: "Design Review Approver", loop: "next revision" },
  jobs: { view: "machine-shop", label: (r) => r.name, role: "Shop Lead", loop: "rework" },
  parts: { view: "parts", label: (r) => r.name, role: "Anyone", loop: "rebuild" },
  docs: { view: "documents", label: (r) => `${r.number} ${r.title} Rev ${r.revision}`, role: ["Author or lead", "Design Review Approver / lead"], loop: "new revision" },
  projects: { view: "projects", label: (r) => r.name, role: ["Subteam lead / leadership", "POC or lead", "POC or lead", "POC or lead"], loop: null }
};
function renderProcess(key) {
  const box = $(`#process-${key}`); const cfg = PROCESSES[key];
  if (!onPage(`#process-${key}`) || box.closest(".collapsed")) return;
  if (!window.MotorsportFlow?.available) return withFlow(box, () => renderProcess(key));
  const rows = read(key); const statuses = next[key];
  const mine = can("advance", key, { createdBy: "__nobody__", subsystem: me().subsystem });
  const stages = statuses.map((s, i) => ({ id: s, label: s, items: rows.filter((r) => r.status === s).map(cfg.label), final: i === statuses.length - 1 }));
  // "Could I move an item out of stage s?" — tested against a stand-in item in my subteam that someone else created.
  const sample = (s) => ({ status: s, createdBy: "__nobody__", subsystem: me().subsystem, subteam: (me().leads || [])[0] || "", pocId: "__nobody__", assignees: [] });
  const edges = statuses.slice(0, -1).map((s, i) => ({ from: s, to: statuses[i + 1], label: Array.isArray(cfg.role) ? cfg.role[i] : cfg.role, mine: key === "projects" || key === "docs" ? can("advance", key, sample(s)) : mine }));
  if (cfg.loop) edges.push({ from: statuses[statuses.length - 1], to: statuses[0], label: cfg.loop, mine });
  window.MotorsportFlow.renderProcess(box, { stages, edges });
}
const renderProcesses = () => Object.keys(PROCESSES).forEach(renderProcess);

// ---------- Org map (React Flow) ----------
let orgFocus = "";
function renderOrg() {
  const box = $("#org-flow");
  if (!onPage("#org-flow")) return;
  if (!window.MotorsportFlow?.available) return withFlow(box, renderOrg);
  const team = read("team");
  const select = $("#org-focus");
  select.innerHTML = `<option value="">Highlight a member…</option>` + [...team].sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<option value="${m.id}" ${m.id === orgFocus ? "selected" : ""}>${esc(m.name)}${(m.subteams || []).length > 1 ? ` (${m.subteams.length} subteams)` : ""}</option>`).join("");
  window.MotorsportFlow.renderOrg(box, { team, subteams: SUBTEAMS, focus: orgFocus, meId: me().id, onFocus: (memberId) => { orgFocus = memberId === orgFocus ? "" : memberId; renderOrg(); } });
}
$("#org-focus").addEventListener("change", (e) => { orgFocus = e.target.value; renderOrg(); });

function flash(text) { const el = $("#toast"); el.textContent = text; el.classList.add("show"); clearTimeout(flash.t); flash.t = setTimeout(() => el.classList.remove("show"), 3200); }

const PAGE_RENDERS = [["#parent-select", () => renderParentOptions()], ["#parts-tree", () => { renderTree(); renderVenn(); renderAssemblyMode(); }], ["#parts-body", () => renderParts()], ["#purchases-body", () => renderPurchases()], ["#jobs-body", () => renderJobs()], ["#budget-list", () => renderBudgets()], ["#approvals-body", () => renderApprovals()], ["#team-body", () => renderTeam()], ["#stats", () => renderOverview()], ["#projects-list", () => { renderProjectForm(); renderProjects(); }], ["#docs-body", () => { renderDocForm(); renderDocs(); renderDeliverables(); }], ["#bom-preview", () => renderBomPreview()], [".flow.short", () => renderProcesses()], ["#org-flow", () => renderOrg()]];
// EXT.renders entries are either a function (always runs) or [selector, fn] (runs when that element is on this page).
const renderAll = () => { renderUser(); PAGE_RENDERS.forEach(([sel, fn]) => { if (onPage(sel)) fn(); }); EXT.renders.forEach((r) => { if (typeof r === "function") r(); else if (onPage(r[0])) r[1](); }); };

// ---------- Forms & actions ----------
const labelOf = (key, row) => row.name || row.item || row.category || row.title || "item";
const nouns = { parts: "part", purchases: "purchase request", jobs: "shop job", budgets: "budget allocation", approvals: "design review", projects: "project", tasks: "task", docs: "document" };
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
  const lead = form.get("lead") || "";
  const subteams = [...new Set([...form.getAll("subteams"), ...(lead ? [lead] : [])])];
  const roles = form.getAll("roles"); if (lead && !roles.includes("Subteam Lead")) roles.push("Subteam Lead");
  const member = { id: id(), name: form.get("name"), title: form.get("title") || "", roles, subteams, leads: lead ? [lead] : [], subsystem: lead ? SUBTEAMS[lead].subsystem : "" };
  write("team", [...read("team"), member]); logEvent(`added ${member.name} to the team`); event.target.reset(); renderAll();
});
$("#member-subteams").innerHTML = Object.keys(SUBTEAMS).map((t) => `<label class="check"><input type="checkbox" name="subteams" value="${esc(t)}" />${esc(t)}</label>`).join("");
$("#member-lead").innerHTML = `<option value="">— None —</option>` + Object.keys(SUBTEAMS).map((t) => `<option>${esc(t)}</option>`).join("");
$("#member-title").innerHTML = `<option value="">Member</option>` + TITLES.map((t) => `<option>${esc(t)}</option>`).join("");
$("#member-roles").innerHTML = Object.keys(ROLES).filter((r) => r !== "Subteam Lead").map((r) => `<label class="check"><input type="checkbox" name="roles" value="${esc(r)}" />${esc(r)}</label>`).join("");
$("#part-search").addEventListener("input", renderParts);

const next = { parts: ["In Design", "Manufacturing", "In Inventory", "Installed", "Damaged"], purchases: ["Requested", "Quoted", "Approved", "Ordered", "Received"], jobs: ["Queued", "In Progress", "Quality Check", "Complete"], approvals: ["Pending Review", "Changes Requested", "Approved"], projects: ["Proposed", "Approved", "In Progress", "Review", "Complete"], tasks: ["To Do", "In Progress", "Blocked", "Done"], docs: ["Draft", "In Review", "Released"] };
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  const { action, key } = button.dataset;
  if (action === "remove-member") {
    if (!can("manage", "team")) return;
    if (!confirm(`Remove ${memberName(button.dataset.id)} from the team?`)) return;
    const team = read("team"); const m = team.find((x) => x.id === button.dataset.id);
    write("team", team.filter((x) => x.id !== button.dataset.id)); logEvent(`removed ${m?.name} from the team`); renderAll(); return;
  }
  const rows = read(key); const row = rows.find((r) => r.id === button.dataset.id); if (!row) return;
  if (action === "unassign") {
    if (!can("assign", "projects", row)) return flash("Only the POC, subteam lead or leadership can change assignments.");
    row.assignees = (row.assignees || []).filter((m) => m !== button.dataset.member); write(key, rows); logEvent(`removed ${memberName(button.dataset.member)} from "${row.name}"`); renderAll(); return;
  }
  if (!can(action, key, row)) { flash("Your roles don't allow this."); return; }
  for (const f of EXT.before) { const err = f(action, key, row); if (err) { flash(err); return; } }
  if (action === "delete" && !confirm(`Delete ${nouns[key] || "item"} "${labelOf(key, row)}"? This can't be undone.`)) return;
  const fromStatus = row.status;
  if (action === "advance") {
    const statuses = next[key];
    const from = row.status;
    row.status = key === "projects" && from === "Rejected" ? "Proposed" : statuses[(statuses.indexOf(from) + 1) % statuses.length];
    row.updatedAt = new Date().toISOString();
    if (key === "docs" && row.status === "Released") { row.releasedBy = me().id; }
    if (key === "projects" && from === "Proposed") { row.approvedBy = me().id; row.approvedAt = new Date().toISOString(); }
    write(key, rows);
    logEvent(key === "projects" && from === "Proposed" ? `approved project proposal "${labelOf(key, row)}"` : key === "projects" && from === "Rejected" ? `resubmitted project "${labelOf(key, row)}"` : `moved ${nouns[key]} "${labelOf(key, row)}" to ${row.status}`);
  } else if (action === "revise") {
    row.history = [...(row.history || []), { revision: row.revision, status: row.status, at: row.updatedAt, by: row.releasedBy || "" }];
    const old = row.revision; row.revision = nextRev(row.revision); row.status = "Draft"; row.updatedAt = new Date().toISOString();
    write(key, rows); logEvent(`started Rev ${row.revision} of ${row.number} "${row.title}" (was Rev ${old})`);
  } else if (action === "reject") {
    row.status = "Rejected"; row.rejectedBy = me().id; write(key, rows); logEvent(`rejected project proposal "${labelOf(key, row)}"`);
  } else if (action === "delete") {
    write(key, rows.filter((r) => r !== row));
    if (key === "projects") write("tasks", read("tasks").filter((t) => t.projectId !== row.id));
    logEvent(`deleted ${nouns[key]} "${labelOf(key, row)}"`);
  }
  EXT.after.forEach((f) => f(action, key, row, fromStatus));
  renderAll();
});

ensureTeam();
ensureDeliverables();
// The first render happens at the end of events.js, once every module has registered its hooks.
