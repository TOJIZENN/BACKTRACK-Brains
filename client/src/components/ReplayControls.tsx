import { REPLAY_SPEEDS, type ReplaySpeed } from '../replay/replayEngine';
import type { ReplaySnapshot } from '../store/replaySession';
import { formatDateTimeUtc } from '../utils/format';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Spinner } from './ui/Spinner';

interface Props {
  snapshot: ReplaySnapshot;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReset: () => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
}

export function ReplayControls({ snapshot, onPlayPause, onNext, onPrevious, onReset, onSpeedChange }: Props) {
  const { replay, currentCandle, loadingMore, dataExhausted } = snapshot;
  const playing = replay.status === 'playing';
  const canAdvance = !replay.atEndOfData || loadingMore;
  const revealedCount = replay.maxRevealedIndex - replay.startIndex;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-terminal-border bg-terminal-panel px-4 py-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={onReset} title="Reset to start (R)" aria-label="Reset replay">
          <Icon name="reset" />
        </Button>
        <Button variant="ghost" onClick={onPrevious} disabled={replay.currentIndex === 0} title="Previous candle (←)" aria-label="Previous candle">
          <Icon name="previous" />
        </Button>
        <Button
          variant="primary"
          onClick={onPlayPause}
          disabled={!playing && !canAdvance}
          title="Play / Pause (Space)"
          aria-label={playing ? 'Pause' : 'Play'}
          className="w-20"
        >
          <Icon name={playing ? 'pause' : 'play'} />
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button variant="ghost" onClick={onNext} disabled={!canAdvance} title="Next candle (→)" aria-label="Next candle">
          <Icon name="next" />
        </Button>
      </div>

      <div className="flex items-center gap-1 rounded-md border border-terminal-border bg-terminal-bg p-0.5" role="radiogroup" aria-label="Replay speed">
        {REPLAY_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            role="radio"
            aria-checked={replay.speed === speed}
            onClick={() => onSpeedChange(speed)}
            className={`rounded px-2 py-0.5 font-mono text-xs ${replay.speed === speed ? 'bg-terminal-raised text-gold' : 'text-terminal-muted hover:text-terminal-text'}`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-4 text-xs">
        {loadingMore && <Spinner label="Loading more candles..." />}
        {dataExhausted && <span className="text-gold">End of available data</span>}
        {!replay.atLiveEdge && (
          <span className="rounded bg-gold/15 px-2 py-0.5 text-gold" title="Step forward to the latest revealed candle to trade">
            Reviewing — {replay.maxRevealedIndex - replay.currentIndex} candle(s) behind
          </span>
        )}
        <span className="text-terminal-muted">
          Bars replayed: <span className="font-mono text-terminal-text">{revealedCount}</span>
        </span>
        <span className="font-mono text-terminal-text" data-testid="current-candle-time">
          {formatDateTimeUtc(currentCandle.timestamp)}
        </span>
      </div>
    </div>
  );
}
