import { CODE_CARD } from '../../engine/codes';

export function CodeCard() {
  return (
    <section className="card" aria-labelledby="card-title">
      <h2 id="card-title" className="card-title">
        Wallet code card
      </h2>
      <p className="card-sub">Keep with your pager. Numbers only, like it is 1994.</p>
      <dl className="card-list">
        {CODE_CARD.map((c) => (
          <div key={c.code} className="card-row">
            <dt>{c.code}</dt>
            <dd>
              <strong>{c.meaning}.</strong> {c.detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
