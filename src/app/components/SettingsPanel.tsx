import { useState, type FormEvent } from 'react';
import { isValidTimeZone, pad, parseHm } from '../../engine/time';
import type { TravelMode } from '../../engine/types';
import type { PagerApi } from '../usePager';

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];

const ESCALATION_PRESETS: { label: string; value: number[] }[] = [
  { label: '5/10 min', value: [5, 10] },
  { label: '3/6/10 min', value: [3, 6, 10] },
  { label: '2/4/6/8 min', value: [2, 4, 6, 8] },
];

function PlaceForm({ pager }: { pager: PagerApi }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState('');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Name the place.');
    let point = null;
    if (coords.trim()) {
      const [lat, lon] = coords.split(',').map((s) => Number(s.trim()));
      if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return setError('Coordinates look like "42.03, -87.96".');
      }
      point = { lat, lon };
    }
    setError('');
    pager.addPlace({ name: name.trim(), address: address.trim() || name.trim(), point });
    setName('');
    setAddress('');
    setCoords('');
  }

  return (
    <form className="form form--compact" onSubmit={submit} noValidate>
      <div className="field-row">
        <label className="field">
          <span>Place name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Willow Clinic" />
        </label>
        <label className="field">
          <span>Address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="22 Elm Court" />
        </label>
        <label className="field">
          <span>Lat, lon (optional)</span>
          <input value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="42.018, -87.981" inputMode="decimal" />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn">
        Save place
      </button>
    </form>
  );
}

export function SettingsPanel({ pager }: { pager: PagerApi }) {
  const { settings, updateSettings, places, commitments } = pager;
  const [zone, setZone] = useState(settings.timeZone);
  const zoneOk = isValidTimeZone(zone);
  const escalationKey = settings.escalationMinutes.join(',');

  return (
    <div className="settings">
      <div className="field-row">
        <label className="field">
          <span>Beep budget per day: {settings.dailyBudget}</span>
          <input
            type="range"
            min={1}
            max={12}
            value={settings.dailyBudget}
            onChange={(e) => updateSettings({ dailyBudget: Number(e.target.value) })}
            data-testid="budget-range"
          />
          <small>Everything past the budget waits in one quiet digest.</small>
        </label>
        <label className="field">
          <span>Honesty factor: x{settings.honestyFactor.toFixed(2)}</span>
          <input type="range" min={1} max={2.5} step={0.25} value={settings.honestyFactor} onChange={(e) => updateSettings({ honestyFactor: Number(e.target.value) })} />
          <small>Stated prep time is multiplied by this. Time blindness is real.</small>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Arrive early by (min)</span>
          <input type="number" min={0} max={60} value={settings.bufferMinutes} onChange={(e) => updateSettings({ bufferMinutes: Math.max(0, Number(e.target.value)) })} />
        </label>
        <label className="field">
          <span>Repeat unanswered pages</span>
          <select value={escalationKey} onChange={(e) => updateSettings({ escalationMinutes: e.target.value.split(',').map(Number) })}>
            {ESCALATION_PRESETS.map((p) => (
              <option key={p.label} value={p.value.join(',')}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Digest at</span>
          <input
            type="time"
            value={`${pad(settings.digestTime.hour)}:${pad(settings.digestTime.minute)}`}
            onChange={(e) => {
              const hm = parseHm(e.target.value);
              if (hm) updateSettings({ digestTime: hm });
            }}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Getting around by</span>
          <select value={settings.travelMode} onChange={(e) => updateSettings({ travelMode: e.target.value as TravelMode })}>
            <option value="car">Car</option>
            <option value="transit">Transit</option>
            <option value="bike">Bike</option>
            <option value="walk">Walking</option>
          </select>
        </label>
        <label className="field">
          <span>Home</span>
          <select value={settings.homePlaceId ?? ''} onChange={(e) => updateSettings({ homePlaceId: e.target.value || null })}>
            <option value="">Not set</option>
            {places
              .filter((p) => !p.virtual)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          <span>Time zone</span>
          <input
            list="zones"
            value={zone}
            aria-invalid={!zoneOk}
            onChange={(e) => {
              setZone(e.target.value);
              if (isValidTimeZone(e.target.value)) updateSettings({ timeZone: e.target.value });
            }}
          />
          <datalist id="zones">
            {ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="settings-block">
        <h3>Lock-screen pages</h3>
        <p className="form-hint">
          {pager.notifyPermission === 'granted'
            ? 'On. Pages show as notifications with an ACK button, even when this tab is in the background.'
            : pager.notifyPermission === 'denied'
              ? 'Blocked in this browser. Pages still beep and show on the pager here.'
              : pager.notifyPermission === 'unsupported'
                ? 'This browser has no notifications. Pages still beep and show on the pager here.'
                : 'Allow notifications so pages reach you outside this tab.'}
        </p>
        {pager.notifyPermission === 'default' && (
          <button type="button" className="btn" onClick={() => void pager.requestNotifications()}>
            Allow lock-screen pages
          </button>
        )}
        <p className="adapters">{pager.adapterSummary.join(' · ')}</p>
      </div>

      <div className="settings-block">
        <h3>Places</h3>
        <ul className="place-list">
          {places.map((p) => {
            const used = commitments.some((c) => c.placeId === p.id) || settings.homePlaceId === p.id;
            return (
              <li key={p.id}>
                <span>
                  <strong>{p.name}</strong> <span className="muted">{p.virtual ? 'no travel' : p.point ? p.address : `${p.address} (no coordinates: ${settings.defaultTravelMinutes} min assumed)`}</span>
                </span>
                <button type="button" className="btn btn--ghost" disabled={used} onClick={() => pager.removePlace(p.id)} aria-label={`Remove ${p.name}`}>
                  {used ? 'In use' : 'Remove'}
                </button>
              </li>
            );
          })}
        </ul>
        <PlaceForm pager={pager} />
      </div>

      <div className="settings-block">
        <h3>Start over</h3>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            if (window.confirm('Clear every commitment, place and stored page on this device?')) pager.reset();
          }}
        >
          Reset this pager
        </button>
      </div>
    </div>
  );
}
