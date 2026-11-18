// The dashboard's runtime: reads window.RADAR (written by main.ts) and renders the board,
// the detail view, the live-token tab and the model panel. No framework, no network.

const RADAR = window.RADAR || { rows: [], live: [], comparables: {}, model: {}, as_of: '', watchlist: [] };

let sortKey = 'implied_value_usd';
let sortAsc = false;
let filterCategory = '';
let filterChain = '';
let watchlistOnly = false;

function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n;
}

function renderBoard() {
  const body = document.getElementById('board-body');
  if (!body) return;

  let rows = [...RADAR.rows];
  const q = (document.getElementById('search').value || '').toLowerCase();

  if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  if (filterCategory) rows = rows.filter(r => r.category === filterCategory);
  if (filterChain) rows = rows.filter(r => r.chains.includes(filterChain));
  if (watchlistOnly) rows = rows.filter(r => RADAR.watchlist.includes(r.slug));

  rows.sort((a, b) => {
    const va = a[sortKey] === null ? -Infinity : a[sortKey];
    const vb = b[sortKey] === null ? -Infinity : b[sortKey];
    if (va === vb) return a.slug.localeCompare(b.slug);
    return sortAsc ? va - vb : vb - va;
  });

  body.innerHTML = rows.map(r => {
    const delta = r.change_7d;
    const deltaClass = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
    const deltaText = delta === null ? '—' : delta.toFixed(2) + '%';
    return `<tr data-slug="${r.slug}">
      <td>${r.rank}</td>
      <td><strong>${r.name}</strong><br><small style="color:var(--muted)">${r.slug}</small></td>
      <td>${r.category || '—'}</td>
      <td>${r.chains.join(', ')}</td>
      <td>${fmtMoney(r.tvl_usd)}</td>
      <td class="${deltaClass}">${deltaText}</td>
      <td>${r.age_days ?? '—'}</td>
      <td>${fmtMoney(r.implied_value_usd)}</td>
    </tr>`;
  }).join('');
}

function renderDetail(slug) {
  const r = RADAR.rows.find(x => x.slug === slug);
  const view = document.getElementById('view-detail');
  if (!r || !view) return;

  const rowFromBoard = r;
  const implied = r.implied_value_usd;

  const multipliersHtml = `
    <div class="detail-grid">
      <div class="stat-box"><div class="stat-label">TVL</div><div class="stat-value">${fmtMoney(r.tvl_usd)}</div></div>
      <div class="stat-box"><div class="stat-label">7d Growth</div><div class="stat-value">${r.change_7d ?? '—'}%</div></div>
      <div class="stat-box"><div class="stat-label">Age (days)</div><div class="stat-value">${r.age_days ?? 'Unknown'}</div></div>
      <div class="stat-box"><div class="stat-label">Implied Value</div><div class="stat-value">${fmtMoney(implied)}</div></div>
      <div class="stat-box"><div class="stat-label">Growth Mult</div><div class="stat-value">${rowFromBoard.growth_multiplier?.toFixed(4) || '—'}</div></div>
      <div class="stat-box"><div class="stat-label">Maturity Mult</div><div class="stat-value">${rowFromBoard.maturity_multiplier?.toFixed(4) || '—'}</div></div>
    </div>`;

  // We don't have farm_steps in RadarRow, so we regenerate minimal steps or just show placeholders
  const stepsHtml = `<ul class="farm-steps">${(r.farm_steps || []).map(s => `<li>${s}</li>`).join('')}</ul>`;

  view.innerHTML = `<div class="wrap"><button onclick="history.back()" style="margin-bottom:1rem;background:var(--panel);color:var(--text);border:none;padding:0.5rem 1rem;border-radius:6px;cursor:pointer">&larr; Back</button>
    <div class="detail-card">
      <h2>${r.name}</h2>
      <p style="color:var(--muted)">${r.slug} &middot; ${r.category || 'Uncategorized'} &middot; Chains: ${r.chains.join(', ')}</p>
      ${multipliersHtml}
      <h3>Farm Plan</h3>
      ${stepsHtml}
    </div></div>`;
}

function initControls() {
  const cats = new Set();
  const chains = new Set();
  RADAR.rows.forEach(r => {
    if (r.category) cats.add(r.category);
    r.chains.forEach(c => chains.add(c));
  });

  const catSel = document.getElementById('category-filter');
  if (catSel) {
    [...cats].sort().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      catSel.appendChild(opt);
    });
    catSel.onchange = (e) => { filterCategory = e.target.value; renderBoard(); };
  }

  const chainSel = document.getElementById('chain-filter');
  if (chainSel) {
    [...chains].sort().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      chainSel.appendChild(opt);
    });
    chainSel.onchange = (e) => { filterChain = e.target.value; renderBoard(); };
  }

  const searchInput = document.getElementById('search');
  if (searchInput) searchInput.oninput = () => renderBoard();

  const wlCheck = document.getElementById('watchlist-only');
  if (wlCheck) wlCheck.onchange = (e) => { watchlistOnly = e.target.checked; renderBoard(); };

  document.querySelectorAll('.board-table th[data-sort]').forEach(th => {
    th.onclick = () => {
      const key = th.getAttribute('data-sort');
      if (sortKey === key) sortAsc = !sortAsc;
      else { sortKey = key; sortAsc = false; }
      renderBoard();
    };
  });

  document.querySelectorAll('#board-body tr').forEach(tr => {
    tr.onclick = () => {
      const slug = tr.getAttribute('data-slug');
      showView('detail', slug);
    };
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.id.replace('tab-', '');
      showView(target);
    };
  });
}

function showView(name, param) {
  ['board', 'detail', 'live', 'model'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== name);
  });

  if (name === 'detail' && param) renderDetail(param);

  if (name === 'live') {
    const view = document.getElementById('view-live');
    view.innerHTML = `<div class="wrap"><h2>Live Tokens</h2><table class="board-table"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>TVL</th><th>Market Cap</th><th>7d %</th></tr></thead><tbody>${
      RADAR.live.map((l, i) => `<tr><td>${i+1}</td><td>${l.name}</td><td>${l.category||'—'}</td><td>${fmtMoney(l.tvl_usd)}</td><td>${fmtMoney(l.mcap_usd)}</td><td>${l.change_7d??'—'}%</td></tr>`).join('')
    }</tbody></table></div>`;
  }

  if (name === 'model') {
    const view = document.getElementById('view-model');
    const compRows = Object.entries(RADAR.comparables)
      .filter(([k]) => k !== '__fallback__')
      .map(([k, v]) => `<tr><td>${k}</td><td>${v.multiple.toFixed(4)}</td><td>${v.peers}</td></tr>`).join('');
    const fb = RADAR.comparables['__fallback__'];

    view.innerHTML = `<div class="wrap"><h2>Model radar-2</h2>
      <p>Implied value = TVL × category multiple × growth mult × maturity mult × chain mult.</p>
      <div class="detail-grid">
        <div class="stat-box"><div class="stat-label">Base Multiple</div><div class="stat-value">${RADAR.model.base_multiple}</div></div>
        <div class="stat-box"><div class="stat-label">Fallback Multiple</div><div class="stat-value">${fb?.multiple.toFixed(4) || '—'}</div></div>
      </div>
      <h3>Category Comparables</h3>
      <table class="board-table"><thead><tr><th>Category</th><th>Median mcap/TVL</th><th>Peers</th></tr></thead><tbody>${compRows}</tbody></table>
    </div>`;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  initControls();
  renderBoard();
});
