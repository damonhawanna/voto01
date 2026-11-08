/* ============================================================
   store.js — lógica del dominio electoral.
   Orquesta IndexedDB, la cadena de bloques y la criptografía.
   ============================================================ */

import * as db from './db.js';
import { makeBlock, verifyChain, checkLedgerUniqueness, GENESIS_HASH } from './chain.js';
import { createCredential, verifyPin, sha256Hex, randomHex, randomId } from './crypto.js';

const K = {
  institution: 'institution',
  auth: 'auth',
  election: 'election',
  settings: 'settings'
};

export const APP_ID = 'voto-seguro';
export const APP_VERSION = 1;

/* ---------------- Configuración / institución ---------------- */

export const getInstitution = () => db.get('kv', K.institution);
export const getAuth = () => db.get('kv', K.auth);
export const getSettings = () => db.get('kv', K.settings);
export const getElection = () => db.get('kv', K.election);

export async function isConfigured() {
  const [inst, auth] = await Promise.all([getInstitution(), getAuth()]);
  return !!(inst && auth);
}

export async function verifyAdmin(pin) {
  const auth = await getAuth();
  return verifyPin(pin, auth);
}

function freshElection(extra = {}) {
  return {
    id: randomId(),
    salt: randomHex(16),
    status: 'open',
    createdAt: new Date().toISOString(),
    openedAt: new Date().toISOString(),
    closedAt: null,
    ...extra
  };
}

/**
 * Primer arranque: registra institución, credencial y bloque génesis.
 */
export async function createInstitution({ name, acronym, code, place, adminName, processName, year, pin, hideResults }) {
  const credential = await createCredential(pin);
  const now = new Date().toISOString();
  const institution = {
    name: name.trim(),
    acronym: (acronym || '').trim(),
    code: (code || '').trim(),
    place: (place || '').trim(),
    adminName: (adminName || '').trim(),
    processName: processName.trim(),
    year: Number(year),
    createdAt: now
  };
  const election = freshElection();
  const settings = { hideResults: !!hideResults };
  const genesis = await makeBlock(null, {
    type: 'genesis',
    timestamp: now,
    data: {
      institution: institution.name,
      processName: institution.processName,
      year: institution.year,
      electionId: election.id
    }
  });

  await db.clearAll();
  await db.put('kv', institution, K.institution);
  await db.put('kv', credential, K.auth);
  await db.put('kv', election, K.election);
  await db.put('kv', settings, K.settings);
  await db.put('blocks', genesis);

  await audit('configuracion', `Institución registrada: ${institution.name}`);
  return institution;
}

export async function updateInstitution(patch) {
  const current = await getInstitution();
  if (!current) throw new Error('No hay institución configurada.');
  const next = { ...current };
  for (const key of ['name', 'acronym', 'code', 'place', 'adminName', 'processName']) {
    if (patch[key] !== undefined) next[key] = String(patch[key]).trim();
  }
  if (patch.year !== undefined) next.year = Number(patch.year);
  await db.put('kv', next, K.institution);
  await audit('institucion', 'Datos de la institución actualizados.');
  return next;
}

export async function updateSettings(patch) {
  const current = (await getSettings()) || {};
  const next = { ...current, ...patch };
  await db.put('kv', next, K.settings);
  return next;
}

export async function changePin(currentPin, newPin) {
  const ok = await verifyAdmin(currentPin);
  if (!ok) throw new Error('El PIN actual no es correcto.');
  const credential = await createCredential(newPin);
  await db.put('kv', credential, K.auth);
  await audit('seguridad', 'PIN de administración actualizado.');
}

/* ---------------- Cadena ---------------- */

export async function listBlocks() {
  const blocks = await db.getAll('blocks');
  return blocks.sort((a, b) => a.index - b.index);
}

export async function appendBlock(type, data) {
  const blocks = await listBlocks();
  const previous = blocks.length ? blocks[blocks.length - 1] : null;
  const block = await makeBlock(previous, { type, data });
  await db.put('blocks', block);
  return block;
}

export async function verifyLedger() {
  const blocks = await listBlocks();
  const chain = await verifyChain(blocks);
  const unique = checkLedgerUniqueness(blocks);
  const errors = [...chain.errors, ...unique.errors];
  return {
    ok: errors.length === 0,
    errors,
    length: blocks.length,
    head: chain.head,
    verifiedAt: new Date().toISOString()
  };
}

/* ---------------- Candidaturas ---------------- */

export async function listCandidates() {
  const list = await db.getAll('candidates');
  return list.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'es'));
}

export async function saveCandidate(input) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre de la candidatura es obligatorio.');

  if (input.id) {
    const current = await db.get('candidates', input.id);
    if (!current) throw new Error('La candidatura no existe.');
    const next = {
      ...current,
      name,
      list: String(input.list || '').trim(),
      motto: String(input.motto || '').trim(),
      color: input.color || current.color,
      initials: (input.initials || '').trim().toUpperCase().slice(0, 4) || initialsOf(name)
    };
    await db.put('candidates', next);
    await audit('candidatura', `Candidatura actualizada: ${name}`);
    return next;
  }

  const all = await listCandidates();
  const candidate = {
    id: randomId(),
    name,
    list: String(input.list || '').trim(),
    motto: String(input.motto || '').trim(),
    color: input.color || pickColor(all.length),
    initials: (input.initials || '').trim().toUpperCase().slice(0, 4) || initialsOf(name),
    order: all.length + 1,
    createdAt: new Date().toISOString()
  };
  await db.put('candidates', candidate);
  await audit('candidatura', `Candidatura registrada: ${name}`);
  return candidate;
}

export async function deleteCandidate(id) {
  const blocks = await listBlocks();
  const used = blocks.some((b) => b.type === 'vote' && b.data && b.data.candidateId === id);
  if (used) throw new Error('No se puede eliminar: la candidatura ya tiene votos registrados en la cadena.');
  const current = await db.get('candidates', id);
  await db.del('candidates', id);
  if (current) await audit('candidatura', `Candidatura eliminada: ${current.name}`);
}

const PALETTE = ['#1d4ed8', '#b45309', '#15803d', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f', '#c2410c'];
export function pickColor(i) { return PALETTE[i % PALETTE.length]; }

export function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------------- Padrón ---------------- */

export async function listVoters() {
  const voters = await db.getAll('voters');
  return voters.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function getVoter(dni) {
  return db.get('voters', normalizeDni(dni));
}

export async function countVoters() {
  return db.count('voters');
}

export async function searchVoters(query = '', limit = 40) {
  const all = await listVoters();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? all.filter((v) => v.name.toLowerCase().includes(q) || v.dni.toLowerCase().includes(q))
    : all;
  return { total: filtered.length, rows: filtered.slice(0, limit), voters: all };
}

export function normalizeDni(value) {
  return String(value || '').toUpperCase().replace(/[\s.]/g, '').trim();
}

export function parseVoterList(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    if (index === 0 && /dni|documento|c[oó]digo/i.test(line) && /nombre|apellido|elector/i.test(line)) return;

    const parts = line.split(/[;,|\t]/).map((s) => s.trim()).filter(Boolean);
    let dni;
    let name;
    if (parts.length >= 2) {
      dni = parts[0];
      name = parts.slice(1).join(' ');
    } else {
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (!match) { errors.push(`Línea ${index + 1}: falta el nombre.`); return; }
      dni = match[1];
      name = match[2];
    }

    dni = normalizeDni(dni);
    name = name.replace(/\s+/g, ' ').trim();

    if (!/^[A-Z0-9-]{3,20}$/.test(dni)) {
      errors.push(`Línea ${index + 1}: documento inválido «${dni}».`);
      return;
    }
    if (name.length < 2) {
      errors.push(`Línea ${index + 1}: nombre demasiado corto.`);
      return;
    }
    if (seen.has(dni)) {
      errors.push(`Línea ${index + 1}: documento repetido «${dni}».`);
      return;
    }
    seen.add(dni);
    rows.push({ dni, name });
  });

  return { rows, errors };
}

export async function importVoters(text) {
  const { rows, errors } = parseVoterList(text);
  if (!rows.length) throw new Error(errors[0] || 'No se encontraron electores válidos.');

  const existing = new Set((await db.getAll('voters')).map((v) => v.dni));
  const fresh = rows.filter((r) => !existing.has(r.dni));
  const now = new Date().toISOString();

  if (fresh.length) {
    await db.atomic('voters', 'readwrite', (stores) => {
      for (const row of fresh) {
        stores.voters.put({
          dni: row.dni,
          name: row.name,
          token: randomHex(16),
          hasVoted: false,
          votedAt: null,
          blockIndex: null,
          createdAt: now
        });
      }
    });
  }

  await audit('padron', `Importación: ${fresh.length} electores nuevos, ${rows.length - fresh.length} ya existentes.`);
  return {
    added: fresh.length,
    skipped: rows.length - fresh.length,
    invalid: errors,
    total: existing.size + fresh.length
  };
}

export async function addVoter(dniRaw, nameRaw) {
  const dni = normalizeDni(dniRaw);
  const name = String(nameRaw || '').replace(/\s+/g, ' ').trim();
  if (!/^[A-Z0-9-]{3,20}$/.test(dni)) throw new Error('Documento inválido (3 a 20 caracteres alfanuméricos).');
  if (name.length < 2) throw new Error('Escribe el nombre completo del elector.');
  if (await db.get('voters', dni)) throw new Error('Ese documento ya está en el padrón.');
  await db.put('voters', {
    dni, name, token: randomHex(16), hasVoted: false,
    votedAt: null, blockIndex: null, createdAt: new Date().toISOString()
  });
  await audit('padron', `Elector agregado: ${dni}`);
}

export async function deleteVoter(dni) {
  const voter = await db.get('voters', dni);
  if (!voter) return;
  if (voter.hasVoted) throw new Error('No se puede quitar a un elector que ya votó.');
  await db.del('voters', dni);
  await audit('padron', `Elector eliminado: ${dni}`);
}

/* ---------------- Votación ---------------- */

/**
 * Emite un voto de forma atómica.
 * - `choice`: 'candidate' | 'blank' | 'null'
 * - `candidateId`: id de la candidatura (solo si choice === 'candidate')
 * Devuelve { block, receipt }.
 */
export async function castVote({ dni: dniRaw, candidateId = null, choice = 'candidate' }) {
  const dni = normalizeDni(dniRaw);
  const election = await getElection();
  if (!election) throw new Error('No hay un proceso electoral configurado.');
  if (election.status !== 'open') throw new Error('La jornada electoral está cerrada.');

  const voter = await db.get('voters', dni);
  if (!voter) throw new Error('El documento no está en el padrón electoral.');
  if (voter.hasVoted) throw new Error('Este elector ya emitió su voto.');

  if (choice === 'candidate') {
    const candidate = await db.get('candidates', candidateId);
    if (!candidate) throw new Error('La candidatura seleccionada no existe.');
  }

  const blocks = await listBlocks();
  const previous = blocks.length ? blocks[blocks.length - 1] : null;

  const nullifier = await sha256Hex('nullifier:' + (voter.token || randomHex(16)));
  if (blocks.some((b) => b.type === 'vote' && b.data && b.data.nullifier === nullifier)) {
    throw new Error('Se detectó un intento de voto duplicado.');
  }

  const receipt = randomHex(5).toUpperCase();
  const receiptHash = await sha256Hex('receipt:' + receipt);
  const block = await makeBlock(previous, {
    type: 'vote',
    data: {
      electionId: election.id,
      candidateId: choice === 'candidate' ? candidateId : null,
      choice,
      nullifier,
      receiptHash
    }
  });

  const dbc = await db.openDB();
  await new Promise((resolve, reject) => {
    const tx = dbc.transaction(['voters', 'blocks'], 'readwrite');
    const voterStore = tx.objectStore('voters');
    const blockStore = tx.objectStore('blocks');
    let failure = null;

    const request = voterStore.get(dni);
    request.onsuccess = () => {
      const current = request.result;
      if (!current) { failure = new Error('El elector ya no está en el padrón.'); tx.abort(); return; }
      if (current.hasVoted) { failure = new Error('Este elector ya emitió su voto.'); tx.abort(); return; }
      voterStore.put({
        ...current,
        hasVoted: true,
        votedAt: new Date().toISOString(),
        blockIndex: block.index,
        token: null
      });
      blockStore.add(block);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || failure || new Error('No se pudo registrar el voto.'));
    tx.onabort = () => reject(failure || tx.error || new Error('Registro de voto cancelado.'));
  });

  return { block, receipt, blockIndex: block.index };
}

/** Verifica un comprobante y devuelve la candidatura por la que se votó. */
export async function verifyReceipt(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 6) throw new Error('El código del comprobante es demasiado corto.');
  const hash = await sha256Hex('receipt:' + clean);
  const blocks = await listBlocks();
  const block = blocks.find((b) => b.type === 'vote' && b.data && b.data.receiptHash === hash);
  if (!block) return { found: false };
  let candidate = null;
  if (block.data.candidateId) candidate = await db.get('candidates', block.data.candidateId);
  return { found: true, block, candidate, choice: block.data.choice };
}

/* ---------------- Resultados ---------------- */

export async function tally() {
  const [candidates, blocks, voters] = await Promise.all([listCandidates(), listBlocks(), db.getAll('voters')]);
  const votes = blocks.filter((b) => b.type === 'vote');
  const counts = new Map(candidates.map((c) => [c.id, 0]));
  let blank = 0;
  let nullVotes = 0;

  for (const block of votes) {
    const data = block.data || {};
    if (data.choice === 'blank') blank += 1;
    else if (data.choice === 'null') nullVotes += 1;
    else if (data.candidateId && counts.has(data.candidateId)) {
      counts.set(data.candidateId, counts.get(data.candidateId) + 1);
    } else {
      nullVotes += 1;
    }
  }

  const totalVotes = votes.length;
  const rows = candidates.map((c) => ({
    ...c,
    votes: counts.get(c.id) || 0,
    pct: totalVotes ? ((counts.get(c.id) || 0) / totalVotes) * 100 : 0
  }));
  const sorted = [...rows].sort((a, b) => b.votes - a.votes);
  const winner = sorted.length && sorted[0].votes > 0 ? sorted[0] : null;
  const electorate = voters.length;
  const voted = voters.filter((v) => v.hasVoted).length;

  return {
    candidates: rows,
    ranking: sorted,
    blank,
    nullVotes,
    totalVotes,
    electorate,
    voted,
    participation: electorate ? (voted / electorate) * 100 : 0,
    winner: winner && (sorted.length === 1 || winner.votes > (sorted[1]?.votes || 0)) ? winner : null
  };
}

/* ---------------- Jornada ---------------- */

export async function closeElection() {
  const election = await getElection();
  if (!election) throw new Error('No hay proceso electoral.');
  if (election.status === 'closed') return election;
  const closed = { ...election, status: 'closed', closedAt: new Date().toISOString() };
  await db.put('kv', closed, K.election);
  await appendBlock('close', { electionId: closed.id, closedAt: closed.closedAt });
  await audit('jornada', 'Jornada electoral cerrada.');
  return closed;
}

export async function reopenElection() {
  const election = await getElection();
  if (!election) throw new Error('No hay proceso electoral.');
  if (election.status === 'open') return election;
  const reopened = { ...election, status: 'open', closedAt: null, reopenedAt: new Date().toISOString() };
  await db.put('kv', reopened, K.election);
  await appendBlock('reopen', { electionId: reopened.id, reopenedAt: reopened.reopenedAt });
  await audit('jornada', 'Jornada electoral reabierta.');
  return reopened;
}

/* ---------------- Bitácora ---------------- */

export async function audit(action, detail = '') {
  await db.put('audit', { ts: new Date().toISOString(), action, detail });
}

export async function listAudit(limit = 40) {
  const rows = await db.getAll('audit');
  return rows.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
}

/* ---------------- Respaldo / acta ---------------- */

export async function exportBackup() {
  const [institution, auth, election, settings, candidates, voters, blocks, auditLog] = await Promise.all([
    getInstitution(), getAuth(), getElection(), getSettings(),
    db.getAll('candidates'), db.getAll('voters'), listBlocks(), db.getAll('audit')
  ]);
  return {
    app: APP_ID,
    version: APP_VERSION,
    kind: 'respaldo',
    exportedAt: new Date().toISOString(),
    institution, auth, election, settings,
    candidates, voters, blocks, audit: auditLog
  };
}

export async function importBackup(data) {
  if (!data || data.app !== APP_ID || !data.institution || !data.auth || !data.blocks) {
    throw new Error('El archivo no es un respaldo válido de Voto Seguro.');
  }
  await db.clearAll();
  await db.put('kv', data.institution, K.institution);
  await db.put('kv', data.auth, K.auth);
  if (data.election) await db.put('kv', data.election, K.election);
  if (data.settings) await db.put('kv', data.settings, K.settings);
  for (const c of data.candidates || []) await db.put('candidates', c);
  for (const v of data.voters || []) await db.put('voters', v);
  for (const b of data.blocks || []) await db.put('blocks', b);
  for (const a of data.audit || []) await db.put('audit', a);
  await audit('respaldo', 'Respaldo restaurado en este dispositivo.');
}

export async function exportActa() {
  const [institution, election, settings] = await Promise.all([getInstitution(), getElection(), getSettings()]);
  const results = await tally();
  const ledger = await verifyLedger();
  const blocks = await listBlocks();
  return {
    app: APP_ID,
    kind: 'acta',
    version: APP_VERSION,
    generatedAt: new Date().toISOString(),
    institution,
    election,
    settings,
    results,
    ledger,
    blocks
  };
}

/**
 * Reinicia el proceso electoral conservando institución y PIN.
 * Borra padrón, candidaturas, cadena y abre una nueva jornada.
 */
export async function resetElectionData() {
  const institution = await getInstitution();
  const election = freshElection();
  const now = new Date().toISOString();
  const genesis = await makeBlock(null, {
    type: 'genesis',
    timestamp: now,
    data: {
      institution: institution ? institution.name : 'Institución',
      processName: institution ? institution.processName : 'Proceso electoral',
      year: institution ? institution.year : new Date().getFullYear(),
      electionId: election.id,
      reset: true
    }
  });

  await db.clear('voters');
  await db.clear('candidates');
  await db.clear('blocks');
  await db.put('kv', election, K.election);
  await db.put('blocks', genesis);
  await audit('jornada', 'Nuevo proceso electoral: datos anteriores borrados.');
  return election;
}

export { GENESIS_HASH };
