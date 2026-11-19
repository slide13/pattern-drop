import { useId } from "react";

export type Avatar = "boy" | "girl";

type Point = readonly [number, number];

// The figure is drawn in a 320 × 585 box, matching .paper-doll. One head is
// about 71px, so the body is roughly eight heads tall like a fashion croquis:
// chin ≈ 1 head, chest ≈ 2, waist ≈ 3, crotch ≈ 4, knee ≈ 6, sole ≈ 8.
const CENTER = 160;
const SKIN = "#e6b58f";
const TOP = "#d1d3cc";
const BOTTOM = "#c5c7c0";
const HAIR = "#292a28";
const INK = "var(--ink)";

/** Closed Catmull-Rom spline through points given as [offset from centre, y]. */
function smooth(points: readonly Point[]) {
  const p = points.map(([x, y]) => [CENTER + x, y] as const);
  const n = p.length;
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return `${d}Z`;
}

const mirror = (points: readonly Point[]) => points.map(([x, y]) => [-x, y] as const);
/** A symmetric outline from its right half; the last point lies on the centre line and is shared. */
const symmetric = (half: readonly Point[]) => smooth([...half, ...mirror(half).reverse().slice(1)]);

type Shape = {
  /** Right half of the head-less silhouette: neck, outer contour down to the foot, inner leg up to the crotch. */
  body: Point[];
  arm: Point[];
  topFrom: number;
  hairBack?: Point[];
  hairFront: Point[];
};

const SHAPES: Record<Avatar, Shape> = {
  girl: {
    // Narrower shoulders, defined waist, wider hips.
    body: [
      [8, 70], [9, 96], [30, 106], [50, 113], [56, 126], [51, 150], [51, 166], [43, 190], [35, 226], [44, 252], [56, 280],
      [56, 322], [46, 386], [38, 438], [41, 480], [26, 546], [32, 566], [30, 578], [8, 578], [9, 556], [12, 548],
      [12, 486], [10, 438], [7, 366], [3, 312], [0, 304],
    ],
    arm: [[48, 114], [62, 122], [70, 144], [74, 222], [82, 290], [89, 316], [83, 340], [73, 336], [69, 318], [67, 292], [59, 226], [50, 160]],
    topFrom: 134,
    hairBack: [[-30, 16], [0, 8], [30, 16], [40, 60], [41, 118], [32, 146], [0, 150], [-32, 146], [-41, 118], [-40, 60]],
    hairFront: [[-29, 40], [-28, 22], [-12, 12], [8, 12], [26, 22], [30, 44], [24, 30], [10, 26], [-6, 34], [-22, 32]],
  },
  boy: {
    // Broader shoulders and chest, straighter waist and hips.
    body: [
      [10, 70], [11, 96], [36, 106], [60, 114], [66, 130], [58, 154], [56, 174], [47, 202], [43, 228], [46, 256], [50, 280],
      [52, 322], [44, 388], [38, 438], [42, 480], [28, 546], [34, 566], [32, 578], [8, 578], [9, 556], [12, 548],
      [13, 486], [11, 438], [7, 366], [3, 312], [0, 304],
    ],
    arm: [[58, 114], [74, 124], [82, 146], [86, 222], [91, 290], [97, 318], [91, 343], [81, 339], [77, 320], [75, 292], [67, 226], [57, 162]],
    topFrom: 128,
    hairFront: [[-28, 44], [-30, 24], [-16, 12], [4, 9], [24, 16], [30, 32], [28, 46], [22, 30], [6, 24], [-12, 28], [-24, 32]],
  },
};

type Garment = { fill: string; from: number; to: number };

function Part({ d, clip, garments = [] }: { d: string; clip: string; garments?: Garment[] }) {
  return (
    <g>
      <clipPath id={clip}><path d={d} /></clipPath>
      <path d={d} fill={SKIN} />
      {garments.map(({ fill, from, to }) => <rect key={from} x="0" y={from} width="320" height={to - from} fill={fill} clipPath={`url(#${clip})`} />)}
      <path d={d} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </g>
  );
}

export default function AvatarFigure({ avatar }: { avatar: Avatar }) {
  const id = useId().replaceAll(":", "");
  const shape = SHAPES[avatar];
  const body = symmetric(shape.body);
  const rightArm = smooth(shape.arm), leftArm = smooth(mirror(shape.arm));
  const headRx = avatar === "girl" ? 25 : 27;

  return (
    <svg className="doll-figure" viewBox="0 0 320 585" aria-hidden="true" focusable="false">
      {shape.hairBack && <path d={smooth(shape.hairBack)} fill={HAIR} />}
      <Part d={leftArm} clip={`${id}-la`} />
      <Part d={rightArm} clip={`${id}-ra`} />
      <Part d={body} clip={`${id}-b`} garments={[{ fill: TOP, from: shape.topFrom, to: 272 }, { fill: BOTTOM, from: 272, to: 540 }]} />
      <path d={`M${CENTER - 60},272 H${CENTER + 60}`} stroke={INK} strokeWidth="1.5" clipPath={`url(#${id}-b)`} />
      <ellipse cx={CENTER - headRx} cy="50" rx="4" ry="8" fill={SKIN} stroke={INK} strokeWidth="2" />
      <ellipse cx={CENTER + headRx} cy="50" rx="4" ry="8" fill={SKIN} stroke={INK} strokeWidth="2" />
      <ellipse cx={CENTER} cy="46" rx={headRx} ry="34" fill={SKIN} stroke={INK} strokeWidth="2" />
      <path d={smooth(shape.hairFront)} fill={HAIR} />
      <ellipse cx={CENTER - 10} cy="50" rx="2.6" ry="2.2" fill={INK} />
      <ellipse cx={CENTER + 10} cy="50" rx="2.6" ry="2.2" fill={INK} />
      <path d={`M${CENTER - 5},66 Q${CENTER},69 ${CENTER + 5},66`} fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
