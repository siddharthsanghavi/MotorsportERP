// Vehicles: Car → FSAE cost system → Assembly → Part drill-down on the Parts page, simple part numbers
// (KS10-BR-001), the FSAE cost-event CSV export, and the Assembly graph. Loaded after vendors.js.
Object.assign(KEYS, { vehicles: "motorsport-erp-vehicles", assemblies: "motorsport-erp-assemblies" });
nouns.vehicles = "car"; nouns.assemblies = "assembly";

// The official FSAE cost-report systems, with a 2-letter code for part numbers and the subteam area that owns them.
const FSAE_SYSTEMS = [
  ["Brake System", "BR", "Brakes"],
  ["Drivetrain", "DT", "Powertrain"],
  ["Frame & Body", "FR", "Chassis"],
  ["Instruments, Wiring & Accessories", "EL", "Electronics"],
  ["Miscellaneous, Safety, Finish and Assembly", "MS", "Chassis"],
  ["Steering System", "ST", "Suspension"],
  ["Suspension & Shocks", "SU", "Suspension"],
  ["Wheels, Wheel Bearings & Tires", "WT", "Suspension"]
].map(([name, code, subsystem]) => ({ name, code, subsystem }));
const SYSTEM_NAMES = FSAE_SYSTEMS.map((s) => s.name);
const systemOf = (name) => FSAE_SYSTEMS.find((s) => s.name === name) || FSAE_SYSTEMS[4];
const SUBSYSTEM_TO_SYSTEM = { Powertrain: "Drivetrain", Suspension: "Suspension & Shocks", Brakes: "Brake System", Electronics: "Instruments, Wiring & Accessories", Chassis: "Frame & Body", Aero: "Frame & Body", Other: "Miscellaneous, Safety, Finish and Assembly" };
const DEFAULT_VEHICLES = [{ name: "KS10", platform: "ICE" }, { name: "KS10E", platform: "EV" }];

const vehicles = () => { const v = read("vehicles"); return v.length ? v : DEFAULT_VEHICLES; };
const vehicleNames = () => vehicles().map((v) => v.name);
const partVehicles = (p) => (Array.isArray(p.vehicles) && p.vehicles.length ? p.vehicles : vehicles().filter((v) => p.platform === "Both" || !p.platform || v.platform === p.platform).map((v) => v.name));
const onVehicle = (p, car) => partVehicles(p).includes(car);

// Keep the older fields (subsystem, platform) in step so permissions, testing and the Venn keep working.
function syncPart(p) {
  if (!SYSTEM_NAMES.includes(p.system)) p.system = SUBSYSTEM_TO_SYSTEM[p.subsystem] || SYSTEM_NAMES[4];
  if (!Array.isArray(p.vehicles) || !p.vehicles.length) p.vehicles = partVehicles(p);
  p.subsystem = systemOf(p.system).subsystem;
  const plats = new Set(vehicles().filter((v) => p.vehicles.includes(v.name)).map((v) => v.platform));
  p.platform = plats.size === 1 ? [...plats][0] : "Both";
  if (!p.assembly) p.assembly = "General";
  return p;
}
function nextPartNumber(car, system, parts = read("parts")) {
  const pre = `${car}-${systemOf(system).code}-`;
  const max = parts.filter((p) => String(p.partNumber || "").startsWith(pre)).reduce((m, p) => Math.max(m, parseInt(p.partNumber.slice(pre.length), 10) || 0), 0);
  return pre + String(max + 1).padStart(3, "0");
}

// Older data: system from the subsystem, cars from "Used on", assembly from the nearest ancestor in the same system.
// Each part belongs to exactly one car. A part listed on several cars becomes one copy per car.
function splitShared(parts, renumber = true) {
  const out = [];
  parts.forEach((p) => {
    const cars = partVehicles(p);
    cars.forEach((car, i) => {
      const q = i === 0 ? p : { ...p, id: id(), partNumber: "" };
      q.vehicles = [car]; syncPart(q);
      if (renumber && (!q.partNumber || !String(q.partNumber).startsWith(car + "-"))) q.partNumber = nextPartNumber(car, q.system, [...out, ...parts]);
      out.push(q);
    });
  });
  return out;
}
function migrateParts() {
  if (!read("vehicles").length) write("vehicles", DEFAULT_VEHICLES.map((v) => ({ ...v, id: id() })));
  const parts = read("parts"); if (!parts.some((p) => !p.system || !p.assembly || !Array.isArray(p.vehicles) || p.vehicles.length !== 1)) return ensureAssemblies();
  const byName = Object.fromEntries(parts.map((p) => [p.name, p]));
  parts.forEach((p) => {
    if (p.system && p.assembly && Array.isArray(p.vehicles)) return;
    const sys = SUBSYSTEM_TO_SYSTEM[p.subsystem] || SYSTEM_NAMES[4];
    let a = p; const chain = []; const seen = new Set();
    while (a && !seen.has(a.name)) { seen.add(a.name); chain.push(a); a = a.parent ? byName[a.parent] : null; }
    const pick = chain.slice(1).reverse().find((x) => (SUBSYSTEM_TO_SYSTEM[x.subsystem] || "") === sys && x.parent);
    p.system = p.system || sys; p.assembly = p.assembly || (pick ? pick.name : (chain.length > 1 ? chain[chain.length - 1].name : p.name));
    syncPart(p);
  });
  write("parts", splitShared(parts)); ensureAssemblies();
}
// Every assembly named on a part gets a record, so empty assemblies can exist too.
function ensureAssemblies() {
  const asms = read("assemblies"); const key = (a) => `${a.system}|${a.name}`; const known = new Map(asms.map((a) => [key(a), a])); let changed = false;
  read("parts").forEach((p) => {
    if (!p.assembly) return; const k = `${p.system}|${p.assembly}`; let a = known.get(k);
    if (!a) { a = { id: id(), name: p.assembly, system: p.system, vehicles: [], createdAt: new Date().toISOString() }; asms.push(a); known.set(k, a); changed = true; }
    partVehicles(p).forEach((v) => { if (!a.vehicles.includes(v)) { a.vehicles.push(v); changed = true; } });
  });
  if (changed) write("assemblies", asms);
}

// ---------------------------------------------------------------------
// Parts page: drill-down browser.
// ---------------------------------------------------------------------
const PB_PARAMS = new URLSearchParams(location.search);
const pb = { car: PB_PARAMS.get("car") || "", sys: PB_PARAMS.get("system") || "", asm: PB_PARAMS.get("assembly") || "" };
function pbGo(car = "", sys = "", asm = "") {
  Object.assign(pb, { car, sys, asm });
  const q = new URLSearchParams(Object.entries({ car, system: sys, assembly: asm }).filter(([, v]) => v));
  history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : ""));
  renderPartsBrowser();
}
const statusTally = (ps) => { const t = {}; ps.forEach((p) => { t[p.status] = (t[p.status] || 0) + 1; }); return Object.entries(t).map(([s, n]) => `<span class="status">${n} ${esc(s)}</span>`).join(" ") || '<span class="hint">No parts</span>'; };
const canEditParts = () => can("create", "parts");

function renderPartsBrowser() {
  const box = $("#parts-browser"); const parts = read("parts"); const asms = read("assemblies"); const cars = vehicles();
  if (pb.car && !cars.some((c) => c.name === pb.car)) Object.assign(pb, { car: "", sys: "", asm: "" });
  if (pb.sys && !SYSTEM_NAMES.includes(pb.sys)) Object.assign(pb, { sys: "", asm: "" });
  const crumb = [`<button class="link" data-pb="">Cars</button>`];
  if (pb.car) crumb.push(`<button class="link" data-pb="${esc(pb.car)}">${esc(pb.car)}</button>`);
  if (pb.sys) crumb.push(`<button class="link" data-pb="${esc(pb.car)}" data-pb-sys="${esc(pb.sys)}">${esc(pb.sys)}</button>`);
  if (pb.asm) crumb.push(`<strong>${esc(pb.asm)}</strong>`);
  $("#pb-crumbs").innerHTML = crumb.join('<span class="crumb-sep">›</span>');
  const carParts = pb.car ? parts.filter((p) => onVehicle(p, pb.car)) : [];
  $("#pb-export").classList.toggle("hidden", !pb.car); $("#pb-export").textContent = pb.car ? `Export ${pb.car} cost report BOM (CSV)` : "";

  if (!pb.car) {
    box.innerHTML = `<div class="car-grid">${cars.map((c) => { const ps = parts.filter((p) => onVehicle(p, c.name)); const nAsm = asms.filter((a) => a.vehicles.includes(c.name)).length;
      return `<button class="car-tile" data-pb="${esc(c.name)}"><strong>${esc(c.name)}</strong><span class="plat ${c.platform.toLowerCase()}">${esc(c.platform)}</span><small>${new Set(ps.map((p) => p.system)).size} systems · ${nAsm} assemblies · ${ps.length} parts</small></button>`; }).join("")}
      ${isLeader(me()) || has("Admin") ? `<button class="car-tile add" data-op="add-car"><strong>+ Add a car</strong><small>e.g. KS11 or KS11E</small></button>` : ""}</div>`;
    return;
  }
  if (!pb.sys) {
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>System</th><th>Assemblies</th><th>Parts</th><th></th></tr></thead><tbody>${FSAE_SYSTEMS.map((s) => {
      const ps = carParts.filter((p) => p.system === s.name); const nAsm = asms.filter((a) => a.system === s.name && a.vehicles.includes(pb.car)).length;
      return `<tr class="clickable" data-pb="${esc(pb.car)}" data-pb-sys="${esc(s.name)}"><td><span class="sys-code">${s.code}</span> ${esc(s.name)}</td><td>${nAsm}</td><td>${ps.length}</td><td><button class="secondary" data-pb="${esc(pb.car)}" data-pb-sys="${esc(s.name)}">Open assemblies</button></td></tr>`; }).join("")}</tbody></table></div>`;
    return;
  }
  if (!pb.asm) {
    const list = asms.filter((a) => a.system === pb.sys && a.vehicles.includes(pb.car)).sort((a, b) => a.name.localeCompare(b.name));
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Assembly</th><th>Parts</th><th>Status</th><th></th></tr></thead><tbody>${list.map((a) => {
      const ps = carParts.filter((p) => p.system === pb.sys && p.assembly === a.name);
      return `<tr class="clickable" data-pb="${esc(pb.car)}" data-pb-sys="${esc(pb.sys)}" data-pb-asm="${esc(a.name)}"><td><strong>${esc(a.name)}</strong></td><td>${ps.length}</td><td>${statusTally(ps)}</td><td><button class="secondary" data-pb="${esc(pb.car)}" data-pb-sys="${esc(pb.sys)}" data-pb-asm="${esc(a.name)}">Open parts</button></td></tr>`; }).join("")}</tbody></table></div>
      ${list.length ? "" : `<p class="empty">No assemblies in ${esc(pb.sys)} on ${esc(pb.car)} yet.</p>`}
      ${canEditParts() ? `<form id="asm-form" class="inline-form"><input name="name" placeholder="New assembly name, e.g. Pedal box" required /><button>Add assembly</button></form>` : ""}`;
    return;
  }
  const ps = carParts.filter((p) => p.system === pb.sys && p.assembly === pb.asm).sort((a, b) => String(a.partNumber).localeCompare(String(b.partNumber)));
  const others = cars.filter((c) => c.name !== pb.car);
  box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>P/N</th><th>Part</th><th>Qty</th><th>Material</th><th>Status</th><th></th></tr></thead><tbody>${ps.map((p) => `<tr><td class="mono">${esc(p.partNumber || "—")}</td><td>${esc(p.name)}</td><td>${esc(p.quantity)}</td><td>${esc(p.material || "—")}</td><td><span class="status">${esc(p.status)}</span></td><td>${actions("parts", p)}</td></tr>`).join("")}</tbody></table></div>
    ${ps.length ? "" : `<p class="empty">No parts in this assembly yet.</p>`}
    ${canEditParts() ? `<form id="pb-part-form" class="form-grid pb-part-form">
      <label>Part name<input name="name" required /></label>
      <label>Part number<input name="partNumber" placeholder="${esc(nextPartNumber(pb.car, pb.sys))} (auto)" /></label>
      <label>Qty<input name="quantity" type="number" min="1" value="1" required /></label>
      <label>Material<input name="material" /></label>
      <label>Status<select name="status">${next.parts.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>
      <button>Add part</button></form><p class="hint">Leave the part number blank to get the next one.</p>` : ""}`;
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-pb]"); if (!t || !onPage("#parts-browser")) return;
  pbGo(t.dataset.pb || "", t.dataset.pbSys || "", t.dataset.pbAsm || "");
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "asm-form") {
    e.preventDefault(); const name = new FormData(e.target).get("name").trim(); if (!name) return;
    const asms = read("assemblies"); const hit = asms.find((a) => a.system === pb.sys && a.name.toLowerCase() === name.toLowerCase());
    if (hit) { if (!hit.vehicles.includes(pb.car)) hit.vehicles.push(pb.car); } else asms.push({ id: id(), name, system: pb.sys, vehicles: [pb.car], createdBy: me().id, createdAt: new Date().toISOString() });
    write("assemblies", asms); logEvent(`added assembly ${name} to ${pb.car} ${pb.sys}`); pbGo(pb.car, pb.sys, hit?.name || name);
  }
  if (e.target.id === "pb-part-form") {
    e.preventDefault(); if (!canEditParts()) return flash("Your roles don't allow this.");
    const f = new FormData(e.target); const parts = read("parts");
    const p = syncPart({ id: id(), name: f.get("name").trim(), partNumber: f.get("partNumber").trim() || nextPartNumber(pb.car, pb.sys, parts), quantity: f.get("quantity") || "1", material: f.get("material"), status: f.get("status"), system: pb.sys, assembly: pb.asm, vehicles: [pb.car], parent: "", createdBy: me().id, createdAt: new Date().toISOString() });
    write("parts", [...parts, p]); ensureAssemblies(); logEvent(`added part ${p.partNumber} ${p.name}`); renderAll();
  }
});
OPS["add-car"] = () => openForm("Add a car", [["name", "Car name (e.g. KS11E)", "text"], ["platform", "Powertrain", "select", ["EV", "ICE"]]], { platform: "EV" }, (v) => {
  const name = v.name.trim().toUpperCase(); if (!name) return; if (vehicleNames().includes(name)) return flash(`${name} already exists.`);
  write("vehicles", [...vehicles(), { id: id(), name, platform: v.platform }]); logEvent(`added car ${name}`); renderAll();
});

// FSAE cost-report BOM structure (no costs): one row per part, grouped by system then assembly.
function exportCostBom(car) {
  const head = ["System", "Assembly", "Part Number", "Part", "Qty", "Material"];
  const order = (p) => SYSTEM_NAMES.indexOf(p.system);
  const rows = read("parts").filter((p) => onVehicle(p, car)).sort((a, b) => order(a) - order(b) || a.assembly.localeCompare(b.assembly) || String(a.partNumber).localeCompare(String(b.partNumber))).map((p) => {
    return [p.system, p.assembly, p.partNumber || "", p.name, Number(p.quantity || 1), p.material || ""];
  });
  downloadFile(`${car}-cost-bom-${todayISO()}.csv`, [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")); logEvent(`exported the ${car} cost BOM`);
}
$("#pb-export").addEventListener("click", () => pb.car && exportCostBom(pb.car));

// Edit dialog for parts: car, system and assembly instead of the old subsystem / parent fields.
EDIT_FIELDS.parts = (row) => {
  const names = vehicleNames(); const combos = names.map((n) => [n, n]);
  const asmNames = [...new Set(read("assemblies").filter((a) => a.system === row.system).map((a) => a.name))].sort();
  return [["partNumber", "Part number", "text"], ["name", "Name", "text"], ["vehiclesStr", "Car", "select", combos], ["system", "System", "select", SYSTEM_NAMES], ["assembly", "Assembly", "select", asmNames.includes(row.assembly) ? asmNames : [row.assembly, ...asmNames]], ["quantity", "Quantity", "number"], ["material", "Material", "text"]];
};
const partFormValues = (row) => ({ ...row, vehiclesStr: partVehicles(row).join(",") });
function prepPartEdit(row, vals) {
  if ("vehiclesStr" in vals) { vals.vehicles = String(vals.vehiclesStr).split(",").filter(Boolean); delete vals.vehiclesStr; }
  if (vals.system && vals.system !== row.system) { const cur = String(row.partNumber || ""); const m = cur.match(/^(.+)-([A-Z]{2})-\d{3}$/); if (m && m[2] !== systemOf(vals.system).code && vals.partNumber === cur) vals.partNumber = nextPartNumber(m[1], vals.system); }
}

// ---------------------------------------------------------------------
// Assembly page: graph only, Car → System → Assembly → Part.
// ---------------------------------------------------------------------
let graphCar = "";
function renderAssemblyGraph() {
  const cars = vehicleNames(); if (!cars.includes(graphCar)) graphCar = cars[0] || "";
  $("#graph-car").innerHTML = cars.map((c) => `<button class="${c === graphCar ? "active" : ""}" data-graph-car="${esc(c)}">${esc(c)}</button>`).join("");
  const box = $("#parts-flow"); if (!window.MotorsportFlow?.available) return withFlow(box, renderAssemblyGraph);
  const ps = read("parts").filter((p) => onVehicle(p, graphCar)); const plat = vehicles().find((v) => v.name === graphCar)?.platform || "Both";
  const nodes = [{ id: `car:${graphCar}`, name: graphCar, parentId: "", platform: plat, sub: "Car" }];
  SYSTEM_NAMES.filter((s) => ps.some((p) => p.system === s)).forEach((s) => {
    nodes.push({ id: `sys:${s}`, name: s, parentId: `car:${graphCar}`, platform: plat, sub: `System · ${systemOf(s).code}` });
    [...new Set(ps.filter((p) => p.system === s).map((p) => p.assembly))].sort().forEach((a) => nodes.push({ id: `asm:${s}|${a}`, name: a, parentId: `sys:${s}`, platform: plat, sub: "Assembly", key: `${s}|${a}` }));
  });
  ps.forEach((p) => nodes.push({ id: p.id, name: p.name, parentId: `asm:${p.system}|${p.assembly}`, platform: p.platform, sub: `${p.partNumber || "—"} · ×${p.quantity} · ${p.status}` }));
  $("#flow-hint").textContent = can("reparent", "parts") ? "Drag from an assembly's right handle to a part to move the part into that assembly. Scroll to zoom, drag to pan." : "Scroll to zoom, drag to pan.";
  window.MotorsportFlow.render(box, { parts: nodes, platform: "All", canReparent: can("reparent", "parts"), onReparent: (childId, parentId) => {
    const target = nodes.find((n) => n.id === parentId); const parts = read("parts"); const p = parts.find((x) => x.id === childId);
    if (!p || !target?.key) return flash("Connect an assembly to a part.");
    if (!can("reparent", "parts", p)) return flash(`Only the ${p.subsystem} Subteam Lead can move ${p.name}.`);
    const [sys, asm] = target.key.split("|"); p.system = sys; p.assembly = asm; syncPart(p); write("parts", parts); ensureAssemblies(); logEvent(`moved ${p.name} into ${asm}`); renderAll();
  } });
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-graph-car]"); if (b) { graphCar = b.dataset.graphCar; renderAssemblyGraph(); } });

// ---------------------------------------------------------------------
// Demo data: the demo BOM sorted into cars, FSAE systems and assemblies, with simple part numbers.
// ---------------------------------------------------------------------
EXT.seeds.push(() => {
  write("vehicles", DEFAULT_VEHICLES.map((v) => ({ ...v, id: id() }))); write("assemblies", []);
  const A = {
    "Steel spaceframe": ["Frame & Body", "Chassis"], "Front impact attenuator": ["Frame & Body", "Chassis"], "Firewall": ["Frame & Body", "Chassis"],
    "Front wing": ["Frame & Body", "Aero package"], "Rear wing": ["Frame & Body", "Aero package"], "Undertray": ["Frame & Body", "Aero package"],
    "Driver seat": ["Miscellaneous, Safety, Finish and Assembly", "Driver cell"],
    "Front upright": ["Suspension & Shocks", "Front corner"], "Wishbone set": ["Suspension & Shocks", "Front corner"], "Rocker": ["Suspension & Shocks", "Rocker & damper"], "Damper": ["Suspension & Shocks", "Rocker & damper"],
    "Wheel hub": ["Wheels, Wheel Bearings & Tires", "Hub & bearing"], "Wheel bearing": ["Wheels, Wheel Bearings & Tires", "Hub & bearing"],
    "Brake pedal assembly": ["Brake System", "Pedal box"], "Master cylinder": ["Brake System", "Pedal box"], "Caliper": ["Brake System", "Brake corner"], "Brake rotor": ["Brake System", "Brake corner"], "Regen brake controller": ["Brake System", "Regen braking"],
    "Steering rack": ["Steering System", "Steering column & rack"], "Steering wheel": ["Steering System", "Steering column & rack"],
    "Engine (600cc)": ["Drivetrain", "Engine"], "Intake & restrictor": ["Drivetrain", "Engine"], "Exhaust & muffler": ["Drivetrain", "Engine"], "Fuel tank": ["Drivetrain", "Fuel system"], "Fuel pump": ["Drivetrain", "Fuel system"], "Radiator": ["Drivetrain", "Cooling"],
    "Chain & sprockets": ["Drivetrain", "Final drive"], "Differential": ["Drivetrain", "Final drive"], "Halfshafts": ["Drivetrain", "Final drive"],
    "Accumulator": ["Drivetrain", "Accumulator"], "Accumulator enclosure": ["Drivetrain", "Accumulator"], "Cell modules": ["Drivetrain", "Accumulator"], "Inverter": ["Drivetrain", "Motor & inverter"], "Traction motor": ["Drivetrain", "Motor & inverter"],
    "ECU": ["Instruments, Wiring & Accessories", "Engine control"], "BMS": ["Instruments, Wiring & Accessories", "Accumulator management"], "HV harness": ["Instruments, Wiring & Accessories", "Tractive system wiring"],
    "LV battery": ["Instruments, Wiring & Accessories", "LV system"], "CAN node board": ["Instruments, Wiring & Accessories", "LV system"], "Shutdown circuit": ["Instruments, Wiring & Accessories", "LV system"], "Dash display": ["Instruments, Wiring & Accessories", "Dash"]
  };
  // The old top-level grouping rows (Chassis, Suspension, Brakes…) are replaced by the systems themselves.
  const parts = splitShared(read("parts").filter((p) => A[p.name]).map((p) => { [p.system, p.assembly] = A[p.name]; p.parent = ""; delete p.vehicles; return syncPart(p); }), false); const counters = {};
  parts.forEach((p) => {
    const car = p.vehicles[0]; const pre = `${car}-${systemOf(p.system).code}`;
    counters[pre] = (counters[pre] || 0) + 1; p.partNumber = `${pre}-${String(counters[pre]).padStart(3, "0")}`;
  });
  write("parts", parts); ensureAssemblies();
});

migrateParts();
EXT.renders.push(["#parts-browser", () => { migrateParts(); renderPartsBrowser(); }], ["#parts-flow", () => { renderAssemblyGraph(); }]);
