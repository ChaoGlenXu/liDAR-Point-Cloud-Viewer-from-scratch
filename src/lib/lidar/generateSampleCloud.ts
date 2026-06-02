// Procedurally generate a small LiDAR-like point cloud:
// - a noisy ground plane
// - a few car-shaped clusters
// - a couple of pedestrian clusters
// Returns Float32Array positions + Float32Array colors (intensity-based).

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export interface GeneratedCloud {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
}

export type SceneId = "urban_street" | "highway" | "intersection" | "parking_lot" | "tunnel";

export const SCENES: { id: SceneId; label: string; description: string }[] = [
  { id: "urban_street", label: "Urban street", description: "Two-lane road with parked cars and pedestrians" },
  { id: "highway", label: "Highway", description: "Multi-lane high-speed traffic, sparse returns at distance" },
  { id: "intersection", label: "4-way intersection", description: "Crosswalks, cyclists, mixed agents" },
  { id: "parking_lot", label: "Parking lot", description: "Grid of static vehicles" },
  { id: "tunnel", label: "Tunnel", description: "Enclosed walls, dense uniform returns" },
];

export function generateSampleCloud(seed = 7, scene: SceneId = "urban_street"): GeneratedCloud {
  return generateSampleCloudFrame(seed, scene, 0);
}

// Animated multi-frame variant. `frame` advances dynamic agents while static
// returns (ground, walls, stripes) stay deterministic via the seeded RNG.
export function generateSampleCloudFrame(
  seed = 7,
  scene: SceneId = "urban_street",
  frame = 0,
): GeneratedCloud {
  const r = rand(seed);
  const f = frame;
  const pts: number[] = [];
  const cols: number[] = [];

  const pushPoint = (x: number, y: number, z: number, intensity: number) => {
    pts.push(x, y, z);
    const t = Math.min(1, Math.max(0, intensity));
    const cr = 0.1 + 0.2 * t;
    const cg = 0.3 + 0.6 * t;
    const cb = 0.9 - 0.5 * t;
    cols.push(cr, cg, cb);
  };

  const ground = (radius: number, count: number, intensity = 0.18) => {
    for (let i = 0; i < count; i++) {
      const rad = Math.sqrt(r()) * radius;
      const theta = r() * Math.PI * 2;
      pushPoint(Math.cos(theta) * rad, -1.6 + (r() - 0.5) * 0.05, Math.sin(theta) * rad, intensity + r() * 0.08);
    }
  };

  const car = (cx: number, cz: number, yaw = 0, hx = 0.95, hy = 0.75, hz = 2.2, n = 700) => {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    for (let i = 0; i < n; i++) {
      const face = Math.floor(r() * 6);
      let lx = (r() * 2 - 1) * hx, ly = (r() * 2 - 1) * hy, lz = (r() * 2 - 1) * hz;
      if (face === 0) lx = hx; else if (face === 1) lx = -hx;
      else if (face === 2) ly = hy; else if (face === 3) ly = -hy;
      else if (face === 4) lz = hz; else lz = -hz;
      lx += (r() - 0.5) * 0.04; ly += (r() - 0.5) * 0.04; lz += (r() - 0.5) * 0.04;
      pushPoint(cosY * lx + sinY * lz + cx, ly + (-1.6 + hy), -sinY * lx + cosY * lz + cz, 0.55 + r() * 0.25);
    }
  };

  const ped = (px: number, pz: number, n = 220) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rad = 0.2 + r() * 0.05;
      pushPoint(px + Math.cos(a) * rad, -1.6 + r() * 1.8, pz + Math.sin(a) * rad, 0.7 + r() * 0.2);
    }
  };

  const cyclist = (px: number, pz: number, yaw = 0) => {
    // rider torso
    ped(px, pz, 180);
    // bike frame
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    for (let i = 0; i < 120; i++) {
      const lx = (r() - 0.5) * 0.1;
      const lz = (r() - 0.5) * 0.9;
      pushPoint(px + cosY * lx + sinY * lz, -1.4 + r() * 0.3, pz - sinY * lx + cosY * lz, 0.6);
    }
  };

  const wall = (x0: number, z0: number, x1: number, z1: number, height: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = r();
      const x = x0 + (x1 - x0) * t + (r() - 0.5) * 0.05;
      const z = z0 + (z1 - z0) * t + (r() - 0.5) * 0.05;
      const y = -1.6 + r() * height;
      pushPoint(x, y, z, 0.35 + r() * 0.2);
    }
  };

  const laneStripes = (lanes: number[], n = 1200, intensity = 0.9) => {
    for (let i = 0; i < n; i++) {
      const lane = lanes[Math.floor(r() * lanes.length)];
      pushPoint(lane + (r() - 0.5) * 0.15, -1.59, -25 + r() * 50, intensity);
    }
  };

  if (scene === "urban_street") {
    ground(30, 28000);
    laneStripes([-3.2, 0, 3.2]);
    [[3.5, 6], [-3.2, 10], [3.4, 18], [-3.3, 22], [0.2, -8]].forEach(([x, z], i) => {
      const dz = ((z + f * (0.4 + i * 0.05) + 40) % 50) - 25;
      car(x, dz, (r() - 0.5) * 0.2);
    });
    [[1.2, 4], [-1.4, 12], [5.5, 14]].forEach(([x, z], i) => {
      ped(x + Math.sin(f * 0.2 + i) * 0.3, z + ((f * 0.1) % 4));
    });
    wall(-12, -28, -12, 28, 8, 2000);
    wall(12, -28, 12, 28, 8, 2000);
  } else if (scene === "highway") {
    ground(45, 36000, 0.14);
    laneStripes([-6, -2, 2, 6], 1800);
    for (let i = 0; i < 14; i++) {
      const lane = [-6, -2, 2, 6][Math.floor(r() * 4)];
      const z = ((-40 + r() * 80 + f * 1.5 + 80) % 80) - 40;
      car(lane, z, 0);
    }
    // jersey barriers
    wall(-9, -45, -9, 45, 1.2, 2500);
    wall(9, -45, 9, 45, 1.2, 2500);
  } else if (scene === "intersection") {
    ground(35, 32000);
    // crosswalk stripes north/south + east/west
    for (let i = 0; i < 800; i++) {
      const a = Math.floor(r() * 6) - 2.5;
      pushPoint(a * 0.6, -1.59, -6 + (r() - 0.5) * 0.4, 0.95);
      pushPoint(a * 0.6, -1.59, 6 + (r() - 0.5) * 0.4, 0.95);
      pushPoint(-6 + (r() - 0.5) * 0.4, -1.59, a * 0.6, 0.95);
      pushPoint(6 + (r() - 0.5) * 0.4, -1.59, a * 0.6, 0.95);
    }
    car(-3, ((12 - f * 0.5 + 40) % 40) - 20, 0);
    car(3, ((-10 + f * 0.5 + 40) % 40) - 20, Math.PI);
    car(((12 - f * 0.5 + 40) % 40) - 20, 3, Math.PI / 2);
    car(((-10 + f * 0.5 + 40) % 40) - 20, -3, -Math.PI / 2);
    cyclist(-1, ((2 + f * 0.2 + 20) % 20) - 10, 0);
    cyclist(((8 + f * 0.2 + 20) % 20) - 10, -1, Math.PI / 2);
    [[5, 5], [-4, -5], [0, 7]].forEach(([x, z], i) => ped(x + Math.sin(f * 0.15 + i) * 0.4, z));
    // corner buildings
    wall(-25, -8, -8, -8, 9, 1500);
    wall(8, -8, 25, -8, 9, 1500);
    wall(-25, 8, -8, 8, 9, 1500);
    wall(8, 8, 25, 8, 9, 1500);
  } else if (scene === "parking_lot") {
    ground(30, 24000, 0.2);
    // grid of cars
    for (let row = -2; row <= 2; row++) {
      for (let col = -3; col <= 3; col++) {
        if (r() < 0.85) car(col * 3, row * 6, 0);
      }
    }
    // painted spot lines
    for (let i = 0; i < 1500; i++) {
      const col = (Math.floor(r() * 7) - 3) * 3 + 1.5;
      pushPoint(col + (r() - 0.5) * 0.1, -1.59, -14 + r() * 28, 0.85);
    }
  } else if (scene === "tunnel") {
    ground(30, 22000, 0.25);
    // curved tunnel ceiling
    for (let i = 0; i < 8000; i++) {
      const z = -30 + r() * 60;
      const a = (r() - 0.5) * Math.PI * 0.9;
      const radius = 6;
      const x = Math.sin(a) * radius;
      const y = -1.6 + Math.cos(a) * radius + 1;
      pushPoint(x, y, z, 0.4 + r() * 0.3);
    }
    car(0, 8, 0);
    car(0, -6, 0);
    // overhead lights (bright)
    for (let i = 0; i < 200; i++) {
      const z = -28 + Math.floor(r() * 14) * 4;
      pushPoint((r() - 0.5) * 0.6, 4.5, z, 1);
    }
  }

  return {
    positions: new Float32Array(pts),
    colors: new Float32Array(cols),
    count: pts.length / 3,
  };
}