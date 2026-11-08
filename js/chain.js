/* ============================================================
   chain.js — cadena de bloques local para el registro de votos.

   Cada bloque contiene: índice, marca de tiempo, hash del bloque
   anterior, tipo y datos. El hash se calcula con SHA-256 sobre una
   representación canónica (mismo orden de campos siempre), por lo
   que cualquier cambio en un bloque pasado rompe la cadena.
   ============================================================ */

import { sha256Hex } from './crypto.js';

export const GENESIS_HASH = '0'.repeat(64);

/** Serialización estable: el orden de las claves es fijo. */
export function canonicalBlock(block) {
  return JSON.stringify({
    index: block.index,
    timestamp: block.timestamp,
    prevHash: block.prevHash,
    type: block.type,
    data: block.data
  });
}

export async function hashBlock(block) {
  return sha256Hex(canonicalBlock(block));
}

/**
 * Crea un bloque enlazado al anterior (o al génesis si es el primero).
 */
export async function makeBlock(previous, { type, data, timestamp } = {}) {
  const block = {
    index: previous ? previous.index + 1 : 0,
    timestamp: timestamp || new Date().toISOString(),
    prevHash: previous ? previous.hash : GENESIS_HASH,
    type,
    data
  };
  block.hash = await hashBlock(block);
  return block;
}

/**
 * Verifica integridad y enlaces de toda la cadena.
 * Devuelve { ok, errors, head, length }.
 */
export async function verifyChain(blocks) {
  const errors = [];
  const list = [...(blocks || [])].sort((a, b) => a.index - b.index);

  if (list.length === 0) {
    return { ok: false, errors: ['La cadena está vacía.'], head: null, length: 0 };
  }

  let previous = null;

  for (let i = 0; i < list.length; i++) {
    const block = list[i];
    const label = `Bloque #${block.index}`;

    if (block.index !== i) {
      errors.push(`${label}: índice fuera de secuencia (se esperaba #${i}).`);
    }

    const expectedPrev = previous ? previous.hash : GENESIS_HASH;
    if (block.prevHash !== expectedPrev) {
      errors.push(`${label}: el enlace al bloque anterior no coincide.`);
    }

    const expectedHash = await hashBlock(block);
    if (block.hash !== expectedHash) {
      errors.push(`${label}: el hash no coincide, el contenido fue alterado.`);
    }

    previous = block;
  }

  return {
    ok: errors.length === 0,
    errors,
    head: previous ? { index: previous.index, hash: previous.hash } : null,
    length: list.length
  };
}

/**
 * Comprobaciones adicionales del registro electoral: ningún voto
 * puede repetir su nullifier ni su comprobante.
 */
export function checkLedgerUniqueness(blocks) {
  const errors = [];
  const nullifiers = new Set();
  const receipts = new Set();

  for (const block of blocks || []) {
    if (block.type !== 'vote') continue;
    const { nullifier, receiptHash } = block.data || {};
    if (nullifier) {
      if (nullifiers.has(nullifier)) errors.push(`Bloque #${block.index}: nullifier duplicado.`);
      nullifiers.add(nullifier);
    }
    if (receiptHash) {
      if (receipts.has(receiptHash)) errors.push(`Bloque #${block.index}: comprobante duplicado.`);
      receipts.add(receiptHash);
    }
  }

  return { ok: errors.length === 0, errors };
}

export const BLOCK_LABELS = {
  genesis: 'Acta de apertura',
  vote: 'Voto sellado',
  close: 'Cierre de jornada',
  reopen: 'Reapertura de jornada'
};
