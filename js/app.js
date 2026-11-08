/* ============================================================
   app.js — arranque, autenticación, navegación y ciclo de vida.
   ============================================================ */

import * as store from './store.js';
import { $, $$, esc, toast } from './utils.js';
import { renderPanel, renderVotar, renderResultados, renderBlockchain, renderConfigurar, renderDemo, renderTutorial } from './views.js';

const SESSION_KEY = 'voto01.session';
const THEME_KEY = 'voto01.theme';

const VIEWS = {
  panel: renderPanel,
  votar: renderVotar,
  resultados: renderResultados,
  blockchain: renderBlockchain,
  configurar: renderConfigurar,
  demo: renderDemo,
  tutorial: renderTutorial
};
const GUEST_VIEWS = new Set(['demo', 'tutorial']);

const state = {
  inst: null,
  election: null,
  settings: null,
  candidates: [],
  voters: [],
  blocks: [],
  view: 'panel',
  voterQuery: '',
  resultsUnlocked: false,
  guest: false
};

let installPrompt = null;
let failedAttempts = 0;
let lockUntil = 0;

const ctx = {
  state,
  refresh,
  navigate,
  render,
  installPrompt: null,
  main: null
};

/* ---------------- Datos ---------------- */

async function refresh() {
  if (state.guest) { updateBrand(); return; }
  const [inst, election, settings, candidates, voters, blocks] = await Promise.all([
    store.getInstitution(),
    store.getElection(),
    store.getSettings(),
    store.listCandidates(),
    store.listVoters(),
    store.listBlocks()
  ]);
  Object.assign(state, { inst, election, settings, candidates, voters, blocks });
  updateBrand();
}

function updateBrand() {
  const name = state.guest ? 'Voto Seguro · Demo' : (state.inst?.name || 'Institución educativa');
  const process = state.guest
    ? 'Exploración sin datos reales'
    : [state.inst?.processName, state.inst?.year].filter(Boolean).join(' · ') || 'Proceso electoral';
  $('#brand-name').textContent = name;
  $('#brand-process').textContent = process;
  const lock = $('#btn-lock');
  if (lock) {
    lock.innerHTML = state.guest
      ? '<span aria-hidden="true">↩</span> <span class="lock-label">Salir</span>'
      : '<span aria-hidden="true">🔒</span> <span class="lock-label">Bloquear</span>';
    lock.title = state.guest ? 'Salir del modo demostración' : 'Cerrar sesión';
  }
  document.title = state.guest ? 'Demo · Voto Seguro' : `${name} · Voto Seguro`;
}

/* ---------------- Navegación ---------------- */

function updateTabs() {
  $$('#tabs button').forEach((btn) => {
    const allowed = !state.guest || GUEST_VIEWS.has(btn.dataset.view);
    btn.hidden = !allowed;
    const active = btn.dataset.view === state.view;
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function navigate(view) {
  if (!VIEWS[view]) view = 'panel';
  if (state.guest && !GUEST_VIEWS.has(view)) view = 'demo';
  state.view = view;
  const hash = `#${view}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  updateTabs();
  render();
  window.scrollTo(0, 0);
}

function render() {
  ctx.main = $('#view');
  if (!ctx.main) return;
  Promise.resolve(VIEWS[state.view](ctx)).catch((error) => {
    console.error(error);
    ctx.main.innerHTML = `
      <div class="alert alert-danger" style="margin-top:1rem">
        <span aria-hidden="true">⚠️</span>
        <div><strong>Ocurrió un error al mostrar esta sección.</strong><br>${esc(error.message)}
        <div style="margin-top:.6rem"><button class="btn btn-sm btn-ghost" data-go="panel">Volver al panel</button></div></div>
      </div>`;
    ctx.main.querySelector('[data-go]')?.addEventListener('click', () => navigate('panel'));
  });
}

/* ---------------- Pantallas ---------------- */

function showScreen(name) {
  $('#boot')?.setAttribute('hidden', '');
  const targetId = name === 'app' ? 'app' : `screen-${name}`;
  for (const id of ['screen-setup', 'screen-login', 'app']) {
    const node = document.getElementById(id);
    if (node) node.hidden = id !== targetId;
  }
  if (name === 'app') {
    document.body.classList.add('in-app');
  }
}

function fillLogin(institution) {
  const acronym = institution?.acronym?.trim() || '';
  const logo = acronym
    ? `<div class="login-logo">${esc(acronym.slice(0, 5))}</div>`
    : '<div class="login-logo"><img src="assets/logo.svg" alt=""></div>';
  $('#login-brand').innerHTML = `
    ${logo}
    <strong>${esc(institution?.name || 'Voto Seguro')}</strong>
    <span>${esc([institution?.processName, institution?.year].filter(Boolean).join(' · '))}</span>`;
  $('#login-sub').textContent = `Ingresa el PIN de administración de ${institution?.name || 'la institución'} para continuar.`;
  $('#li-pin').value = '';
  $('#login-error').hidden = true;
}

function enterApp({ guest = false, initial = null } = {}) {
  state.guest = guest;
  state.resultsUnlocked = false;
  showScreen('app');
  updateBrand();
  updateTabs();
  updateNetBadge();

  const fromHash = location.hash.replace('#', '');
  let view = initial || (VIEWS[fromHash] ? fromHash : (guest ? 'demo' : 'panel'));
  if (guest && !GUEST_VIEWS.has(view)) view = 'demo';
  state.view = view;
  updateTabs();
  render();
}

/* ---------------- Autenticación ---------------- */

async function handleSetup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = $('#setup-error');
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());

  const fail = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    submit.disabled = false;
    submit.textContent = 'Crear institución y entrar';
  };

  errorBox.hidden = true;
  const name = String(data.name || '').trim();
  const pin = String(data.pin || '');
  const pin2 = String(data.pin2 || '');
  const year = Number(data.year);

  if (name.length < 3) return fail('Escribe el nombre completo de la institución.');
  if (!Number.isFinite(year) || year < 2020 || year > 2100) return fail('Indica un año electoral válido.');
  if (pin.length < 6) return fail('El PIN debe tener al menos 6 caracteres.');
  if (pin !== pin2) return fail('Los dos PIN no coinciden.');

  submit.disabled = true;
  submit.textContent = 'Creando institución…';

  try {
    await store.createInstitution({
      name,
      acronym: data.acronym,
      code: data.code,
      place: data.place,
      adminName: data.adminName,
      processName: String(data.processName || 'Municipio Escolar').trim(),
      year,
      pin,
      hideResults: form.querySelector('#su-hide').checked
    });
    sessionStorage.setItem(SESSION_KEY, '1');
    await refresh();
    enterApp({ initial: 'panel' });
    toast('Institución registrada. ¡Todo listo para configurar la elección!', 'ok');
  } catch (error) {
    console.error(error);
    fail(error.message || 'No se pudo crear la institución.');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const errorBox = $('#login-error');
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  const pin = $('#li-pin').value;
  errorBox.hidden = true;

  if (Date.now() < lockUntil) {
    errorBox.textContent = `Demasiados intentos. Espera ${Math.ceil((lockUntil - Date.now()) / 1000)} segundos.`;
    errorBox.hidden = false;
    return;
  }
  if (!pin || pin.length < 6) {
    errorBox.textContent = 'Escribe tu PIN completo.';
    errorBox.hidden = false;
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Verificando…';
  try {
    const ok = await store.verifyAdmin(pin);
    if (!ok) {
      failedAttempts += 1;
      store.audit('seguridad', 'Intento de acceso fallido.').catch(() => {});
      if (failedAttempts >= 5) {
        lockUntil = Date.now() + 30000;
        failedAttempts = 0;
        errorBox.textContent = 'Demasiados intentos fallidos. Espera 30 segundos.';
      } else {
        errorBox.textContent = `PIN incorrecto. Intento ${failedAttempts} de 5.`;
      }
      errorBox.hidden = false;
      $('#li-pin').select();
      return;
    }
    failedAttempts = 0;
    sessionStorage.setItem(SESSION_KEY, '1');
    await refresh();
    enterApp({ initial: 'panel' });
    toast('Sesión iniciada.', 'ok');
  } catch (error) {
    console.error(error);
    errorBox.textContent = error.message || 'No se pudo verificar el PIN.';
    errorBox.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Entrar';
  }
}

function startGuest() {
  state.guest = true;
  state.inst = null;
  state.election = null;
  state.settings = null;
  state.candidates = [];
  state.voters = [];
  state.blocks = [];
  location.hash = '';
  enterApp({ guest: true, initial: 'demo' });
}

function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  location.hash = '';
  location.reload();
}

/* ---------------- Tema y conexión ---------------- */

function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const btn = $('#btn-theme');
  if (btn) {
    const next = preferredTheme() === 'dark' ? 'claro' : 'oscuro';
    btn.title = `Cambiar al tema ${next}`;
    btn.setAttribute('aria-label', `Cambiar al tema ${next}`);
  }
}

function toggleTheme() {
  const next = preferredTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  document.documentElement.dataset.theme = next;
  applyTheme();
}

function updateNetBadge() {
  const badge = $('#net-badge');
  if (!badge) return;
  const online = navigator.onLine;
  badge.textContent = online ? 'Online' : 'Offline';
  badge.classList.toggle('offline', !online);
  badge.title = online
    ? 'Con conexión. La app funciona igual sin internet.'
    : 'Sin conexión. La app sigue funcionando con los datos locales.';
}

/* ---------------- Eventos globales ---------------- */

function bindGlobal() {
  document.addEventListener('click', (event) => {
    const reveal = event.target.closest('[data-reveal]');
    if (reveal) {
      const input = document.getElementById(reveal.dataset.reveal);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      reveal.textContent = show ? 'Ocultar' : 'Ver';
      reveal.setAttribute('aria-label', show ? 'Ocultar PIN' : 'Mostrar PIN');
      return;
    }
    const demoLink = event.target.closest('[data-open-demo]');
    if (demoLink) startGuest();
  });

  window.addEventListener('online', updateNetBadge);
  window.addEventListener('offline', updateNetBadge);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    ctx.installPrompt = event;
    if (state.view === 'tutorial') render();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    ctx.installPrompt = null;
    toast('App instalada en el dispositivo.', 'ok');
  });

  window.addEventListener('hashchange', () => {
    if ($('#app').hidden) return;
    const view = location.hash.replace('#', '');
    if (!VIEWS[view]) return;
    if (state.guest && !GUEST_VIEWS.has(view)) { navigate('demo'); return; }
    navigate(view);
  });

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!localStorage.getItem(THEME_KEY)) applyTheme();
    });
  }
}

function wireNav() {
  $$('#tabs button').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
  $('#btn-lock')?.addEventListener('click', lockApp);
  $('#btn-theme')?.addEventListener('click', toggleTheme);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return; // file:// no admite service worker
  navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './' })
    .catch((error) => console.warn('Service worker no registrado:', error));
}

function bootError(error) {
  console.error(error);
  const boot = $('#boot');
  if (!boot) return;
  boot.innerHTML = `
    <img src="assets/logo.svg" alt="" class="boot-logo" width="56" height="56">
    <div class="alert alert-danger" style="max-width:420px;text-align:left">
      <div><strong>No se pudo iniciar el almacenamiento local.</strong><br>${esc(error.message || String(error))}
      <br><br>Prueba con otro navegador, desactiva el modo privado o sirve la app por <code>http://localhost</code>.</div>
    </div>
    <button class="btn btn-primary" id="boot-demo" type="button">Explorar la demo sin guardar datos</button>`;
  $('#boot-demo').addEventListener('click', startGuest);
}

/* ---------------- Arranque ---------------- */

async function boot() {
  applyTheme();
  bindGlobal();
  if ($('#btn-theme')) wireNav();
  registerServiceWorker();

  const yearInput = $('#su-year');
  if (yearInput) yearInput.value = new Date().getFullYear();

  $('#form-setup')?.addEventListener('submit', handleSetup);
  $('#form-login')?.addEventListener('submit', handleLogin);

  try {
    const configured = await store.isConfigured();
    if (!configured) {
      showScreen('setup');
      $('#su-name').focus();
      return;
    }
    const institution = await store.getInstitution();
    fillLogin(institution);

    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      await refresh();
      enterApp({ initial: (location.hash.replace('#', '') || 'panel') });
    } else {
      showScreen('login');
      setTimeout(() => $('#li-pin')?.focus(), 60);
    }
  } catch (error) {
    bootError(error);
  }
}

document.addEventListener('DOMContentLoaded', boot);
