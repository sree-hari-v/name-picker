// Lucky Picker App — with list controls and spin animation
// - Remaining: Reset (rebuild), Clear (empty)
// - Picked: Reset (return to remaining), Remove (delete from dataset)
// - Draw animation: fast roulette before final pick

const els = {
  total: document.getElementById('stat-total'),
  remaining: document.getElementById('stat-remaining'),
  picked: document.getElementById('stat-picked'),
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  fileList: document.getElementById('file-list'),
  namesInput: document.getElementById('names-input'),
  btnAddManual: document.getElementById('btn-add-manual'),
  btnClearManual: document.getElementById('btn-clear-manual'),
  optTrimDuplicates: document.getElementById('opt-trim-duplicates'),
  optCaseSensitive: document.getElementById('opt-case-sensitive'),
  btnDraw: document.getElementById('btn-draw'),
  btnUndo: document.getElementById('btn-undo'),
  btnReset: document.getElementById('btn-reset'),
  btnExportPicked: document.getElementById('btn-export-picked'),
  btnExportRemaining: document.getElementById('btn-export-remaining'),
  selectedName: document.getElementById('selected-name'),
  listRemaining: document.getElementById('list-remaining'),
  listPicked: document.getElementById('list-picked'),
  // new list action buttons
  btnResetRemaining: document.getElementById('btn-reset-remaining'),
  btnClearRemaining: document.getElementById('btn-clear-remaining'),
  btnResetPicked: document.getElementById('btn-reset-picked'),
  btnRemovePicked: document.getElementById('btn-remove-picked'),
};

// App state
const state = {
  original: [],   // full set (unique) from all sources
  pool: [],       // remaining to draw from
  picked: [],     // already drawn (in order)
  history: [],    // stack of drawn names for undo
  spinning: false // animation guard
};

// Utilities
const normalize = (s, caseSensitive) => {
  const t = String(s).trim();
  return caseSensitive ? t : t.toLowerCase();
};

function uniqueMerge(existing, incoming, caseSensitive) {
  const map = new Map(existing.map(n => [normalize(n, caseSensitive), n]));
  for (const n of incoming) {
    const key = normalize(n, caseSensitive);
    if (!key) continue;
    if (!map.has(key)) map.set(key, String(n).trim());
  }
  return Array.from(map.values());
}

function updateStatsAndLists() {
  els.total.textContent = state.original.length.toString();
  els.remaining.textContent = state.pool.length.toString();
  els.picked.textContent = state.picked.length.toString();

  // Render lists as badges
  renderBadges(els.listRemaining, state.pool, false);
  renderBadges(els.listPicked, state.picked, true);
}

function renderBadges(container, arr, picked) {
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const name of arr) {
    const b = document.createElement('span');
    b.className = 'badge' + (picked ? ' picked' : '');
    b.textContent = name;
    frag.appendChild(b);
  }
  container.appendChild(frag);
}

function showFiles(files) {
  els.fileList.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const f of files) {
    const chip = document.createElement('span');
    chip.className = 'file-chip';
    chip.textContent = `${f.name} (${Math.ceil(f.size / 1024)} KB)`;
    frag.appendChild(chip);
  }
  els.fileList.appendChild(frag);
}

function setSelectedName(name) {
  els.selectedName.textContent = name || 'No name selected yet';
  els.selectedName.classList.remove('pop');
  requestAnimationFrame(() => {
    // trigger reflow
    void els.selectedName.offsetWidth;
    els.selectedName.classList.add('pop');
  });
}

function celebrate() {
  // Confetti burst sequence
  const duration = 1_200;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#7c5cff','#00d4ff','#22c55e','#f59e0b','#ef4444','#ffffff']
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#7c5cff','#00d4ff','#22c55e','#f59e0b','#ef4444','#ffffff']
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    } else {
      confetti({
        particleCount: 120,
        spread: 80,
        startVelocity: 45,
        scalar: 0.9,
        ticks: 120,
        origin: { y: 0.3 }
      });
    }
  })();
}

/* Spin animation: quickly cycle through names before selecting */
function setAllButtonsDisabled(disabled) {
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(b => b.disabled = disabled);
}

async function spinAndPick() {
  if (state.spinning) return;
  if (state.pool.length === 0) {
    setSelectedName('All names have been drawn. Reset to start over.');
    return;
  }

  state.spinning = true;
  setAllButtonsDisabled(true);

  const spinDuration = 1400; // ms
  const intervalMs = 50; // speed of cycling
  let timer;
  let lastShown = '';

  await new Promise(resolve => {
    timer = setInterval(() => {
      if (state.pool.length === 0) return;
      const idx = Math.floor(Math.random() * state.pool.length);
      lastShown = state.pool[idx];
      setSelectedName(lastShown);
    }, intervalMs);

    setTimeout(() => {
      clearInterval(timer);
      resolve();
    }, spinDuration);
  });

  // After spin, actually pick and remove from pool
  if (state.pool.length > 0) {
    const idx = Math.floor(Math.random() * state.pool.length);
    const [name] = state.pool.splice(idx, 1);
    state.picked.push(name);
    state.history.push(name);
    setSelectedName(name);
    celebrate();
    updateStatsAndLists();
  }

  state.spinning = false;
  setAllButtonsDisabled(false);
}

// File Parsing
async function parseFiles(files) {
  if (!files || files.length === 0) return [];
  const all = [];
  for (const file of files) {
    const ext = file.name.toLowerCase().split('.').pop() || '';
    try {
      if (ext === 'xlsx' || ext === 'xls') {
        all.push(...await parseExcel(file));
      } else if (ext === 'csv') {
        all.push(...await parseCSV(file));
      } else if (ext === 'txt') {
        all.push(...await parseTXT(file));
      } else if (ext === 'docx') {
        all.push(...await parseDOCX(file));
      } else {
        alert(`Unsupported file type: .${ext}\nSupported: .xlsx, .xls, .csv, .txt, .docx`);
      }
    } catch (err) {
      console.error('Failed to parse', file.name, err);
      alert(`Failed to parse ${file.name}: ${err.message || err}`);
    }
  }
  return all;
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error('File read failed'));
    fr.readAsArrayBuffer(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('File read failed'));
    fr.readAsText(file);
  });
}

async function parseExcel(file) {
  const buf = await readAsArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // Convert sheet to 2D array, flatten, filter
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // array of arrays
  const flat = rows.flat().map(x => (x == null ? '' : String(x)));
  return flat
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 0);
}

async function parseCSV(file) {
  // Use XLSX to parse CSV robustly
  const text = await readAsText(file);
  const wb = XLSX.read(text, { type: 'string' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const flat = rows.flat().map(x => (x == null ? '' : String(x)));
  return flat.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function parseTXT(file) {
  const text = await readAsText(file);
  return splitNames(text);
}

async function parseDOCX(file) {
  const buffer = await readAsArrayBuffer(file);
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value || '';
  return splitNames(text);
}

function splitNames(text) {
  // Accept lines or comma/semicolon separated lists
  return text
    .split(/\r?\n|,|;|\t/g)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Actions
function addNames(names) {
  const caseSensitive = !!els.optCaseSensitive.checked;
  const dedupe = !!els.optTrimDuplicates.checked;

  const clean = names
    .map(n => String(n).trim())
    .filter(Boolean);

  let merged;
  if (dedupe) {
    merged = uniqueMerge(state.original, clean, caseSensitive);
  } else {
    // Append as-is
    merged = state.original.concat(clean);
  }

  state.original = merged.slice();
  rebuildPoolKeepingPicked();
  updateStatsAndLists();
}

function rebuildPoolKeepingPicked() {
  // pool = original - picked
  const caseSensitive = !!els.optCaseSensitive.checked;
  const pickedSet = new Set(state.picked.map(n => normalize(n, caseSensitive)));
  state.pool = state.original.filter(n => !pickedSet.has(normalize(n, caseSensitive)));
}

function drawNext() {
  if (state.spinning) return;
  if (state.pool.length === 0) {
    setSelectedName('All names have been drawn. Reset to start over.');
    return;
  }
  spinAndPick();
}

function undo() {
  if (state.spinning) return;
  if (state.history.length === 0) return;
  const caseSensitive = !!els.optCaseSensitive.checked;
  const last = state.history.pop();

  // Remove last from picked, put back into pool
  const i = state.picked.lastIndexOf(last);
  if (i >= 0) state.picked.splice(i, 1);

  // Only add back to pool if it still belongs to original
  const inOriginal = new Set(state.original.map(n => normalize(n, caseSensitive)))
    .has(normalize(last, caseSensitive));
  if (inOriginal) {
    state.pool.push(last);
  }

  setSelectedName('Undo ✔');
  updateStatsAndLists();
}

function resetAll() {
  if (state.spinning) return;
  state.pool = state.original.slice();
  state.picked = [];
  state.history = [];
  setSelectedName('Pool reset. Ready to draw.');
  updateStatsAndLists();
}

function exportCSV(filename, rows) {
  const header = 'name';
  const content = [header, ...rows.map(n => `"${String(n).replace(/"/g, '""')}"`)].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/* List-specific actions */
function clearRemaining() {
  if (state.spinning) return;
  state.pool = [];
  updateStatsAndLists();
}
function resetRemaining() {
  if (state.spinning) return;
  rebuildPoolKeepingPicked();
  updateStatsAndLists();
}
function resetPicked() {
  if (state.spinning) return;
  // return all picked back to remaining (pool)
  state.pool = state.pool.concat(state.picked);
  state.picked = [];
  state.history = [];
  setSelectedName('Picked moved back to Remaining ✔');
  updateStatsAndLists();
}
function removePicked() {
  if (state.spinning) return;
  if (state.picked.length === 0) return;
  const ok = confirm('Remove all PICKED names from the dataset? This cannot be undone (except by re-importing).');
  if (!ok) return;
  const caseSensitive = !!els.optCaseSensitive.checked;
  const toRemove = new Set(state.picked.map(n => normalize(n, caseSensitive)));
  // Remove from original
  state.original = state.original.filter(n => !toRemove.has(normalize(n, caseSensitive)));
  // Clear picked and rebuild pool accordingly
  state.picked = [];
  state.history = [];
  rebuildPoolKeepingPicked();
  setSelectedName('Picked removed from dataset ✔');
  updateStatsAndLists();
}

// Events: drag and drop
['dragenter','dragover'].forEach(evt => {
  els.dropzone.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation();
    els.dropzone.style.borderColor = '#7c5cff';
    els.dropzone.style.background = 'rgba(124,92,255,0.10)';
  });
});
['dragleave','drop'].forEach(evt => {
  els.dropzone.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation();
    els.dropzone.style.borderColor = '#3a3f75';
    els.dropzone.style.background = 'rgba(124,92,255,0.05)';
  });
});
els.dropzone.addEventListener('drop', async (e) => {
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length === 0) return;
  showFiles(files);
  const names = await parseFiles(files);
  addNames(names);
});

els.fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  showFiles(files);
  const names = await parseFiles(files);
  addNames(names);
});

els.btnAddManual.addEventListener('click', () => {
  const text = els.namesInput.value || '';
  const names = splitNames(text);
  if (names.length === 0) {
    alert('Please paste some names first.');
    return;
  }
  addNames(names);
  setSelectedName(`${names.length} name(s) added ✔`);
});

els.btnClearManual.addEventListener('click', () => {
  els.namesInput.value = '';
  els.namesInput.focus();
});

els.btnDraw.addEventListener('click', drawNext);
els.btnUndo.addEventListener('click', undo);
els.btnReset.addEventListener('click', resetAll);
els.btnExportPicked.addEventListener('click', () => exportCSV('picked.csv', state.picked));
els.btnExportRemaining.addEventListener('click', () => exportCSV('remaining.csv', state.pool));

// List controls
els.btnClearRemaining.addEventListener('click', clearRemaining);
els.btnResetRemaining.addEventListener('click', resetRemaining);
els.btnResetPicked.addEventListener('click', resetPicked);
els.btnRemovePicked.addEventListener('click', removePicked);

// Initialize
(function init(){
  updateStatsAndLists();
  setSelectedName('Load names to begin');
})();