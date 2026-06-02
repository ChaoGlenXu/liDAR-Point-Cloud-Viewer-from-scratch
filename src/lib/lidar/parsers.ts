import type { GeneratedCloud } from "./generateSampleCloud";

/**
 * Parse a KITTI raw LiDAR .bin file: tightly packed Float32[x, y, z, intensity].
 * KITTI is in vehicle frame (x-forward, y-left, z-up); we remap to our viewer
 * frame (x-right, y-up, z-forward) so it lines up with the synthetic clouds.
 */
export function parseKittiBin(buf: ArrayBuffer): GeneratedCloud {
  const f32 = new Float32Array(buf);
  const count = Math.floor(f32.length / 4);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const kx = f32[i * 4];
    const ky = f32[i * 4 + 1];
    const kz = f32[i * 4 + 2];
    const intensity = Math.min(1, Math.max(0, f32[i * 4 + 3]));
    // KITTI x-forward, y-left, z-up  ->  viewer x-right, y-up, z-forward
    const x = -ky;
    const y = kz;
    const z = kx;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    colors[i * 3] = 0.1 + 0.2 * intensity;
    colors[i * 3 + 1] = 0.3 + 0.6 * intensity;
    colors[i * 3 + 2] = 0.9 - 0.5 * intensity;
  }
  return { positions, colors, count };
}

/**
 * Parse a PCD file (ASCII or uncompressed binary). Supports x/y/z and optional
 * intensity/rgb fields. Binary_compressed (LZF) is not supported — we throw
 * with a clear message so the caller can show a toast.
 */
export function parsePCD(buf: ArrayBuffer): GeneratedCloud {
  const bytes = new Uint8Array(buf);
  // Find header end (\nDATA <type>\n)
  let headerEnd = -1;
  for (let i = 0; i < bytes.length - 5; i++) {
    if (
      bytes[i] === 0x44 && // D
      bytes[i + 1] === 0x41 && // A
      bytes[i + 2] === 0x54 && // T
      bytes[i + 3] === 0x41 && // A
      bytes[i + 4] === 0x20 // space
    ) {
      const nl = bytes.indexOf(0x0a, i);
      if (nl > 0) {
        headerEnd = nl + 1;
        break;
      }
    }
  }
  if (headerEnd < 0) throw new Error("PCD: header not found");
  const headerText = new TextDecoder().decode(bytes.subarray(0, headerEnd));
  const lines = headerText.split(/\r?\n/);
  const get = (key: string) =>
    lines.find((l) => l.toUpperCase().startsWith(key + " "))?.split(/\s+/).slice(1) ?? [];
  const fields = get("FIELDS");
  const sizes = get("SIZE").map(Number);
  const types = get("TYPE");
  const counts = get("COUNT").map(Number);
  const points = parseInt(get("POINTS")[0] ?? "0", 10);
  const data = (get("DATA")[0] ?? "ascii").toLowerCase();
  if (data === "binary_compressed") {
    throw new Error("PCD: binary_compressed (LZF) is not supported");
  }
  const xi = fields.indexOf("x");
  const yi = fields.indexOf("y");
  const zi = fields.indexOf("z");
  if (xi < 0 || yi < 0 || zi < 0) throw new Error("PCD: missing x/y/z fields");
  const ii = fields.indexOf("intensity");
  const rgbi = fields.indexOf("rgb");

  const positions = new Float32Array(points * 3);
  const colors = new Float32Array(points * 3);

  if (data === "ascii") {
    const text = new TextDecoder().decode(bytes.subarray(headerEnd));
    const rows = text.split(/\r?\n/);
    let p = 0;
    for (const row of rows) {
      if (!row.trim()) continue;
      const toks = row.trim().split(/\s+/);
      if (toks.length < fields.length) continue;
      writePoint(
        positions, colors, p,
        parseFloat(toks[xi]), parseFloat(toks[yi]), parseFloat(toks[zi]),
        ii >= 0 ? parseFloat(toks[ii]) : 0.5,
        rgbi >= 0 ? parseFloat(toks[rgbi]) : NaN,
      );
      p++;
      if (p >= points) break;
    }
    return { positions, colors, count: p };
  }

  // binary
  const offsets: number[] = [];
  let off = 0;
  for (let i = 0; i < fields.length; i++) {
    offsets.push(off);
    off += (sizes[i] || 4) * (counts[i] || 1);
  }
  const stride = off;
  const dv = new DataView(buf, headerEnd);
  const readField = (rowOff: number, fi: number) => {
    const o = rowOff + offsets[fi];
    const t = types[fi]?.toUpperCase();
    const s = sizes[fi];
    if (t === "F" && s === 4) return dv.getFloat32(o, true);
    if (t === "F" && s === 8) return dv.getFloat64(o, true);
    if (t === "U" && s === 1) return dv.getUint8(o);
    if (t === "U" && s === 2) return dv.getUint16(o, true);
    if (t === "U" && s === 4) return dv.getUint32(o, true);
    if (t === "I" && s === 4) return dv.getInt32(o, true);
    return 0;
  };
  let written = 0;
  for (let p = 0; p < points; p++) {
    const rowOff = p * stride;
    if (rowOff + stride > dv.byteLength) break;
    writePoint(
      positions, colors, written,
      readField(rowOff, xi), readField(rowOff, yi), readField(rowOff, zi),
      ii >= 0 ? readField(rowOff, ii) : 0.5,
      rgbi >= 0 ? readField(rowOff, rgbi) : NaN,
    );
    written++;
  }
  return { positions, colors, count: written };
}

function writePoint(
  positions: Float32Array,
  colors: Float32Array,
  i: number,
  x: number, y: number, z: number,
  intensity: number,
  rgb: number,
) {
  // Remap from common z-up sensor frame to viewer (y-up, z-forward).
  positions[i * 3] = -y;
  positions[i * 3 + 1] = z;
  positions[i * 3 + 2] = x;
  if (!Number.isNaN(rgb)) {
    const u32 = new Uint32Array([rgb >>> 0]);
    const b = new Uint8Array(u32.buffer);
    colors[i * 3] = b[2] / 255;
    colors[i * 3 + 1] = b[1] / 255;
    colors[i * 3 + 2] = b[0] / 255;
    return;
  }
  const t = Math.min(1, Math.max(0, intensity > 1 ? intensity / 255 : intensity));
  colors[i * 3] = 0.1 + 0.2 * t;
  colors[i * 3 + 1] = 0.3 + 0.6 * t;
  colors[i * 3 + 2] = 0.9 - 0.5 * t;
}

/** Minimal ASCII .ply parser supporting `element vertex N` with x/y/z (+ optional intensity, r/g/b). */
export function parsePLYAscii(buf: ArrayBuffer): GeneratedCloud {
  const text = new TextDecoder().decode(new Uint8Array(buf));
  const lines = text.split(/\r?\n/);
  let vertexCount = 0;
  const fields: string[] = [];
  let headerEnd = -1;
  let inVertex = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("element vertex")) {
      vertexCount = parseInt(l.split(/\s+/)[2], 10);
      inVertex = true;
    } else if (l.startsWith("element ")) {
      inVertex = false;
    } else if (l.startsWith("property") && inVertex) {
      fields.push(l.split(/\s+/).pop()!);
    } else if (l === "end_header") {
      headerEnd = i + 1;
      break;
    }
  }
  if (headerEnd < 0) throw new Error("PLY: header not found");
  const xi = fields.indexOf("x");
  const yi = fields.indexOf("y");
  const zi = fields.indexOf("z");
  if (xi < 0 || yi < 0 || zi < 0) throw new Error("PLY: missing x/y/z");
  const ri = fields.indexOf("red");
  const gi = fields.indexOf("green");
  const bi = fields.indexOf("blue");
  const ii = fields.indexOf("intensity");
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  let p = 0;
  for (let i = headerEnd; i < lines.length && p < vertexCount; i++) {
    const toks = lines[i].trim().split(/\s+/);
    if (toks.length < fields.length) continue;
    const x = parseFloat(toks[xi]);
    const y = parseFloat(toks[yi]);
    const z = parseFloat(toks[zi]);
    positions[p * 3] = -y;
    positions[p * 3 + 1] = z;
    positions[p * 3 + 2] = x;
    if (ri >= 0 && gi >= 0 && bi >= 0) {
      colors[p * 3] = parseFloat(toks[ri]) / 255;
      colors[p * 3 + 1] = parseFloat(toks[gi]) / 255;
      colors[p * 3 + 2] = parseFloat(toks[bi]) / 255;
    } else {
      const t = ii >= 0 ? parseFloat(toks[ii]) / 255 : 0.5;
      colors[p * 3] = 0.1 + 0.2 * t;
      colors[p * 3 + 1] = 0.3 + 0.6 * t;
      colors[p * 3 + 2] = 0.9 - 0.5 * t;
    }
    p++;
  }
  return { positions, colors, count: p };
}

export async function parseCloudFile(file: File): Promise<GeneratedCloud> {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith(".bin")) return parseKittiBin(buf);
  if (name.endsWith(".pcd")) return parsePCD(buf);
  if (name.endsWith(".ply")) return parsePLYAscii(buf);
  throw new Error(`Unsupported format: ${file.name}`);
}