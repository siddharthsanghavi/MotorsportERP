// Event manager: track days the team hosts and competitions it travels to.
// Each event has a roster, a checklist (due dates count back from the start date), a packing list tied to stock,
// an incident log, results (competitions), and the test sessions logged there. Loaded after ops.js.
Object.assign(KEYS, { events: "motorsport-erp-events" });
nouns.events = "event";
next.events = ["Planning", "Confirmed", "Completed"];
FINAL.events = "Completed";

const EVENT_KINDS = ["Competition", "Hosted"];
const EVENT_ROLES = ["Driver", "Crew chief", "Mechanic", "Safety officer", "Timing", "Marshal", "Business presenter", "Volunteer", "Other"];
const RESULT_EVENTS = ["Acceleration", "Skidpad", "Autocross", "Endurance", "Efficiency", "Design", "Cost & Manufacturing", "Business presentation"];
const EVENT_CHECKLISTS = {
  Competition: [["Register the team", -120], ["Pay registration fee", -110], ["Book lodging", -45], ["Book vans / trailer", -30], ["Submit required documents (see Deliverables)", -30], ["Travel forms & approvals", -21], ["Confirm drivers and crew", -14], ["Tech inspection walkthrough against the rules", -10], ["Pack spares, tools & safety gear", -3], ["Debrief & lessons learned", 3]],
  Hosted: [["Book the venue / lot", -45], ["Insurance & risk paperwork", -30], ["Invite teams & confirm attendance", -21], ["Assign safety officer & first aid", -14], ["Course design & cone layout", -7], ["Test the timing system", -3], ["Waivers ready (printed or online)", -3], ["Fire extinguishers & spill kit staged", -1], ["Clean-up & debrief", 2]]
};
const addDays = (date, n) => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const dueOf = (e, item) => item.due || (item.offset !== undefined && item.offset !== null && e.startDate ? addDays(e.startDate, item.offset) : "");
const evEnd = (e) => e.endDate || e.startDate;
const evManage = (e, u = me()) => !!u.id && !!e && (isLeader(u) || e.leadId === u.id || own(e, u));
const evOpenState = (e) => !["Completed", "Cancelled"].includes(e.status);

EXT.can.push((action, key, row, u) => {
  if (key !== "events") return undefined;
  if (action === "create") return isLeader(u) || (u.leads || []).length > 0;
  if (action === "advance") return !!row && row.status !== "Cancelled" && evManage(row, u);
  if (action === "delete") return !!row && (isLeader(u) || own(row, u));
  return false;
});

function evUpdate(eid, fn) {
  const list = read("events"); const e = list.find((x) => x.id === eid); if (!e) return;
  if (fn(e) === false) return;
  e.updatedAt = new Date().toISOString(); write("events", list); renderAll();
}
function newEvent(v) {
  return {
    id: id(), name: v.name, kind: v.kind, car: v.car || "Both", startDate: v.startDate, endDate: v.endDate || v.startDate, location: v.location || "",
    status: "Planning", regDeadline: v.regDeadline || "", fee: v.fee || "", capacity: v.capacity || "", leadId: v.leadId || me().id, notes: v.notes || "",
    roster: v.leadId || me().id ? [{ memberId: v.leadId || me().id, role: v.kind === "Hosted" ? "Safety officer" : "Crew chief", status: "Confirmed" }] : [],
    checklist: EVENT_CHECKLISTS[v.kind].map(([text, offset]) => ({ id: id(), text, offset, done: false, ownerId: "" })),
    packing: [], results: [], incidents: [], createdBy: me().id, createdAt: new Date().toISOString()
  };
}

// ----- Rendering -----
let evFilter = "Upcoming"; let evKind = ""; const evOpen = new Set();
const bar = (done, total, label) => `<div class="ev-meter"><span>${label}</span><div class="progress-row"><div class="progress ${total && done >= total ? "" : done / Math.max(1, total) < .5 ? "warn" : ""}"><i style="width:${total ? Math.min(100, done / total * 100) : 0}%"></i></div><span>${done}/${total}</span></div></div>`;
const section = (e, keyName, title, body) => `<details class="ev-sec" data-sec="${e.id}:${keyName}" ${evOpen.has(`${e.id}:${keyName}`) ? "open" : ""}><summary>${title}</summary>${body}</details>`;

function deliverablesReady() {
  const docs = read("docs"); const list = read("deliverables");
  return { ready: list.filter((d) => docs.find((x) => x.id === d.docId)?.status === "Released").length, total: list.length };
}

function eventCard(e) {
  const u = me(); const today = todayISO(); const mgr = evManage(e); const open = evOpenState(e);
  const days = e.startDate ? daysBetween(today, e.startDate) : null;
  const when = days === null ? "" : days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : evEnd(e) >= today ? "happening now" : `${-days} days ago`;
  const roster = e.roster || []; const confirmed = roster.filter((r) => r.status === "Confirmed"); const requested = roster.filter((r) => r.status === "Requested");
  const mine = roster.find((r) => r.memberId === u.id);
  const cl = e.checklist || []; const pk = e.packing || [];
  const overdueItems = cl.filter((i) => !i.done && dueOf(e, i) && dueOf(e, i) < today);
  const dl = deliverablesReady();
  const sessions = read("sessions").filter((s) => s.eventId === e.id);

  const acts = [];
  if (can("advance", "events", e)) acts.push(`<button class="secondary small" data-action="advance" data-key="events" data-id="${e.id}">${e.status === "Planning" ? "Confirm event" : "Mark completed"}</button>`);
  if (mgr) acts.push(`<button class="link" data-op="ev-edit" data-id="${e.id}">Edit</button>`);
  if (mgr && open) acts.push(`<button class="link" data-op="ev-cancel" data-id="${e.id}">Cancel event</button>`);
  if (mgr && e.status === "Cancelled") acts.push(`<button class="link" data-op="ev-reopen" data-id="${e.id}">Reopen</button>`);
  if (mgr && e.fee && !e.feePurchaseId && e.kind === "Competition") acts.push(`<button class="link" data-op="ev-fee" data-id="${e.id}">Request fee payment</button>`);
  if (!mine && open && u.id) acts.push(`<button class="link" data-op="ev-join" data-id="${e.id}">${e.kind === "Hosted" ? "Volunteer" : "Ask to travel"}</button>`);
  if (mine && open && mine.memberId !== e.leadId) acts.push(`<button class="link" data-op="ev-leave" data-id="${e.id}">Leave roster</button>`);
  if (can("delete", "events", e)) acts.push(`<button class="link danger" data-action="delete" data-key="events" data-id="${e.id}">Delete</button>`);

  // Roster
  const rosterRows = roster.map((r) => {
    const m = read("team").find((x) => x.id === r.memberId); if (!m) return "";
    const safety = trained(m.id, "safety"); const hv = trained(m.id, "hv");
    const warn = r.role === "Driver" && !safety ? "no shop safety sign-off" : (e.car === "EV" && ["Driver", "Mechanic", "Crew chief"].includes(r.role) && !hv) ? "no HV safety sign-off" : "";
    return `<tr><td>${esc(m.name)}${r.memberId === e.leadId ? ` <span class="role-chip">Lead</span>` : ""}</td><td>${mgr ? `<select data-evop="role" data-id="${e.id}" data-member="${m.id}">${EVENT_ROLES.map((x) => `<option ${x === r.role ? "selected" : ""}>${x}</option>`).join("")}</select>` : esc(r.role)}</td><td>${r.status === "Requested" ? `<span class="warn-chip">Requested</span>` : `<span class="life ok">Confirmed</span>`}${warn ? `<div class="hint bad">⚠ ${warn}</div>` : ""}</td><td>${mgr && r.status === "Requested" ? `<button class="link" data-op="ev-approve" data-id="${e.id}" data-member="${m.id}">Confirm</button>` : ""}${mgr && r.memberId !== e.leadId ? `<button class="link danger" data-op="ev-remove" data-id="${e.id}" data-member="${m.id}">Remove</button>` : ""}</td></tr>`;
  }).join("");
  const onRoster = new Set(roster.map((r) => r.memberId));
  const rosterBody = `<table class="compact"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${rosterRows}</tbody></table>${mgr && open ? `<div class="inline-form ev-add"><select data-evadd="member" data-id="${e.id}"><option value="">Add a person…</option>${teamSorted().filter((m) => !onRoster.has(m.id)).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select><select data-evadd="role" data-id="${e.id}">${EVENT_ROLES.map((x) => `<option>${x}</option>`).join("")}</select><button class="secondary small" data-op="ev-add" data-id="${e.id}">Add</button></div>` : ""}`;

  // Checklist
  const clBody = `<ul class="ev-check">${cl.map((i) => { const due = dueOf(e, i); const late = !i.done && due && due < today; return `<li class="${i.done ? "done" : ""}"><label class="check"><input type="checkbox" data-evop="check" data-id="${e.id}" data-item="${i.id}" ${i.done ? "checked" : ""} ${mgr || i.ownerId === u.id ? "" : "disabled"} />${esc(i.text)}</label><span class="ev-meta">${due ? `<span class="${late ? "overdue-text" : ""}">${due}</span>` : ""}${mgr ? `<select data-evop="owner" data-id="${e.id}" data-item="${i.id}">${memberSelect(i.ownerId, "— owner —")}</select>` : i.ownerId ? esc(memberName(i.ownerId)) : ""}${i.done && i.doneBy ? `<small>✓ ${esc(memberName(i.doneBy))}</small>` : ""}${mgr ? `<button class="x" data-op="ev-check-del" data-id="${e.id}" data-item="${i.id}" title="Remove">×</button>` : ""}</span></li>`; }).join("")}</ul>${mgr ? `<form class="inline-form ev-form" data-evform="check" data-id="${e.id}"><input name="text" required placeholder="Add a checklist item" /><input name="due" type="date" /><button class="secondary small">Add</button></form>` : ""}`;

  // Packing (linked to stock so you know where things live)
  const stock = read("stock");
  const pkBody = `<ul class="ev-check">${pk.map((i) => { const s = i.stockId && stock.find((x) => x.id === i.stockId); return `<li class="${i.packed ? "done" : ""}"><label class="check"><input type="checkbox" data-evop="pack" data-id="${e.id}" data-item="${i.id}" ${i.packed ? "checked" : ""} ${onRoster.has(u.id) || mgr ? "" : "disabled"} />${esc(s ? s.name : i.text)} <span class="hint">×${esc(i.qty || 1)}</span></label><span class="ev-meta">${s ? `<small>${esc(s.location || "")}${Number(i.qty || 1) > available(s) ? ` · <span class="overdue-text">only ${available(s)} available</span>` : ""}</small>` : ""}${mgr ? `<button class="x" data-op="ev-pack-del" data-id="${e.id}" data-item="${i.id}" title="Remove">×</button>` : ""}</span></li>`; }).join("")}</ul>${mgr ? `<form class="inline-form ev-form" data-evform="pack" data-id="${e.id}"><select name="stockId"><option value="">From stock…</option>${stock.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select><input name="text" placeholder="…or type an item" /><input name="qty" type="number" min="1" value="1" class="narrow" /><button class="secondary small">Add</button></form>${pk.length === 0 ? `<button class="link" data-op="ev-pack-default" data-id="${e.id}">Add the standard kit</button>` : ""}` : ""}`;

  // Results (competitions)
  const res = e.results || []; const totalPts = res.reduce((s, r) => s + Number(r.points || 0), 0);
  const resBody = `<table class="compact"><thead><tr><th>Event</th><th>Place</th><th>Points</th><th>Notes</th></tr></thead><tbody>${RESULT_EVENTS.map((name) => { const r = res.find((x) => x.event === name) || {}; return `<tr><td>${name}</td><td>${mgr ? `<input class="narrow" data-evop="result" data-field="place" data-id="${e.id}" data-ev="${esc(name)}" value="${esc(r.place || "")}" />` : esc(r.place || "—")}</td><td>${mgr ? `<input class="narrow" type="number" step="any" data-evop="result" data-field="points" data-id="${e.id}" data-ev="${esc(name)}" value="${esc(r.points || "")}" />` : esc(r.points || "—")}</td><td>${mgr ? `<input data-evop="result" data-field="notes" data-id="${e.id}" data-ev="${esc(name)}" value="${esc(r.notes || "")}" />` : esc(r.notes || "")}</td></tr>`; }).join("")}</tbody><tfoot><tr><td><strong>Total</strong></td><td>${mgr ? `<input class="narrow" data-evop="overall" data-id="${e.id}" value="${esc(e.overallPlace || "")}" placeholder="Overall" />` : esc(e.overallPlace || "")}</td><td><strong>${totalPts}</strong></td><td></td></tr></tfoot></table>`;

  // Incidents
  const inc = [...(e.incidents || [])].reverse();
  const incBody = `${inc.length ? `<ul class="ev-inc">${inc.map((i) => `<li><span class="life ${i.severity === "Serious" ? "bad" : i.severity === "Minor" ? "warn" : "ok"}">${esc(i.severity)}</span> ${esc(i.text)}<small>${esc(memberName(i.by))} · ${new Date(i.at).toLocaleString()}</small></li>`).join("")}</ul>` : `<p class="empty">No incidents logged.</p>`}${onRoster.has(u.id) || mgr ? `<form class="inline-form ev-form" data-evform="incident" data-id="${e.id}"><select name="severity"><option>Note</option><option>Minor</option><option>Serious</option></select><input name="text" required placeholder="What happened (off-course, injury, damage, near miss…)" /><button class="secondary small">Log</button></form>` : ""}`;

  const sessBody = sessions.length ? `<ul class="ev-inc">${sessions.map((s) => `<li>${esc(s.date)} · <span class="plat ${s.car.toLowerCase()}">${esc(s.car)}</span> ${esc(s.type)} · ${esc(memberName(s.driverId))} · ${esc(s.km)} km</li>`).join("")}</ul>` : `<p class="empty">No sessions linked. Pick this event when logging a session on the Testing tab.</p>`;

  return `<article class="event ${e.kind.toLowerCase()} ${stageClass(e.status)}">
    <div class="event-head"><div><h3>${esc(e.name)}</h3><div class="event-meta"><span class="ev-kind ${e.kind.toLowerCase()}">${e.kind === "Hosted" ? "We host" : "Competition"}</span><span class="plat ${String(e.car).toLowerCase()}">${esc(e.car)}</span><span>${esc(e.startDate)}${evEnd(e) !== e.startDate ? ` → ${esc(evEnd(e))}` : ""}</span>${e.location ? `<span>📍 ${esc(e.location)}</span>` : ""}<span>Lead: ${esc(memberName(e.leadId))}</span></div></div><div class="event-status"><span class="stage-chip ${stageClass(e.status)}">${esc(e.status)}</span><small>${when}</small></div></div>
    ${e.notes ? `<p class="notes">${esc(e.notes)}</p>` : ""}
    <div class="ev-facts">${e.regDeadline ? `<span class="${open && e.regDeadline < today && e.status === "Planning" ? "warn-chip" : "person-chip"}">Registration by ${esc(e.regDeadline)}</span>` : ""}${e.fee ? `<span class="person-chip">Fee ${money(e.fee)}${e.feePurchaseId ? ` · ${esc(read("purchases").find((p) => p.id === e.feePurchaseId)?.status || "requested")}` : ""}</span>` : ""}${requested.length && mgr ? `<span class="warn-chip">${requested.length} request${requested.length > 1 ? "s" : ""} to travel</span>` : ""}${overdueItems.length ? `<span class="warn-chip">${overdueItems.length} checklist item${overdueItems.length > 1 ? "s" : ""} overdue</span>` : ""}${mine ? `<span class="person-chip poc">You: ${esc(mine.role)}${mine.status === "Requested" ? " (requested)" : ""}</span>` : ""}</div>
    <div class="ev-meters">${bar(cl.filter((i) => i.done).length, cl.length, "Checklist")}${bar(confirmed.length, Number(e.capacity) || confirmed.length, e.capacity ? "Roster / spots" : "Roster")}${bar(pk.filter((i) => i.packed).length, pk.length, "Packed")}${e.kind === "Competition" ? bar(dl.ready, dl.total, "Deliverables") : ""}</div>
    ${section(e, "roster", `Roster (${confirmed.length}${requested.length ? ` + ${requested.length} requested` : ""})`, rosterBody)}
    ${section(e, "check", `Checklist (${cl.filter((i) => i.done).length}/${cl.length})`, clBody)}
    ${section(e, "pack", `Packing list (${pk.filter((i) => i.packed).length}/${pk.length})`, pkBody)}
    ${e.kind === "Competition" ? section(e, "results", `Results${totalPts ? ` (${totalPts} pts${e.overallPlace ? `, ${esc(e.overallPlace)} overall` : ""})` : ""}`, resBody) : ""}
    ${section(e, "inc", `Incident log (${inc.length})`, incBody)}
    ${section(e, "sess", `Test sessions (${sessions.length})`, sessBody)}
    <div class="row-actions ev-actions">${acts.join("")}</div>
  </article>`;
}

function renderEvents() {
  if (!onPage("#events-list")) return;
  const today = todayISO(); const all = read("events");
  let list = all.filter((e) => !evKind || e.kind === evKind);
  if (evFilter === "Upcoming") list = list.filter((e) => evOpenState(e) && evEnd(e) >= today);
  else if (evFilter === "Past") list = list.filter((e) => !evOpenState(e) || evEnd(e) < today);
  list.sort((a, b) => evFilter === "Past" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate));
  document.querySelectorAll("#event-filter button").forEach((b) => b.classList.toggle("active", b.dataset.filter === evFilter));
  const upcoming = all.filter((e) => evOpenState(e) && evEnd(e) >= today);
  const nextComp = upcoming.filter((e) => e.kind === "Competition").sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const nextHost = upcoming.filter((e) => e.kind === "Hosted").sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  $("#event-stats").innerHTML = [["Upcoming", upcoming.length], ["Next competition", nextComp ? `${nextComp.name} · ${daysBetween(today, nextComp.startDate)} d` : "—"], ["Next hosted day", nextHost ? `${nextHost.name} · ${daysBetween(today, nextHost.startDate)} d` : "—"], ["Completed this season", all.filter((e) => e.status === "Completed").length]].map(([l, v]) => `<div class="mini-stat"><span>${l}</span><strong>${esc(v)}</strong></div>`).join("");
  if (!onPage("#events-list")) return;
  $("#events-list").innerHTML = list.map(eventCard).join("");
  $("#events-empty").style.display = list.length ? "none" : "block";
  $("#event-form-card").classList.toggle("hidden", !can("create", "events"));
  const lead = $("#event-lead"); const cur = lead.value; lead.innerHTML = memberSelect(cur || me().id, "— Lead —"); lead.value = cur || me().id;
}
// Testing page: pick the event a session was run at.
function renderSessionEvents() {
  const all = read("events"); const se = $("#session-event"); { const c = se.value; se.innerHTML = `<option value="">— None —</option>` + all.filter((e) => e.status !== "Cancelled").sort((a, b) => b.startDate.localeCompare(a.startDate)).map((e) => `<option value="${e.id}">${esc(e.name)} (${esc(e.startDate)})</option>`).join(""); se.value = c; }
}
EXT.renders.push(["#events-list", renderEvents], ["#session-event", renderSessionEvents]);

// ----- Interactions -----
document.querySelectorAll("#event-filter button").forEach((b) => b.addEventListener("click", () => { evFilter = b.dataset.filter; renderEvents(); }));
$("#event-kind").addEventListener("change", (e) => { evKind = e.target.value; renderEvents(); });
document.addEventListener("toggle", (e) => { const d = e.target; if (d.classList?.contains("ev-sec")) { d.open ? evOpen.add(d.dataset.sec) : evOpen.delete(d.dataset.sec); } }, true);

$("#event-form").addEventListener("submit", (ev) => {
  ev.preventDefault(); if (!can("create", "events")) return flash("Only leads and leadership can create events.");
  const v = formValues(ev.target);
  if (v.endDate && v.endDate < v.startDate) return flash("The end date is before the start date.");
  const e = newEvent(v); write("events", [...read("events"), e]);
  if (e.leadId !== me().id) notify(e.leadId, `You're the lead for ${e.kind === "Hosted" ? "hosted event" : "competition"} "${e.name}" (${e.startDate})`);
  logEvent(`created ${e.kind === "Hosted" ? "hosted event" : "competition"} "${e.name}" (${e.startDate})`);
  ev.target.reset(); evOpen.add(`${e.id}:check`); renderAll();
});

const EVENT_FIELDS = () => [["name", "Event name", "text"], ["kind", "Type", "select", EVENT_KINDS], ["car", "Car", "select", ["Both", "EV", "ICE"]], ["startDate", "Start date", "date"], ["endDate", "End date", "date"], ["location", "Location", "text"], ["regDeadline", "Registration deadline", "date"], ["fee", "Entry / venue fee ($)", "number"], ["capacity", "Travel spots / volunteer slots", "number"], ["leadId", "Event lead", "member"], ["notes", "Notes", "textarea"]];
OPS["ev-edit"] = (b) => {
  const e = read("events").find((x) => x.id === b.dataset.id); if (!evManage(e)) return;
  openForm(`Edit event: ${e.name}`, EVENT_FIELDS(), e, (v) => {
    if (v.endDate && v.startDate && v.endDate < v.startDate) return flash("The end date is before the start date.");
    evUpdate(e.id, (x) => {
      const moved = x.startDate !== v.startDate; const newLead = v.leadId && v.leadId !== x.leadId;
      Object.assign(x, v);
      if (newLead && !(x.roster || []).some((r) => r.memberId === v.leadId)) x.roster = [...(x.roster || []), { memberId: v.leadId, role: "Crew chief", status: "Confirmed" }];
      if (newLead) notify(v.leadId, `You're now the lead for "${x.name}"`);
      if (moved) notify((x.roster || []).filter((r) => r.status === "Confirmed").map((r) => r.memberId), `"${x.name}" moved to ${x.startDate}`);
      logEvent(`edited event "${x.name}"`);
    });
  });
};
OPS["ev-cancel"] = (b) => {
  const e = read("events").find((x) => x.id === b.dataset.id); if (!evManage(e) || !confirm(`Cancel "${e.name}"? The roster will be notified.`)) return;
  evUpdate(e.id, (x) => { x.status = "Cancelled"; notify((x.roster || []).map((r) => r.memberId), `"${x.name}" (${x.startDate}) was cancelled`); logEvent(`cancelled event "${x.name}"`); });
};
OPS["ev-reopen"] = (b) => evUpdate(b.dataset.id, (x) => { if (!evManage(x)) return false; x.status = "Planning"; logEvent(`reopened event "${x.name}"`); });
OPS["ev-join"] = (b) => evUpdate(b.dataset.id, (x) => {
  const u = me(); if ((x.roster || []).some((r) => r.memberId === u.id)) return false;
  // Volunteering for a day we host is open; travel spots for competitions need the lead to confirm.
  const direct = x.kind === "Hosted" && (!Number(x.capacity) || x.roster.filter((r) => r.status === "Confirmed").length < Number(x.capacity));
  x.roster.push({ memberId: u.id, role: x.kind === "Hosted" ? "Volunteer" : "Mechanic", status: direct ? "Confirmed" : "Requested" });
  notify(x.leadId, direct ? `${u.name} volunteered for "${x.name}"` : `${u.name} asked to travel to "${x.name}"`);
  logEvent(direct ? `volunteered for "${x.name}"` : `asked to join "${x.name}"`); flash(direct ? "You're on the roster." : "Request sent to the event lead.");
});
OPS["ev-leave"] = (b) => evUpdate(b.dataset.id, (x) => { x.roster = x.roster.filter((r) => r.memberId !== me().id); notify(x.leadId, `${me().name} left the roster for "${x.name}"`); logEvent(`left the roster for "${x.name}"`); });
OPS["ev-approve"] = (b) => evUpdate(b.dataset.id, (x) => {
  if (!evManage(x)) return false;
  const cap = Number(x.capacity); const conf = x.roster.filter((r) => r.status === "Confirmed").length;
  if (cap && conf >= cap) { flash(`All ${cap} spots are taken. Raise the capacity or remove someone first.`); return false; }
  const r = x.roster.find((y) => y.memberId === b.dataset.member); r.status = "Confirmed";
  notify(r.memberId, `You're confirmed for "${x.name}" (${x.startDate}) as ${r.role}`); logEvent(`confirmed ${memberName(r.memberId)} for "${x.name}"`);
});
OPS["ev-remove"] = (b) => evUpdate(b.dataset.id, (x) => {
  if (!evManage(x)) return false; x.roster = x.roster.filter((r) => r.memberId !== b.dataset.member);
  notify(b.dataset.member, `You were taken off the roster for "${x.name}"`); logEvent(`removed ${memberName(b.dataset.member)} from "${x.name}"`);
});
OPS["ev-add"] = (b) => {
  const card = b.closest(".ev-add"); const member = card.querySelector('[data-evadd="member"]').value; const role = card.querySelector('[data-evadd="role"]').value;
  if (!member) return flash("Pick someone to add.");
  evUpdate(b.dataset.id, (x) => {
    if (!evManage(x)) return false;
    const cap = Number(x.capacity); if (cap && x.roster.filter((r) => r.status === "Confirmed").length >= cap) { flash(`All ${cap} spots are taken.`); return false; }
    x.roster.push({ memberId: member, role, status: "Confirmed" });
    notify(member, `You're on the roster for "${x.name}" (${x.startDate}) as ${role}`); logEvent(`added ${memberName(member)} to "${x.name}" as ${role}`);
  });
};
OPS["ev-fee"] = (b) => evUpdate(b.dataset.id, (x) => {
  if (!evManage(x)) return false;
  const req = { id: id(), item: `Entry fee: ${x.name}`, vendor: x.kind === "Competition" ? "Event organizer" : "Venue", amount: String(x.fee), neededBy: x.regDeadline || addDays(x.startDate, -30), status: "Requested", category: "", eventId: x.id, createdBy: me().id, createdAt: new Date().toISOString() };
  write("purchases", [...read("purchases"), req]); x.feePurchaseId = req.id;
  logEvent(`requested the entry fee for "${x.name}" (${money(x.fee)})`); flash("Fee request added to Purchasing.");
});
OPS["ev-check-del"] = (b) => evUpdate(b.dataset.id, (x) => { if (!evManage(x)) return false; x.checklist = x.checklist.filter((i) => i.id !== b.dataset.item); });
OPS["ev-pack-del"] = (b) => evUpdate(b.dataset.id, (x) => { if (!evManage(x)) return false; x.packing = x.packing.filter((i) => i.id !== b.dataset.item); });
OPS["ev-pack-default"] = (b) => evUpdate(b.dataset.id, (x) => {
  if (!evManage(x)) return false;
  const stock = read("stock"); const pick = (re) => stock.find((s) => re.test(s.name));
  const kit = [[/torque wrench/i, 1], [/safety-wire pliers/i, 1], [/safety wire/i, 1], [/brake fluid/i, 1], [/rod end/i, 2], [/nitrile/i, 1], [/calipers/i, 1]];
  if (x.car !== "ICE") kit.push([/HV insulated gloves/i, 2], [/insulation tester/i, 1]);
  x.packing = kit.map(([re, qty]) => pick(re)).filter(Boolean).map((s, i) => ({ id: id(), stockId: s.id, qty: String(kit.find(([re]) => re.test(s.name))[1]), packed: false }));
  ["Spare wheels & tyres", "Fuel / charger & cables", "Pop-up tent & tables", "First-aid kit", "Fire extinguishers"].forEach((t) => x.packing.push({ id: id(), text: t, qty: "1", packed: false }));
  logEvent(`added the standard packing kit to "${x.name}"`);
});

document.addEventListener("change", (ev) => {
  const t = ev.target; const op = t.dataset?.evop; if (!op) return;
  const eid = t.dataset.id; const u = me();
  if (op === "check") evUpdate(eid, (x) => { const i = x.checklist.find((y) => y.id === t.dataset.item); if (!(evManage(x) || i.ownerId === u.id)) return false; i.done = t.checked; i.doneBy = t.checked ? u.id : ""; i.doneAt = t.checked ? new Date().toISOString() : ""; if (t.checked) logEvent(`checked off "${i.text}" for "${x.name}"`); });
  if (op === "owner") evUpdate(eid, (x) => { if (!evManage(x)) return false; const i = x.checklist.find((y) => y.id === t.dataset.item); i.ownerId = t.value; if (t.value) notify(t.value, `You own "${i.text}" for "${x.name}"${dueOf(x, i) ? `, due ${dueOf(x, i)}` : ""}`); });
  if (op === "pack") evUpdate(eid, (x) => { const i = x.packing.find((y) => y.id === t.dataset.item); i.packed = t.checked; i.packedBy = t.checked ? u.id : ""; });
  if (op === "role") evUpdate(eid, (x) => { if (!evManage(x)) return false; x.roster.find((r) => r.memberId === t.dataset.member).role = t.value; });
  if (op === "result") evUpdate(eid, (x) => { if (!evManage(x)) return false; x.results = x.results || []; let r = x.results.find((y) => y.event === t.dataset.ev); if (!r) { r = { event: t.dataset.ev }; x.results.push(r); } r[t.dataset.field] = t.value; });
  if (op === "overall") evUpdate(eid, (x) => { if (!evManage(x)) return false; x.overallPlace = t.value; });
});
document.addEventListener("submit", (ev) => {
  const f = ev.target; const kind = f.dataset?.evform; if (!kind) return; ev.preventDefault();
  const v = formValues(f); const eid = f.dataset.id;
  if (kind === "check") evUpdate(eid, (x) => { if (!evManage(x)) return false; x.checklist.push({ id: id(), text: v.text, due: v.due || "", done: false, ownerId: "" }); });
  if (kind === "pack") { if (!v.stockId && !v.text) return flash("Pick a stock item or type one."); evUpdate(eid, (x) => { if (!evManage(x)) return false; x.packing.push({ id: id(), stockId: v.stockId || "", text: v.stockId ? "" : v.text, qty: v.qty || "1", packed: false }); }); }
  if (kind === "incident") evUpdate(eid, (x) => {
    x.incidents = [...(x.incidents || []), { id: id(), severity: v.severity, text: v.text, at: new Date().toISOString(), by: me().id }];
    if (v.severity !== "Note") notify([x.leadId, ...read("team").filter((m) => isLeader(m) && !m.roles.includes("Admin")).map((m) => m.id)], `${v.severity} incident at "${x.name}": ${v.text}`);
    logEvent(`logged a ${v.severity.toLowerCase()} incident at "${x.name}"`);
  });
});

// Status changes notify the roster.
EXT.after.push((action, key, row) => {
  if (key !== "events" || action !== "advance") return;
  notify((row.roster || []).filter((r) => r.status === "Confirmed").map((r) => r.memberId), row.status === "Confirmed" ? `"${row.name}" is confirmed for ${row.startDate}${row.location ? ` at ${row.location}` : ""}` : `"${row.name}" is marked completed`);
});
// Queue: leads see overdue checklist items and travel requests; rostered members see what's coming up.
EXT.inbox.push((u) => {
  const today = todayISO(); const soon = addDays(today, 14); const out = [];
  read("events").filter(evOpenState).forEach((e) => {
    if (evManage(e, u)) {
      const late = (e.checklist || []).filter((i) => !i.done && dueOf(e, i) && dueOf(e, i) < today);
      if (late.length) out.push(`Event: ${e.name} has ${late.length} overdue checklist item${late.length > 1 ? "s" : ""}`);
      const req = (e.roster || []).filter((r) => r.status === "Requested");
      if (req.length) out.push(`Event: ${req.length} travel request${req.length > 1 ? "s" : ""} for ${e.name}`);
      if (e.regDeadline && e.status === "Planning" && e.regDeadline >= today && e.regDeadline <= soon) out.push(`Event: register for ${e.name} by ${e.regDeadline}`);
    }
    (e.checklist || []).filter((i) => i.ownerId === u.id && !i.done && dueOf(e, i) && dueOf(e, i) <= soon).forEach((i) => out.push(`Event: "${i.text}" for ${e.name} due ${dueOf(e, i)}`));
    const mine = (e.roster || []).find((r) => r.memberId === u.id && r.status === "Confirmed");
    if (mine && e.startDate >= today && e.startDate <= soon) out.push(`Event: ${e.name} on ${e.startDate} (you're ${mine.role})`);
  });
  return out;
});

// ----- Demo data -----
EXT.seeds.push((team) => {
  const by = (n) => team.find((m) => m.name === n)?.id; const lead = (sub) => team.find((m) => (m.leads || []).includes(sub))?.id;
  const president = team.find((m) => m.title === "President")?.id || team[0].id; const chief = team.find((m) => m.title === "Chief Mechanic")?.id || president;
  const pick = (sub, n) => team.filter((m) => (m.subteams || []).includes(sub)).slice(0, n).map((m) => m.id);
  const mk = (v, roster, doneUpTo, extra = {}) => {
    const e = newEvent(v); e.roster = []; const seen = new Set();
    roster.forEach(([memberId, role, status = "Confirmed"]) => { if (memberId && !seen.has(memberId)) { seen.add(memberId); e.roster.push({ memberId, role, status }); } });
    const today = todayISO(); e.checklist.forEach((i, k) => { if (dueOf(e, i) <= doneUpTo || k < 0) { i.done = true; i.doneBy = e.leadId; i.doneAt = new Date().toISOString(); } i.ownerId = k % 3 === 0 ? e.leadId : ""; });
    if (doneUpTo === "skip-one") e.checklist[2].done = false;
    return Object.assign(e, extra);
  };
  const today = todayISO();
  const shake = mk({ name: "Fall shakedown day", kind: "Hosted", car: "Both", startDate: daysFromNow(-38), location: "Regional kart track", leadId: chief, capacity: "14", notes: "First laps for both cars. Open to the whole team." }, [[chief, "Safety officer"], ...pick("Vehicle Dynamics", 3).map((x) => [x, "Driver"]), ...pick("Manufacturing", 2).map((x) => [x, "Mechanic"]), ...pick("Business", 2).map((x) => [x, "Timing"])], "9999-12-31", { status: "Completed", incidents: [{ id: id(), severity: "Minor", text: "ICE car went off at turn 3, cone strike only", at: new Date(Date.now() - 38 * 864e5).toISOString(), by: chief }] });
  const testDay = mk({ name: "Winter test day", kind: "Hosted", car: "EV", startDate: daysFromNow(12), location: "Campus lot", leadId: lead("Vehicle Dynamics") || chief, capacity: "12", notes: "Skidpad and brake bias sweeps. Need two marshals and someone on timing." }, [[lead("Vehicle Dynamics") || chief, "Crew chief"], [chief, "Safety officer"], ...pick("Vehicle Dynamics", 2).map((x) => [x, "Driver"]), ...pick("Low Voltage", 1).map((x) => [x, "Timing"]), ...pick("EV Powertrain", 2).map((x) => [x, "Mechanic"])], today);
  const invitational = mk({ name: "Regional autocross invitational", kind: "Hosted", car: "Both", startDate: daysFromNow(40), endDate: daysFromNow(41), location: "Fairgrounds lot", leadId: lead("Business") || president, fee: "450", capacity: "20", notes: "We host three visiting teams. Venue fee covered by the event budget." }, [[lead("Business") || president, "Crew chief"], [chief, "Safety officer"], ...pick("Business", 3).map((x) => [x, "Marshal"])], today);
  const compEV = mk({ name: "FSAE Electric competition", kind: "Competition", car: "EV", startDate: daysFromNow(175), endDate: daysFromNow(179), location: "Placeholder: set the venue", leadId: president, regDeadline: daysFromNow(20), fee: "3200", capacity: "16", notes: "Dates and fee are placeholders. Set them from this season's event calendar." }, [[president, "Crew chief"], [chief, "Mechanic"], ...pick("Vehicle Dynamics", 3).map((x) => [x, "Driver"]), ...pick("EV Powertrain", 3).map((x) => [x, "Mechanic"]), ...pick("Business", 1).map((x) => [x, "Business presenter"]), ...pick("Low Voltage", 2).map((x) => [x, "Mechanic", "Requested"])], today);
  const compICE = mk({ name: "FSAE Combustion competition", kind: "Competition", car: "ICE", startDate: daysFromNow(182), endDate: daysFromNow(185), location: "Placeholder: set the venue", leadId: chief, regDeadline: daysFromNow(27), fee: "3200", capacity: "16", notes: "Dates and fee are placeholders." }, [[chief, "Crew chief"], ...pick("Combustion", 3).map((x) => [x, "Mechanic"]), ...pick("Driveline", 2).map((x) => [x, "Mechanic"]), ...pick("Vehicle Dynamics", 2).map((x) => [x, "Driver"])], today);
  const lastSeason = mk({ name: "Spring regional competition (last season)", kind: "Competition", car: "ICE", startDate: daysFromNow(-200), endDate: daysFromNow(-197), location: "Regional circuit", leadId: chief, fee: "1800" }, [[chief, "Crew chief"], ...pick("Combustion", 2).map((x) => [x, "Mechanic"])], "9999-12-31", { status: "Completed", overallPlace: "14th", results: [["Acceleration", "11", "62"], ["Skidpad", "9", "48"], ["Autocross", "15", "88"], ["Endurance", "DNF", "0", "Lost drive chain lap 9"], ["Efficiency", "—", "0"], ["Design", "12", "70"], ["Cost & Manufacturing", "8", "64"], ["Business presentation", "10", "52"]].map(([event, place, points, notes = ""]) => ({ event, place, points, notes })) });
  write("events", [shake, testDay, invitational, compEV, compICE, lastSeason]);
  // Link the past shakedown sessions to the shakedown day.
  write("sessions", read("sessions").map((s) => (s.type === "Shakedown" ? { ...s, eventId: shake.id } : s)));
});

// Every module is loaded: draw the page once, then pick up anything handed over from another page.
renderAll();
handleArrivals();
if (typeof applyPendingVendor === "function") applyPendingVendor();
