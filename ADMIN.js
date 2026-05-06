// save (add or edit)
document.getElementById('saveBtn').addEventListener('click', () => {
  const modal = document.getElementById('modal');
  const mode = modal.dataset.mode || 'add';
  const editId = modal.dataset.editId;

  const name = document.getElementById('itemName').value.trim();
  const category = document.getElementById('itemCategory').value.trim();
  const unit = document.getElementById('itemUnit').value.trim();
  const qty = Number(document.getElementById('itemQty').value) || 0;
  const threshold = Number(document.getElementById('itemThreshold').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  const supplier = document.getElementById('itemSupplier').value.trim();

  if (!name) return alert("Name required");

  const payload = { name, category, unit, qty, threshold, location, supplier };

  if (mode === 'edit') {
    inventoryRef.child(editId).update(payload);
  } else {
    payload.status = 'Active';
    payload.createdAt = Date.now();
    inventoryRef.push(payload);
  }

  modal.style.display = "none";
});

// Open Add Modal
document.getElementById('addBtn').addEventListener('click', () => {
  const modal = document.getElementById('modal');
  modal.dataset.mode = 'add';
  modal.dataset.editId = '';
  document.getElementById('modalTitle').innerText = 'Add Item';

  document.querySelectorAll('.form-grid input').forEach(i => i.value = '');
  
  modal.style.display = 'flex';
});

// Cancel button
document.getElementById('cancelBtn').addEventListener('click', () => {
  document.getElementById('modal').style.display = 'none';
});
