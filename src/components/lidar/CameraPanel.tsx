import { Stage, Layer, Rect, Line, Text, Group } from "react-konva";
import type { Annotation3D } from "@/lib/lidar/types";

interface Props {
  width: number;
  height: number;
  annotations: Annotation3D[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Project a 3D world point into 2D camera image coords using a pinhole
 * camera placed at the LiDAR origin, looking down +Z.
 */
function project(
  p: [number, number, number],
  w: number,
  h: number,
): { x: number; y: number; depth: number } | null {
  const [X, Y, Z] = p;
  const fov = (60 * Math.PI) / 180;
  const f = h / (2 * Math.tan(fov / 2));
  const cx = w / 2;
  const cy = h / 2;
  if (Z <= 0.5) return null;
  // camera y-up; image y is down
  const x = (X * f) / Z + cx;
  const y = (-Y * f) / Z + cy;
  return { x, y, depth: Z };
}

function boxCorners(a: Annotation3D): Array<[number, number, number]> {
  const [hx, hy, hz] = a.size;
  const [cx, cy, cz] = a.center;
  const cosY = Math.cos(a.yaw);
  const sinY = Math.sin(a.yaw);
  const signs: Array<[number, number, number]> = [
    [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
    [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
  ];
  return signs.map(([sx, sy, sz]) => {
    const lx = sx * hx;
    const ly = sy * hy;
    const lz = sz * hz;
    const wx = cosY * lx + sinY * lz + cx;
    const wz = -sinY * lx + cosY * lz + cz;
    const wy = ly + cy;
    return [wx, wy, wz];
  });
}

/** Synthesized 2D background: sky gradient + road + lane lines */
function Backdrop({ w, h }: { w: number; h: number }) {
  const horizon = h * 0.45;
  return (
    <Group>
      {/* sky */}
      <Rect x={0} y={0} width={w} height={horizon} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: 0, y: horizon }} fillLinearGradientColorStops={[0, "#1e293b", 1, "#475569"]} />
      {/* ground */}
      <Rect x={0} y={horizon} width={w} height={h - horizon} fillLinearGradientStartPoint={{ x: 0, y: horizon }} fillLinearGradientEndPoint={{ x: 0, y: h }} fillLinearGradientColorStops={[0, "#1f2937", 1, "#0f172a"]} />
      {/* road */}
      <Line
        points={[w * 0.35, horizon, w * 0.65, horizon, w * 0.95, h, w * 0.05, h]}
        closed
        fill="#111827"
      />
      {/* center lane */}
      {Array.from({ length: 6 }).map((_, i) => {
        const t1 = i / 6;
        const t2 = (i + 0.5) / 6;
        const x1 = w * 0.5;
        const y1 = horizon + (h - horizon) * t1;
        const x2 = w * 0.5;
        const y2 = horizon + (h - horizon) * t2;
        const widen = 1 + t1 * 6;
        return (
          <Line
            key={i}
            points={[x1, y1, x2, y2]}
            stroke="#fbbf24"
            strokeWidth={2 * widen}
            opacity={0.8}
          />
        );
      })}
    </Group>
  );
}

export function CameraPanel({ width, height, annotations, selectedId, onSelect }: Props) {
  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null);
      }}
    >
      <Layer listening={false}>
        <Backdrop w={width} h={height} />
      </Layer>
      <Layer>
        {annotations.map((a) => {
          const corners = boxCorners(a)
            .map((c) => project(c, width, height))
            .filter((p): p is { x: number; y: number; depth: number } => !!p);
          if (corners.length < 4) return null;
          const xs = corners.map((c) => c.x);
          const ys = corners.map((c) => c.y);
          const minX = Math.max(0, Math.min(...xs));
          const maxX = Math.min(width, Math.max(...xs));
          const minY = Math.max(0, Math.min(...ys));
          const maxY = Math.min(height, Math.max(...ys));
          if (maxX - minX < 2 || maxY - minY < 2) return null;
          const isSel = selectedId === a.id;
          return (
            <Group key={a.id} onMouseDown={() => onSelect(a.id)}>
              <Rect
                x={minX}
                y={minY}
                width={maxX - minX}
                height={maxY - minY}
                stroke={a.color}
                strokeWidth={isSel ? 3 : 1.5}
                dash={isSel ? undefined : [4, 4]}
                fill={a.color}
                opacity={isSel ? 0.9 : 0.7}
                fillEnabled={false}
              />
              <Rect
                x={minX}
                y={Math.max(0, minY - 18)}
                width={Math.min(120, a.label.length * 9 + 18)}
                height={16}
                fill={a.color}
                opacity={0.85}
                cornerRadius={3}
              />
              <Text
                x={minX + 5}
                y={Math.max(0, minY - 16)}
                text={a.label.toUpperCase()}
                fontSize={11}
                fontStyle="bold"
                fill="#0b0f1a"
              />
            </Group>
          );
        })}
      </Layer>
    </Stage>
  );
}
export default CameraPanel;