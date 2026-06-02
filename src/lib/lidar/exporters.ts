import type { Annotation3D } from "./types";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(annotations: Annotation3D[]) {
  download(
    `annotations-${Date.now()}.json`,
    JSON.stringify(annotations, null, 2),
    "application/json",
  );
}

/**
 * KITTI label format (one space-separated line per object):
 * type truncated occluded alpha bbox(4) dim(h w l) loc(x y z) rotation_y
 * We don't have 2D bbox / occlusion, so they're set to placeholder values.
 */
export function exportKITTI(annotations: Annotation3D[]) {
  const typeMap: Record<string, string> = {
    car: "Car",
    pedestrian: "Pedestrian",
    cyclist: "Cyclist",
    other: "Misc",
  };
  const lines = annotations.map((a) => {
    const h = a.size[1] * 2;
    const w = a.size[0] * 2;
    const l = a.size[2] * 2;
    // Viewer (x-right, y-up, z-forward) -> KITTI cam (x-right, y-down, z-forward)
    const x = a.center[0];
    const y = -a.center[1];
    const z = a.center[2];
    const ry = -a.yaw;
    const alpha = Math.atan2(-x, z) + ry;
    return [
      typeMap[a.label] ?? "Misc",
      "0.00", "0", alpha.toFixed(2),
      "0.00", "0.00", "0.00", "0.00",
      h.toFixed(2), w.toFixed(2), l.toFixed(2),
      x.toFixed(2), y.toFixed(2), z.toFixed(2),
      ry.toFixed(2),
    ].join(" ");
  });
  download(`labels-kitti-${Date.now()}.txt`, lines.join("\n") + "\n", "text/plain");
}

/**
 * nuScenes-style sample_annotation JSON. Simplified (no token chain, no
 * attributes) but uses correct field names and a quaternion rotation.
 */
export function exportNuScenes(annotations: Annotation3D[]) {
  const out = annotations.map((a) => {
    const half = a.yaw / 2;
    return {
      token: a.id,
      category_name: `vehicle.${a.label}`,
      // nuScenes wlh = width(x), length(z), height(y) doubled
      size: [a.size[0] * 2, a.size[2] * 2, a.size[1] * 2],
      translation: [a.center[0], a.center[2], a.center[1]],
      rotation: [Math.cos(half), 0, 0, Math.sin(half)],
      num_lidar_pts: 0,
      num_radar_pts: 0,
      visibility_token: "",
    };
  });
  download(
    `annotations-nuscenes-${Date.now()}.json`,
    JSON.stringify(out, null, 2),
    "application/json",
  );
}