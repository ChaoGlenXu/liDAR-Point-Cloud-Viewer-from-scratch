interface Props {
  open: boolean;
  onClose: () => void;
}

const ROWS: Array<[string, string]> = [
  ["? / H", "Toggle this help"],
  ["1 / 2 / 3 / 4", "Pick class (car / ped / cyclist / other)"],
  ["Click ground", "Place box at cursor"],
  ["Esc", "Cancel placement / deselect"],
  ["Del / Backspace", "Delete selected box"],
  ["K", "Set keyframe at current frame on selected box"],
  ["Space", "Play / pause timeline"],
  ["← / →", "Step one frame"],
  ["Ctrl/Cmd + Z", "Undo"],
  ["Ctrl/Cmd + Shift + Z", "Redo"],
  ["Drag", "Orbit · scroll to zoom"],
];

export function ShortcutsOverlay({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Keyboard shortcuts</h3>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">
                    {k}
                  </kbd>
                </td>
                <td className="py-1.5 text-muted-foreground">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}