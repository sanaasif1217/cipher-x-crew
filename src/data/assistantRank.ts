/**
 * Tiny TF-IDF ranker for the Research Assistant.
 *
 * Indexes the project knowledge chunks (title weighted x3), scores a
 * question by cosine similarity, and returns the best matches. The
 * assistant only answers when the best score clears MIN_SCORE — below
 * that it honestly reports insufficient evidence instead of guessing.
 */

import { KNOWLEDGE, type KnowledgeChunk } from './assistantKnowledge';

export const MIN_SCORE = 0.09;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'as', 'it',
  'its', 'this', 'that', 'these', 'those', 'and', 'or', 'but', 'if',
  'then', 'than', 'so', 'such', 'into', 'over', 'under', 'about',
  'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
  'i', 'you', 'he', 'she', 'we', 'they', 'me', 'my', 'your', 'our',
  'tell', 'show', 'give', 'please', 'explain', 'describe',
]);

function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out: string[] = [];
  for (const w of raw) {
    if (w.length < 2) continue; // drops stray possessive "s" and similar noise
    if (STOPWORDS.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

interface IndexedChunk {
  chunk: KnowledgeChunk;
  vector: Map<string, number>;
  norm: number;
}

function buildIndex(): { docs: IndexedChunk[]; idf: Map<string, number> } {
  const df = new Map<string, number>();
  const docTerms: Map<string, number>[] = [];

  for (const chunk of KNOWLEDGE) {
    const counts = new Map<string, number>();
    for (const t of tokenize(chunk.title)) counts.set(t, (counts.get(t) ?? 0) + 3);
    for (const t of tokenize(chunk.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    docTerms.push(counts);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const n = KNOWLEDGE.length;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 1)) + 1);

  const docs: IndexedChunk[] = KNOWLEDGE.map((chunk, i) => {
    const vector = new Map<string, number>();
    let normSq = 0;
    for (const [t, c] of docTerms[i]) {
      const w = c * (idf.get(t) ?? 1);
      vector.set(t, w);
      normSq += w * w;
    }
    return { chunk, vector, norm: Math.sqrt(normSq) || 1 };
  });

  return { docs, idf };
}

const INDEX = buildIndex();

export interface RankedAnswer {
  chunk: KnowledgeChunk;
  score: number;
}

/** Rank all chunks against a question, best first. */
export function rankChunks(question: string): RankedAnswer[] {
  const qCounts = new Map<string, number>();
  for (const t of tokenize(question)) qCounts.set(t, (qCounts.get(t) ?? 0) + 1);

  const qVector = new Map<string, number>();
  let qNormSq = 0;
  for (const [t, c] of qCounts) {
    const w = c * (INDEX.idf.get(t) ?? 1.5);
    qVector.set(t, w);
    qNormSq += w * w;
  }
  const qNorm = Math.sqrt(qNormSq);
  if (qNorm === 0) return [];

  return INDEX.docs
    .map((doc) => {
      let dot = 0;
      for (const [t, w] of qVector) {
        const dw = doc.vector.get(t);
        if (dw) dot += w * dw;
      }
      return { chunk: doc.chunk, score: dot / (qNorm * doc.norm) };
    })
    .sort((a, b) => b.score - a.score);
}
