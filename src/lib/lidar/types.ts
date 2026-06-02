export type AnnotationClass = "car" | "pedestrian" | "cyclist" | "other";

export interface Keyframe {
  frame: number;
  center: [number, number, number];
  yaw: number;
}

export interface Annotation3D {
  id: string;
  label: AnnotationClass;
  // center in world space (x right, y up, z forward)
  center: [number, number, number];
  // half-extents
  size: [number, number, number];
  // yaw around Y in radians
  yaw: number;
  color: string;
  // Optional sparse keyframes for multi-frame interpolation.
  // When present, `center` and `yaw` are interpolated across frames.
  keyframes?: Keyframe[];
}

export const CLASS_COLORS: Record<AnnotationClass, string> = {
  car: "#22d3ee",
  pedestrian: "#f59e0b",
  cyclist: "#a855f7",
  other: "#ef4444",
};

export const CLASS_DEFAULT_SIZE: Record<AnnotationClass, [number, number, number]> = {
  car: [2.0, 0.8, 2.3],
  pedestrian: [0.4, 0.9, 0.4],
  cyclist: [0.6, 1.0, 1.0],
  other: [1.0, 1.0, 1.0],
};

/** Linearly interpolate yaw on the shorter angular path. */
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/**
 * Resolve an annotation's pose at a specific frame.
 * - 0 keyframes: returns the static pose.
 * - 1 keyframe: that pose for all frames.
 * - 2+ keyframes: linearly interpolated; clamped outside the range.
 */
export function getAnnotationAt(a: Annotation3D, frame: number): Annotation3D {
  const kf = a.keyframes;
  if (!kf || kf.length === 0) return a;
  if (kf.length === 1) {
    return { ...a, center: kf[0].center, yaw: kf[0].yaw };
  }
  const sorted = [...kf].sort((x, y) => x.frame - y.frame);
  if (frame <= sorted[0].frame) {
    return { ...a, center: sorted[0].center, yaw: sorted[0].yaw };
  }
  if (frame >= sorted[sorted.length - 1].frame) {
    const last = sorted[sorted.length - 1];
    return { ...a, center: last.center, yaw: last.yaw };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const k0 = sorted[i];
    const k1 = sorted[i + 1];
    if (frame >= k0.frame && frame <= k1.frame) {
      const t = (frame - k0.frame) / (k1.frame - k0.frame);
      const center: [number, number, number] = [
        k0.center[0] + (k1.center[0] - k0.center[0]) * t,
        k0.center[1] + (k1.center[1] - k0.center[1]) * t,
        k0.center[2] + (k1.center[2] - k0.center[2]) * t,
      ];
      return { ...a, center, yaw: lerpAngle(k0.yaw, k1.yaw, t) };
    }
  }
  return a;
}