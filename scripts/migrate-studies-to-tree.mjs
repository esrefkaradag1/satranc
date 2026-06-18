#!/usr/bin/env node
/**
 * Migrate legacy chess_studies chapters (fen + moves + variations + annotations)
 * into Lichess-like tree snapshots (chess_study_snapshots).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-studies-to-tree.mjs
 *
 * Optional:
 *   --study=<id>          only migrate one study
 *   --dry-run             do not write, just report
 */

import { createClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const onlyStudy = argv.find(a => a.startsWith('--study='))?.split('=')[1] || null;
const dryRun = argv.includes('--dry-run');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const STUDIES_TABLE = 'chess_studies';
const SNAP_TABLE = 'chess_study_snapshots';

function genId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function safeChess(fen) {
  try {
    return new Chess(fen);
  } catch {
    return new Chess(fen, { skipValidation: true });
  }
}

function applyMove(game, moveStr) {
  if (!moveStr || !String(moveStr).trim()) return false;
  let s = String(moveStr).trim().replace(/^\d+\.+/, '').replace(/\s+/g, '').replace(/[?!+#]+$/, '');
  try {
    if (game.move(s)) return true;
  } catch {}
  try {
    if (s.length >= 4) {
      const from = s.slice(0, 2);
      const to = s.slice(2, 4);
      const promo = s.slice(4, 5) || undefined;
      if (game.move({ from, to, promotion: promo || 'q' })) return true;
    }
  } catch {}
  try {
    if (game.move(s.toLowerCase())) return true;
  } catch {}
  try {
    if (game.move(s.replace(/[+#]/g, ''))) return true;
  } catch {}
  return false;
}

function buildTreeSnapshotFromChapter(chapter, study) {
  const startFen = (chapter?.fen || '').trim() || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const rootId = 'root';
  const nodes = {};
  nodes[rootId] = {
    id: rootId,
    parentId: null,
    children: [],
    fen: startFen,
    ply: 0,
    comments: [],
    glyphs: [],
    shapes: Array.isArray(chapter?.arrows) ? chapter.arrows : [],
  };

  const mainlineIds = [rootId];
  const moves = Array.isArray(chapter?.moves) ? chapter.moves : [];
  let curId = rootId;

  for (let i = 0; i < moves.length; i++) {
    const parent = nodes[curId];
    const g = safeChess(parent.fen);
    const san = String(moves[i] || '').trim();
    applyMove(g, san);
    const childId = genId();
    nodes[childId] = {
      id: childId,
      parentId: curId,
      children: [],
      san,
      fen: g.fen(),
      ply: parent.ply + 1,
      comments: [],
      glyphs: [],
      shapes: [],
    };
    parent.children.push(childId);
    curId = childId;
    mainlineIds.push(childId);
  }

  // move comments / glyphs (annotations) from legacy indexes
  const moveComments = chapter?.moveComments && typeof chapter.moveComments === 'object' ? chapter.moveComments : {};
  const moveAnnotations = chapter?.moveAnnotations && typeof chapter.moveAnnotations === 'object' ? chapter.moveAnnotations : {};
  for (const [k, v] of Object.entries(moveComments)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    const nodeId = mainlineIds[idx + 1];
    if (!nodeId || !nodes[nodeId]) continue;
    const text = String(v || '').trim();
    if (!text) continue;
    nodes[nodeId].comments.push({
      id: genId(),
      by: 'migrate',
      text,
      createdAt: new Date().toISOString(),
    });
  }
  for (const [k, v] of Object.entries(moveAnnotations)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    const nodeId = mainlineIds[idx + 1];
    if (!nodeId || !nodes[nodeId]) continue;
    const sym = String(v || '').trim();
    if (!sym) continue;
    nodes[nodeId].glyphs = [sym];
  }

  // variations: Record<moveIndex, string[][]>
  const vars = chapter?.variations && typeof chapter.variations === 'object' ? chapter.variations : {};
  for (const [k, groups] of Object.entries(vars)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    const parentNodeId = mainlineIds[idx] ?? rootId;
    if (!nodes[parentNodeId]) continue;
    if (!Array.isArray(groups)) continue;
    for (const line of groups) {
      if (!Array.isArray(line) || line.length === 0) continue;
      let pid = parentNodeId;
      for (const mv of line) {
        const parent = nodes[pid];
        const g = safeChess(parent.fen);
        const san = String(mv || '').trim();
        applyMove(g, san);
        const childId = genId();
        nodes[childId] = {
          id: childId,
          parentId: pid,
          children: [],
          san,
          fen: g.fen(),
          ply: parent.ply + 1,
          comments: [],
          glyphs: [],
          shapes: [],
        };
        parent.children.push(childId);
        pid = childId;
      }
    }
  }

  return {
    studyId: String(study.id),
    chapterId: String(chapter.id),
    lastSeq: 0,
    tree: {
      rootId,
      nodes,
      mainline: mainlineIds,
    },
  };
}

async function main() {
  const q = supabase.from(STUDIES_TABLE).select('*').order('created_at', { ascending: true });
  const { data, error } = onlyStudy ? await q.eq('id', onlyStudy) : await q;
  if (error) throw error;
  const studies = data || [];

  console.log(`Found ${studies.length} studies.`);
  let written = 0;

  for (const s of studies) {
    const chapters = Array.isArray(s.chapters) ? s.chapters : [];
    for (const ch of chapters) {
      const snap = buildTreeSnapshotFromChapter(ch, s);
      if (dryRun) {
        console.log(`[dry-run] study=${snap.studyId} chapter=${snap.chapterId} nodes=${Object.keys(snap.tree.nodes).length}`);
        continue;
      }
      const { error: upErr } = await supabase
        .from(SNAP_TABLE)
        .upsert(
          {
            study_id: snap.studyId,
            chapter_id: snap.chapterId,
            last_seq: snap.lastSeq,
            tree: snap.tree,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'study_id,chapter_id' },
        );
      if (upErr) {
        console.error('Upsert error:', upErr.message, 'study=', snap.studyId, 'chapter=', snap.chapterId);
      } else {
        written++;
      }
    }
  }

  console.log(dryRun ? 'Dry run completed.' : `Done. Upserted ${written} snapshots.`);
}

main().catch((e) => {
  console.error('Migration failed:', e?.message || e);
  process.exit(1);
});

