import { useState, type FormEvent } from 'react';
import { rankChunks, MIN_SCORE } from '../data/assistantRank';
import { SUGGESTED_QUESTIONS } from '../data/assistantKnowledge';

/**
 * ResearchAssistant — a document-grounded question-answer panel.
 *
 * Answers come ONLY from the project's own documents (README,
 * methodology, pack manifests, challenge brief), indexed locally with
 * TF-IDF. Every answer cites its source chunk. When no chunk matches
 * well enough, the assistant says it does not have the evidence rather
 * than inventing an answer. No server and no external AI service is
 * involved — retrieval runs entirely in the browser.
 */

interface Exchange {
  question: string;
  answer: string | null;
  sourceTitle?: string;
  source?: string;
  score?: number;
  related?: string;
}

export function ResearchAssistant() {
  const [input, setInput] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question) return;
    const ranked = rankChunks(question);
    const top = ranked[0];
    let exchange: Exchange;
    if (top && top.score >= MIN_SCORE) {
      const second = ranked[1];
      exchange = {
        question,
        answer: top.chunk.text,
        sourceTitle: top.chunk.title,
        source: top.chunk.source,
        score: top.score,
        related:
          second && second.score >= MIN_SCORE && second.chunk.id !== top.chunk.id
            ? second.chunk.title
            : undefined,
      };
    } else {
      exchange = { question, answer: null };
    }
    setExchanges((prev) => [exchange, ...prev].slice(0, 4));
    setInput('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <div className="mt-8 bg-[#0a0d16] rounded-2xl border border-[#f5efe2]/10 p-5">
      <h3 className="text-sm font-mono uppercase tracking-wider text-emerald-300">
        Research Assistant
      </h3>
      <p className="text-[11px] text-[#f5efe2]/55 mt-0.5 max-w-2xl leading-relaxed">
        Ask about the project, the data or the method. Answers are retrieved from the project's own
        documents — the README, the methodology and the pack manifests — and cite their source. If
        the documents don't cover a question, the assistant says so instead of guessing.
      </p>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            className="text-[11px] px-2.5 py-1.5 rounded-full bg-[#161c2d] border border-[#f5efe2]/15 text-[#f5efe2]/75 hover:border-[#3b82f6]/60 hover:text-[#f5efe2] transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 mt-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question — e.g. How many epochs does the archive hold for WISE 0855?"
          className="flex-1 min-w-0 bg-[#161c2d] border border-[#f5efe2]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#f5efe2] placeholder:text-[#f5efe2]/35 focus:outline-none focus:border-[#3b82f6]"
          aria-label="Ask the research assistant a question"
        />
        <button
          type="submit"
          className="shrink-0 bg-[#f5efe2] hover:bg-[#e2d8c5] text-[#0a0d16] font-semibold text-sm py-2.5 px-5 rounded-xl transition-colors"
        >
          Ask
        </button>
      </form>

      <div className="space-y-3 mt-4">
        {exchanges.map((ex, i) => (
          <div key={i} className="bg-[#121622] rounded-xl border border-[#f5efe2]/10 p-4">
            <p className="text-xs font-mono text-[#93c5fd] mb-1.5">Q · {ex.question}</p>
            {ex.answer ? (
              <>
                <p className="text-sm text-[#f5efe2]/85 leading-relaxed">{ex.answer}</p>
                <p className="text-[11px] font-mono text-[#f5efe2]/45 mt-2">
                  Source: {ex.source} · “{ex.sourceTitle}” · match{' '}
                  {Math.round((ex.score ?? 0) * 100)}%
                  {ex.related ? ` · Related: ${ex.related}` : ''}
                </p>
              </>
            ) : (
              <p className="text-sm text-[#f5efe2]/70 leading-relaxed">
                I don't have evidence for that in the project documents yet. Try one of the suggested
                questions above, or ask about the data packs, the targets, difference imaging, or the
                project's limitations.
              </p>
            )}
          </div>
        ))}
        {exchanges.length === 0 && (
          <p className="text-[11px] text-[#f5efe2]/40">
            No questions yet — pick a suggestion or type your own.
          </p>
        )}
      </div>
    </div>
  );
}
