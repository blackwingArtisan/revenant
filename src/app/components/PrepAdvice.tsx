import { isSampleHistory } from '../../engine/sample';
import type { PagerApi } from '../usePager';

/**
 * Suggestions from the engine's learner: a longer prep time for routines whose
 * leave-now page is usually ACK'd late. Nothing changes until the person presses Apply.
 */
export function PrepAdvice({ pager }: { pager: PagerApi }) {
  const { prepSuggestions } = pager;
  if (prepSuggestions.length === 0) return null;
  return (
    <section className="advice" aria-labelledby="advice-title" data-testid="prep-advice">
      <h3 id="advice-title">Prep time suggestion</h3>
      <ul>
        {prepSuggestions.map((s) => (
          <li key={s.routineKey} data-testid="prep-suggestion">
            <p className="advice-text">
              <strong>{s.title}.</strong> You often ACK this one late. Try {s.suggestedPrepMinutes} min prep instead of {s.currentPrepMinutes}.
            </p>
            {s.commitmentIds.some(isSampleHistory) && (
              <p className="advice-note" data-testid="sample-history-note">
                Sample history: the two earlier weeks are invented for the demo, so the learner has something to learn from.
              </p>
            )}
            <span className="advice-actions">
              <button type="button" className="btn btn--primary" onClick={() => pager.applyPrepSuggestion(s)} aria-label={`Apply ${s.suggestedPrepMinutes} min prep for ${s.title}`}>
                Apply
              </button>
              <button type="button" className="btn" onClick={() => pager.dismissPrepSuggestion(s)} aria-label={`Dismiss the prep suggestion for ${s.title}`}>
                Dismiss
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
