/* ============================================================
   utils.js — utilidades de interfaz (DOM, formato, modales).
   ============================================================ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const dateFmt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
const timeFmt = new Intl.DateTimeFormat('es-PE', { timeStyle: 'medium' });
const dayFmt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' });
const numFmt = new Intl.NumberFormat('es-PE');

export function fmtDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}
export function fmtTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? '—' : timeFmt.format(d);
}
export function fmtDay(date = new Date()) {
  return dayFmt.format(new Date(date));
}
export function fmtNumber(n) {
  return numFmt.format(Number(n) || 0);
}
export function fmtPct(n) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}
export function shortHash(hash, size = 12) {
  if (!hash) return '—';
  return `${hash.slice(0, size)}…`;
}
export function groupCode(code) {
  return String(code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}
export function slug(text) {
  return String(text || 'archivo').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'archivo';
}

export function debounce(fn, wait = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/* ---------------- Copiar / descargar ---------------- */

export async function copyText(text) {
  const value = String(text);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch { /* respaldo */ }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadJSON(filename, data) {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = (file) => { input.remove(); resolve(file); };
    input.addEventListener('change', () => done(input.files && input.files[0]));
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

/* ---------------- Notificaciones ---------------- */

export function toast(message, kind = '') {
  const root = $('#toast-root') || document.body;
  const node = document.createElement('div');
  node.className = `toast ${kind}`.trim();
  node.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s ease, transform .25s ease';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 260);
  }, kind === 'err' ? 5200 : 3200);
}

/* ---------------- Modales ---------------- */

function lockScroll(lock) {
  document.body.style.overflow = lock ? 'hidden' : '';
}

/**
 * Abre un modal accesible. Devuelve { modal, bodyEl, actionsEl, close }.
 * actions: [{ label, kind, id, onClick, close }]
 */
export function openModal({ title = '', body = '', actions = [], center = true, dismissible = true, onMount } = {}) {
  const previousFocus = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = `modal-backdrop${center ? ' center' : ''}`;
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <h2 id="modal-title">${esc(title)}</h2>
        <button class="modal-close" type="button" aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions"></div>
    </div>`;
  const modal = backdrop.querySelector('.modal');
  const bodyEl = backdrop.querySelector('.modal-body');
  const actionsEl = backdrop.querySelector('.modal-actions');
  const closeBtn = backdrop.querySelector('.modal-close');

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (!document.querySelector('.modal-backdrop')) lockScroll(false);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try { previousFocus.focus(); } catch { /* noop */ }
    }
  }

  function onKey(event) {
    if (event.key === 'Escape' && dismissible) { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${action.kind || 'btn-ghost'}`.trim();
    btn.textContent = action.label;
    if (action.id) btn.id = action.id;
    btn.addEventListener('click', async () => {
      if (action.onClick) {
        const outcome = await action.onClick({ modal, bodyEl, actionsEl, close });
        if (outcome === false) return;
      }
      if (action.close !== false) close();
    });
    actionsEl.appendChild(btn);
  }
  if (!actions.length) actionsEl.remove();

  closeBtn.addEventListener('click', () => { if (dismissible) close(); });
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop && dismissible) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  lockScroll(true);

  requestAnimationFrame(() => {
    const target = modal.querySelector('[autofocus]')
      || modal.querySelector('input, select, textarea, button.btn-primary, button');
    if (target) target.focus();
  });

  if (onMount) onMount({ modal, bodyEl, actionsEl, close });
  return { modal, bodyEl, actionsEl, close };
}

export function confirmDialog({ title = '¿Confirmar?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, requireText = '' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value, close) => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };

    const body = `
      <p>${message}</p>
      ${requireText ? `
        <label class="field" style="margin-top:.6rem">
          <span style="font-weight:600;font-size:.87rem">Escribe <strong>${esc(requireText)}</strong> para confirmar</span>
          <input type="text" id="confirm-text" autocomplete="off" autocapitalize="characters">
        </label>` : ''}`;

    const modal = openModal({
      title,
      body,
      actions: [
        { label: cancelText, kind: 'btn-ghost', onClick: ({ close }) => finish(false, close) },
        {
          label: confirmText,
          kind: danger ? 'btn-danger' : 'btn-primary',
          id: 'confirm-action',
          onClick: ({ close }) => {
            if (requireText) {
              const input = modal.modal.querySelector('#confirm-text');
              if (!input || input.value.trim().toUpperCase() !== requireText.toUpperCase()) {
                input.setAttribute('aria-invalid', 'true');
                input.focus();
                toast(`Escribe «${requireText}» para continuar.`, 'err');
                return false;
              }
            }
            finish(true, close);
          }
        }
      ],
      onMount: ({ modal: m }) => {
        const input = m.querySelector('#confirm-text');
        if (input) {
          input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); m.querySelector('#confirm-action').click(); }
          });
        }
      }
    });

    // Si se cierra con ESC o la X, se resuelve como cancelado.
    const observer = new MutationObserver(() => {
      if (!document.body.contains(modal.modal)) {
        observer.disconnect();
        if (!settled) { settled = true; resolve(false); }
      }
    });
    observer.observe(document.body, { childList: true });
  });
}

export function pinDialog({ title = 'Confirma tu PIN', message = '', confirmText = 'Continuar' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let pin = null;
    const modal = openModal({
      title,
      body: `
        <p class="muted small">${message || 'Se requiere el PIN de administración para continuar.'}</p>
        <div class="field">
          <label for="pin-dialog-input">PIN de administración</label>
          <input id="pin-dialog-input" type="password" inputmode="numeric" autocomplete="current-password" maxlength="32" autofocus>
          <p id="pin-dialog-error" class="alert alert-danger" hidden role="alert"></p>
        </div>`,
      actions: [
        { label: 'Cancelar', kind: 'btn-ghost', onClick: ({ close }) => { if (!settled) { settled = true; resolve(null); } close(); } },
        {
          label: confirmText,
          kind: 'btn-primary',
          onClick: ({ close }) => {
            const value = modal.modal.querySelector('#pin-dialog-input').value;
            const err = modal.modal.querySelector('#pin-dialog-error');
            if (!value || value.length < 6) {
              err.textContent = 'Escribe tu PIN completo.';
              err.hidden = false;
              return false;
            }
            settled = true;
            pin = value;
            resolve(pin);
            close();
          }
        }
      ],
      onMount: ({ modal: m }) => {
        const input = m.querySelector('#pin-dialog-input');
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); m.querySelector('.modal-actions .btn-primary').click(); }
        });
      }
    });
    const observer = new MutationObserver(() => {
      if (!document.body.contains(modal.modal)) {
        observer.disconnect();
        if (!settled) { settled = true; resolve(null); }
      }
    });
    observer.observe(document.body, { childList: true });
  });
}

/* ---------------- Formato visual ---------------- */

export function avatarHtml(name, color, size = '') {
  const initials = String(name || '?').trim().split(/\s+/).filter(Boolean)
    .map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  return `<span class="avatar ${size}" style="background:${color || 'var(--primary)'}" aria-hidden="true">${esc(initials)}</span>`;
}

export function emptyState(title, text = '', icon = '🗳️') {
  return `<div class="empty"><div style="font-size:1.8rem;margin-bottom:.3rem" aria-hidden="true">${icon}</div><strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
}
