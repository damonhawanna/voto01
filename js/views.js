/* ============================================================
   views.js — pantallas de la aplicación.
   Cada función recibe el contexto { state, refresh, navigate,
   render, main, installPrompt } y pinta la vista actual.
   ============================================================ */

import * as store from './store.js';
import {
  esc, fmtDateTime, fmtTime, fmtNumber, fmtPct, shortHash, groupCode,
  avatarHtml, emptyState, openModal, confirmDialog, pinDialog, toast,
  copyText, downloadJSON, slug, pickFile, $, $$
} from './utils.js';
import {
  DEMO_CANDIDATES, ensureDemo, demoVote, demoTamper, demoRepair,
  demoVerify, demoSummary, demoReset
} from './demo.js';

/* ============================================================
   Utilidades compartidas
   ============================================================ */

function candidateLabel(block, candidates) {
  const data = block.data || {};
  if (data.choice === 'blank') return 'Voto en blanco';
  if (data.choice === 'null') return 'Voto nulo';
  const candidate = candidates.find((c) => c.id === data.candidateId);
  return candidate ? candidate.name : 'Candidatura no disponible';
}

function receiptFilename(prefix, institution) {
  const day = new Date().toISOString().slice(0, 10);
  return `${prefix}-${slug(institution?.acronym || institution?.name || 'institucion')}-${day}.json`;
}

async function doExportActa(institution) {
  const acta = await store.exportActa();
  downloadJSON(receiptFilename('acta', institution), acta);
  toast('Acta exportada como archivo JSON.');
}

async function doPrintActa(institution) {
  const win = window.open('', '_blank');
  const acta = await store.exportActa();

  if (!win) {
    toast('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes.', 'err');
    return;
  }

  const t = acta.results;
  const rows = [
    ...t.ranking.map((c) => `
      <tr>
        <td>${esc(c.name)}${c.list ? `<br><span class="muted">${esc(c.list)}</span>` : ''}</td>
        <td class="num">${fmtNumber(c.votes)}</td>
        <td class="num">${fmtPct(c.pct)}</td>
      </tr>`),
    `<tr><td>Voto en blanco</td><td class="num">${fmtNumber(t.blank)}</td><td class="num">${fmtPct(t.totalVotes ? (t.blank / t.totalVotes) * 100 : 0)}</td></tr>`,
    `<tr><td>Voto nulo</td><td class="num">${fmtNumber(t.nullVotes)}</td><td class="num">${fmtPct(t.totalVotes ? (t.nullVotes / t.totalVotes) * 100 : 0)}</td></tr>`
  ].join('');

  const winner = t.winner
    ? `<p class="winner">Candidatura ganadora: <strong>${esc(t.winner.name)}</strong> con ${fmtNumber(t.winner.votes)} votos (${fmtPct(t.winner.pct)}).</p>`
    : `<p class="winner">${t.totalVotes ? 'Sin ganador por empate o falta de mayoría.' : 'Aún no se registran votos.'}</p>`;

  win.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Acta electoral · ${esc(acta.institution.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 32px auto; max-width: 780px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; text-align: center; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #333; padding-bottom: 4px; }
  .head { text-align: center; border-bottom: 3px double #111; padding-bottom: 14px; margin-bottom: 18px; }
  .muted { color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #444; padding: 7px 9px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .winner { background: #f4f4f4; border-left: 4px solid #111; padding: 8px 12px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; font-size: 12px; }
  .grid span:nth-child(odd) { color: #555; }
  code { font-family: ui-monospace, monospace; font-size: 10px; word-break: break-all; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 56px; text-align: center; font-size: 12px; }
  .sign div { border-top: 1px solid #111; padding-top: 6px; }
  @media print { body { margin: 12mm; } }
</style></head>
<body>
  <div class="head">
    <div class="muted">${esc(acta.institution.place || '')}</div>
    <h1>Acta de escrutinio</h1>
    <div><strong>${esc(acta.institution.name)}</strong></div>
    <div>${esc(acta.institution.processName)} · ${esc(acta.institution.year)}</div>
    <div class="muted">Código modular: ${esc(acta.institution.code || '—')} · Generada el ${fmtDateTime(acta.generatedAt)}</div>
  </div>

  <h2>Participación</h2>
  <div class="grid">
    <span>Electores en el padrón</span><span>${fmtNumber(t.electorate)}</span>
    <span>Votos emitidos</span><span>${fmtNumber(t.totalVotes)}</span>
    <span>Participación</span><span>${fmtPct(t.participation)}</span>
    <span>Votos en blanco / nulos</span><span>${fmtNumber(t.blank)} / ${fmtNumber(t.nullVotes)}</span>
    <span>Estado de la jornada</span><span>${acta.election?.status === 'closed' ? 'Cerrada' : 'Abierta'}</span>
    <span>Integridad de la cadena</span><span>${acta.ledger.ok ? 'Verificada' : 'CON OBSERVACIONES'}</span>
  </div>

  <h2>Resultados</h2>
  ${winner}
  <table>
    <thead><tr><th>Organización / candidatura</th><th class="num">Votos</th><th class="num">%</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <h2>Registro verificable (blockchain)</h2>
  <div class="grid">
    <span>Bloques encadenados</span><span>${fmtNumber(acta.ledger.length)}</span>
    <span>Último bloque</span><span>#${acta.ledger.head ? acta.ledger.head.index : '—'}</span>
    <span>Hash de cabecera</span><span><code>${esc(acta.ledger.head ? acta.ledger.head.hash : '—')}</code></span>
    <span>Verificación</span><span>${fmtDateTime(acta.ledger.verifiedAt)}</span>
  </div>
  <p class="muted">Cada voto fue sellado con SHA-256 y enlazado al bloque anterior. Cualquier alteración posterior invalida la cadena completa. El detalle de los bloques se entrega junto a esta acta en formato JSON.</p>

  <div class="sign">
    <div>Presidente de la mesa</div>
    <div>Secretario/a</div>
    <div>Coordinador/a TIC</div>
  </div>

  <p class="muted" style="margin-top:36px;text-align:center">Documento generado por Voto Seguro · ${esc(acta.institution.adminName || '')}</p>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
</body></html>`);
  win.document.close();
  win.focus();
}

async function toggleJourney(ctx, closing) {
  const pin = await pinDialog({
    title: closing ? 'Cerrar la jornada electoral' : 'Reabrir la jornada electoral',
    message: closing
      ? 'Al cerrar la jornada ya no se podrán emitir votos. Se añadirá un bloque de cierre a la cadena.'
      : 'Al reabrir la jornada se podrán emitir votos nuevamente. Se añadirá un bloque de reapertura.',
    confirmText: closing ? 'Cerrar jornada' : 'Reabrir jornada'
  });
  if (!pin) return;
  if (!(await store.verifyAdmin(pin))) {
    toast('PIN incorrecto. No se realizaron cambios.', 'err');
    return;
  }
  try {
    if (closing) await store.closeElection();
    else await store.reopenElection();
    await ctx.refresh();
    ctx.state.resultsUnlocked = false;
    ctx.render();
    toast(closing ? 'Jornada cerrada correctamente.' : 'Jornada reabierta.', 'ok');
  } catch (error) {
    toast(error.message, 'err');
  }
}

/* ============================================================
   Panel
   ============================================================ */

export async function renderPanel(ctx) {
  const { state } = ctx;
  const [t, ledger, audit] = await Promise.all([
    store.tally(), store.verifyLedger(), store.listAudit(6)
  ]);
  const isOpen = state.election?.status === 'open';
  const ready = state.candidates.length > 0 && state.voters.length > 0;

  ctx.main.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">${esc(state.inst?.processName || 'Proceso electoral')} · ${esc(state.inst?.year || '')}</p>
        <h1>Panel de la jornada</h1>
        <p class="muted">${esc(state.inst?.name || '')}${state.inst?.place ? ` · ${esc(state.inst.place)}` : ''}</p>
      </div>
      <div class="page-head-actions">
        <span class="badge ${isOpen ? 'badge-ok' : 'badge-warn'}">${isOpen ? '● Jornada abierta' : '● Jornada cerrada'}</span>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <div class="stat-label">Padrón electoral</div>
        <div class="stat-value">${fmtNumber(t.electorate)}</div>
        <div class="stat-sub">${fmtNumber(t.voted)} ya votaron</div>
      </div>
      <div class="stat">
        <div class="stat-label">Votos emitidos</div>
        <div class="stat-value">${fmtNumber(t.totalVotes)}</div>
        <div class="stat-sub">${fmtPct(t.participation)} de participación</div>
      </div>
      <div class="stat">
        <div class="stat-label">Candidaturas</div>
        <div class="stat-value">${fmtNumber(state.candidates.length)}</div>
        <div class="stat-sub">${fmtNumber(t.blank)} blancos · ${fmtNumber(t.nullVotes)} nulos</div>
      </div>
      <div class="stat">
        <div class="stat-label">Integridad</div>
        <div class="stat-value" style="font-size:1.45rem;color:${ledger.ok ? 'var(--ok)' : 'var(--danger)'}">${ledger.ok ? 'Verificada' : 'Revisar'}</div>
        <div class="stat-sub">${fmtNumber(ledger.length)} bloques en la cadena</div>
      </div>
    </div>

    ${!ready ? `
      <div class="alert alert-warn">
        <span aria-hidden="true">⚠️</span>
        <div>
          <strong>Falta preparar la elección.</strong>
          ${state.candidates.length === 0 ? ' No hay candidaturas registradas.' : ''}
          ${state.voters.length === 0 ? ' El padrón electoral está vacío.' : ''}
          <div style="margin-top:.5rem"><button class="btn btn-sm btn-soft" data-go="configurar">Ir a Configurar</button></div>
        </div>
      </div>` : ''}

    <div class="grid two">
      <section class="card">
        <div class="card-head"><h2>Acciones rápidas</h2></div>
        <div class="actions-stack">
          <button class="btn btn-primary" data-go="votar" ${!isOpen || !ready ? 'disabled' : ''}>🗳️ Ir a la mesa de votación</button>
          <button class="btn btn-ghost" data-go="resultados">📊 Ver resultados</button>
          <button class="btn btn-ghost" data-go="blockchain">⛓️ Verificar blockchain</button>
          <button class="btn btn-ghost" data-export-acta>📄 Exportar acta (JSON)</button>
          <button class="btn btn-ghost" data-print-acta>🖨️ Imprimir acta</button>
          <button class="btn ${isOpen ? 'btn-soft' : 'btn-ok'}" data-journey>${isOpen ? '🔒 Cerrar la jornada' : '🔓 Reabrir la jornada'}</button>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Estado de la cadena</h2><span class="badge ${ledger.ok ? 'badge-ok' : 'badge-danger'}">${ledger.ok ? 'Íntegra' : 'Alterada'}</span></div>
        <div class="integrity ${ledger.ok ? 'ok' : 'bad'}">
          <span class="dot" aria-hidden="true"></span>
          ${ledger.ok ? 'Todos los bloques coinciden con su hash y están enlazados.' : `Se detectaron ${ledger.errors.length} problema(s) de integridad.`}
        </div>
        <dl class="block-kv" style="margin-top:.9rem">
          <dt>Bloques</dt><dd>${fmtNumber(ledger.length)}</dd>
          <dt>Cabecera</dt><dd>#${ledger.head ? ledger.head.index : '—'} · ${esc(shortHash(ledger.head?.hash, 18))}</dd>
          <dt>Verificado</dt><dd>${esc(fmtDateTime(ledger.verifiedAt))}</dd>
        </dl>
        <div class="btn-row" style="margin-top:.9rem">
          <button class="btn btn-ghost btn-sm" data-go="blockchain">Abrir explorador</button>
          <button class="btn btn-ghost btn-sm" data-export-chain>Exportar cadena</button>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>Actividad reciente</h2><span class="badge">${fmtNumber(audit.length)} eventos</span></div>
      ${audit.length ? `<div class="list">${audit.map((a) => `
        <div class="list-row">
          <span class="meta" style="flex:none;min-width:86px">${esc(fmtTime(a.ts))}</span>
          <div class="grow"><span class="name" style="font-size:.86rem">${esc(a.detail || a.action)}</span>
          <span class="meta">${esc(a.action)} · ${esc(fmtDateTime(a.ts))}</span></div>
        </div>`).join('')}</div>` : emptyState('Sin actividad todavía', 'La bitácora registrará cada acción importante.', '📝')}
    </section>
  `;

  ctx.main.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.navigate(btn.dataset.go));
  });
  $('[data-journey]', ctx.main)?.addEventListener('click', () => toggleJourney(ctx, isOpen));
  $('[data-export-acta]', ctx.main)?.addEventListener('click', () => doExportActa(state.inst).catch((e) => toast(e.message, 'err')));
  $('[data-print-acta]', ctx.main)?.addEventListener('click', () => doPrintActa(state.inst).catch((e) => toast(e.message, 'err')));
  $('[data-export-chain]', ctx.main)?.addEventListener('click', () => {
    downloadJSON(receiptFilename('cadena', state.inst), {
      institution: state.inst, election: state.election, exportedAt: new Date().toISOString(), blocks: state.blocks
    });
    toast('Cadena exportada.');
  });
}

/* ============================================================
   Votar
   ============================================================ */

export async function renderVotar(ctx) {
  const { state } = ctx;
  if (!state.election || state.election.status !== 'open') {
    ctx.main.innerHTML = `
      <div class="page-head"><div><p class="eyebrow">Mesa de votación</p><h1>Jornada cerrada</h1></div></div>
      <div class="card">
        ${emptyState('La jornada electoral está cerrada', 'No se pueden emitir más votos. Puedes consultar los resultados o reabrir la jornada desde el panel.', '🔒')}
        <div class="btn-row" style="justify-content:center">
          <button class="btn btn-primary" data-go="resultados">Ver resultados</button>
          <button class="btn btn-ghost" data-go="panel">Volver al panel</button>
        </div>
      </div>`;
    ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.navigate(b.dataset.go)));
    return;
  }

  if (!state.candidates.length) {
    ctx.main.innerHTML = `
      <div class="page-head"><div><p class="eyebrow">Mesa de votación</p><h1>Sin candidaturas</h1></div>
      <div class="page-head-actions"><button class="btn btn-primary btn-sm" data-go="configurar">Registrar candidaturas</button></div></div>
      <div class="card">${emptyState('Primero registra las candidaturas', 'La papeleta se genera con las candidaturas que agregues en Configurar.', '📋')}</div>`;
    ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.navigate(b.dataset.go)));
    return;
  }

  const voted = state.voters.filter((v) => v.hasVoted).length;

  ctx.main.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Mesa de votación</p>
        <h1>Entregar cédula y votar</h1>
        <p class="muted">Busca al elector por nombre o documento, confirma su identidad y emite el voto.</p>
      </div>
      <div class="page-head-actions">
        <span class="badge">${fmtNumber(state.voters.length)} electores</span>
        <span class="badge badge-ok">${fmtNumber(voted)} votaron</span>
      </div>
    </div>

    ${state.voters.length === 0 ? `<div class="card">${emptyState('El padrón está vacío', 'Importa la lista de electores en Configurar → Padrón electoral.', '👥')}<div class="btn-row" style="justify-content:center"><button class="btn btn-primary" data-go="configurar">Ir a Configurar</button></div></div>` : `
    <section class="card">
      <div class="search-bar">
        <input type="search" id="voter-search" placeholder="Buscar por nombre, apellido o documento…" autocomplete="off" value="${esc(state.voterQuery || '')}" aria-label="Buscar elector">
        <button class="btn btn-ghost" type="button" id="voter-clear">Limpiar</button>
      </div>
      <p class="hint" id="voter-count" style="margin-bottom:.6rem"></p>
      <div id="voter-list" class="list" aria-live="polite"></div>
    </section>`}
  `;

  ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.navigate(b.dataset.go)));
  const search = $('#voter-search', ctx.main);
  if (!search) return;

  const paint = () => {
    const query = search.value.trim().toLowerCase();
    state.voterQuery = search.value;
    const rows = state.voters.filter((v) => !query
      || v.name.toLowerCase().includes(query)
      || v.dni.toLowerCase().includes(query));
    const limited = rows.slice(0, 60);
    $('#voter-count', ctx.main).textContent = query
      ? `${rows.length} coincidencia(s). Mostrando ${limited.length}.`
      : `${state.voters.length} electores en el padrón. Mostrando los primeros ${limited.length}. Usa el buscador para encontrar a otro.`;

    $('#voter-list', ctx.main).innerHTML = limited.length ? limited.map((v) => `
      <div class="list-row">
        ${avatarHtml(v.name, v.hasVoted ? 'var(--muted)' : 'var(--primary)')}
        <div class="grow">
          <span class="name">${esc(v.name)}</span>
          <span class="meta">Doc. ${esc(v.dni)}${v.hasVoted ? ` · votó ${esc(fmtDateTime(v.votedAt))}` : ''}</span>
        </div>
        ${v.hasVoted
          ? '<span class="badge badge-ok">Ya votó</span>'
          : `<button class="btn btn-primary btn-sm" data-vote="${esc(v.dni)}">Votar</button>`}
      </div>`).join('')
      : emptyState('Sin coincidencias', 'Revisa el nombre o el documento ingresado.', '🔎');

    $$('[data-vote]', ctx.main).forEach((btn) => {
      btn.addEventListener('click', () => openBallot(ctx, btn.dataset.vote));
    });
  };

  search.addEventListener('input', paint);
  $('#voter-clear', ctx.main).addEventListener('click', () => { search.value = ''; paint(); search.focus(); });
  paint();
}

async function openBallot(ctx, dni) {
  const { state } = ctx;
  const voter = state.voters.find((v) => v.dni === dni);
  if (!voter) { toast('Elector no encontrado.', 'err'); return; }

  const confirmed = await confirmDialog({
    title: 'Entregar cédula',
    message: `¿Confirmas que <strong>${esc(voter.name)}</strong> (doc. ${esc(voter.dni)}) está presente y recibirá la cédula para votar?`,
    confirmText: 'Sí, entregar cédula',
    cancelText: 'Cancelar'
  });
  if (!confirmed) return;

  let selected = null;

  const handle = openModal({
    title: 'Papeleta única',
    body: `
      <p class="muted small" style="margin-top:-.4rem">Elector: <strong style="color:var(--text)">${esc(voter.name)}</strong> · Doc. ${esc(voter.dni)}</p>
      <div class="ballot-grid" role="group" aria-label="Opciones de voto">
        ${state.candidates.map((c) => `
          <button type="button" class="ballot-option" data-choice="${esc(c.id)}" aria-pressed="false">
            <span class="tick" aria-hidden="true">✓</span>
            ${avatarHtml(c.name, c.color, 'lg')}
            <span class="cand-name">${esc(c.name)}</span>
            <span class="cand-list">${esc(c.list || 'Candidatura')}</span>
            ${c.motto ? `<span class="cand-list" style="font-style:italic">“${esc(c.motto)}”</span>` : ''}
          </button>`).join('')}
        <button type="button" class="ballot-option special" data-choice="__blank__" aria-pressed="false">
          <span class="tick" aria-hidden="true">✓</span> Voto en blanco
        </button>
        <button type="button" class="ballot-option special" data-choice="__null__" aria-pressed="false">
          <span class="tick" aria-hidden="true">✓</span> Voto nulo
        </button>
      </div>
      <p id="ballot-hint" class="hint" style="margin-top:.7rem">Selecciona una opción para habilitar la emisión del voto.</p>
      <p id="ballot-error" class="alert alert-danger" role="alert" hidden></p>`,
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost' },
      {
        label: 'Emitir voto',
        kind: 'btn-primary',
        id: 'ballot-emit',
        close: false,
        onClick: async ({ bodyEl, actionsEl, close }) => {
          const errorBox = $('#ballot-error', bodyEl);
          errorBox.hidden = true;
          if (!selected) {
            errorBox.textContent = 'Selecciona una candidatura, voto en blanco o voto nulo.';
            errorBox.hidden = false;
            return false;
          }
          const buttons = $$('button', actionsEl);
          buttons.forEach((b) => { b.disabled = true; });
          try {
            const choice = selected === '__blank__' ? 'blank' : selected === '__null__' ? 'null' : 'candidate';
            const result = await store.castVote({
              dni: voter.dni,
              candidateId: choice === 'candidate' ? selected : null,
              choice
            });
            close();
            await ctx.refresh();
            ctx.render();
            openReceipt(ctx, result, voter, choice === 'candidate' ? state.candidates.find((c) => c.id === selected) : null, choice);
          } catch (error) {
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            buttons.forEach((b) => { b.disabled = false; });
          }
          return false;
        }
      }
    ],
    onMount: ({ bodyEl }) => {
      $$('[data-choice]', bodyEl).forEach((btn) => {
        btn.addEventListener('click', () => {
          selected = btn.dataset.choice;
          $$('[data-choice]', bodyEl).forEach((other) => other.setAttribute('aria-pressed', String(other === btn)));
          $('#ballot-hint', bodyEl).textContent = 'Opción seleccionada. Pulsa «Emitir voto» para sellar el voto en la cadena.';
        });
      });
    }
  });
  return handle;
}

function openReceipt(ctx, result, voter, candidate, choice) {
  const code = String(result.receipt || '').toUpperCase();
  const choiceText = choice === 'blank' ? 'Voto en blanco' : choice === 'null' ? 'Voto nulo' : (candidate?.name || 'Candidatura');
  openModal({
    title: 'Voto registrado',
    body: `
      <div class="receipt">
        <span class="badge badge-ok">✓ Sellado en la cadena</span>
        <div class="receipt-code">${esc(groupCode(code))}</div>
        <p class="hint" style="margin:0">Código de comprobante</p>
        <dl>
          <dt>Elector</dt><dd>${esc(voter.name)} · ${esc(voter.dni)}</dd>
          <dt>Opción</dt><dd>${esc(choiceText)}</dd>
          <dt>Bloque</dt><dd>#${fmtNumber(result.blockIndex)}</dd>
          <dt>Hash</dt><dd>${esc(result.block.hash)}</dd>
          <dt>Fecha</dt><dd>${esc(fmtDateTime(result.block.timestamp))}</dd>
        </dl>
      </div>
      <div class="alert alert-warn" style="margin-top:1rem">
        <span aria-hidden="true">⚠️</span>
        <div>Entrega este código al elector. <strong>No queda guardado en el equipo</strong>: es la única forma de verificar después por qué opción se votó.</div>
      </div>`,
    actions: [
      {
        label: 'Copiar código',
        kind: 'btn-soft',
        close: false,
        onClick: async () => {
          const ok = await copyText(code);
          toast(ok ? 'Código copiado al portapapeles.' : 'No se pudo copiar. Anótalo manualmente.', ok ? 'ok' : 'err');
          return false;
        }
      },
      { label: 'Listo', kind: 'btn-primary' }
    ]
  });
}

/* ============================================================
   Resultados
   ============================================================ */

export async function renderResultados(ctx) {
  const { state } = ctx;
  const hidden = state.settings?.hideResults && state.election?.status === 'open' && !state.resultsUnlocked;

  if (hidden) {
    ctx.main.innerHTML = `
      <div class="page-head"><div><p class="eyebrow">Escrutinio</p><h1>Resultados protegidos</h1></div></div>
      <div class="card" style="max-width:520px;margin:0 auto;text-align:center;padding:2rem">
        <div style="font-size:2.4rem" aria-hidden="true">🔒</div>
        <h2>Resultados ocultos</h2>
        <p class="muted">La institución configuró que los resultados se muestran recién al cerrar la jornada. Ingresa el PIN de administración para verlos antes.</p>
        <div class="field" style="text-align:left">
          <label for="res-pin">PIN de administración</label>
          <input id="res-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="32">
        </div>
        <p id="res-error" class="alert alert-danger" role="alert" hidden></p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn btn-primary" id="res-unlock">Ver resultados</button>
          <button class="btn btn-ghost" data-journey>🔒 Cerrar la jornada</button>
        </div>
      </div>`;

    $('#res-unlock', ctx.main).addEventListener('click', async () => {
      const pin = $('#res-pin', ctx.main).value;
      const err = $('#res-error', ctx.main);
      if (!pin) { err.textContent = 'Escribe el PIN.'; err.hidden = false; return; }
      if (await store.verifyAdmin(pin)) {
        state.resultsUnlocked = true;
        ctx.render();
      } else {
        err.textContent = 'PIN incorrecto.';
        err.hidden = false;
      }
    });
    $('#res-pin', ctx.main).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#res-unlock', ctx.main).click();
    });
    $('[data-journey]', ctx.main).addEventListener('click', () => toggleJourney(ctx, true));
    return;
  }

  const [t, ledger] = await Promise.all([store.tally(), store.verifyLedger()]);
  const isClosed = state.election?.status === 'closed';
  const ranking = t.ranking;
  const others = t.blank + t.nullVotes;

  ctx.main.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Escrutinio</p>
        <h1>Resultados</h1>
        <p class="muted">${esc(state.inst?.processName || '')} · ${esc(state.inst?.name || '')}</p>
      </div>
      <div class="page-head-actions">
        <span class="badge ${isClosed ? 'badge-warn' : 'badge-ok'}">${isClosed ? 'Jornada cerrada' : 'Jornada abierta'}</span>
        <span class="badge ${ledger.ok ? 'badge-ok' : 'badge-danger'}">${ledger.ok ? 'Cadena íntegra' : 'Cadena con problemas'}</span>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Padrón</div><div class="stat-value">${fmtNumber(t.electorate)}</div></div>
      <div class="stat"><div class="stat-label">Votos emitidos</div><div class="stat-value">${fmtNumber(t.totalVotes)}</div></div>
      <div class="stat"><div class="stat-label">Participación</div><div class="stat-value">${fmtPct(t.participation)}</div></div>
      <div class="stat"><div class="stat-label">Blancos / nulos</div><div class="stat-value">${fmtNumber(t.blank)} / ${fmtNumber(t.nullVotes)}</div></div>
    </div>

    ${t.totalVotes === 0 ? `<div class="alert alert-info"><span aria-hidden="true">ℹ️</span><div>Aún no se registran votos. Los resultados se actualizarán en tiempo real.</div></div>` : ''}

    ${t.winner ? `
      <div class="winner">
        <span class="trophy" aria-hidden="true">🏆</span>
        <div>
          <p class="eyebrow" style="margin:0">${isClosed ? 'Resultado final' : 'Va ganando'}</p>
          <strong style="font-size:1.15rem">${esc(t.winner.name)}</strong>
          <div class="muted small">${fmtNumber(t.winner.votes)} votos · ${fmtPct(t.winner.pct)} del total emitido${t.winner.list ? ` · ${esc(t.winner.list)}` : ''}</div>
        </div>
      </div>` : (t.totalVotes > 0 ? `
      <div class="alert alert-warn"><span aria-hidden="true">⚖️</span><div>Empate técnico o sin mayoría clara entre las primeras candidaturas. Revisa el detalle.</div></div>` : '')}

    <section class="card">
      <div class="card-head"><h2>Votos por candidatura</h2><span class="badge">${fmtNumber(t.totalVotes)} emitidos</span></div>
      ${ranking.length ? ranking.map((c) => `
        <div class="result-row">
          <div class="result-top">
            <span><strong>${esc(c.name)}</strong>${c.list ? ` <span class="muted small">· ${esc(c.list)}</span>` : ''}</span>
            <span class="pct">${fmtNumber(c.votes)} · ${fmtPct(c.pct)}</span>
          </div>
          <div class="progress"><span style="width:${t.totalVotes ? (c.votes / Math.max(...ranking.map((x) => x.votes), 1)) * 100 : 0}%;--c:${c.color || 'var(--primary)'}"></span></div>
        </div>`).join('') : emptyState('Sin candidaturas', 'Registra candidaturas para habilitar la papeleta.', '📋')}
      ${others > 0 ? `
        <div class="result-row" style="margin-top:1.2rem">
          <div class="result-top"><span><strong>Voto en blanco</strong></span><span class="pct">${fmtNumber(t.blank)} · ${fmtPct(t.totalVotes ? (t.blank / t.totalVotes) * 100 : 0)}</span></div>
          <div class="progress"><span style="width:${t.totalVotes ? (t.blank / Math.max(t.totalVotes, 1)) * 100 : 0}%;background:var(--muted)"></span></div>
        </div>
        <div class="result-row">
          <div class="result-top"><span><strong>Voto nulo</strong></span><span class="pct">${fmtNumber(t.nullVotes)} · ${fmtPct(t.totalVotes ? (t.nullVotes / t.totalVotes) * 100 : 0)}</span></div>
          <div class="progress"><span style="width:${t.totalVotes ? (t.nullVotes / Math.max(t.totalVotes, 1)) * 100 : 0}%;background:var(--muted)"></span></div>
        </div>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>Cierre y acta</h2></div>
      <p class="muted small">Al cerrar la jornada se sella un bloque de cierre y los resultados quedan como definitivos. Puedes exportar el acta o imprimirla firmada.</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-print-acta>🖨️ Imprimir acta</button>
        <button class="btn btn-ghost" data-export-acta>📄 Exportar acta JSON</button>
        <button class="btn btn-ghost" data-go="blockchain">⛓️ Verificar cadena</button>
        <button class="btn ${isClosed ? 'btn-ghost' : 'btn-soft'}" data-journey>${isClosed ? '🔓 Reabrir jornada' : '🔒 Cerrar jornada'}</button>
      </div>
    </section>
  `;

  ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.navigate(b.dataset.go)));
  $('[data-print-acta]', ctx.main).addEventListener('click', () => doPrintActa(state.inst).catch((e) => toast(e.message, 'err')));
  $('[data-export-acta]', ctx.main).addEventListener('click', () => doExportActa(state.inst).catch((e) => toast(e.message, 'err')));
  $('[data-journey]', ctx.main).addEventListener('click', () => toggleJourney(ctx, !isClosed));
}

/* ============================================================
   Blockchain
   ============================================================ */

function blockCard(block, candidates) {
  const data = block.data || {};
  const labels = {
    genesis: ['Acta de apertura', 'genesis'],
    vote: ['Voto sellado', 'vote'],
    close: ['Cierre de jornada', 'close'],
    reopen: ['Reapertura de jornada', 'reopen']
  };
  const [title, cls] = labels[block.type] || [block.type, ''];

  let details = '';
  if (block.type === 'genesis') {
    details = `
      <div class="block-kv"><dt>Institución</dt><dd>${esc(data.institution || '—')}</dd></div>
      <div class="block-kv"><dt>Proceso</dt><dd>${esc(data.processName || '—')} ${esc(data.year || '')}</dd></div>`;
  } else if (block.type === 'vote') {
    details = `
      <div class="block-kv"><dt>Opción</dt><dd>${esc(candidateLabel(block, candidates))}</dd></div>
      <div class="block-kv"><dt>Nullifier</dt><dd>${esc(shortHash(data.nullifier, 20))}</dd></div>
      <div class="block-kv"><dt>Comprobante</dt><dd>${esc(shortHash(data.receiptHash, 20))}</dd></div>`;
  } else {
    details = `<div class="block-kv"><dt>Jornada</dt><dd>${esc(data.electionId || '—')}</dd></div>`;
  }

  return `
    <article class="block ${cls}">
      <div class="block-head">
        <span class="block-title">#${fmtNumber(block.index)} · ${esc(title)}</span>
        <span class="block-time">${esc(fmtDateTime(block.timestamp))}</span>
      </div>
      <div class="block-body">
        <div class="block-kv"><dt>Hash</dt><dd>${esc(block.hash)}</dd></div>
        <div class="block-kv"><dt>Hash previo</dt><dd>${esc(shortHash(block.prevHash, 34))}</dd></div>
        ${details}
      </div>
    </article>`;
}

export async function renderBlockchain(ctx) {
  const { state } = ctx;
  const ledger = await store.verifyLedger();
  const blocks = [...state.blocks].reverse();

  ctx.main.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Registro verificable</p>
        <h1>Blockchain local</h1>
        <p class="muted">Cada voto se sella con SHA-256 y queda enlazado al bloque anterior. Editar un bloque rompe toda la cadena.</p>
      </div>
      <div class="page-head-actions">
        <span class="badge ${ledger.ok ? 'badge-ok' : 'badge-danger'}">${ledger.ok ? '✓ Cadena íntegra' : '✕ Alteraciones detectadas'}</span>
      </div>
    </div>

    <div class="grid two">
      <section class="card">
        <div class="card-head"><h2>Verificación</h2></div>
        <div class="integrity ${ledger.ok ? 'ok' : 'bad'}">
          <span class="dot" aria-hidden="true"></span>
          ${ledger.ok ? 'Todos los hashes coinciden y los enlaces son correctos.' : 'La verificación encontró problemas.'}
        </div>
        ${ledger.ok ? '' : `<ul class="small" style="color:var(--danger);margin:.7rem 0 0">${ledger.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`}
        <dl class="block-kv" style="margin-top:.9rem">
          <dt>Bloques</dt><dd>${fmtNumber(ledger.length)}</dd>
          <dt>Cabecera</dt><dd>${ledger.head ? `#${ledger.head.index}` : '—'}</dd>
          <dt>Hash cabecera</dt><dd>${esc(shortHash(ledger.head?.hash, 30))}</dd>
          <dt>Verificado</dt><dd>${esc(fmtDateTime(ledger.verifiedAt))}</dd>
        </dl>
        <div class="btn-row" style="margin-top:.9rem">
          <button class="btn btn-primary btn-sm" id="chain-verify">Verificar ahora</button>
          <button class="btn btn-ghost btn-sm" id="chain-copy">Copiar cabecera</button>
          <button class="btn btn-ghost btn-sm" id="chain-export">Exportar cadena</button>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Comprobar un voto</h2></div>
        <p class="muted small">Ingresa el código del comprobante entregado al elector para confirmar que su voto está en la cadena.</p>
        <div class="search-bar">
          <input type="search" id="receipt-code" placeholder="Ej. A1B2 C3D4 E5" autocomplete="off" aria-label="Código de comprobante">
          <button class="btn btn-primary" id="receipt-check">Verificar</button>
        </div>
        <div id="receipt-result"></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>Bloques</h2><span class="badge">${fmtNumber(blocks.length)} registrados</span></div>
      ${blocks.length ? blocks.map((b) => blockCard(b, state.candidates)).join('') : emptyState('La cadena está vacía', 'Aún no hay bloques registrados.', '⛓️')}
    </section>
  `;

  $('#chain-verify', ctx.main).addEventListener('click', async () => {
    const fresh = await store.verifyLedger();
    toast(fresh.ok ? `Cadena válida: ${fresh.length} bloques verificados.` : `Se detectaron ${fresh.errors.length} problema(s).`, fresh.ok ? 'ok' : 'err');
    ctx.render();
  });
  $('#chain-copy', ctx.main).addEventListener('click', async () => {
    if (!ledger.head) return toast('Sin bloques para copiar.', 'err');
    const ok = await copyText(ledger.head.hash);
    toast(ok ? 'Hash de cabecera copiado.' : 'No se pudo copiar.', ok ? 'ok' : 'err');
  });
  $('#chain-export', ctx.main).addEventListener('click', () => {
    downloadJSON(receiptFilename('cadena', state.inst), {
      institution: state.inst, election: state.election, ledger, exportedAt: new Date().toISOString(), blocks: state.blocks
    });
    toast('Cadena exportada.');
  });

  const check = async () => {
    const input = $('#receipt-code', ctx.main);
    const out = $('#receipt-result', ctx.main);
    try {
      const res = await store.verifyReceipt(input.value);
      if (!res.found) {
        out.innerHTML = `<div class="alert alert-warn"><span aria-hidden="true">🔎</span><div>No se encontró ningún voto con ese comprobante. Revisa el código (solo letras y números).</div></div>`;
        return;
      }
      const choice = res.choice === 'blank' ? 'Voto en blanco' : res.choice === 'null' ? 'Voto nulo' : (res.candidate?.name || 'Candidatura');
      out.innerHTML = `
        <div class="alert alert-ok" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;gap:.5rem;align-items:center"><span aria-hidden="true">✓</span><strong>Comprobante válido</strong></div>
          <dl class="block-kv" style="margin-top:.5rem">
            <dt>Opción</dt><dd>${esc(choice)}</dd>
            <dt>Bloque</dt><dd>#${fmtNumber(res.block.index)}</dd>
            <dt>Fecha</dt><dd>${esc(fmtDateTime(res.block.timestamp))}</dd>
            <dt>Hash</dt><dd>${esc(shortHash(res.block.hash, 40))}</dd>
          </dl>
        </div>`;
    } catch (error) {
      out.innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`;
    }
  };
  $('#receipt-check', ctx.main).addEventListener('click', check);
  $('#receipt-code', ctx.main).addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
}

/* ============================================================
   Configurar
   ============================================================ */

export async function renderConfigurar(ctx) {
  const { state } = ctx;
  const [auditLog, t] = await Promise.all([store.listAudit(30), store.tally()]);
  const voted = state.voters.filter((v) => v.hasVoted).length;
  const isOpen = state.election?.status === 'open';

  ctx.main.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Administración</p><h1>Configurar la elección</h1>
      <p class="muted">Candidaturas, padrón, datos de la institución, seguridad y respaldos.</p></div>
    </div>

    <section class="card" id="sec-candidates">
      <div class="card-head">
        <h2>Candidaturas <span class="badge">${state.candidates.length}</span></h2>
        <button class="btn btn-primary btn-sm" id="add-candidate">+ Agregar candidatura</button>
      </div>
      ${state.candidates.length ? `<div class="list">${state.candidates.map((c) => {
        const votes = t.candidates.find((x) => x.id === c.id)?.votes || 0;
        return `<div class="list-row">
          ${avatarHtml(c.name, c.color)}
          <div class="grow">
            <span class="name">${esc(c.name)}</span>
            <span class="meta">${esc(c.list || 'Sin organización')}${c.motto ? ` · “${esc(c.motto)}”` : ''} · ${fmtNumber(votes)} voto(s)</span>
          </div>
          <button class="btn btn-ghost btn-sm" data-edit="${esc(c.id)}">Editar</button>
          <button class="btn btn-danger-soft btn-sm" data-del="${esc(c.id)}" ${votes ? 'disabled title="Ya tiene votos"' : ''}>Eliminar</button>
        </div>`;
      }).join('')}</div>` : emptyState('Sin candidaturas', 'Agrega al menos dos candidaturas para habilitar la papeleta.', '📋')}
    </section>

    <section class="card" id="sec-voters">
      <div class="card-head">
        <h2>Padrón electoral <span class="badge">${fmtNumber(state.voters.length)}</span></h2>
        <span class="badge ${voted ? 'badge-ok' : ''}">${fmtNumber(voted)} votaron</span>
      </div>
      <p class="card-sub">Pega la lista con formato <code>documento, nombre completo</code>, un elector por línea. También acepta punto y coma o tabulaciones (CSV).</p>
      <div class="field">
        <label for="bulk-voters" class="sr-only">Lista de electores</label>
        <textarea id="bulk-voters" placeholder="70451234, Ana Torres Quispe&#10;70451235, Luis Ramírez Soto&#10;70451236, María Huamán Vega"></textarea>
      </div>
      <div class="btn-row" style="margin-bottom:1rem">
        <button class="btn btn-primary" id="import-voters">Importar padrón</button>
        <button class="btn btn-ghost" id="toggle-add-voter">Agregar un elector</button>
      </div>
      <div id="add-voter-box" hidden style="border:1px solid var(--border);border-radius:12px;padding:.8rem;margin-bottom:1rem">
        <div class="form-row">
          <div class="field" style="margin:0 0 .6rem"><label for="new-dni">Documento</label><input id="new-dni" type="text" maxlength="20" placeholder="70451234"></div>
          <div class="field" style="margin:0 0 .6rem"><label for="new-name">Nombre completo</label><input id="new-name" type="text" maxlength="90" placeholder="Ana Torres Quispe"></div>
        </div>
        <button class="btn btn-soft btn-sm" id="add-voter">Guardar elector</button>
      </div>
      <details class="tut">
        <summary>Ver electores del padrón (${fmtNumber(state.voters.length)})</summary>
        <div class="tut-body" style="padding-top:.4rem">
          ${state.voters.length ? `<div class="list" style="max-height:420px;overflow:auto">${state.voters.slice(0, 120).map((v) => `
            <div class="list-row">
              ${avatarHtml(v.name, v.hasVoted ? 'var(--muted)' : 'var(--primary)')}
              <div class="grow"><span class="name">${esc(v.name)}</span><span class="meta">Doc. ${esc(v.dni)}</span></div>
              ${v.hasVoted ? '<span class="badge badge-ok">Ya votó</span>' : `<button class="btn btn-danger-soft btn-sm" data-del-voter="${esc(v.dni)}">Quitar</button>`}
            </div>`).join('')}</div>
          ${state.voters.length > 120 ? `<p class="hint">Mostrando los primeros 120 de ${fmtNumber(state.voters.length)}. La lista completa está en el respaldo JSON.</p>` : ''}`
          : `<p class="hint">Todavía no hay electores.</p>`}
        </div>
      </details>
    </section>

    <section class="card" id="sec-institution">
      <div class="card-head"><h2>Datos de la institución</h2></div>
      <form id="inst-form">
        <div class="field"><label for="in-name">Nombre de la institución</label><input id="in-name" type="text" maxlength="90" value="${esc(state.inst?.name || '')}" required></div>
        <div class="form-row">
          <div class="field"><label for="in-acronym">Siglas</label><input id="in-acronym" type="text" maxlength="8" value="${esc(state.inst?.acronym || '')}"></div>
          <div class="field"><label for="in-code">Código modular</label><input id="in-code" type="text" maxlength="12" value="${esc(state.inst?.code || '')}"></div>
        </div>
        <div class="field"><label for="in-place">Región / UGEL</label><input id="in-place" type="text" maxlength="80" value="${esc(state.inst?.place || '')}"></div>
        <div class="form-row">
          <div class="field"><label for="in-process">Proceso electoral</label><input id="in-process" type="text" maxlength="70" value="${esc(state.inst?.processName || '')}"></div>
          <div class="field"><label for="in-year">Año</label><input id="in-year" type="number" min="2020" max="2100" value="${esc(state.inst?.year || '')}"></div>
        </div>
        <div class="field"><label for="in-admin">Administrador</label><input id="in-admin" type="text" maxlength="70" value="${esc(state.inst?.adminName || '')}"></div>
        <button class="btn btn-primary" type="submit">Guardar datos</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><h2>Seguridad</h2></div>
      <form id="pin-form">
        <div class="form-row">
          <div class="field"><label for="pin-current">PIN actual</label><input id="pin-current" type="password" inputmode="numeric" maxlength="32" autocomplete="current-password" required></div>
          <div class="field"><label for="pin-new">Nuevo PIN</label><input id="pin-new" type="password" inputmode="numeric" minlength="6" maxlength="32" autocomplete="new-password" required></div>
        </div>
        <div class="field"><label for="pin-new2">Repetir nuevo PIN</label><input id="pin-new2" type="password" inputmode="numeric" minlength="6" maxlength="32" autocomplete="new-password" required></div>
        <p id="pin-error" class="alert alert-danger" role="alert" hidden></p>
        <button class="btn btn-primary" type="submit">Cambiar PIN</button>
      </form>
      <p class="hint" style="margin-top:.6rem">El PIN protege el acceso a esta app y la apertura/cierre de la jornada. No se puede recuperar: si lo olvidas, deberás restaurar un respaldo.</p>
    </section>

    <section class="card" id="sec-backup">
      <div class="card-head"><h2>Jornada, respaldo y reinicio</h2><span class="badge ${isOpen ? 'badge-ok' : 'badge-warn'}">${isOpen ? 'Abierta' : 'Cerrada'}</span></div>
      <label class="check" style="margin-bottom:1rem">
        <input type="checkbox" id="setting-hide" ${state.settings?.hideResults ? 'checked' : ''}>
        <span>Ocultar los resultados hasta cerrar la jornada (se pueden ver con PIN)</span>
      </label>
      <div class="btn-row">
        <button class="btn ${isOpen ? 'btn-soft' : 'btn-ok'}" id="journey-btn">${isOpen ? '🔒 Cerrar jornada' : '🔓 Reabrir jornada'}</button>
        <button class="btn btn-ghost" id="backup-export">💾 Exportar respaldo completo</button>
        <button class="btn btn-ghost" id="backup-import">📥 Restaurar respaldo</button>
        <button class="btn btn-ghost" id="acta-export">📄 Exportar acta</button>
      </div>
      <hr class="rule">
      <h3 style="color:var(--danger)">Zona peligrosa</h3>
      <p class="muted small">Borra padrón, candidaturas y cadena para iniciar un nuevo proceso electoral. La institución y el PIN se conservan. Exporta un respaldo antes.</p>
      <button class="btn btn-danger-soft" id="reset-election">Reiniciar proceso electoral</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>Bitácora</h2><span class="badge">${auditLog.length} eventos</span></div>
      ${auditLog.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>${auditLog.map((a) => `<tr><td style="white-space:nowrap">${esc(fmtDateTime(a.ts))}</td><td>${esc(a.action)}</td><td>${esc(a.detail)}</td></tr>`).join('')}</tbody>
      </table></div>` : `<p class="hint">Sin eventos.</p>`}
    </section>
  `;

  bindConfigurar(ctx);
}

function bindConfigurar(ctx) {
  const { state } = ctx;

  // Candidaturas
  $('#add-candidate', ctx.main).addEventListener('click', () => openCandidateForm(ctx));
  $$('[data-edit]', ctx.main).forEach((btn) => {
    btn.addEventListener('click', () => {
      const candidate = state.candidates.find((c) => c.id === btn.dataset.edit);
      if (candidate) openCandidateForm(ctx, candidate);
    });
  });
  $$('[data-del]', ctx.main).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const candidate = state.candidates.find((c) => c.id === btn.dataset.del);
      if (!candidate) return;
      const ok = await confirmDialog({
        title: 'Eliminar candidatura',
        message: `¿Eliminar <strong>${esc(candidate.name)}</strong>? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await store.deleteCandidate(candidate.id);
        await ctx.refresh();
        ctx.render();
        toast('Candidatura eliminada.', 'ok');
      } catch (error) { toast(error.message, 'err'); }
    });
  });

  // Padrón
  $('#import-voters', ctx.main).addEventListener('click', async () => {
    const text = $('#bulk-voters', ctx.main).value;
    if (!text.trim()) { toast('Pega primero la lista de electores.', 'err'); return; }
    try {
      const result = await store.importVoters(text);
      await ctx.refresh();
      ctx.render();
      const extra = result.invalid.length ? ` ${result.invalid.length} línea(s) con problemas fueron ignoradas.` : '';
      toast(`${result.added} elector(es) agregados, ${result.skipped} ya existían.${extra}`, 'ok');
      if (result.invalid.length) console.warn('Líneas ignoradas:', result.invalid);
    } catch (error) { toast(error.message, 'err'); }
  });

  $('#toggle-add-voter', ctx.main).addEventListener('click', () => {
    const box = $('#add-voter-box', ctx.main);
    box.hidden = !box.hidden;
    if (!box.hidden) $('#new-dni', ctx.main).focus();
  });

  $('#add-voter', ctx.main).addEventListener('click', async () => {
    try {
      await store.addVoter($('#new-dni', ctx.main).value, $('#new-name', ctx.main).value);
      await ctx.refresh();
      ctx.render();
      toast('Elector agregado al padrón.', 'ok');
    } catch (error) { toast(error.message, 'err'); }
  });

  $$('[data-del-voter]', ctx.main).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Quitar elector',
        message: '¿Quitar este elector del padrón? Si aún no votó, puedes volver a importarlo después.',
        confirmText: 'Quitar',
        danger: true
      });
      if (!ok) return;
      try {
        await store.deleteVoter(btn.dataset.delVoter);
        await ctx.refresh();
        ctx.render();
        toast('Elector eliminado del padrón.', 'ok');
      } catch (error) { toast(error.message, 'err'); }
    });
  });

  // Institución
  $('#inst-form', ctx.main).addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await store.updateInstitution({
        name: $('#in-name', ctx.main).value,
        acronym: $('#in-acronym', ctx.main).value,
        code: $('#in-code', ctx.main).value,
        place: $('#in-place', ctx.main).value,
        processName: $('#in-process', ctx.main).value,
        year: $('#in-year', ctx.main).value,
        adminName: $('#in-admin', ctx.main).value
      });
      await ctx.refresh();
      ctx.render();
      toast('Datos de la institución guardados.', 'ok');
    } catch (error) { toast(error.message, 'err'); }
  });

  // Seguridad
  $('#pin-form', ctx.main).addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = $('#pin-error', ctx.main);
    errorBox.hidden = true;
    const current = $('#pin-current', ctx.main).value;
    const next = $('#pin-new', ctx.main).value;
    const repeat = $('#pin-new2', ctx.main).value;
    if (next.length < 6) { errorBox.textContent = 'El nuevo PIN debe tener al menos 6 caracteres.'; errorBox.hidden = false; return; }
    if (next !== repeat) { errorBox.textContent = 'Los PIN nuevos no coinciden.'; errorBox.hidden = false; return; }
    try {
      await store.changePin(current, next);
      ctx.main.querySelector('#pin-form').reset();
      toast('PIN actualizado.', 'ok');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });

  // Jornada y respaldo
  $('#setting-hide', ctx.main).addEventListener('change', async (event) => {
    await store.updateSettings({ hideResults: event.target.checked });
    await ctx.refresh();
    toast(event.target.checked ? 'Resultados ocultos hasta el cierre.' : 'Resultados visibles durante la jornada.', 'ok');
  });

  $('#journey-btn', ctx.main).addEventListener('click', () => toggleJourney(ctx, state.election?.status === 'open'));

  $('#backup-export', ctx.main).addEventListener('click', async () => {
    const backup = await store.exportBackup();
    downloadJSON(`respaldo-${slug(state.inst?.name)}-${new Date().toISOString().slice(0, 10)}.json`, backup);
    toast('Respaldo exportado. Guárdalo en un lugar seguro.');
    await store.audit('respaldo', 'Respaldo completo exportado.');
  });

  $('#backup-import', ctx.main).addEventListener('click', async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const ok = await confirmDialog({
        title: 'Restaurar respaldo',
        message: `Se reemplazarán <strong>todos</strong> los datos actuales por los del archivo${data.institution?.name ? ` de <strong>${esc(data.institution.name)}</strong>` : ''} (exportado el ${esc(data.exportedAt ? fmtDateTime(data.exportedAt) : '—')}).<br><br>Esta acción no se puede deshacer.`,
        confirmText: 'Restaurar',
        danger: true
      });
      if (!ok) return;
      await store.importBackup(data);
      await ctx.refresh();
      ctx.state.resultsUnlocked = false;
      ctx.navigate('panel');
      toast('Respaldo restaurado correctamente.', 'ok');
    } catch (error) {
      toast(`No se pudo restaurar: ${error.message}`, 'err');
    }
  });

  $('#acta-export', ctx.main).addEventListener('click', () => doExportActa(state.inst).catch((e) => toast(e.message, 'err')));

  $('#reset-election', ctx.main).addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Reiniciar proceso electoral',
      message: 'Se borrarán el padrón, las candidaturas y toda la cadena de votos. La institución y el PIN se conservan.<br><br><strong>Exporta un respaldo antes de continuar.</strong>',
      confirmText: 'Continuar',
      danger: true,
      requireText: 'REINICIAR'
    });
    if (!ok) return;
    const pin = await pinDialog({ title: 'Confirma tu PIN', message: 'Última confirmación para reiniciar el proceso electoral.', confirmText: 'Reiniciar' });
    if (!pin) return;
    if (!(await store.verifyAdmin(pin))) { toast('PIN incorrecto. No se reinició nada.', 'err'); return; }
    await store.resetElectionData();
    await ctx.refresh();
    ctx.state.resultsUnlocked = false;
    ctx.navigate('panel');
    toast('Nuevo proceso electoral iniciado.', 'ok');
  });
}

function openCandidateForm(ctx, candidate = null) {
  const isEdit = !!candidate;
  const palette = ['#1d4ed8', '#b45309', '#15803d', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f', '#c2410c'];
  const color = candidate?.color || palette[ctx.state.candidates.length % palette.length];

  const handle = openModal({
    title: isEdit ? 'Editar candidatura' : 'Nueva candidatura',
    body: `
      <div class="field">
        <label for="cand-name">Nombre o fórmula <span class="req">*</span></label>
        <input id="cand-name" type="text" maxlength="80" value="${esc(candidate?.name || '')}" placeholder="Ej. Ana Torres Quispe" autofocus>
      </div>
      <div class="field">
        <label for="cand-list">Organización / lista</label>
        <input id="cand-list" type="text" maxlength="60" value="${esc(candidate?.list || '')}" placeholder="Ej. Lista 1 · Innovación">
      </div>
      <div class="field">
        <label for="cand-motto">Lema (opcional)</label>
        <input id="cand-motto" type="text" maxlength="90" value="${esc(candidate?.motto || '')}" placeholder="Ej. Más deporte para todos">
      </div>
      <div class="form-row">
        <div class="field">
          <label for="cand-initials">Iniciales</label>
          <input id="cand-initials" type="text" maxlength="4" value="${esc(candidate?.initials || '')}" placeholder="AT">
        </div>
        <div class="field">
          <label for="cand-color">Color</label>
          <input id="cand-color" type="color" value="${esc(color)}" style="height:44px;padding:.2rem">
        </div>
      </div>
      <p id="cand-error" class="alert alert-danger" role="alert" hidden></p>`,
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost' },
      {
        label: isEdit ? 'Guardar cambios' : 'Agregar candidatura',
        kind: 'btn-primary',
        close: false,
        onClick: async ({ bodyEl, close }) => {
          const errorBox = $('#cand-error', bodyEl);
          errorBox.hidden = true;
          try {
            await store.saveCandidate({
              id: candidate?.id,
              name: $('#cand-name', bodyEl).value,
              list: $('#cand-list', bodyEl).value,
              motto: $('#cand-motto', bodyEl).value,
              initials: $('#cand-initials', bodyEl).value,
              color: $('#cand-color', bodyEl).value
            });
            close();
            await ctx.refresh();
            ctx.render();
            toast(isEdit ? 'Candidatura actualizada.' : 'Candidatura agregada.', 'ok');
          } catch (error) {
            errorBox.textContent = error.message;
            errorBox.hidden = false;
            return false;
          }
          return false;
        }
      }
    ]
  });

  requestAnimationFrame(() => {
    const input = handle.modal.querySelector('#cand-name');
    if (input) input.focus();
  });
}

/* ============================================================
   Demo
   ============================================================ */

export async function renderDemo(ctx) {
  await ensureDemo();
  const [summary, verify] = await Promise.all([demoSummary(), demoVerify()]);
  const total = summary.total;
  const maxVotes = Math.max(...DEMO_CANDIDATES.map((c) => summary.counts[c.id] || 0), 1);

  const verified = verify.ok && total > 0;
  ctx.main.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Sandbox</p><h1>Modo demostración</h1>
      <p class="muted">Practica el flujo completo y comprueba cómo la blockchain detecta alteraciones. No afecta tu elección real.</p></div>
      <div class="page-head-actions"><span class="badge badge-warn">Solo demo</span></div>
    </div>

    <div class="demo-banner">
      <span class="emoji" aria-hidden="true">🧪</span>
      <div><strong>Datos ficticios y aislados.</strong> Cada voto de esta pestaña vive solo en memoria: al recargar o reiniciar, la demo vuelve a cero.</div>
    </div>

    <div class="grid two">
      <section class="card">
        <div class="card-head"><h2>1. Emite votos</h2><span class="badge">${fmtNumber(total)} voto(s)</span></div>
        <div class="demo-controls">
          ${DEMO_CANDIDATES.map((c) => `<button class="btn btn-ghost" data-demo-vote="${c.id}" ${summary.tampered ? 'disabled' : ''} style="border-color:${c.color}"><span class="avatar" style="width:22px;height:22px;font-size:.65rem;background:${c.color}">${c.short}</span> ${esc(c.name.replace('Lista ', ''))}</button>`).join('')}
        </div>
        <div class="demo-controls">
          <button class="btn btn-ghost btn-sm" data-demo-vote="blank" ${summary.tampered ? 'disabled' : ''}>Voto en blanco</button>
          <button class="btn btn-ghost btn-sm" data-demo-vote="null" ${summary.tampered ? 'disabled' : ''}>Voto nulo</button>
          <button class="btn btn-ghost btn-sm" data-demo-reset>Reiniciar demo</button>
        </div>
        <ol class="demo-steps">
          <li class="${total ? 'done' : ''}">Emite al menos un voto de prueba.</li>
          <li class="${verified ? 'done' : ''}">Verifica la cadena: todos los hashes coinciden.</li>
          <li class="${summary.tampered ? 'done' : ''}">Altera un voto y comprueba que la verificación falla.</li>
        </ol>
        <div class="btn-row">
          <button class="btn btn-primary" data-demo-verify>Verificar cadena</button>
          <button class="btn btn-danger-soft" data-demo-tamper ${(!total || summary.tampered) ? 'disabled' : ''}>Alterar un voto</button>
          <button class="btn btn-ok" data-demo-repair ${!summary.tampered ? 'disabled' : ''}>Restaurar</button>
        </div>
        <div style="margin-top:1rem">
          <div class="integrity ${verify.ok ? 'ok' : 'bad'}">
            <span class="dot" aria-hidden="true"></span>
            ${verify.ok ? `Cadena válida · ${verify.length} bloques` : `Verificación fallida · ${verify.errors.length} problema(s)`}
          </div>
          ${verify.ok ? '' : `<ul class="small" style="color:var(--danger);margin:.6rem 0 0">${verify.errors.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>2. Mira el escrutinio</h2><span class="badge">${fmtNumber(total)} emitidos</span></div>
        ${DEMO_CANDIDATES.map((c) => `
          <div class="result-row">
            <div class="result-top"><span><strong>${esc(c.name)}</strong></span><span class="pct">${fmtNumber(summary.counts[c.id] || 0)}</span></div>
            <div class="progress"><span style="width:${((summary.counts[c.id] || 0) / maxVotes) * 100}%;--c:${c.color}"></span></div>
          </div>`).join('')}
        <div class="result-row">
          <div class="result-top"><span class="muted">Blancos · nulos</span><span class="pct">${fmtNumber(summary.counts.blank)} · ${fmtNumber(summary.counts.null)}</span></div>
        </div>
        <div class="alert alert-info" style="margin-top:.6rem"><span aria-hidden="true">💡</span><div>Así se verá el escrutinio real. En tu elección, los resultados salen de los bloques de la cadena, no de una base de datos aparte.</div></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><h2>3. Cadena de bloques de la demo</h2><span class="badge ${summary.tampered ? 'badge-danger' : 'badge-ok'}">${fmtNumber(summary.blocks.length)} bloques</span></div>
      ${summary.tampered ? `<div class="alert alert-danger"><span aria-hidden="true">⚠️</span><div>Alteraste un voto. El contenido del bloque ya no coincide con su hash, por eso la verificación falla. Pulsa <strong>Restaurar</strong> para recuperar la cadena.</div></div>` : ''}
      <div class="list">
        ${[...summary.blocks].reverse().map((b) => blockCard(b, DEMO_CANDIDATES)).join('')}
      </div>
    </section>
  `;

  $$('[data-demo-vote]', ctx.main).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await demoVote(btn.dataset.demoVote);
        ctx.render();
      } catch (error) { toast(error.message, 'err'); }
    });
  });

  $('[data-demo-verify]', ctx.main).addEventListener('click', async () => {
    const result = await demoVerify();
    toast(result.ok ? `Cadena válida: ${result.length} bloques.` : `Cadena inválida: ${result.errors.length} problema(s).`, result.ok ? 'ok' : 'err');
    ctx.render();
  });
  $('[data-demo-tamper]', ctx.main).addEventListener('click', async () => {
    const changed = await demoTamper();
    if (!changed) { toast('Emite al menos un voto antes de alterar la demo.', 'err'); return; }
    toast('Voto alterado. Ahora verifica la cadena.', 'err');
    ctx.render();
  });
  $('[data-demo-repair]', ctx.main).addEventListener('click', () => {
    if (demoRepair()) toast('Cadena restaurada.', 'ok');
    ctx.render();
  });
  $('[data-demo-reset]', ctx.main).addEventListener('click', () => {
    demoReset();
    ctx.render();
  });
}

/* ============================================================
   Tutorial
   ============================================================ */

const CHECKLIST = [
  ['c1', 'Registrar la institución y el PIN de administración'],
  ['c2', 'Agregar todas las candidaturas con sus listas'],
  ['c3', 'Importar y revisar el padrón electoral'],
  ['c4', 'Probar el flujo completo en la pestaña Demo'],
  ['c5', 'Instalar la app en el equipo o teléfono que se usará'],
  ['c6', 'Cargar la app una vez con internet y verificar que funcione en modo avión'],
  ['c7', 'Exportar un respaldo antes de la jornada'],
  ['c8', 'Designar a las personas de mesa y explicar el comprobante de voto']
];

export function renderTutorial(ctx) {
  let checked = {};
  try { checked = JSON.parse(localStorage.getItem('voto01.checklist') || '{}') || {}; } catch { checked = {}; }
  const canInstall = !!ctx.installPrompt;

  ctx.main.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Guía rápida</p><h1>Tutorial</h1>
      <p class="muted">Todo lo necesario para preparar, ejecutar y cerrar una elección escolar con Voto Seguro.</p></div>
      <div class="page-head-actions">
        ${canInstall ? '<button class="btn btn-primary btn-sm" id="install-app">📲 Instalar app</button>' : ''}
        <button class="btn btn-ghost btn-sm" data-go="demo">Ir a la demo</button>
      </div>
    </div>

    <section class="card">
      <div class="card-head"><h2>Antes de empezar</h2><span class="badge">${fmtNumber(Object.values(checked).filter(Boolean).length)} / ${CHECKLIST.length}</span></div>
      <p class="muted small">Marca cada tarea cuando la completes. El avance se guarda en este dispositivo.</p>
      <ul class="check-list">
        ${CHECKLIST.map(([id, label]) => `<li><label><input type="checkbox" data-check="${id}" ${checked[id] ? 'checked' : ''}> <span>${esc(label)}</span></label></li>`).join('')}
      </ul>
    </section>

    <div class="tutorial-list">
      <details class="tut" open>
        <summary>📲 Instalar en laptop, PC o teléfono</summary>
        <div class="tut-body">
          <p>Voto Seguro es una <strong>PWA</strong>: se instala como una app normal y luego abre sin internet.</p>
          <ol>
            <li><strong>Android (Chrome):</strong> abre la dirección de la app → menú ⋮ → «Instalar aplicación» o «Agregar a pantalla principal».</li>
            <li><strong>iPhone / iPad (Safari):</strong> abre la dirección → botón Compartir → «Añadir a pantalla de inicio».</li>
            <li><strong>Windows / Chrome o Edge:</strong> icono de instalar en la barra de direcciones → «Instalar».</li>
            <li><strong>Sin tienda de apps:</strong> también puedes abrir el archivo <code>index.html</code> directamente, aunque la instalación y el modo offline completo requieren servirla por <code>http</code>/<code>https</code>.</li>
          </ol>
          <p><strong>Importante:</strong> carga la app una vez con internet (o desde el servidor local) para que el <em>service worker</em> guarde los archivos. Después funcionará en modo avión.</p>
        </div>
      </details>

      <details class="tut">
        <summary>🔐 1. Registrar la institución y el PIN</summary>
        <div class="tut-body">
          <p>La primera vez, la app pide los datos del colegio y crea un <strong>PIN de administración</strong>. Ese PIN:</p>
          <ul>
            <li>protege la app al abrirla y al volver de una pausa;</li>
            <li>autoriza cerrar o reabrir la jornada, ver resultados ocultos y reiniciar el proceso;</li>
            <li><strong>no se puede recuperar</strong>. Anótalo en un lugar seguro.</li>
          </ul>
          <p>El PIN se guarda cifrado con PBKDF2-SHA256; nunca se almacena en texto plano.</p>
        </div>
      </details>

      <details class="tut">
        <summary>👥 2. Preparar candidaturas y padrón</summary>
        <div class="tut-body">
          <ol>
            <li>En <strong>Configurar → Candidaturas</strong>, agrega cada lista con nombre, organización, lema y color.</li>
            <li>En <strong>Configurar → Padrón electoral</strong>, pega la lista con el formato <code>documento, nombre completo</code>, una persona por línea.</li>
            <li>Revisa el total. Cada documento debe ser único. Puedes corregir quitando electores que aún no hayan votado.</li>
            <li>Si tienes el padrón en Excel, copia dos columnas (documento y nombre) y pégalas directamente: las tabulaciones también se aceptan.</li>
          </ol>
        </div>
      </details>

      <details class="tut">
        <summary>🧪 3. Practicar con la demo</summary>
        <div class="tut-body">
          <p>La pestaña <strong>Demo</strong> es un laboratorio aislado. Permite emitir votos ficticios, ver el escrutinio y comprobar la blockchain.</p>
          <ul>
            <li>Emite varios votos y pulsa <strong>Verificar cadena</strong>.</li>
            <li>Pulsa <strong>Alterar un voto</strong>: la verificación fallará porque el hash ya no coincide.</li>
            <li>Pulsa <strong>Restaurar</strong> para recuperar la cadena original.</li>
          </ul>
          <p>Nada de lo que hagas en la demo afecta tu elección real.</p>
        </div>
      </details>

      <details class="tut">
        <summary>🗳️ 4. Día de la jornada</summary>
        <div class="tut-body">
          <ol>
            <li>Abre la app e ingresa el PIN.</li>
            <li>Pulsa <strong>Votar</strong> y busca al elector por nombre o documento.</li>
            <li>Confirma que la persona está presente y pulsa <strong>Votar</strong>.</li>
            <li>Entrega la papeleta en pantalla (o el dispositivo) para que elija en privado.</li>
            <li>Al emitir, la app muestra un <strong>código de comprobante</strong>. Anótalo o cópialo y entrégalo al elector.</li>
            <li>El elector queda marcado como «Ya votó» y no puede votar dos veces.</li>
          </ol>
          <p>Si usas un solo equipo, el voto es asistido: respeta el secreto del voto y evita mirar la pantalla durante la selección.</p>
        </div>
      </details>

      <details class="tut">
        <summary>⛓️ 5. Cómo funciona la blockchain local</summary>
        <div class="tut-body">
          <p>Cada voto se convierte en un <strong>bloque</strong> con estos datos: índice, fecha, hash del bloque anterior, tipo y contenido. El hash se calcula con <strong>SHA-256</strong> sobre todo el bloque.</p>
          <ul>
            <li>Si alguien cambia un voto, su hash cambia y deja de coincidir con el enlace del siguiente bloque.</li>
            <li>La app verifica toda la cadena en cada consulta y avisa si algo fue alterado.</li>
            <li>El voto se enlaza mediante un código ciego (nullifier) que no permite identificar al elector en el registro.</li>
            <li>No necesita internet ni servidores: la cadena vive en este dispositivo y se puede exportar para auditoría.</li>
          </ul>
          <p>En la pestaña <strong>Blockchain</strong> puedes ver todos los bloques, verificar la cadena, exportarla y comprobar el comprobante de un elector.</p>
        </div>
      </details>

      <details class="tut">
        <summary>🧾 6. Comprobante del elector</summary>
        <div class="tut-body">
          <p>Al emitir el voto se muestra un código como <code>A1B2 C3D4 E5</code>. Ese código es la única prueba que vincula al elector con su voto.</p>
          <ul>
            <li>La app guarda solo un <strong>hash</strong> del comprobante, no el código, para que no se pueda relacionar al elector con su opción desde el registro.</li>
            <li>El elector puede pedir en <strong>Blockchain → Comprobar un voto</strong> que se verifique su código.</li>
            <li>Si pierde el código, no es posible recuperarlo.</li>
          </ul>
        </div>
      </details>

      <details class="tut">
        <summary>🏁 7. Cierre, acta y respaldo</summary>
        <div class="tut-body">
          <ol>
            <li>Al terminar, pulsa <strong>Cerrar la jornada</strong> en el Panel o en Resultados. Se sella un bloque de cierre y ya no se admiten votos.</li>
            <li>Revisa los resultados y pulsa <strong>Imprimir acta</strong>. El acta incluye participación, resultados, número de bloques y hash de cabecera.</li>
            <li>Exporta el <strong>acta JSON</strong> y el <strong>respaldo completo</strong> a una USB o correo institucional.</li>
            <li>Guarda una copia del respaldo: contiene el padrón y permite auditar o restaurar la elección en otro equipo.</li>
          </ol>
          <p><strong>Consejo:</strong> exporta el respaldo <em>antes</em> de cerrar y otra vez después del cierre. Así conservas evidencia de ambos estados.</p>
        </div>
      </details>

      <details class="tut">
        <summary>🛡️ 8. Seguridad y privacidad</summary>
        <div class="tut-body">
          <ul>
            <li>Los datos <strong>no salen del dispositivo</strong>: no hay servidor ni nube.</li>
            <li>Usa un PIN difícil y no lo compartas con los electores.</li>
            <li>El respaldo contiene datos personales del padrón: guárdalo con cuidado y bórralo cuando ya no lo necesites.</li>
            <li>La app evita enlazar elector y voto en la cadena, pero al ejecutarse en un solo equipo la confianza final recae en quienes administran la mesa. Para elecciones de mayor escala, usa varios equipos y auditoría externa.</li>
            <li>Cierra sesión con el botón <strong>Bloquear</strong> cuando te alejes del equipo.</li>
          </ul>
        </div>
      </details>

      <details class="tut">
        <summary>❓ Preguntas frecuentes</summary>
        <div class="tut-body">
          <p><strong>¿Funciona sin internet?</strong> Sí. Cárgala una vez y luego funciona offline. Las actualizaciones se descargan cuando vuelvas a tener conexión.</p>
          <p><strong>¿Puedo usarla en varios dispositivos?</strong> Cada dispositivo tiene su propia elección. Puedes mover los datos exportando el respaldo y restaurándolo en otro equipo.</p>
          <p><strong>¿Qué pasa si se apaga la computadora?</strong> Los votos ya emitidos están en IndexedDB y sobreviven al reinicio. Vuelve a abrir la app y continúa.</p>
          <p><strong>¿Puedo borrar un voto?</strong> No. La cadena es de solo agregado; para corregir un error grave debes reiniciar el proceso y volver a empezar.</p>
          <p><strong>¿La blockchain es una red distribuida?</strong> Esta versión usa una cadena de hashes local, verificable y exportable. No es una red con nodos ni consenso distribuido.</p>
        </div>
      </details>
    </div>
  `;

  $$('[data-check]', ctx.main).forEach((input) => {
    input.addEventListener('change', () => {
      const current = { ...checked, [input.dataset.check]: input.checked };
      checked = current;
      try { localStorage.setItem('voto01.checklist', JSON.stringify(current)); } catch { /* almacenamiento lleno */ }
      const count = Object.values(current).filter(Boolean).length;
      const badge = ctx.main.querySelector('.card-head .badge');
      if (badge) badge.textContent = `${count} / ${CHECKLIST.length}`;
    });
  });

  $$('[data-go]', ctx.main).forEach((b) => b.addEventListener('click', () => ctx.navigate(b.dataset.go)));

  $('#install-app', ctx.main)?.addEventListener('click', async () => {
    if (!ctx.installPrompt) return;
    ctx.installPrompt.prompt();
    const choice = await ctx.installPrompt.userChoice;
    toast(choice.outcome === 'accepted' ? 'Instalación aceptada.' : 'Puedes instalarla luego desde el menú del navegador.', choice.outcome === 'accepted' ? 'ok' : '');
    ctx.installPrompt = null;
    ctx.render();
  });
}
