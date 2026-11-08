/* ============================================================
   demo.js — modo demostración aislado.
   Usa una cadena en memoria: nunca toca la elección real.
   ============================================================ */

import { makeBlock, verifyChain } from './chain.js';
import { sha256Hex, randomHex } from './crypto.js';

export const DEMO_CANDIDATES = [
  { id: 'a', name: 'Lista A · Innovación', short: 'A', color: '#1d4ed8', initials: 'LA' },
  { id: 'b', name: 'Lista B · Cultura', short: 'B', color: '#b45309', initials: 'LB' },
  { id: 'c', name: 'Lista C · Deporte', short: 'C', color: '#15803d', initials: 'LC' }
];

let demo = null;

export async function ensureDemo() {
  if (!demo) {
    const genesis = await makeBlock(null, {
      type: 'genesis',
      data: { demo: true, label: 'Cadena de demostración' }
    });
    demo = { blocks: [genesis], snapshot: null, ballots: 0 };
  }
  return demo;
}

export async function demoVote(choice) {
  const d = await ensureDemo();
  if (d.snapshot) throw new Error('La cadena está alterada: restáurala antes de seguir.');

  const isSpecial = choice === 'blank' || choice === 'null';
  const previous = d.blocks[d.blocks.length - 1];
  const block = await makeBlock(previous, {
    type: 'vote',
    data: {
      demo: true,
      choice: isSpecial ? choice : 'candidate',
      candidateId: isSpecial ? null : choice,
      receiptHash: await sha256Hex('demo-receipt:' + randomHex(8)),
      nullifier: await sha256Hex('demo-nullifier:' + randomHex(8))
    }
  });
  d.blocks.push(block);
  d.ballots += 1;
  return block;
}

/** Altera un voto ya sellado para demostrar que la verificación lo detecta. */
export async function demoTamper() {
  const d = await ensureDemo();
  if (d.snapshot) return false;
  const index = d.blocks.findIndex((b) => b.type === 'vote');
  if (index === -1) return false;
  d.snapshot = JSON.parse(JSON.stringify(d.blocks));
  const block = d.blocks[index];
  const old = block.data.candidateId || 'a';
  block.data.candidateId = old === 'a' ? 'b' : 'a';
  block.data.choice = 'candidate';
  return true;
}

export function demoRepair() {
  if (!demo || !demo.snapshot) return false;
  demo.blocks = demo.snapshot;
  demo.snapshot = null;
  return true;
}

export async function demoVerify() {
  const d = await ensureDemo();
  return verifyChain(d.blocks);
}

export async function demoSummary() {
  const d = await ensureDemo();
  const counts = { a: 0, b: 0, c: 0, blank: 0, null: 0 };
  for (const block of d.blocks) {
    if (block.type !== 'vote') continue;
    const { choice, candidateId } = block.data || {};
    if (choice === 'blank') counts.blank += 1;
    else if (choice === 'null') counts.null += 1;
    else if (candidateId && counts[candidateId] !== undefined) counts[candidateId] += 1;
  }
  return {
    blocks: d.blocks.slice(),
    ballots: d.ballots,
    counts,
    tampered: !!d.snapshot,
    total: d.blocks.filter((b) => b.type === 'vote').length
  };
}

export function demoReset() {
  demo = null;
}
