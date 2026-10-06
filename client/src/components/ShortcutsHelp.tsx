import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import { Modal } from './ui/Modal';

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys} className="border-t border-terminal-border/60 first:border-0">
              <td className="py-1.5 pr-4">
                <kbd className="rounded border border-terminal-border bg-terminal-bg px-1.5 py-0.5 font-mono text-xs">{s.keys}</kbd>
              </td>
              <td className="py-1.5 text-terminal-muted">{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
