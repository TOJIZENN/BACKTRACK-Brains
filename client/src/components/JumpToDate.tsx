import { useState } from 'react';
import { startMsFrom } from '../utils/setupForm';
import { timeZoneShort, toWallClock } from '../utils/timezone';
import { Button } from './ui/Button';
import { Field, inputClass } from './ui/Field';
import { Modal } from './ui/Modal';

interface Props {
  initialMs: number;
  timeZone: string;
  hasOpenTrades: boolean;
  onJump: (startMs: number) => void;
  onClose: () => void;
}

export function JumpToDate({ initialMs, timeZone, hasOpenTrades, onJump, onClose }: Props) {
  const initial = toWallClock(initialMs, timeZone);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const zone = timeZoneShort(timeZone);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const ms = startMsFrom(date, time, timeZone);
    if (Number.isNaN(ms)) return setError('Choose a valid date and time.');
    if (ms >= Date.now()) return setError('The start must be in the past.');
    onJump(ms);
  };

  return (
    <Modal
      title="Jump to date"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={hasOpenTrades}>
            Jump
          </Button>
        </>
      }
    >
      {hasOpenTrades ? (
        <p className="text-warn">Close your open positions before jumping to another period.</p>
      ) : (
        <>
          <p className="mb-4 text-terminal-muted">
            Loads a new replay starting at this time. Your balance and trade history carry over.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Date (${zone})`} htmlFor="jump-date" error={error}>
              <input id="jump-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={`Time (${zone})`} htmlFor="jump-time">
              <input id="jump-time" type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        </>
      )}
    </Modal>
  );
}
