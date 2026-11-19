// Design projects: Inception (Proposed) → PP1 → PP2 → PP3 → Manufacturing.
// Each PP gate passes a subteam review, then a chief review. Either review can reject; the chief can send it back to
// the subteam review. Every step and comment is kept in the project's history, which drives the Gantt.
const DESIGN_STAGES = ["Proposed", "PP1", "PP2", "PP3", "Manufacturing"];
const GATES = ["PP1", "PP2", "PP3"];
const REVIEW_SUB = "Subteam review"; const REVIEW_CHIEF = "Chief review";
next.projects = DESIGN_STAGES;
FINAL.projects = "Manufacturing";
// Older data used Approved / In Progress / Review / Complete.
const LEGACY_STAGE = { Approved: "PP1", "In Progress": "PP2", Review: "PP3", Complete: "Manufacturing" };

const nowISO = () => new Date().toISOString();
const isChief = (u = me()) => u.roles.includes("Admin") || ["Chief Mechanic", "President", "Vice President"].includes(u.title);
const isSubLead = (p, u = me()) => u.roles.includes("Admin") || ledSub(p.subteam, u) || isLeader(u);
const statusLabel = (p) => (p.review ? `${p.status} · ${p.review}` : p.status === "Proposed" ? "Proposed" : GATES.includes(p.status) ? `${p.status} · in work` : p.status);
const teamLink = (sub) => `<a class="team-tag link-tag" href="team.html?subteam=${encodeURIComponent(sub)}" title="Open the ${esc(sub)} subteam on the Team page">${esc(sub)}</a>`;
const personLink = (mid, extra = "") => `<a class="person-chip${extra}" href="team.html?member=${encodeURIComponent(mid)}">${esc(memberName(mid))}</a>`;

function migrateProjects() {
  const list = read("projects"); let changed = false;
  list.forEach((p) => {
    if (LEGACY_STAGE[p.status]) { p.status = LEGACY_STAGE[p.status]; changed = true; }
    if (!Array.isArray(p.history)) {
      p.history = [{ stage: "Proposed", review: "", at: p.createdAt || nowISO(), by: p.createdBy || "" }];
      if (p.status !== "Proposed") p.history.push({ stage: p.status === "Rejected" ? "PP1" : p.status, review: "", at: p.approvedAt || p.updatedAt || nowISO(), by: p.approvedBy || "" });
      if (p.status === "Rejected") p.history.push({ stage: "Rejected", review: "", at: p.updatedAt || nowISO(), by: "" });
      changed = true;
    }
    if (!Array.isArray(p.comments)) { p.comments = []; changed = true; }
    if (p.review === undefined) { p.review = ""; changed = true; }
  });
  if (changed) write("projects", list);
}

// What the current user can do to this project right now.
function designActions(p, u = me()) {
  if (!u.id || !p) return [];
  const mine = p.pocId === u.id || (p.assignees || []).includes(u.id) || own(p, u);
  const notSelf = u.roles.includes("Admin") || p.pocId !== u.id; // nobody signs off a gate on a project they're POC of
  const out = [];
  if (p.status === "Proposed" && isSubLead(p, u) && (u.roles.includes("Admin") || !own(p, u))) out.push(["start", "Start PP1"], ["reject", "Reject"]);
  if (GATES.includes(p.status) && !p.review && (mine || isSubLead(p, u))) out.push(["submit", `Submit ${p.status} for subteam review`]);
  if (p.review === REVIEW_SUB && isSubLead(p, u) && notSelf) out.push(["pass", "Pass subteam review"], ["changes", "Request changes"], ["reject", "Reject"]);
  if (p.review === REVIEW_CHIEF && isChief(u) && notSelf) out.push(["pass", p.status === "PP3" ? "Approve for manufacturing" : `Pass chief review → ${DESIGN_STAGES[DESIGN_STAGES.indexOf(p.status) + 1]}`], ["sendback", "Send back to subteam review"], ["reject", "Reject"]);
  if (p.status === "Rejected" && (own(p, u) || isLeader(u))) out.push(["resubmit", "Resubmit as a new proposal"]);
  return out;
}
// Hook for app.js permission checks ("can this person move it on?").
function designCan(p, u = me()) { return p ? designActions(p, u).some(([a]) => a !== "reject") : (isLeader(u) || (u.leads || []).length > 0); }

function designStep(projectId, action, note = "") {
  const list = read("projects"); const p = list.find((x) => x.id === projectId); const u = me();
  if (!p || !designActions(p, u).some(([a]) => a === action)) return flash("You can't do that on this project.");
  const at = nowISO(); const from = statusLabel(p); const people = [p.createdBy, p.pocId, ...(p.assignees || [])];
  const leadsOf = read("team").filter((m) => (m.leads || []).includes(p.subteam)).map((m) => m.id);
  const chiefs = read("team").filter((m) => m.title === "Chief Mechanic").map((m) => m.id);
  const log = (stage, review) => p.history.push({ stage, review, at, by: u.id, action });
  let msg = "";
  if (action === "start") { p.status = "PP1"; p.review = ""; p.approvedBy = u.id; p.approvedAt = at; log("PP1", ""); msg = `started PP1 on "${p.name}"`; notify(people, `"${p.name}" was accepted and is now in PP1`); }
  if (action === "submit") { p.review = REVIEW_SUB; log(p.status, REVIEW_SUB); msg = `submitted ${p.status} of "${p.name}" for subteam review`; notify(leadsOf, `${p.status} of "${p.name}" is ready for your subteam review`); }
  if (action === "pass" && p.review === REVIEW_SUB) { p.review = REVIEW_CHIEF; log(p.status, REVIEW_CHIEF); msg = `passed the ${p.status} subteam review of "${p.name}"`; notify([...chiefs, ...people], `${p.status} of "${p.name}" passed subteam review and is with the chief`); }
  else if (action === "pass" && p.review === REVIEW_CHIEF) {
    const nextStage = DESIGN_STAGES[DESIGN_STAGES.indexOf(p.status) + 1]; const gate = p.status;
    p.status = nextStage; p.review = ""; log(nextStage, ""); msg = nextStage === "Manufacturing" ? `approved "${p.name}" for manufacturing` : `passed ${gate} of "${p.name}"; now in ${nextStage}`;
    notify(people, nextStage === "Manufacturing" ? `"${p.name}" is approved for manufacturing` : `"${p.name}" passed ${gate} and moved to ${nextStage}`);
  }
  if (action === "changes") { p.review = ""; log(p.status, "Changes requested"); msg = `requested changes on ${p.status} of "${p.name}"`; notify(people, `Changes requested on ${p.status} of "${p.name}"`); }
  if (action === "sendback") { p.review = REVIEW_SUB; log(p.status, "Sent back to subteam review"); msg = `sent ${p.status} of "${p.name}" back to subteam review`; notify([...leadsOf, ...people], `The chief sent ${p.status} of "${p.name}" back to subteam review`); }
  if (action === "reject") { const was = p.status; p.rejectedAt = at; p.rejectedFrom = p.review ? `${was} ${p.review.toLowerCase()}` : was; p.status = "Rejected"; p.review = ""; log("Rejected", ""); msg = `rejected "${p.name}" at ${p.rejectedFrom}`; notify(people, `"${p.name}" was rejected at ${p.rejectedFrom}`); }
  if (action === "resubmit") { p.status = "Proposed"; p.review = ""; log("Proposed", ""); msg = `resubmitted "${p.name}"`; notify(leadsOf, `"${p.name}" was resubmitted as a proposal`); }
  p.comments.push({ id: id(), by: u.id, at, kind: action, text: note, stage: from });
  p.updatedAt = at; write("projects", list); logEvent(msg); renderAll();
}

// ----- Page -----
let designFilter = "Active"; let designMine = false; const designOpen = new Set();
const ACTION_NOTE = { reject: ["Reason for rejecting", true], changes: ["What needs to change", true], sendback: ["Why it's going back", true], pass: ["Comment (optional)", false], submit: ["Note for the reviewers (optional)", false], start: ["Comment (optional)", false], resubmit: ["What changed (optional)", false] };
const COMMENT_VERB = { start: "started PP1", submit: "submitted for subteam review", pass: "passed", changes: "requested changes", sendback: "sent back to subteam review", reject: "rejected", resubmit: "resubmitted", comment: "" };

function stepper(p) {
  const rejected = p.status === "Rejected";
  const reached = new Set(p.history.map((h) => h.stage));
  const cur = rejected ? null : p.status;
  return `<ol class="stepper">${DESIGN_STAGES.map((s) => {
    const state = s === cur ? "current" : reached.has(s) && DESIGN_STAGES.indexOf(s) < DESIGN_STAGES.indexOf(cur || "Manufacturing") + (rejected ? 1 : 0) ? "done" : "";
    const sub = s === cur && GATES.includes(s) ? `<span class="gate">${["", REVIEW_SUB, REVIEW_CHIEF].map((r, i) => `<i class="${p.review === r ? "on" : (p.review === REVIEW_CHIEF && i < 2) ? "done" : ""}">${["Work", "Subteam", "Chief"][i]}</i>`).join("")}</span>` : "";
    return `<li class="${state}"><span class="dot"></span><span class="name">${s === "Manufacturing" ? "Mfg" : s}</span>${sub}</li>`;
  }).join("")}${rejected ? `<li class="rejected"><span class="dot"></span><span class="name">Rejected</span></li>` : ""}</ol>`;
}
function commentHtml(c) {
  const verb = COMMENT_VERB[c.kind] ?? ""; const when = new Date(c.at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `<li class="comment ${c.kind}"><div><strong>${esc(memberName(c.by))}</strong>${verb ? ` <span class="verb">${esc(verb)}${c.stage && c.kind !== "comment" ? ` · ${esc(c.stage)}` : ""}</span>` : ""}<small>${when}</small></div>${c.text ? `<p>${esc(c.text)}</p>` : ""}</li>`;
}
function designCard(p) {
  const u = me(); const tasks = read("tasks").filter((t) => t.projectId === p.id); const done = tasks.filter((t) => t.status === "Done").length;
  const acts = designActions(p, u);
  const comments = [...(p.comments || [])].reverse(); const visible = comments.filter((c) => c.text || c.kind !== "comment");
  const recent = visible.slice(0, 2); const older = visible.slice(2);
  const waiting = p.review === REVIEW_SUB ? `Waiting on the ${p.subteam} lead` : p.review === REVIEW_CHIEF ? "Waiting on the chief" : p.status === "Proposed" ? `Waiting on the ${p.subteam} lead to start PP1` : "";
  const canAssign = can("assign", "projects", p);
  const peopleChips = (p.assignees || []).map((a) => `<span class="person-wrap">${personLink(a, a === p.pocId ? " poc" : "")}${canAssign && a !== p.pocId ? `<button class="x" data-action="unassign" data-key="projects" data-id="${p.id}" data-member="${a}" title="Remove">×</button>` : ""}</span>`).join(" ") || `<span class="hint">Nobody yet</span>`;
  const pocCtl = can("assignPoc", "projects", p) ? `<label class="inline small">POC <select data-poc="${p.id}">${memberOpts(p.assignees || [], p.pocId || "", "— Not set —")}</select></label>` : "";
  const addCtl = canAssign ? `<label class="inline small">Assign <select data-assign="${p.id}">${memberOpts([], "", "Add a person…")}</select></label>` : "";
  const taskRows = tasks.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(memberName(t.assigneeId))}</td><td class="mono">${esc(t.dueDate || "—")}</td><td><span class="status task-${stageClass(t.status)}">${esc(t.status)}</span></td><td class="actions">${can("advance", "tasks", t) ? `<button class="link" data-action="advance" data-key="tasks" data-id="${t.id}">Advance</button>` : ""}${can("delete", "tasks", t) ? `<button class="link danger" data-action="delete" data-key="tasks" data-id="${t.id}">Delete</button>` : ""}</td></tr>`).join("");
  const taskForm = can("create", "tasks", p) && !["Rejected"].includes(p.status) ? `<form class="task-form" data-project="${p.id}"><input name="title" placeholder="New task" required /><select name="assigneeId" required>${memberOpts(p.assignees || [], "", "Assign to…")}</select><input name="dueDate" type="date" /><button class="small">Add task</button></form>` : "";
  const docs = read("docs").filter((d) => d.projectId === p.id);
  const open = (k) => (designOpen.has(`${p.id}:${k}`) ? "open" : "");
  return `<article class="design-card stage-${stageClass(p.status)}${p.review ? " in-review" : ""}">
    <header><div><h3>${esc(p.name)}</h3><div class="meta">${teamLink(p.subteam)}${p.pocId ? `<span>POC ${personLink(p.pocId, " poc")}</span>` : ""}</div></div><span class="stage-chip ${stageClass(p.status)}">${esc(statusLabel(p))}</span></header>
    ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ""}
    ${stepper(p)}
    ${p.status === "Rejected" && p.rejectedFrom ? `<p class="hint bad">Rejected at ${esc(p.rejectedFrom)}</p>` : waiting ? `<p class="hint">${esc(waiting)}</p>` : ""}
    <div class="comments">${recent.length ? `<ul>${recent.map(commentHtml).join("")}</ul>` : `<p class="hint">No comments yet.</p>`}
      ${older.length ? `<details class="sec" data-sec="${p.id}:older" ${open("older")}><summary>${older.length} earlier</summary><ul>${older.map(commentHtml).join("")}</ul></details>` : ""}
      ${u.id ? `<form class="comment-form" data-project="${p.id}"><input name="text" required placeholder="Add a comment" /><button class="small secondary">Post</button></form>` : ""}</div>
    ${acts.length ? `<div class="design-actions">${acts.map(([a, label]) => `<button class="small${a === "reject" ? " danger-btn" : ["changes", "sendback"].includes(a) ? " secondary" : ""}" data-op="design-step" data-act="${a}" data-id="${p.id}">${esc(label)}</button>`).join("")}</div>` : ""}
    <details class="sec" data-sec="${p.id}:tasks" ${open("tasks")}><summary>Tasks <span class="count">${done}/${tasks.length}</span></summary>${tasks.length ? `<div class="table-wrap"><table class="compact"><thead><tr><th>Task</th><th>Assignee</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${taskRows}</tbody></table></div>` : `<p class="hint">No tasks yet.</p>`}${taskForm}</details>
    <details class="sec" data-sec="${p.id}:details" ${open("details")}><summary>Team & details</summary>
      <div class="people"><span class="label">Team</span>${peopleChips}${p.pocId ? "" : `<span class="warn-chip">No POC yet</span>`}</div>
      ${pocCtl || addCtl ? `<div class="assign-row">${pocCtl}${addCtl}</div>` : ""}
      <div class="meta">Proposed by ${esc(memberName(p.createdBy))}${p.estCost ? ` · ${money(p.estCost)} est.` : ""}${p.targetDate ? ` · target ${esc(p.targetDate)}` : ""}</div>
      ${EXT.projectExtras.map((f) => f(p)).join("")}
      ${docs.length ? `<div class="people"><span class="label">Docs</span>${docs.map((d) => `<a class="doc-chip doc-${stageClass(d.status)}" href="documents.html" title="${esc(d.title)}">${esc(d.number)} Rev ${esc(d.revision)} · ${esc(d.status)}</a>`).join(" ")}</div>` : ""}
      ${can("delete", "projects", p) ? `<div class="assign-row"><button class="link danger" data-action="delete" data-key="projects" data-id="${p.id}">Delete project</button></div>` : ""}
    </details>
  </article>`;
}

function renderDesign() {
  const u = me(); const all = read("projects"); const tasks = read("tasks");
  const groups = { Active: (p) => !["Rejected", "Manufacturing"].includes(p.status), Proposed: (p) => p.status === "Proposed", "In review": (p) => !!p.review, Manufacturing: (p) => p.status === "Manufacturing", Rejected: (p) => p.status === "Rejected", All: () => true };
  const shown = all.filter((p) => groups[designFilter](p) && (!designMine || onProject(p, u) || tasks.some((t) => t.projectId === p.id && t.assigneeId === u.id)))
    .sort((a, b) => DESIGN_STAGES.indexOf(b.status) - DESIGN_STAGES.indexOf(a.status) || a.name.localeCompare(b.name));
  document.querySelectorAll("#project-filter button").forEach((b) => b.classList.toggle("active", b.dataset.filter === designFilter));
  $("#project-counts").innerHTML = [...DESIGN_STAGES, "Rejected"].map((s) => `<span class="count-chip ${stageClass(s)}">${s} <b>${all.filter((p) => p.status === s).length}</b></span>`).join("") + `<span class="count-chip in-review">In review <b>${all.filter((p) => p.review).length}</b></span>`;
  $("#projects-list").innerHTML = shown.map(designCard).join("");
  $("#projects-empty").style.display = shown.length ? "none" : "block";
  renderGantt();
}

// Gantt: only what has happened. Each bar is cut into the stages a project actually went through, up to today.
const STAGE_COLOR = { Proposed: "proposed", PP1: "pp1", PP2: "pp2", PP3: "pp3", Manufacturing: "mfg", Rejected: "rejected" };
function stageSpans(p, today) {
  const steps = p.history.filter((h, i, arr) => i === 0 || h.stage !== arr[i - 1].stage);
  return steps.map((h, i) => ({ stage: h.stage, from: h.at.slice(0, 10), to: (steps[i + 1]?.at || today).slice(0, 10), open: !steps[i + 1] && h.stage !== "Rejected", reviews: p.history.filter((r) => r.stage === h.stage && r.review && r.at >= h.at && (!steps[i + 1] || r.at < steps[i + 1].at)) }));
}
function renderGantt() {
  const box = $("#design-gantt"); if (!onPage("#design-gantt")) return;
  const today = todayISO(); const projects = read("projects").filter((p) => p.history?.length);
  if (!projects.length) { box.innerHTML = `<p class="empty">Nothing has happened yet.</p>`; return; }
  const first = projects.flatMap((p) => p.history.map((h) => h.at.slice(0, 10))).sort()[0];
  const [y0, m0] = first.split("-").map(Number); const min = new Date(y0, m0 - 1, 1);
  const end = new Date(today + "T12:00:00"); end.setDate(end.getDate() + 3); const span = end - min;
  const pos = (d) => Math.max(0, Math.min(100, (new Date(d + "T12:00:00") - min) / span * 100));
  const months = []; for (let d = new Date(min); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  const rows = projects.sort((a, b) => a.history[0].at.localeCompare(b.history[0].at)).map((p) => {
    const spans = stageSpans(p, today);
    const bars = spans.filter((s) => s.stage !== "Rejected").map((s) => { const l = pos(s.from); const w = Math.max(.6, pos(s.to) - l); return `<div class="g-seg ${STAGE_COLOR[s.stage]}${s.open ? " open" : ""}" style="left:${l}%;width:${w}%" title="${esc(s.stage)}: ${s.from} → ${s.open ? "today" : s.to}${s.reviews.length ? `\n${s.reviews.map((r) => `${r.review} ${r.at.slice(0, 10)}`).join("\n")}` : ""}"><span>${s.stage === "Manufacturing" ? "Mfg" : esc(s.stage)}</span></div>`; }).join("");
    const marks = spans.map((s) => `<i class="g-ms ${STAGE_COLOR[s.stage]}" style="left:${pos(s.from)}%" title="${esc(s.stage)} · ${s.from}"></i>`).join("")
      + spans.flatMap((s) => s.reviews).map((r) => `<i class="g-rev" style="left:${pos(r.at.slice(0, 10))}%" title="${esc(r.review)} · ${r.at.slice(0, 10)}"></i>`).join("");
    return `<div class="g-row"><div class="g-label"><a href="#" data-op="design-focus" data-id="${p.id}">${esc(p.name)}</a><small>${esc(statusLabel(p))}</small></div><div class="g-track">${bars}${marks}</div></div>`;
  }).join("");
  box.innerHTML = `<div class="gantt"><div class="g-row g-head"><div class="g-label"></div><div class="g-track">${months.map((m) => `<span class="g-month" style="left:${pos(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`)}%">${m.toLocaleString(undefined, { month: "short" })}${m.getMonth() === 0 ? ` ’${String(m.getFullYear()).slice(2)}` : ""}</span>`).join("")}</div></div>${rows}<div class="g-today" style="left:calc(200px + (100% - 200px) * ${pos(today) / 100})"><span>Today</span></div></div>
    <div class="g-legend">${DESIGN_STAGES.map((s) => `<span><i class="g-seg-key ${STAGE_COLOR[s]}"></i>${s}</span>`).join("")}<span><i class="g-ms-key"></i>Milestone reached</span><span><i class="g-rev-key"></i>Review step</span></div>`;
}

// ----- Interactions -----
OPS["design-step"] = (b) => {
  const p = read("projects").find((x) => x.id === b.dataset.id); const action = b.dataset.act; if (!p) return;
  const [label, required] = ACTION_NOTE[action] || ["Comment", false];
  const title = designActions(p).find(([a]) => a === action)?.[1] || action;
  openForm(`${title}: ${p.name}`, [["note", label, "textarea"]], {}, (v) => {
    if (required && !String(v.note || "").trim()) return flash(`${label} is needed.`);
    designStep(p.id, action, String(v.note || "").trim());
  });
};
OPS["design-focus"] = (b) => { const card = [...document.querySelectorAll(".design-card")].find((c) => c.querySelector(`[data-id="${b.dataset.id}"]`)); if (!card) { designFilter = "All"; renderDesign(); return OPS["design-focus"](b); } card.scrollIntoView({ block: "center", behavior: "smooth" }); card.classList.add("flash-row"); setTimeout(() => card.classList.remove("flash-row"), 1500); };
document.addEventListener("click", (e) => { if (e.target.closest('a[data-op="design-focus"]')) e.preventDefault(); }, true);
document.addEventListener("submit", (e) => {
  const f = e.target.closest(".comment-form"); if (!f) return; e.preventDefault();
  const text = String(new FormData(f).get("text") || "").trim(); if (!text) return;
  const list = read("projects"); const p = list.find((x) => x.id === f.dataset.project); if (!p) return;
  p.comments.push({ id: id(), by: me().id, at: nowISO(), kind: "comment", text, stage: statusLabel(p) }); write("projects", list);
  notify([p.pocId, p.createdBy, ...(p.assignees || [])], `${me().name} commented on "${p.name}": ${text.slice(0, 80)}`);
  logEvent(`commented on "${p.name}"`); renderAll();
});
document.addEventListener("toggle", (e) => { const d = e.target; if (d.classList?.contains("sec") && d.dataset.sec) d.open ? designOpen.add(d.dataset.sec) : designOpen.delete(d.dataset.sec); }, true);
document.querySelectorAll("#project-filter button").forEach((b) => b.addEventListener("click", () => { designFilter = b.dataset.filter; renderDesign(); }));
$("#project-mine").addEventListener("change", (e) => { designMine = e.target.checked; renderDesign(); });
EXT.renders.push(["#projects-list", renderDesign]);

// Queue items.
EXT.inbox.push((u) => read("projects").flatMap((p) => {
  const acts = designActions(p, u).filter(([a]) => !["reject", "changes", "sendback", "resubmit"].includes(a));
  const out = acts.filter(([a]) => a !== "submit").map(([, label]) => `Design: ${p.name} (${p.subteam}): ${label.toLowerCase()}`);
  if (!p.pocId && GATES.includes(p.status) && can("assignPoc", "projects", p)) out.push(`Design: ${p.name} needs a POC`);
  return out;
}));

// ----- Demo history -----
EXT.seeds.push(() => {
  const team = read("team"); const chief = team.find((m) => m.title === "Chief Mechanic")?.id || team[0].id;
  const lead = (sub) => team.find((m) => (m.leads || []).includes(sub))?.id || chief;
  const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
  // [name, steps: [stage, review, daysAgo, action, comment?]]
  const plans = {
    "Lightweight front upright": [["Proposed", "", 72], ["PP1", "", 60, "start", "Good mass target. Get loads from VD first."], ["PP1", REVIEW_SUB, 41, "submit"], ["PP1", REVIEW_CHIEF, 38, "pass"], ["PP2", "", 35, "pass", "Concept is sound. Show the bearing fit in PP2."], ["PP2", REVIEW_SUB, 6, "submit", "Drawings and FEA attached in DOC-0001."]],
    "Accumulator cooling redesign": [["Proposed", "", 95], ["PP1", "", 88, "start"], ["PP1", REVIEW_SUB, 70, "submit"], ["PP1", REVIEW_CHIEF, 66, "pass"], ["PP2", "", 63, "pass"], ["PP2", REVIEW_SUB, 40, "submit"], ["PP2", REVIEW_CHIEF, 37, "pass"], ["PP2", REVIEW_SUB, 34, "sendback", "Fan failure case isn't covered. Add it before I sign."], ["PP2", REVIEW_CHIEF, 30, "pass", "Failure case added."], ["PP3", "", 28, "pass"], ["PP3", REVIEW_SUB, 9, "submit"], ["PP3", REVIEW_CHIEF, 4, "pass", "Thermal test matches CFD within 3 °C."]],
    "CAN telemetry dashboard": [["Proposed", "", 40], ["PP1", "", 30, "start", "Keep it read-only for now."]],
    "Carbon steering wheel": [["Proposed", "", 12]],
    "Restrictor CFD study": [["Proposed", "", 5]],
    "Sponsor outreach packet": [["Proposed", "", 50], ["PP1", "", 44, "start"], ["PP1", REVIEW_SUB, 3, "submit", "Draft deck ready for a look."]],
    "Differential mount v2": [["Proposed", "", 150], ["PP1", "", 140, "start"], ["PP1", REVIEW_SUB, 128, "submit"], ["PP1", REVIEW_CHIEF, 126, "pass"], ["PP2", "", 124, "pass"], ["PP2", REVIEW_SUB, 108, "submit"], ["PP2", REVIEW_CHIEF, 105, "pass"], ["PP3", "", 103, "pass"], ["PP3", REVIEW_SUB, 90, "submit"], ["PP3", REVIEW_CHIEF, 88, "pass"], ["Manufacturing", "", 85, "pass", "Approved. Machine both mounts from one billet."]],
    "Active aero DRS flap": [["Proposed", "", 64], ["PP1", "", 58, "start"], ["PP1", REVIEW_SUB, 47, "submit"], ["Rejected", "", 45, "reject", "Outside this season's budget and adds rules risk. Revisit next year."]]
  };
  const projects = read("projects").map((p) => {
    const plan = plans[p.name]; if (!plan) return p;
    const history = []; const comments = [];
    plan.forEach(([stage, review, d, action, note], i) => {
      const by = action === "submit" ? (p.pocId || p.createdBy) : action === "pass" && review === REVIEW_CHIEF ? lead(p.subteam) : ["pass", "sendback", "reject"].includes(action) ? (review === REVIEW_SUB && action === "sendback" ? chief : i && plan[i - 1][1] === REVIEW_CHIEF ? chief : lead(p.subteam)) : action === "start" ? lead(p.subteam) : p.createdBy;
      history.push({ stage, review, at: ago(d), by, action: action || "" });
      if (action) comments.push({ id: id(), by, at: ago(d), kind: action, text: note || "", stage: i ? (plan[i - 1][1] ? `${plan[i - 1][0]} · ${plan[i - 1][1]}` : plan[i - 1][0]) : "" });
    });
    const last = plan[plan.length - 1];
    if (p.name === "Lightweight front upright") comments.push({ id: id(), by: p.assignees?.[1] || p.createdBy, at: ago(2), kind: "comment", text: "Bearing press-fit test booked for next week.", stage: "PP2 · Subteam review" });
    return { ...p, status: last[0], review: last[0] === "Rejected" ? "" : last[1], history, comments, createdAt: history[0].at, approvedAt: history[1]?.at || "", rejectedFrom: last[0] === "Rejected" ? `${plan[plan.length - 2][0]} subteam review` : "" };
  });
  write("projects", projects);
});

migrateProjects();
