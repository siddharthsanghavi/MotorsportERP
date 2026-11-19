// Car log for a test session (testing.html?log=<sessionId>): the test plan, personnel, outside conditions,
// pre-run car checks, the setup sheet (and setdown at the end), laps per driver, the timing sheet and a conclusion.
// Everything is stored on the session as `log` and saves as you type. Loaded after manufacturing.js.

const CAR_CHECKS = ["Mechanical inspection", "Tractive battery inspection", "EV active", "Rain test", "Brakes test", "Diff fluid filled", "Cooling system filled", "Driveline bolts check", "Suspension bolts check"];
const CORNERS = [["fl", "Front left"], ["fr", "Front right"], ["rl", "Rear left"], ["rr", "Rear right"]];
const SHOCK = [["lsb", "LS B"], ["lsr", "LS R"], ["hsb", "HS B"], ["hsr", "HS R"], ["springLength", "Spring length"]];
const carName = (platform) => vehicles().find((v) => v.platform === platform)?.name || platform;

let logId = new URLSearchParams(location.search).get("log") || "";
let sheetTab = "setup";
const getPath = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const setPath = (o, path, v) => { const ks = path.split("."); let x = o; ks.slice(0, -1).forEach((k) => { x = x[k] ||= {}; }); x[ks[ks.length - 1]] = v; };

function openLog(sid) {
  logId = sid; const q = new URLSearchParams(location.search); sid ? q.set("log", sid) : q.delete("log");
  history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : "")); renderCarLog();
  if (sid) $("#car-log").scrollIntoView({ block: "start", behavior: "smooth" });
}
OPS["car-log"] = (b) => openLog(b.dataset.id);
OPS["car-log-close"] = () => openLog("");

function renderCarLog() {
  const card = $("#car-log"); const s = read("sessions").find((x) => x.id === logId);
  card.classList.toggle("hidden", !s); if (!s) return;
  const L = s.log || {}; const sheet = sheetTab;
  const inp = (path, ph = "", type = "text", cls = "") => `<input class="${cls}" type="${type}" data-log="${path}" value="${esc(getPath(L, path) ?? "")}" placeholder="${esc(ph)}" />`;
  const area = (path, ph = "") => `<textarea data-log="${path}" rows="2" placeholder="${esc(ph)}">${esc(getPath(L, path) ?? "")}</textarea>`;
  const yn = (path) => { const v = getPath(L, path) || ""; return ["No", "Yes"].map((o) => `<label class="yn"><input type="radio" name="${path}" data-log="${path}" value="${o}" ${v === o ? "checked" : ""} />${o}</label>`).join(""); };
  const kv = (rows, color) => `<table class="sheet ${color}">${rows.map(([path, label, ph]) => `<tr><th>${esc(label)}</th><td>${inp(`${sheet}.${path}`, ph || "")}</td></tr>`).join("")}</table>`;
  const block = (title, body) => `<div class="sheet-block"><h4>${esc(title)}</h4>${body}</div>`;
  const corner = (c) => `<table class="sheet green"><tr><th>Toe shims</th><td>${inp(`${sheet}.${c}.toeShims`)}</td><td class="small">${inp(`${sheet}.${c}.toeDir`, "out")}</td></tr>${[["camber", "Camber angle"], ["cornerWeight", "Corner weight"], ["tirePress", "Tire press."]].map(([k, l]) => `<tr><th>${l}</th><td colspan="2">${inp(`${sheet}.${c}.${k}`)}</td></tr>`).join("")}</table>`;
  const susp = (end) => kv([[`${end}Susp.springs`, "Springs"], [`${end}Susp.rideHeight`, "Ride height"], [`${end}Susp.rollBarDiam`, "Roll bar diam."], [`${end}Susp.rollBarHole`, "Roll bar hole"]], "green");
  const shocks = (end) => `<div class="sheet-pair">${["l", "r"].map((side) => `<table class="sheet salmon"><tr>${SHOCK.map(([, l]) => `<th>${l}</th>`).join("")}</tr><tr>${SHOCK.map(([k]) => `<td>${inp(`${sheet}.${end}Shocks.${side}.${k}`)}</td>`).join("")}</tr></table>`).join("")}</div>`;
  const toe = (end) => `<div class="sheet-pair">${["l", "r"].map((side) => kv([[`${end}Toe.${side}.front`, "Front toe"], [`${end}Toe.${side}.rear`, "Rear toe"]], "salmon")).join("")}</div>`;
  const wing = (w) => `<div class="sheet-pair">${kv([[`${w}.flEp`, "FL EP height"], [`${w}.rlEp`, "RL EP height"]], "blue")}${kv([[`${w}.frEp`, "FR EP height"], [`${w}.rrEp`, "RR EP height"]], "blue")}</div>`;
  const ev = s.car === "EV";
  const P = peopleOf(s); const drivers = P.driverIds.map(memberName);

  card.innerHTML = `
    <div class="list-header"><div><p class="eyebrow">CAR LOG</p><h2>${esc(carName(s.car))} · ${esc(s.type)} · ${esc(s.date)}</h2><p class="hint">${esc(s.location || "")} Saves as you type.${L.updatedBy ? ` Last edited by ${esc(memberName(L.updatedBy))}.` : ""}</p></div><div class="row-actions"><button class="secondary" data-op="car-log-copy">Copy setup from last ${esc(carName(s.car))} session</button><button class="ghost" data-op="car-log-close">Close</button></div></div>

    <div class="log-grid">
      <div><h3>The test</h3>
        <label>What test is happening?${area("plan.test")}</label>
        <label>Any particular reason or thing we're testing for?${area("plan.reason")}</label>
        <label>Any current issues we know of?${area("plan.knownIssues")}</label>
        <label>Car run order${area("plan.runOrder", "Driver A: 3 laps warm-up, then …")}</label></div>
      <div><h3>Personnel</h3>
        <table class="log-table"><tr><th>Testing lead</th><td>${multiPick("people.leadIds", P.leadIds)}</td></tr>
        <tr><th>Driver(s)</th><td>${multiPick("people.driverIds", P.driverIds)}</td></tr>
        <tr><th>ESO(s)</th><td>${multiPick("people.esoIds", P.esoIds)}</td></tr>
        <tr><th>Other personnel<br><small>Name (role)</small></th><td>${multiPick("people.otherIds", P.otherIds)}${P.otherIds.length ? `<div class="roles-list">${P.otherIds.map((oid) => `<label class="inline">${esc(memberName(oid))}${inp(`people.roles.${oid}`, "role")}</label>`).join("")}</div>` : ""}</td></tr></table>
        <h3>Outside conditions</h3>
        <table class="log-table"><tr><th>Time of test</th><td>${inp("conditions.time", "", "time")}</td></tr><tr><th>Outside temp (°F)</th><td>${inp("conditions.temp", "", "number")}</td></tr><tr><th>Actively raining</th><td>${yn("conditions.raining")}</td></tr><tr><th>Damp track</th><td>${yn("conditions.damp")}</td></tr><tr><th>Wind (mph)</th><td>${inp("conditions.wind", "optional", "number")}</td></tr></table></div>
    </div>

    <h3>Car checks <span class="hint">${CAR_CHECKS.filter((_, i) => getPath(L, `checks.${i}.done`)).length}/${CAR_CHECKS.length} done before the car runs</span></h3>
    <table class="log-table checks"><thead><tr><th>Check</th><th>Done</th><th>Issues found?</th><th>If yes, what</th></tr></thead><tbody>${CAR_CHECKS.map((c, i) => {
      const na = (c === "EV active" || c === "Tractive battery inspection") && !ev; return `<tr class="${na ? "na" : ""}"><th>${esc(c)}${na ? ' <span class="hint">EV only</span>' : ""}</th><td><input type="checkbox" data-log="checks.${i}.done" ${getPath(L, `checks.${i}.done`) ? "checked" : ""} /></td><td>${yn(`checks.${i}.issue`)}</td><td>${inp(`checks.${i}.notes`)}</td></tr>`; }).join("")}</tbody></table>

    <div class="list-header sheet-head"><h3>Setup sheet</h3><div class="seg"><button class="${sheet === "setup" ? "active" : ""}" data-sheet="setup">Setup (before)</button><button class="${sheet === "setdown" ? "active" : ""}" data-sheet="setdown">Setdown (after)</button></div>${sheet === "setdown" ? `<button class="secondary" data-op="car-log-setdown">Copy from setup</button>` : ""}</div>
    <div class="setup-sheet">
      <div class="sheet-row">${kv([["name", "Name", sheet === "setup" ? "Setup" : "Setdown"], ["event", "Event", s.type], ["drivers", "Driver/s", drivers.join(", ")]], "grey")}${kv([["track", "Track", s.location], ["lapDist", "Lap dist."]], "grey")}${kv([["date", "Date", s.date], ["car", "Car", carName(s.car)]], "grey")}</div>
      <div class="sheet-row">${kv([["diff", "Diff"], ["preload", "Preload"], ["ramp", "Ramp"]], "yellow")}${kv([["motor", ev ? "Motor" : "Engine map", ev ? "EMRAX 208 MV" : ""], ["voltage", sheet === "setup" ? "Start voltage" : "Ending voltage"], ["powerLimit", "Power limit"]], "yellow")}${kv([["finalDrive", "Final drive", "11T/45T"], ["chain", "Chain", "420"], ["brakeBias", "Brake bias"]], "yellow")}</div>
      ${block("Front wing", wing("frontWing"))}
      <div class="sheet-row three">${block("Front left", corner("fl"))}${block("Front suspension", susp("front"))}${block("Front right", corner("fr"))}</div>
      ${block("Front shocks", shocks("front"))}${block("Front toe", toe("front"))}
      <div class="sheet-row three">${block("Rear left", corner("rl"))}${block("Rear suspension", susp("rear"))}${block("Rear right", corner("rr"))}</div>
      ${block("Rear shocks", shocks("rear"))}${block("Rear toe", toe("rear"))}
      ${block("Rear wing", wing("rearWing") + kv([["rearWing.drag", "Drag setting"], ["rearWing.drs", "DRS on/off"]], "blue"))}
    </div>

    <div class="log-grid">
      <div><h3>Laps completed</h3><table class="log-table">${P.driverIds.length ? P.driverIds.map((did) => `<tr><th>${esc(memberName(did))}</th><td>${inp(`laps.${did}`, "", "number")}</td></tr>`).join("") : '<tr><td class="hint">Pick the drivers under Personnel.</td></tr>'}</table>
        <h3>Timing sheet</h3><label>Link to the timing sheet${inp("timingUrl", "https://… Autocross_Timing_Sheet.xlsx", "url")}</label>${safeUrl(L.timingUrl) ? `<a href="${esc(L.timingUrl)}" target="_blank" rel="noopener">Open timing sheet</a>` : ""}
        <h3>Data <span class="pill">Roadmap</span></h3><p class="hint">Importing an MCAP CSV export into the session (channels, lap times, faults) is planned. For now, put the log link in the session's Data link.</p></div>
      <div><h3>Conclusion</h3><p class="hint">How did the car perform? Any failures? Did it complete the test? What needs fixing? Drivability, scraping, car faults (inverter, IMD, BMS…).</p>${area("conclusion")}</div>
    </div>`;
  card.querySelectorAll("textarea[data-log]").forEach((t) => { t.rows = Math.max(2, t.value.split("\n").length); });
}
function saveLog(path, value) {
  const list = read("sessions"); const s = list.find((x) => x.id === logId); if (!s) return;
  s.log ||= {}; setPath(s.log, path, value); s.log.updatedBy = me().id; s.log.updatedAt = new Date().toISOString(); write("sessions", list);
}
document.addEventListener("change", (e) => {
  const el = e.target.closest("[data-log]"); if (!el || !onPage("#car-log")) return;
  saveLog(el.dataset.log, el.type === "checkbox" ? el.checked : el.value);
  if (el.type === "radio" || el.type === "checkbox" || el.dataset.log === "timingUrl") renderCarLog();
});
document.addEventListener("click", (e) => { const b = e.target.closest("[data-sheet]"); if (b && onPage("#car-log")) { sheetTab = b.dataset.sheet; renderCarLog(); } });
OPS["car-log-setdown"] = () => { const list = read("sessions"); const s = list.find((x) => x.id === logId); s.log ||= {}; s.log.setdown = JSON.parse(JSON.stringify({ ...(s.log.setup || {}), name: "Setdown", voltage: "" })); write("sessions", list); renderCarLog(); flash("Setdown starts from the setup values. Change what moved."); };
OPS["car-log-copy"] = () => {
  const list = read("sessions"); const s = list.find((x) => x.id === logId);
  const prev = list.filter((x) => x.id !== s.id && x.car === s.car && x.log && (x.log.setdown || x.log.setup) && x.date <= s.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prev) return flash(`No earlier ${carName(s.car)} session has a setup sheet.`);
  s.log ||= {}; s.log.setup = { ...JSON.parse(JSON.stringify(prev.log.setdown || prev.log.setup)), name: "Setup", event: "", date: "", track: "", drivers: "", voltage: "" };
  write("sessions", list); sheetTab = "setup"; renderCarLog(); flash(`Copied the ${prev.log.setdown ? "setdown" : "setup"} from ${prev.date}.`);
};

// After logging a session, open its car log.
document.addEventListener("submit", (e) => {
  if (e.target.id !== "session-form") return;
  const before = new Set(read("sessions").map((x) => x.id));
  setTimeout(() => { const fresh = read("sessions").find((x) => !before.has(x.id)); if (fresh) openLog(fresh.id); }, 0);
}, true);

// People are stored as member ids. Older logs kept free text, which is matched to names where possible.
function peopleOf(s) {
  const p = s.log?.people || {}; const team = read("team"); const byName = (txt) => String(txt || "").split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean).map((n) => team.find((m) => m.name.toLowerCase() === n)?.id).filter(Boolean);
  return { leadIds: p.leadIds || (p.leadId ? [p.leadId] : []), driverIds: p.driverIds || (p.drivers ? byName(p.drivers) : s.driverId ? [s.driverId] : []), esoIds: p.esoIds || byName(p.esos), otherIds: p.otherIds || byName(p.other) };
}
// Dropdown with a search box and a checkbox per member; the summary lists who's picked.
function multiPick(path, ids) {
  const team = [...read("team")].sort((a, b) => a.name.localeCompare(b.name)); const picked = team.filter((m) => ids.includes(m.id)); const rest = team.filter((m) => !ids.includes(m.id));
  const row = (m) => `<label class="msel-opt"><input type="checkbox" data-log-multi="${path}" value="${m.id}" ${ids.includes(m.id) ? "checked" : ""} />${esc(m.name)}</label>`;
  return `<details class="msel" data-msel="${path}"><summary>${picked.length ? picked.map((m) => `<span class="pill">${esc(m.name)}</span>`).join(" ") : '<span class="hint">Select names…</span>'}</summary><div class="msel-panel"><input type="search" class="msel-search" placeholder="Search names" /><div class="msel-list">${[...picked, ...rest].map(row).join("")}</div></div></details>`;
}
document.addEventListener("change", (e) => {
  const cb = e.target.closest("[data-log-multi]"); if (!cb || !onPage("#car-log")) return;
  const box = cb.closest(".msel"); const ids = [...box.querySelectorAll("[data-log-multi]:checked")].map((x) => x.value);
  saveLog(cb.dataset.logMulti, ids);
  box.querySelector("summary").innerHTML = ids.length ? ids.map((i) => `<span class="pill">${esc(memberName(i))}</span>`).join(" ") : '<span class="hint">Select names…</span>';
});
document.addEventListener("input", (e) => { const q = e.target.closest(".msel-search"); if (!q) return; const t = q.value.toLowerCase(); q.closest(".msel").querySelectorAll(".msel-opt").forEach((o) => { o.hidden = !o.textContent.toLowerCase().includes(t); }); });
// Redraw when a picker closes, so the laps table and role boxes follow the names chosen.
document.addEventListener("toggle", (e) => { if (e.target.matches?.(".msel") && !e.target.open && onPage("#car-log")) renderCarLog(); }, true);
// Only one picker open at a time.
document.addEventListener("toggle", (e) => { if (e.target.matches?.(".msel") && e.target.open) document.querySelectorAll(".msel[open]").forEach((d) => { if (d !== e.target) d.open = false; }); }, true);

// Demo: a filled-in car log on the most recent EV session.
EXT.seeds.push((team) => {
  const list = read("sessions"); const s = [...list].filter((x) => x.car === "EV").sort((a, b) => b.date.localeCompare(a.date))[0]; if (!s) return;
  const lead = team.find((m) => (m.leads || []).includes("Vehicle Dynamics")) || team[0];
  const base = { name: "Setup", event: s.type, track: s.location, date: s.date, car: carName("EV"), diff: "Salisbury", preload: "10 Nm", ramp: "40/60", motor: "EMRAX 208 MV", voltage: "588", powerLimit: "80 kW", finalDrive: "11T/45T", chain: "420", brakeBias: "58% F",
    frontWing: { flEp: "45", frEp: "45", rlEp: "52", rrEp: "52" }, rearWing: { flEp: "120", frEp: "120", rlEp: "128", rrEp: "128", drag: "Low", drs: "Off" },
    fl: { toeShims: "2", toeDir: "out", camber: "-1.8", cornerWeight: "68", tirePress: "12" }, fr: { toeShims: "2", toeDir: "out", camber: "-1.8", cornerWeight: "67", tirePress: "12" },
    rl: { toeShims: "1", toeDir: "in", camber: "-1.2", cornerWeight: "74", tirePress: "11" }, rr: { toeShims: "1", toeDir: "in", camber: "-1.2", cornerWeight: "75", tirePress: "11" },
    frontSusp: { springs: "250 lb/in", rideHeight: "30 mm", rollBarDiam: "12 mm", rollBarHole: "2" }, rearSusp: { springs: "300 lb/in", rideHeight: "35 mm", rollBarDiam: "10 mm", rollBarHole: "1" },
    frontShocks: { l: { lsb: "8", lsr: "10", hsb: "4", hsr: "6", springLength: "152" }, r: { lsb: "8", lsr: "10", hsb: "4", hsr: "6", springLength: "152" } },
    rearShocks: { l: { lsb: "9", lsr: "11", hsb: "5", hsr: "7", springLength: "150" }, r: { lsb: "9", lsr: "11", hsb: "5", hsr: "7", springLength: "150" } } };
  s.log = {
    plan: { test: `${s.type} run, 22 laps`, reason: "Check accumulator temps over a full stint", knownIssues: "Inverter derated at the last shakedown", runOrder: "Driver 1: 11 laps, swap, Driver 2: 11 laps" },
    people: { leadIds: [lead.id], driverIds: [s.driverId, ...team.filter((m) => (m.subteams || []).includes("Vehicle Dynamics") && m.id !== s.driverId).slice(0, 1).map((m) => m.id)].filter(Boolean), esoIds: team.filter((m) => (m.subteams || []).includes("Low Voltage")).slice(0, 1).map((m) => m.id), otherIds: [], roles: {} },
    conditions: { time: "14:30", temp: "68", raining: "No", damp: "No", wind: "" },
    checks: CAR_CHECKS.map((_, i) => ({ done: true, issue: i === 6 ? "Yes" : "No", notes: i === 6 ? "Topped up coolant, small air bubble" : "" })),
    setup: base, setdown: { ...JSON.parse(JSON.stringify(base)), name: "Setdown", voltage: "521", fl: { ...base.fl, tirePress: "14" }, fr: { ...base.fr, tirePress: "14" } },
    laps: { [s.driverId]: s.laps }, timingUrl: "", conclusion: "Completed the full stint. Accumulator stayed under 52 °C. No faults. Slight understeer mid-corner; try a softer front bar next time.", updatedBy: lead.id
  };
  write("sessions", list);
});

EXT.renders.push(["#car-log", renderCarLog]);
