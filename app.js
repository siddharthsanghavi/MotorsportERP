const KEYS = { parts: "motorsport-erp-parts", purchases: "motorsport-erp-purchases", jobs: "motorsport-erp-jobs", budgets: "motorsport-erp-budgets", approvals: "motorsport-erp-approvals" };
const $ = (selector) => document.querySelector(selector);
const read = (key) => { try { return JSON.parse(localStorage.getItem(KEYS[key])) || []; } catch { return []; } };
const write = (key, value) => localStorage.setItem(KEYS[key], JSON.stringify(value));
const id = () => crypto.randomUUID();
const formValues = (form) => Object.fromEntries(new FormData(form).entries());
const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);

function showView(view) {
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));

function renderParts() {
  const query = ($("#part-search")?.value || "").trim().toLowerCase();
  const rows = read("parts").filter((part) => Object.values(part).join(" ").toLowerCase().includes(query));
  $("#parts-body").innerHTML = rows.map((part) => `<tr><td>${esc(part.name)}</td><td>${esc(part.subsystem)}</td><td>${part.quantity}</td><td>${esc(part.location)}</td><td><span class="status">${esc(part.status)}</span></td><td><button class="link" data-action="advance-part" data-id="${part.id}">Advance</button><button class="link danger" data-action="delete" data-key="parts" data-id="${part.id}">Delete</button></td></tr>`).join("");
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
const renderAll = () => { renderParts(); renderPurchases(); renderJobs(); renderBudgets(); renderApprovals(); renderOverview(); };

const setupForm = (selector, key, after = renderAll) => $(selector).addEventListener("submit", (event) => { event.preventDefault(); const values = formValues(event.target); write(key, [...read(key), { ...values, id: id(), createdAt: new Date().toISOString(), status: values.status || "Pending" }]); event.target.reset(); after(); });
setupForm("#part-form", "parts"); setupForm("#purchase-form", "purchases"); setupForm("#job-form", "jobs"); setupForm("#budget-form", "budgets"); setupForm("#approval-form", "approvals");
$("#part-search").addEventListener("input", renderParts);
const next = { parts: ["In Design", "Manufacturing", "In Inventory", "Installed", "Damaged"], purchases: ["Requested", "Quoted", "Approved", "Ordered", "Received"], jobs: ["Queued", "In Progress", "Quality Check", "Complete"], approvals: ["Pending Review", "Changes Requested", "Approved"] };
document.addEventListener("click", (event) => { const button = event.target.closest("[data-action]"); if (!button) return; const key = button.dataset.key; const rows = read(key); const index = rows.findIndex((row) => row.id === button.dataset.id); if (index < 0) { const actionKey = { "advance-part": "parts", "advance-purchase": "purchases", "advance-job": "jobs", "advance-approval": "approvals" }[button.dataset.action]; if (!actionKey) return; const items = read(actionKey); const itemIndex = items.findIndex((row) => row.id === button.dataset.id); if (itemIndex < 0) return; const statuses = next[actionKey]; items[itemIndex].status = statuses[(statuses.indexOf(items[itemIndex].status) + 1) % statuses.length]; write(actionKey, items); renderAll(); return; } rows.splice(index, 1); write(key, rows); renderAll(); });
renderAll();
