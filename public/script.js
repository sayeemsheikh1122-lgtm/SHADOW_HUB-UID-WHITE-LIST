const API_BASE = '';

function ensureServerHosting() {
  const msg = document.getElementById('loginMsg');
  const btn = document.getElementById('loginBtn');
  if (window.location.protocol === 'file:') {
    if (msg) {
      msg.textContent = 'Open this page from http://localhost:3000://.';
      msg.style.color = '#fecaca';
    }
    if (btn) btn.disabled = true;
    return false;
  }
  return true;
}
let total = 0, success = 0, failed = 0;
const historyItems = [];
let licenses = [];

async function pasteUID() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('uidInput').value = text.trim();
    document.getElementById('uidInput').focus();
  } catch (e) {
    document.getElementById('uidInput').focus();
  }
}

async function addUID() {
  const uid = document.getElementById('uidInput').value.trim();
  if (!uid) { showResult(false, 'Please enter your UID', 'UID field cannot be empty'); return; }

  setLoading(true);
  hideResult();
  total++;
  updateStats();

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  try {
    const res = await fetch('/proxy/add_uid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid })
    });
    const text = await res.text();
    if (res.ok) {
      success++;
      updateStats();
      showResult(true, 'Bypass Activated!', '1-day access granted · ' + (text || 'Whitelisted successfully'));
      addHistory(uid, true, timeStr);
      document.getElementById('uidInput').value = '';
    } else {
      failed++;
      updateStats();
      showResult(false, 'Activation Failed', 'Error ' + res.status + ': ' + (text || 'Unknown error'));
      addHistory(uid, false, timeStr);
    }
  } catch (err) {
    failed++;
    updateStats();
    showResult(false, 'Connection Error', err.message);
    addHistory(uid, false, timeStr);
  }
  setLoading(false);
}

function setLoading(state) {
  const btn = document.getElementById('addBtn');
  if (!btn) return;
  btn.disabled = state;
  btn.innerHTML = state
    ? '<div class="spinner"></div><span>Activating...</span>'
    : '<i class="ti ti-bolt"></i><span>Activate Bypass</span>';
}

function showResult(ok, msg, sub) {
  const box = document.getElementById('resultBox');
  if (!box) return;
  box.className = 'result ' + (ok ? 'success' : 'error');
  const icon = document.getElementById('resultIcon');
  if (icon) icon.className = 'ti ' + (ok ? 'ti-circle-check' : 'ti-alert-circle');
  document.getElementById('resultMsg').textContent = msg;
  document.getElementById('resultSub').textContent = sub || '';
}

function hideResult() {
  const box = document.getElementById('resultBox');
  if (box) box.className = 'result hidden';
}

function updateStats() {
  const totalCount = document.getElementById('totalCount');
  const successCount = document.getElementById('successCount');
  const failCount = document.getElementById('failCount');
  if (totalCount) totalCount.textContent = total;
  if (successCount) successCount.textContent = success;
  if (failCount) failCount.textContent = failed;
}

function addHistory(uid, ok, time) {
  historyItems.unshift({ uid, ok, time });
  const historyCard = document.getElementById('historyCard');
  const historyList = document.getElementById('historyList');
  if (historyCard) historyCard.style.display = 'block';
  if (historyList) {
    historyList.innerHTML = historyItems.slice(0, 8).map(h => `
      <div class="history-item">
        <span class="h-uid"><i class="ti ti-hash" style="opacity:.35;font-size:11px;margin-right:2px;"></i>${esc(h.uid)}</span>
        <span class="h-badge ${h.ok ? 'ok' : 'fail'}">${h.ok ? 'ACTIVE' : 'FAILED'}</span>
        <span class="h-time">${h.time}</span>
      </div>
    `).join('');
  }
}

function clearHistory() {
  historyItems.length = 0;
  const historyCard = document.getElementById('historyCard');
  const historyList = document.getElementById('historyList');
  if (historyCard) historyCard.style.display = 'none';
  if (historyList) historyList.innerHTML = '';
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  const uidInput = document.getElementById('uidInput');
  if (uidInput) {
    uidInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUID(); });
  }

  const createBtn = document.getElementById('createLicenseBtn');
  if (createBtn) createBtn.addEventListener('click', createLicense);

  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', verifyLicenseLogin);
    const passInput = document.getElementById('passInput');
    if (passInput) passInput.addEventListener('keydown', e => { if (e.key === 'Enter') verifyLicenseLogin(); });
  }

  if (document.getElementById('licenseList')) {
    fetchLicenses();
  }
});

async function verifyLicenseLogin() {
  const input = document.getElementById('passInput');
  const msg = document.getElementById('loginMsg');
  if (!input || !msg) return;
  if (!ensureServerHosting()) return;
  const code = (input.value || '').trim().toUpperCase();
  msg.style.color = '#fecaca';

  if (!code) {
    msg.textContent = 'Please enter a license code';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) {
      msg.textContent = data.message || 'Invalid license';
      return;
    }
    msg.style.color = '#bbf7d0';
    msg.textContent = 'License accepted — redirecting...';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
  } catch (err) {
    msg.textContent = 'Server error — try again soon';
  }
}

async function fetchLicenses() {
  try {
    const res = await fetch(`${API_BASE}/licenses`);
    if (!res.ok) {
      licenses = [];
      renderLicenseList();
      return;
    }
    licenses = await res.json();
    renderLicenseList();
  } catch (err) {
    console.warn('Could not load server license list', err);
    licenses = [];
    renderLicenseList();
  }
}

async function createLicense() {
  try {
    const res = await fetch(`${API_BASE}/create-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      console.warn('Could not create license', res.status);
      return;
    }
    const license = await res.json();
    licenses.unshift(license);
    renderLicenseList();
  } catch (err) {
    console.warn('Create license failed', err);
  }
}

function copyLicenseCode(event, code) {
  event.stopPropagation();
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = event.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'COPIED';
    setTimeout(() => { btn.textContent = original; }, 1200);
  });
}

function renderLicenseList() {
  const list = document.getElementById('licenseList');
  const details = document.getElementById('licenseDetails');
  if (!list) return;

  if (!licenses || licenses.length === 0) {
    list.innerHTML = '<div class="license-item" style="justify-content:center;cursor:auto;">No licenses yet. Run /genlicense in Discord or click CREATE LICENSE.</div>';
    if (details) details.classList.add('hidden');
    return;
  }

  list.innerHTML = licenses.map(license => `
    <div class="license-item ${license.status === 'USED' ? 'used' : ''}" onclick="showLicenseDetails('${license.code}')">
      <div>
        <div class="license-code">${license.code}</div>
        <div class="license-meta">${license.creatorTag ? `${license.creatorTag} · ${new Date(license.createdAt).toLocaleString()}` : `Created: ${new Date(license.createdAt).toLocaleString()}`}</div>
      </div>
      <div class="license-actions">
        <span class="license-status ${license.status}">${license.status}</span>
        <button class="copy-btn" onclick="copyLicenseCode(event, '${license.code}')">COPY</button>
      </div>
    </div>
  `).join('');
}

function showLicenseDetails(code) {
  const details = document.getElementById('licenseDetails');
  if (!details) return;
  const license = licenses.find(l => l.code === code);
  if (!license) {
    details.innerHTML = '<p>License not found.</p>';
    details.classList.remove('hidden');
    return;
  }

  const actionIcon = action => {
    if (action === 'generated') return '✨';
    if (action === 'used') return '✅';
    return '🔹';
  };

  const logLines = license.logs && license.logs.length
    ? license.logs.map(log => `
        <div class="log-line">
          <span class="log-icon">${actionIcon(log.action)}</span>
          <div class="log-text">
            <div class="log-main">${new Date(log.when).toLocaleString()} — ${esc(log.by)}</div>
            ${log.details ? `<div class="log-sub">${esc(log.details)}</div>` : ''}
          </div>
        </div>
      `).join('')
    : '<div class="log-line empty">No logs yet</div>';

  details.innerHTML = `
    <div class="vip-banner">VIP LOG</div>
    <div class="details-grid">
      <div><strong>License</strong><br>${license.code}</div>
      <div><strong>Status</strong><br>${license.status}</div>
      <div><strong>Creator</strong><br>${license.creatorTag || license.note}</div>
      <div><strong>Creator ID</strong><br>${license.creatorId || 'N/A'}</div>
      <div><strong>Created</strong><br>${new Date(license.createdAt).toLocaleString()}</div>
      <div><strong>Used At</strong><br>${license.usedAt ? new Date(license.usedAt).toLocaleString() : 'Not used yet'}</div>
      <div><strong>Used By</strong><br>${license.usedBy || 'No user yet'}</div>
    </div>
    <div class="log-section">
      <div class="log-title">Line-by-line activity</div>
      ${logLines}
    </div>
  `;
  details.classList.remove('hidden');
}

// ── Particle Animation ──────────────────────────────────
(function () {
  const canvas = document.getElementById('dots');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkP() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.4,
      a: Math.random() * 0.5 + 0.08
    };
  }

  function initParticles() {
    resize();
    particles = Array.from({ length: 160 }, mkP);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239,68,68,${Math.min(0.9, p.a + 0.05)})`;
      ctx.fill();
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(239,68,68,${0.12 * (1 - d / 130)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  initParticles();
  draw();
  window.addEventListener('resize', initParticles);
})();
