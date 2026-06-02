import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, Stats, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { generateSampleCloudFrame } from "@/lib/lidar/generateSampleCloud";
import type { GeneratedCloud, SceneId } from "@/lib/lidar/generateSampleCloud";
import type { Annotation3D, AnnotationClass } from "@/lib/lidar/types";
import { CLASS_COLORS, CLASS_DEFAULT_SIZE, getAnnotationAt } from "@/lib/lidar/types";

export type ColorMode = "intensity" | "height" | "depth";

interface Props {
  annotations: Annotation3D[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (a: Annotation3D) => void;
  placingClass: AnnotationClass | null;
  showStats: boolean;
  pointSize: number;
  scene: SceneId;
  frame: number;
  colorMode: ColorMode;
  decimation: number;
  hideGround: boolean;
  onPointCount: (n: number) => void;
  externalCloud?: GeneratedCloud | null;
}

function PointCloud({
  onGroundClick,
  scene,
  frame,
  colorMode,
  decimation,
  hideGround,
  onPointCount,
  externalCloud,
}: {
  onGroundClick: (p: THREE.Vector3) => void;
  scene: SceneId;
  frame: number;
  colorMode: ColorMode;
  decimation: number;
  hideGround: boolean;
  onPointCount: (n: number) => void;
  externalCloud?: GeneratedCloud | null;
}) {
  const cloud = useMemo(
    () => externalCloud ?? generateSampleCloudFrame(7, scene, frame),
    [scene, frame, externalCloud],
  );

  const geometry = useMemo(() => {
    const src = cloud.positions;
    const srcCol = cloud.colors;
    const stride = Math.max(1, Math.round(1 / Math.max(0.01, decimation)));
    const keepIdx: number[] = [];
    for (let i = 0; i < cloud.count; i++) {
      if (i % stride !== 0) continue;
      const y = src[i * 3 + 1];
      if (hideGround && y < -1.55 && y > -1.65) continue;
      keepIdx.push(i);
    }
    const n = keepIdx.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < n; k++) {
      const y = src[keepIdx[k] * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const rangeY = Math.max(0.001, maxY - minY);
    for (let k = 0; k < n; k++) {
      const i = keepIdx[k];
      const x = src[i * 3];
      const y = src[i * 3 + 1];
      const z = src[i * 3 + 2];
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      if (colorMode === "intensity") {
        col[k * 3] = srcCol[i * 3];
        col[k * 3 + 1] = srcCol[i * 3 + 1];
        col[k * 3 + 2] = srcCol[i * 3 + 2];
      } else if (colorMode === "height") {
        const t = (y - minY) / rangeY;
        col[k * 3] = t;
        col[k * 3 + 1] = 1 - Math.abs(0.5 - t) * 2;
        col[k * 3 + 2] = 1 - t;
      } else {
        const d = Math.min(1, Math.sqrt(x * x + z * z) / 40);
        col[k * 3] = 1 - d;
        col[k * 3 + 1] = 0.4 + d * 0.4;
        col[k * 3 + 2] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }, [cloud, colorMode, decimation, hideGround]);

  useEffect(() => {
    onPointCount(geometry.getAttribute("position").count);
  }, [geometry, onPointCount]);

  return (
    <>
      <points
        geometry={geometry}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onGroundClick(e.point);
        }}
      >
        <pointsMaterial vertexColors size={0.05} sizeAttenuation />
      </points>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -1.6, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onGroundClick(e.point);
        }}
        visible={false}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  );
}

function AnnotationBox({
  a,
  selected,
  onSelect,
}: {
  a: Annotation3D;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const dist = Math.sqrt(a.center[0] ** 2 + a.center[2] ** 2);
  return (
    <group
      ref={ref}
      position={a.center}
      rotation={[0, a.yaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh>
        <boxGeometry args={[a.size[0] * 2, a.size[1] * 2, a.size[2] * 2]} />
        <meshBasicMaterial
          color={a.color}
          transparent
          opacity={selected ? 0.18 : 0.08}
          depthWrite={false}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry
          args={[new THREE.BoxGeometry(a.size[0] * 2, a.size[1] * 2, a.size[2] * 2)]}
        />
        <lineBasicMaterial color={a.color} linewidth={selected ? 2 : 1} />
      </lineSegments>
      <mesh position={[0, 0, a.size[2]]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.18, 0.4, 8]} />
        <meshBasicMaterial color={a.color} />
      </mesh>
      <Html
        position={[0, a.size[1] + 0.4, 0]}
        center
        distanceFactor={10}
        zIndexRange={[10, 0]}
      >
        <div
          className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap pointer-events-none border"
          style={{
            background: "rgba(10,15,26,0.85)",
            color: a.color,
            borderColor: a.color,
          }}
        >
          {a.label} · {dist.toFixed(1)}m
        </div>
      </Html>
    </group>
  );
}

function CursorMode({ active }: { active: boolean }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.domElement.style.cursor = active ? "crosshair" : "grab";
    return () => {
      gl.domElement.style.cursor = "";
    };
  }, [active, gl]);
  return null;
}

export function PointCloudViewer({
  annotations,
  selectedId,
  onSelect,
  onAdd,
  placingClass,
  showStats,
  pointSize,
  scene,
  frame,
  colorMode,
  decimation,
  hideGround,
  onPointCount,
  externalCloud,
}: Props) {
  return (
    <Canvas
      camera={{ position: [15, 12, 18], fov: 55, near: 0.1, far: 500 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      style={{ background: "oklch(0.12 0.02 260)" }}
    >
      <CursorMode active={!!placingClass} />
      <color attach="background" args={["#0b0f1a"]} />
      <ambientLight intensity={0.6} />
      <Grid
        args={[60, 60]}
        position={[0, -1.599, 0]}
        cellColor="#1f2937"
        sectionColor="#334155"
        fadeDistance={50}
        infiniteGrid={false}
      />
      <PointCloud
        scene={scene}
        frame={frame}
        colorMode={colorMode}
        decimation={decimation}
        hideGround={hideGround}
        onPointCount={onPointCount}
        externalCloud={externalCloud}
        onGroundClick={(p) => {
          if (!placingClass) {
            onSelect(null);
            return;
          }
          const size = CLASS_DEFAULT_SIZE[placingClass];
          const id = crypto.randomUUID();
          onAdd({
            id,
            label: placingClass,
            center: [p.x, -1.6 + size[1], p.z],
            size,
            yaw: 0,
            color: CLASS_COLORS[placingClass],
          });
        }}
      />
      {annotations.map((a) => {
        const pose = getAnnotationAt(a, frame);
        return (
          <AnnotationBox
            key={a.id}
            a={pose}
            selected={selectedId === a.id}
            onSelect={() => onSelect(a.id)}
          />
        );
      })}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      {showStats && <Stats className="!left-auto !right-2 !top-2" />}
      <PointSizeUpdater size={pointSize} />
    </Canvas>
  );
}

function PointSizeUpdater({ size }: { size: number }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.traverse((o) => {
      if ((o as THREE.Points).isPoints) {
        const m = (o as THREE.Points).material as THREE.PointsMaterial;
        m.size = size;
        m.needsUpdate = true;
      }
    });
  }, [size, scene]);
  return null;
}
