const STORAGE_KEY = "motorsport-erp-parts";

const form = document.getElementById("part-form");
const searchInput = document.getElementById("search");
const tableBody = document.getElementById("parts-body");
const emptyState = document.getElementById("empty-state");

function loadParts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveParts(parts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parts));
}

function renderParts() {
  const query = searchInput.value.trim().toLowerCase();
  const parts = loadParts();
  const filteredParts = parts.filter((part) =>
    [part.name, part.subsystem, part.location, part.status]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );

  tableBody.innerHTML = "";

  filteredParts.forEach((part) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${part.name}</td>
      <td>${part.subsystem}</td>
      <td>${part.quantity}</td>
      <td>${part.location}</td>
      <td>${part.status}</td>
      <td class="actions">
        <button type="button" data-action="advance" data-id="${part.id}">Advance Status</button>
        <button type="button" class="delete" data-action="delete" data-id="${part.id}">Delete</button>
      </td>
    `;
    tableBody.appendChild(row);
  });

  emptyState.style.display = filteredParts.length ? "none" : "block";
}

function nextStatus(status) {
  const statuses = ["In Design", "Manufacturing", "In Inventory", "Installed", "Damaged"];
  const currentIndex = statuses.indexOf(status);
  if (currentIndex === -1 || currentIndex === statuses.length - 1) {
    return statuses[0];
  }
  return statuses[currentIndex + 1];
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const part = {
    id: crypto.randomUUID(),
    name: formData.get("name").toString().trim(),
    subsystem: formData.get("subsystem").toString(),
    quantity: Number(formData.get("quantity")),
    location: formData.get("location").toString().trim(),
    status: formData.get("status").toString(),
  };

  if (!part.name || !part.location || part.quantity < 1) {
    return;
  }

  const parts = loadParts();
  parts.push(part);
  saveParts(parts);

  form.reset();
  document.getElementById("quantity").value = "1";
  document.getElementById("status").value = "In Design";
  renderParts();
});

searchInput.addEventListener("input", renderParts);

tableBody.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) {
    return;
  }

  const parts = loadParts();
  const index = parts.findIndex((part) => part.id === id);
  if (index === -1) {
    return;
  }

  if (action === "delete") {
    parts.splice(index, 1);
  }

  if (action === "advance") {
    parts[index].status = nextStatus(parts[index].status);
  }

  saveParts(parts);
  renderParts();
});

renderParts();
