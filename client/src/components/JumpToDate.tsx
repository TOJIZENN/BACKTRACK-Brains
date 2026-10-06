import { useState } from 'react';
import { startMsFrom } from '../utils/setupForm';
import { Button } from './ui/Button';
import { Field, inputClass } from './ui/Field';
import { Modal } from './ui/Modal';

interface Props {
  initialMs: number;
  hasOpenTrades: boolean;
  onJump: (startMs: number) => void;
  onClose: () => void;
}

export function JumpToDate({ initialMs, hasOpenTrades, onJump, onClose }: Props) {
  const iso = new Date(initialMs).toISOString();
  const [date, setDate] = useState(iso.slice(0, 10));
  const [time, setTime] = useState(iso.slice(11, 16));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const ms = startMsFrom(date, time);
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
        <p className="text-gold">Close your open positions before jumping to another period.</p>
      ) : (
        <>
          <p className="mb-4 text-terminal-muted">
            Loads a new replay starting at this time. Your balance and trade history carry over.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date (UTC)" htmlFor="jump-date" error={error}>
              <input id="jump-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time (UTC)" htmlFor="jump-time">
              <input id="jump-time" type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        </>
      )}
    </Modal>
  );
}
