import { useId, useState, type FormEvent } from 'react';
import { effectivePrepMinutes } from '../../engine/plan';
import { MINUTE, pad, parseHm, readableClock, zonedToEpoch } from '../../engine/time';
import type { CommitmentKind, Priority } from '../../engine/types';
import type { PagerApi } from '../usePager';

export function AddForm({ pager }: { pager: PagerApi }) {
  const { places, settings, dayDate, tz, plan } = pager;
  const id = useId();
  const [kind, setKind] = useState<CommitmentKind>('appointment');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(`${dayDate.year}-${pad(dayDate.month)}-${pad(dayDate.day)}`);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [placeId, setPlaceId] = useState(places.find((p) => p.id !== settings.homePlaceId)?.id ?? '');
  const [prep, setPrep] = useState(20);
  const [checkIn, setCheckIn] = useState(25);
  const [priority, setPriority] = useState<Priority>('normal');
  const [error, setError] = useState('');
  const [addedId, setAddedId] = useState<string | null>(null);

  const added = addedId ? plan.pages.filter((p) => p.commitmentId === addedId) : [];
  const addedDigest = addedId ? plan.days.flatMap((d) => d.digest).filter((d) => d.commitmentId === addedId) : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    const hm = parseHm(time);
    const [y, m, d] = date.split('-').map(Number);
    if (!title.trim()) return setError('Give it a name.');
    if (!hm || !y || !m || !d) return setError('Pick a date and a start time.');
    if (duration < 5) return setError('It needs to last at least 5 minutes.');
    setError('');
    const start = zonedToEpoch({ year: y, month: m, day: d, ...hm }, tz);
    const c = pager.addCommitment({
      title: title.trim(),
      kind,
      start,
      end: start + duration * MINUTE,
      placeId: kind === 'appointment' ? placeId || null : null,
      prepMinutes: kind === 'appointment' ? Math.max(0, prep) : 0,
      priority,
      checkInEveryMinutes: kind === 'focus' && checkIn > 0 ? checkIn : null,
    });
    setAddedId(c.id);
    setTitle('');
  }

  const honest = effectivePrepMinutes(prep, settings.honestyFactor);

  return (
    <form className="form" onSubmit={submit} aria-describedby={`${id}-hint`} noValidate>
      <p id={`${id}-hint`} className="form-hint">
        Tell the pager what you have to show up for. It works out when you need to act.
      </p>
      <fieldset className="seg">
        <legend className="sr-only">Kind</legend>
        <label className={kind === 'appointment' ? 'seg-on' : ''}>
          <input type="radio" name="kind" value="appointment" checked={kind === 'appointment'} onChange={() => setKind('appointment')} />
          Somewhere to be
        </label>
        <label className={kind === 'focus' ? 'seg-on' : ''}>
          <input type="radio" name="kind" value="focus" checked={kind === 'focus'} onChange={() => setKind('focus')} />
          Focus block (body double)
        </label>
      </fieldset>

      <label className="field">
        <span>What</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'focus' ? 'Quarterly taxes' : 'Dentist cleaning'} required />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Starts at</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className="field field--narrow">
          <span>Minutes</span>
          <input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </label>
      </div>

      {kind === 'appointment' ? (
        <div className="field-row">
          <label className="field">
            <span>Where</span>
            <select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
              <option value="">No travel</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Getting ready really takes (min)</span>
            <input type="number" min={0} step={5} value={prep} onChange={(e) => setPrep(Number(e.target.value))} aria-describedby={`${id}-honest`} />
            <small id={`${id}-honest`}>
              Planned as {honest} min (x{settings.honestyFactor} honesty factor).
            </small>
          </label>
        </div>
      ) : (
        <label className="field">
          <span>Body double checks in every (min)</span>
          <input type="number" min={0} step={5} value={checkIn} onChange={(e) => setCheckIn(Number(e.target.value))} />
          <small>A soft 121 page that asks if you are still on it. 0 turns check-ins off.</small>
        </label>
      )}

      <fieldset className="seg seg--three">
        <legend>How badly does it need you?</legend>
        {(
          [
            ['must', 'Must page'],
            ['normal', 'Page me'],
            ['low', 'Digest only'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={priority === value ? 'seg-on' : ''}>
            <input type="radio" name="priority" value={value} checked={priority === value} onChange={() => setPriority(value)} />
            {label}
          </label>
        ))}
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn--primary">
        Arm the pager
      </button>

      <div role="status" className="form-result" data-testid="add-result">
        {addedId &&
          (added.length > 0
            ? `Armed: ${added.map((p) => `${p.code} at ${readableClock(p.fireAt, tz)}`).join(', ')}.`
            : addedDigest.length > 0
              ? 'Added to the quiet digest. It will not beep.'
              : 'Added.')}
      </div>
    </form>
  );
}
