import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Annotation3D, AnnotationClass } from "@/lib/lidar/types";
import { CLASS_COLORS, getAnnotationAt } from "@/lib/lidar/types";
import { SCENES, type SceneId, type GeneratedCloud } from "@/lib/lidar/generateSampleCloud";
import { useResizeObserver } from "@/hooks/use-resize-observer";
import { parseCloudFile } from "@/lib/lidar/parsers";
import { exportJSON, exportKITTI, exportNuScenes } from "@/lib/lidar/exporters";
import { ShortcutsOverlay } from "@/components/lidar/ShortcutsOverlay";

const PointCloudViewer = lazy(() =>
  import("@/components/lidar/PointCloudViewer").then((m) => ({ default: m.PointCloudViewer })),
);
const CameraPanel = lazy(() =>
  import("@/components/lidar/CameraPanel").then((m) => ({ default: m.CameraPanel })),
);
type ColorMode = "intensity" | "height" | "depth";
const FRAME_COUNT = 60;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LiDAR Annotator — 3D Point Cloud Labeling" },
      { name: "description", content: "Annotate 3D LiDAR point clouds with synced 2D camera projections. Built with Three.js, React Three Fiber, and Konva." },
      { property: "og:title", content: "LiDAR Annotator" },
      { property: "og:description", content: "3D point cloud labeling tool with synced 2D camera view." },
    ],
  }),
  component: Index,
});

const CLASSES: AnnotationClass[] = ["car", "pedestrian", "cyclist", "other"];
const STORAGE_KEY = "lidar-annotations-v1";

function Index() {
  const [mounted, setMounted] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation3D[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<AnnotationClass | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [pointSize, setPointSize] = useState(0.05);
  const [scene, setScene] = useState<SceneId>("urban_street");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("intensity");
  const [decimation, setDecimation] = useState(1);
  const [hideGround, setHideGround] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [externalCloud, setExternalCloud] = useState<GeneratedCloud | null>(null);
  const [externalName, setExternalName] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const undoStack = useRef<Annotation3D[][]>([]);
  const redoStack = useRef<Annotation3D[][]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ref: panelRef, size } = useResizeObserver<HTMLDivElement>();
  const onPointCount = useCallback((n: number) => setPointCount(n), []);

  const commit = useCallback((updater: (prev: Annotation3D[]) => Annotation3D[]) => {
    setAnnotations((prev) => {
      const next = updater(prev);
      if (next !== prev) {
        undoStack.current.push(prev);
        if (undoStack.current.length > 100) undoStack.current.shift();
        redoStack.current = [];
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setAnnotations((prev) => {
      const last = undoStack.current.pop();
      if (!last) return prev;
      redoStack.current.push(prev);
      return last;
    });
  }, []);

  const redo = useCallback(() => {
    setAnnotations((prev) => {
      const next = redoStack.current.pop();
      if (!next) return prev;
      undoStack.current.push(prev);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(
      () => setFrame((f) => (f + 1) % FRAME_COUNT),
      100,
    );
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setAnnotations(JSON.parse(raw));
    } catch {}
    // ensure dark theme tokens
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    } catch {}
  }, [annotations]);

  // keyboard: delete to remove selected, esc to cancel placing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        setPlacing(null);
        setSelectedId(null);
        setShowHelp(false);
        setShowExport(false);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        commit((a) => a.filter((x) => x.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "?" || e.key.toLowerCase() === "h") setShowHelp((s) => !s);
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === "ArrowRight") setFrame((f) => (f + 1) % FRAME_COUNT);
      if (e.key === "ArrowLeft") setFrame((f) => (f - 1 + FRAME_COUNT) % FRAME_COUNT);
      if (e.key === "1") setPlacing("car");
      if (e.key === "2") setPlacing("pedestrian");
      if (e.key === "3") setPlacing("cyclist");
      if (e.key === "4") setPlacing("other");
      if (e.key.toLowerCase() === "k" && selectedId) {
        commit((all) =>
          all.map((a) => {
            if (a.id !== selectedId) return a;
            const pose = getAnnotationAt(a, frame);
            const next = (a.keyframes ?? []).filter((k) => k.frame !== frame);
            next.push({ frame, center: pose.center, yaw: pose.yaw });
            next.sort((x, y) => x.frame - y.frame);
            return { ...a, keyframes: next };
          }),
        );
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, frame, commit, undo, redo]);

  const selected = useMemo(
    () => annotations.find((a) => a.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const updateSelected = (patch: Partial<Annotation3D>) => {
    if (!selectedId) return;
    commit((all) =>
      all.map((a) => (a.id === selectedId ? { ...a, ...patch } : a)),
    );
  };

  const handleFile = async (file: File) => {
    setLoadError(null);
    try {
      const cloud = await parseCloudFile(file);
      setExternalCloud(cloud);
      setExternalName(file.name);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to parse file");
      setTimeout(() => setLoadError(null), 4000);
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            LiDAR Annotator
          </h1>
          <p className="text-xs text-muted-foreground">
            3D point cloud · KITTI/PCD import · multi-frame interpolation · KITTI/nuScenes export
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pcd,.bin,.ply"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent"
            title="Load .pcd, .bin (KITTI), or .ply"
          >
            Load cloud
          </button>
          {externalCloud && (
            <button
              onClick={() => { setExternalCloud(null); setExternalName(null); }}
              className="text-xs px-2 py-1.5 rounded border border-border hover:bg-accent text-muted-foreground max-w-[140px] truncate"
              title="Return to synthetic scenes"
            >
              ✕ {externalName}
            </button>
          )}
          <button
            onClick={undo}
            className="text-xs px-2 py-1.5 rounded border border-border hover:bg-accent"
            title="Undo (Ctrl+Z)"
          >↶</button>
          <button
            onClick={redo}
            className="text-xs px-2 py-1.5 rounded border border-border hover:bg-accent"
            title="Redo (Ctrl+Shift+Z)"
          >↷</button>
          <div className="relative">
            <button
              onClick={() => setShowExport((s) => !s)}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent"
            >Export ▾</button>
            {showExport && (
              <div
                className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-md shadow-lg min-w-[180px] py-1"
                onMouseLeave={() => setShowExport(false)}
              >
                {[
                  { label: "JSON (native)", fn: () => exportJSON(annotations) },
                  { label: "KITTI labels (.txt)", fn: () => exportKITTI(annotations) },
                  { label: "nuScenes (.json)", fn: () => exportNuScenes(annotations) },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => { opt.fn(); setShowExport(false); }}
                    className="w-full text-left text-xs px-3 py-1.5 hover:bg-accent"
                  >{opt.label}</button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              if (confirm("Clear all annotations?")) commit(() => []);
            }}
            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-accent"
          >Clear</button>
          <button
            onClick={() => setShowHelp(true)}
            className="text-xs px-2 py-1.5 rounded border border-border hover:bg-accent"
            title="Keyboard shortcuts"
          >?</button>
          <label className="text-xs flex items-center gap-1">
            <input
              type="checkbox"
              checked={showStats}
              onChange={(e) => setShowStats(e.target.checked)}
            />
            FPS
          </label>
        </div>
      </header>
      {loadError && (
        <div className="bg-destructive/20 border-b border-destructive/40 text-destructive text-xs px-4 py-2">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0 h-[calc(100vh-57px)]">
        <div className="grid grid-rows-[1fr_280px] min-h-0">
          {/* 3D viewer */}
          <div className="relative border-b border-border min-h-0">
            {mounted ? (
              <Suspense
                fallback={
                  <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                    Loading 3D viewer…
                  </div>
                }
              >
                <PointCloudViewer
                  annotations={annotations}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAdd={(a) => {
                    commit((all) => [...all, a]);
                    setSelectedId(a.id);
                    setPlacing(null);
                  }}
                  placingClass={placing}
                  showStats={showStats}
                  pointSize={pointSize}
                  scene={scene}
                  frame={frame}
                  colorMode={colorMode}
                  decimation={decimation}
                  hideGround={hideGround}
                  onPointCount={onPointCount}
                  externalCloud={externalCloud}
                />
              </Suspense>
            ) : null}

            {/* class toolbar */}
            <div className="absolute top-3 left-3 flex flex-col gap-1 bg-card/80 backdrop-blur rounded-md border border-border p-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                Place box
              </span>
              {CLASSES.map((c) => (
                <button
                  key={c}
                  onClick={() => setPlacing(placing === c ? null : c)}
                  className={`text-xs px-2 py-1 rounded flex items-center gap-2 ${
                    placing === c
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm"
                    style={{ background: CLASS_COLORS[c] }}
                  />
                  {c}
                </button>
              ))}
              {placing && (
                <p className="text-[10px] text-muted-foreground px-1 pt-1 max-w-[120px]">
                  Click on the ground to place. Esc to cancel.
                </p>
              )}
            </div>

            {/* scene picker */}
            <div className="absolute top-3 right-3 bg-card/80 backdrop-blur rounded-md border border-border p-2 text-xs max-w-[200px]">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1 px-1">
                {externalCloud ? "Loaded cloud" : "Scene"}
              </span>
              {externalCloud ? (
                <p className="text-[10px] text-muted-foreground px-1 truncate" title={externalName ?? ""}>
                  {externalName} · {externalCloud.count.toLocaleString()} pts
                </p>
              ) : (
                <>
                  <select
                    value={scene}
                    onChange={(e) => setScene(e.target.value as SceneId)}
                    className="w-full bg-background border border-input rounded px-2 py-1 text-xs"
                  >
                    {SCENES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1 px-1">
                    {SCENES.find((s) => s.id === scene)?.description}
                  </p>
                </>
              )}
              <div className="border-t border-border mt-2 pt-2 space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                  Color by
                </label>
                <div className="flex gap-1">
                  {(["intensity", "height", "depth"] as ColorMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setColorMode(m)}
                      className={`flex-1 px-1.5 py-1 rounded text-[10px] border ${
                        colorMode === m
                          ? "bg-accent border-accent text-accent-foreground"
                          : "border-border hover:bg-accent/50"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-muted-foreground">Decimate</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={decimation}
                    onChange={(e) => setDecimation(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="tabular-nums w-8 text-right">
                    {Math.round(decimation * 100)}%
                  </span>
                </label>
                <label className="flex items-center gap-2 text-[10px]">
                  <input
                    type="checkbox"
                    checked={hideGround}
                    onChange={(e) => setHideGround(e.target.checked)}
                  />
                  <span className="text-muted-foreground">Remove ground plane</span>
                </label>
              </div>
            </div>

            {/* perf HUD */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur rounded-md border border-border px-3 py-1.5 text-[10px] flex items-center gap-3">
              <span className="text-muted-foreground">Points rendered</span>
              <span className="tabular-nums font-medium">
                {pointCount.toLocaleString()}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">Frame</span>
              <span className="tabular-nums font-medium">
                {frame.toString().padStart(2, "0")}/{FRAME_COUNT - 1}
              </span>
            </div>

            <div className="absolute bottom-3 left-3 bg-card/80 backdrop-blur rounded-md border border-border p-2 text-xs flex items-center gap-2">
              <label className="text-muted-foreground">Point size</label>
              <input
                type="range"
                min={0.01}
                max={0.2}
                step={0.005}
                value={pointSize}
                onChange={(e) => setPointSize(parseFloat(e.target.value))}
              />
              <span className="tabular-nums w-10 text-right">
                {pointSize.toFixed(3)}
              </span>
            </div>

            {/* timeline scrubber */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur rounded-md border border-border p-2 text-xs flex items-center gap-2 w-[420px] max-w-[60%]">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="px-2 py-0.5 rounded border border-border hover:bg-accent text-[11px] w-14"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <input
                type="range"
                min={0}
                max={FRAME_COUNT - 1}
                step={1}
                value={frame}
                onChange={(e) => setFrame(parseInt(e.target.value, 10))}
                className="flex-1"
              />
              <span className="tabular-nums w-12 text-right text-muted-foreground">
                t={(frame * 0.1).toFixed(1)}s
              </span>
            </div>
          </div>

          {/* 2D camera */}
          <div ref={panelRef} className="relative bg-black min-h-0 overflow-hidden">
            <div className="absolute top-2 left-2 z-10 text-[10px] uppercase tracking-wider text-muted-foreground bg-card/70 backdrop-blur px-2 py-1 rounded">
              Camera 0 · synced projection
            </div>
            {mounted && size.width > 0 && size.height > 0 && (
              <Suspense fallback={null}>
              <CameraPanel
                width={size.width}
                height={size.height}
                annotations={annotations}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
              </Suspense>
            )}
          </div>
        </div>

        {/* Side panel */}
        <aside className="border-l border-border flex flex-col min-h-0">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-medium">
              Annotations{" "}
              <span className="text-muted-foreground">({annotations.length})</span>
            </h2>
          </div>
          <div className="flex-1 overflow-auto">
            {annotations.length === 0 && (
              <div className="p-4 text-xs text-muted-foreground">
                No annotations yet. Pick a class on the left, then click on the
                ground in the 3D scene to place a box.
              </div>
            )}
            <ul>
              {annotations.map((a) => (
                <li
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`px-3 py-2 border-b border-border cursor-pointer text-xs flex items-center gap-2 ${
                    selectedId === a.id ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: a.color }}
                  />
                  <span className="font-medium">{a.label}</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    ({a.center[0].toFixed(1)}, {a.center[2].toFixed(1)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {selected && (
            <div className="border-t border-border p-3 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">Selected: {selected.label}</span>
                <button
                  onClick={() => {
                    commit((all) =>
                      all.filter((x) => x.id !== selected.id),
                    );
                    setSelectedId(null);
                  }}
                  className="text-destructive hover:underline"
                >
                  Delete
                </button>
              </div>
              {(["x", "y", "z"] as const).map((axis, i) => (
                <NumberRow
                  key={`c${axis}`}
                  label={`center.${axis}`}
                  value={selected.center[i]}
                  step={0.1}
                  onChange={(v) => {
                    const next = [...selected.center] as [number, number, number];
                    next[i] = v;
                    updateSelected({ center: next });
                  }}
                />
              ))}
              {(["x", "y", "z"] as const).map((axis, i) => (
                <NumberRow
                  key={`s${axis}`}
                  label={`half-size.${axis}`}
                  value={selected.size[i]}
                  step={0.05}
                  min={0.05}
                  onChange={(v) => {
                    const next = [...selected.size] as [number, number, number];
                    next[i] = Math.max(0.05, v);
                    updateSelected({ size: next });
                  }}
                />
              ))}
              <NumberRow
                label="yaw (rad)"
                value={selected.yaw}
                step={0.05}
                onChange={(v) => updateSelected({ yaw: v })}
              />
              <div className="border-t border-border pt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    Keyframes
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {selected.keyframes?.length ?? 0}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      const pose = getAnnotationAt(selected, frame);
                      commit((all) =>
                        all.map((a) => {
                          if (a.id !== selected.id) return a;
                          const next = (a.keyframes ?? []).filter((k) => k.frame !== frame);
                          next.push({ frame, center: pose.center, yaw: pose.yaw });
                          next.sort((x, y) => x.frame - y.frame);
                          return { ...a, keyframes: next };
                        }),
                      );
                    }}
                    className="flex-1 text-[11px] px-2 py-1 rounded border border-border hover:bg-accent"
                    title="Press K"
                  >
                    Set @ frame {frame}
                  </button>
                  {selected.keyframes && selected.keyframes.length > 0 && (
                    <button
                      onClick={() =>
                        commit((all) =>
                          all.map((a) =>
                            a.id === selected.id ? { ...a, keyframes: undefined } : a,
                          ),
                        )
                      }
                      className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent text-muted-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {selected.keyframes && selected.keyframes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.keyframes.map((k) => (
                      <button
                        key={k.frame}
                        onClick={() => setFrame(k.frame)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border tabular-nums ${
                          k.frame === frame ? "bg-accent border-accent" : "border-border hover:bg-accent/50"
                        }`}
                      >
                        {k.frame}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="border-t border-border p-3 text-[10px] text-muted-foreground space-y-1">
            <p>Press <kbd className="px-1 py-0.5 bg-muted border border-border rounded">?</kbd> for keyboard shortcuts</p>
          </div>
        </aside>
      </div>
      <ShortcutsOverlay open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

function NumberRow({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 bg-background border border-input rounded px-2 py-1 text-right tabular-nums"
      />
    </label>
  );
}
