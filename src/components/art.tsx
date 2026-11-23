// Our own drawings of the prototype's dishes, seen from above on a piece of banana leaf (docs/design.md,
// UI1, UI6). No picture comes from the internet. A dish the set does not know gets a plain rice bowl.
// The pictures are decorative: the dish name is always next to them, so they are hidden from screen readers.
import type { ReactNode } from 'react'

type Container = 'plate' | 'bowl' | 'none'
type Drawing = { container: Container; food: () => ReactNode }

const C = {
  leaf: '#3f8a4a',
  leafLight: '#5aa364',
  plate: '#fbfbf6',
  plateLine: '#e4e6dc',
  bowl: '#f5f2e9',
  bowlBand: '#3f6f9e',
  rice: '#fdfcf6',
  grain: '#ebe6d4',
  scallion: '#5aa04a',
  herb: '#2f7d34',
  chili: '#d33a26',
}

const Scallions = ({ at }: { at: [number, number][] }) => (
  <>
    {at.map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={1.8} fill="none" stroke={C.scallion} strokeWidth={1.3} />
    ))}
  </>
)

const ChiliRings = ({ at }: { at: [number, number][] }) => (
  <>
    {at.map(([x, y], i) => (
      <g key={i}>
        <circle cx={x} cy={y} r={2.6} fill={C.chili} />
        <circle cx={x} cy={y} r={1.1} fill="#f6d27a" />
      </g>
    ))}
  </>
)

/** A mound of steamed rice; `tint` gives turmeric rice. */
export function RiceMound({ cx, cy, r, tint = C.rice }: { cx: number; cy: number; r: number; tint?: string }) {
  const grains: [number, number, number][] = [
    [-0.45, -0.3, 20],
    [0.1, -0.5, -30],
    [0.45, -0.1, 60],
    [-0.2, 0.15, -10],
    [0.25, 0.4, 35],
    [-0.5, 0.35, 80],
    [0.05, 0.1, 15],
  ]
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={tint} stroke={C.grain} strokeWidth={1.2} />
      {grains.map(([dx, dy, rot], i) => (
        <ellipse
          key={i}
          cx={cx + dx * r}
          cy={cy + dy * r}
          rx={r * 0.13}
          ry={r * 0.06}
          transform={`rotate(${rot} ${cx + dx * r} ${cy + dy * r})`}
          fill={C.grain}
        />
      ))}
    </g>
  )
}

const rib = (x: number, y: number, rot: number) => (
  <g key={`${x}${y}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={-15} y={-6.5} width={28} height={13} rx={6.5} fill="#8f4a1c" />
    <rect x={-12} y={-5} width={20} height={5} rx={2.5} fill="#bb6a2d" />
    <circle cx={14} cy={0} r={3.4} fill="#f1e4c8" />
  </g>
)

const belly = (x: number, y: number) => (
  <g key={`${x}${y}`} transform={`translate(${x} ${y})`}>
    <rect x={-9} y={-8} width={18} height={16} rx={3} fill="#7d3f17" />
    <rect x={-9} y={-3} width={18} height={4} fill="#f0d3a4" />
    <rect x={-9} y={3} width={18} height={2.2} fill="#a65a26" />
  </g>
)

const egg = (x: number, y: number) => (
  <g key={`${x}${y}`}>
    <ellipse cx={x} cy={y} rx={9} ry={11} fill="#c98c4f" />
    <ellipse cx={x} cy={y + 1} rx={5} ry={6} fill="#f2b630" />
  </g>
)

const fishSteak = (x: number, y: number, rot: number, fill = '#c77d45', inner = '#e3a46a') => (
  <g key={`${x}${y}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
    <path d="M-12 -4 Q-10 -12 0 -11 Q11 -10 12 0 Q11 10 0 11 Q-10 11 -12 3 Z" fill={fill} />
    <path d="M-8 -3 Q-6 -8 0 -7 Q7 -6 8 0 Q7 6 0 7 Q-6 7 -8 2 Z" fill={inner} />
    <circle cx={0} cy={0} r={1.8} fill="#f4ead6" />
  </g>
)

const DRAWINGS: Record<string, Drawing> = {
  'd-suon': {
    container: 'plate',
    food: () => (
      <>
        <ellipse cx={60} cy={62} rx={30} ry={24} fill="#a65a22" opacity={0.35} />
        {rib(55, 49, -20)}
        {rib(63, 62, 12)}
        {rib(54, 74, -6)}
        {[
          [44, 58],
          [70, 50],
          [72, 74],
          [48, 82],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.7} fill="#d7a256" />
        ))}
        <Scallions
          at={[
            [66, 44],
            [41, 68],
            [76, 66],
          ]}
        />
      </>
    ),
  },
  'd-thitkho': {
    container: 'plate',
    food: () => (
      <>
        <ellipse cx={60} cy={61} rx={31} ry={25} fill="#9c5420" opacity={0.4} />
        {belly(46, 53)}
        {belly(64, 46)}
        {belly(52, 72)}
        {egg(74, 66)}
      </>
    ),
  },
  'd-cakho': {
    container: 'none',
    food: () => (
      <>
        <circle cx={60} cy={60} r={40} fill="#5a2e17" />
        <circle cx={60} cy={60} r={34} fill="#6e3414" />
        <path d="M24 48 L14 44 M96 48 L106 44" stroke="#5a2e17" strokeWidth={6} strokeLinecap="round" />
        {fishSteak(50, 54, -15)}
        {fishSteak(70, 66, 20)}
        {[
          [42, 72],
          [58, 78],
          [78, 48],
          [64, 42],
          [46, 40],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.2} fill="#1b0f08" />
        ))}
        <ChiliRings
          at={[
            [78, 76],
            [40, 62],
          ]}
        />
      </>
    ),
  },
  'd-trung': {
    container: 'plate',
    food: () => (
      <>
        <path
          d="M34 58 Q32 40 50 36 Q62 30 74 38 Q90 42 86 60 Q90 78 72 82 Q58 90 46 82 Q30 76 34 58 Z"
          fill="#fffdf6"
          stroke="#e3c48c"
          strokeWidth={2.4}
        />
        <circle cx={58} cy={58} r={11} fill="#f5b00b" />
        <ellipse cx={54} cy={54} rx={3.5} ry={2.4} fill="#fbd864" />
        <Scallions
          at={[
            [74, 52],
            [44, 70],
            [70, 72],
            [46, 48],
          ]}
        />
      </>
    ),
  },
  'd-ga': {
    container: 'plate',
    food: () => (
      <>
        {[
          [48, 50, 12, 9, 20],
          [68, 48, 11, 8, -15],
          [56, 66, 13, 9, 5],
          [74, 66, 10, 8, 30],
          [42, 68, 9, 7, -25],
        ].map(([x, y, rx, ry, r], i) => (
          <g key={i} transform={`rotate(${r} ${x} ${y})`}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#b06a2c" />
            <ellipse cx={x - 1} cy={y - 1} rx={rx - 3} ry={ry - 3} fill="#d4924f" />
          </g>
        ))}
        {[
          [60, 40],
          [36, 56],
          [82, 56],
          [64, 80],
          [50, 80],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.2} fill="#ece6a6" stroke="#c2b964" strokeWidth={0.8} />
        ))}
        <ChiliRings
          at={[
            [58, 54],
            [80, 76],
            [38, 44],
          ]}
        />
      </>
    ),
  },
  'd-dauhu': {
    container: 'plate',
    food: () => (
      <>
        <ellipse cx={60} cy={61} rx={31} ry={26} fill="#c9412b" />
        {[
          [44, 48],
          [62, 44],
          [52, 62],
          [70, 60],
          [58, 76],
        ].map(([x, y], i) => (
          <g key={i}>
            <rect x={x - 7} y={y - 7} width={14} height={14} rx={2.5} fill="#f6e7c3" />
            <rect x={x - 7} y={y - 7} width={14} height={4} rx={2} fill="#fff6dd" />
          </g>
        ))}
        <Scallions
          at={[
            [78, 48],
            [40, 70],
            [74, 78],
            [50, 40],
          ]}
        />
      </>
    ),
  },
  'd-raumuong': {
    container: 'plate',
    food: () => (
      <>
        {[
          [32, 70, 88, 46],
          [34, 60, 86, 56],
          [38, 80, 84, 40],
          [30, 50, 82, 70],
          [44, 86, 90, 62],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5ca74b" strokeWidth={3} strokeLinecap="round" />
        ))}
        {[
          [44, 52, -30],
          [62, 46, 20],
          [74, 60, -10],
          [52, 70, 40],
          [68, 76, -40],
          [40, 66, 10],
        ].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={9} ry={4} transform={`rotate(${r} ${x} ${y})`} fill={C.herb} />
        ))}
        {[
          [56, 58],
          [48, 44],
          [72, 50],
          [60, 80],
          [36, 74],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2} fill="#f3e7c4" />
        ))}
      </>
    ),
  },
  'd-caithia': {
    container: 'plate',
    food: () => (
      <>
        {[
          [52, 50, -25],
          [60, 64, 10],
          [46, 72, 40],
        ].map(([x, y, r], i) => (
          <g key={i} transform={`rotate(${r} ${x} ${y})`}>
            <ellipse cx={x + 8} cy={y} rx={12} ry={8} fill="#2f7d34" />
            <ellipse cx={x - 6} cy={y} rx={10} ry={5} fill="#e3f0c8" />
            <line x1={x - 14} y1={y} x2={x + 16} y2={y} stroke="#cfe3a8" strokeWidth={1.5} />
          </g>
        ))}
        <circle cx={80} cy={78} r={10} fill={C.bowl} stroke={C.bowlBand} strokeWidth={1.6} />
        <circle cx={80} cy={78} r={7} fill="#b5651d" />
        <ChiliRings at={[[79, 77]]} />
      </>
    ),
  },
  'd-susu': {
    container: 'plate',
    food: () => (
      <>
        {[
          [46, 50, 20],
          [64, 46, -10],
          [74, 62, 35],
          [56, 64, 0],
          [42, 70, -30],
          [62, 80, 15],
        ].map(([x, y, r], i) => (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={10}
            ry={6}
            transform={`rotate(${r} ${x} ${y})`}
            fill="#c3df92"
            stroke="#9cc06a"
            strokeWidth={1.2}
          />
        ))}
        {[
          [52, 40, 30],
          [78, 50, -20],
          [48, 82, 60],
          [70, 72, 10],
        ].map(([x, y, r], i) => (
          <rect key={i} x={x - 6} y={y - 1.3} width={12} height={2.6} rx={1.3} transform={`rotate(${r} ${x} ${y})`} fill="#e8803a" />
        ))}
      </>
    ),
  },
  'd-canhchua': {
    container: 'bowl',
    food: () => (
      <>
        <circle cx={60} cy={60} r={31} fill="#e9a44c" opacity={0.85} />
        {fishSteak(50, 56, 10, '#e9d3b2', '#f5e7cf')}
        {[
          [70, 48, 0],
          [68, 70, 120],
          [44, 74, 240],
        ].map(([x, y, r], i) => (
          <path key={i} d={`M${x} ${y} l9 0 a9 9 0 0 1 -9 9 z`} transform={`rotate(${r} ${x} ${y})`} fill="#d8432c" />
        ))}
        {[
          [78, 60],
          [58, 80],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x - 5} ${y + 4} L${x} ${y - 5} L${x + 5} ${y + 4} Z`} fill="#f2c94c" />
        ))}
        {[
          [40, 50, 30],
          [62, 38, -20],
          [80, 74, 60],
        ].map(([x, y, r], i) => (
          <line
            key={i}
            x1={x - 5}
            y1={y}
            x2={x + 5}
            y2={y}
            transform={`rotate(${r} ${x} ${y})`}
            stroke="#fbf6e6"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        ))}
        {[
          [36, 62, 20],
          [70, 40, -40],
          [50, 84, 70],
        ].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={5} ry={2.5} transform={`rotate(${r} ${x} ${y})`} fill={C.herb} />
        ))}
      </>
    ),
  },
  'd-canhbi': {
    container: 'bowl',
    food: () => (
      <>
        <circle cx={60} cy={60} r={31} fill="#f0a443" />
        {[
          [48, 50],
          [66, 46],
          [56, 66],
          [74, 64],
          [42, 68],
        ].map(([x, y], i) => (
          <g key={i}>
            <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill="#e57f22" />
            <rect x={x - 6} y={y + 3} width={12} height={3} rx={1} fill="#5d7f2e" />
          </g>
        ))}
        <Scallions
          at={[
            [60, 38],
            [80, 52],
            [52, 80],
            [38, 56],
            [70, 78],
          ]}
        />
      </>
    ),
  },
  'd-bunbo': {
    container: 'bowl',
    food: () => (
      <>
        <circle cx={60} cy={60} r={32} fill="#c9482c" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M${34 + i * 2} ${44 + i * 8} q8 -6 16 0 t16 0 t16 0`}
            fill="none"
            stroke="#fbf6ea"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        ))}
        {[
          [48, 48, -20],
          [62, 44, 15],
        ].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={9} ry={5} transform={`rotate(${r} ${x} ${y})`} fill="#8b3a2b" />
        ))}
        <circle cx={72} cy={64} r={9} fill="#f1d9b5" />
        <circle cx={72} cy={64} r={4} fill="#c98f5a" />
        <rect x={42} y={66} width={14} height={9} rx={2} fill="#e9b36a" />
        <path d="M76 42 a8 8 0 0 1 8 8 l-8 0 z" fill="#9bc94f" />
        {[
          [58, 78, 30],
          [38, 56, -30],
          [82, 76, 10],
        ].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={5.5} ry={2.6} transform={`rotate(${r} ${x} ${y})`} fill={C.herb} />
        ))}
      </>
    ),
  },
  'd-comga': {
    container: 'plate',
    food: () => (
      <>
        <RiceMound cx={50} cy={58} r={22} tint="#f2c94c" />
        {[
          [62, 44, 76, 50],
          [64, 52, 80, 46],
          [60, 60, 78, 64],
          [66, 66, 82, 58],
          [58, 50, 72, 62],
          [62, 70, 76, 72],
        ].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f1d8aa" strokeWidth={3.4} strokeLinecap="round" />
        ))}
        {[
          [44, 82, 20, '#e8803a'],
          [52, 84, -10, '#f3e7c4'],
          [60, 82, 30, '#e8803a'],
        ].map(([x, y, r, f], i) => (
          <rect
            key={i}
            x={(x as number) - 6}
            y={(y as number) - 1.3}
            width={12}
            height={2.6}
            rx={1.3}
            transform={`rotate(${r} ${x} ${y})`}
            fill={f as string}
          />
        ))}
        {[
          [80, 74, 30],
          [72, 36, -30],
        ].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={6} ry={2.6} transform={`rotate(${r} ${x} ${y})`} fill={C.herb} />
        ))}
        <ChiliRings at={[[70, 80]]} />
      </>
    ),
  },
  'd-buncha': {
    container: 'none',
    food: () => (
      <>
        <rect x={14} y={30} width={42} height={58} rx={10} fill={C.plate} stroke={C.plateLine} strokeWidth={1.5} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${20 + i * 5.5} 36 q3 24 0 46`} fill="none" stroke="#efe9d8" strokeWidth={2} strokeLinecap="round" />
        ))}
        <ellipse cx={30} cy={34} rx={9} ry={4} fill={C.herb} />
        <circle cx={78} cy={62} r={28} fill={C.bowl} stroke={C.bowlBand} strokeWidth={2.4} />
        <circle cx={78} cy={62} r={22} fill="#e7b46b" />
        {[
          [70, 56],
          [86, 54],
          [78, 70],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={6} fill="#6e3416" />
            <circle cx={x - 1.5} cy={y - 1.5} r={2.5} fill="#8f4a1c" />
          </g>
        ))}
        <rect x={64} y={68} width={10} height={6} rx={2} fill="#a8572a" transform="rotate(-20 69 71)" />
        <rect x={84} y={66} width={8} height={2.4} rx={1.2} fill="#e8803a" />
        <rect x={74} y={50} width={8} height={2.4} rx={1.2} fill="#f3e7c4" transform="rotate(30 78 51)" />
      </>
    ),
  },
}

const fallback: Drawing = {
  container: 'bowl',
  food: () => <RiceMound cx={60} cy={60} r={26} />,
}

/** Fixed dishes served with steamed rice on the side (their description says so, CN-30). */
const WITH_RICE = new Set(['d-suon', 'd-thitkho'])

function LeafPiece() {
  return (
    <g>
      <path d="M10 26 Q60 2 110 20 Q118 60 108 98 Q60 118 12 100 Q2 62 10 26 Z" fill={C.leaf} />
      <path d="M12 98 Q60 60 109 22" stroke={C.leafLight} strokeWidth={2.2} fill="none" />
      {[0.2, 0.38, 0.56, 0.74].map((t, i) => {
        const x = 12 + t * 97
        const y = 98 - t * 76
        return (
          <g key={i} stroke={C.leafLight} strokeWidth={1} opacity={0.75}>
            <line x1={x} y1={y} x2={x - 16} y2={y - 22} />
            <line x1={x} y1={y} x2={x + 20} y2={y + 14} />
          </g>
        )
      })}
    </g>
  )
}

function Container({ kind }: { kind: Container }) {
  if (kind === 'plate')
    return (
      <>
        <circle cx={60} cy={60} r={44} fill={C.plate} />
        <circle cx={60} cy={60} r={36} fill="none" stroke={C.plateLine} strokeWidth={1.4} />
      </>
    )
  if (kind === 'bowl')
    return (
      <>
        <circle cx={60} cy={60} r={42} fill={C.bowl} />
        <circle cx={60} cy={60} r={38.5} fill="none" stroke={C.bowlBand} strokeWidth={2.6} />
      </>
    )
  return null
}

/** Only the food of a dish, drawn around (60, 60) in a 120 box: used on the plate builder's plate. */
export function Food({ dishId }: { dishId: string }) {
  const d = DRAWINGS[dishId] ?? fallback
  if (d.container === 'plate') return <>{d.food()}</>
  // Bowls and pots keep their own vessel, smaller, so soups still read as soups on the plate.
  return (
    <>
      <Container kind={d.container} />
      {d.food()}
    </>
  )
}

/** A dish on a piece of banana leaf. `meal` adds the rice that comes with some ready meals. */
export function DishArt({ dishId, meal = false, className }: { dishId: string; meal?: boolean; className?: string }) {
  const d = DRAWINGS[dishId] ?? fallback
  const rice = meal && WITH_RICE.has(dishId)
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className} data-dish={dishId}>
      <LeafPiece />
      <Container kind={d.container} />
      {rice ? (
        <>
          <RiceMound cx={41} cy={58} r={18} />
          <g transform="translate(26 12) scale(0.8)">{d.food()}</g>
        </>
      ) : (
        d.food()
      )}
    </svg>
  )
}

/** A build-your-own plate: rice in the middle and the chosen dishes around it (S-C5, UI6). */
export function PlateArt({ picks, slots, className }: { picks: (string | null)[]; slots: number; className?: string }) {
  const n = Math.max(slots, picks.length, 1)
  // Fewer dishes get more room, so a thumbnail of a small plate stays readable.
  const ring = n <= 3 ? 50 : 54
  const scale = n <= 3 ? 0.72 : 0.62
  const place = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [100 + Math.cos(a) * ring, 100 + Math.sin(a) * ring]
  }
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={className}>
      <g transform="scale(1.6667)">
        <LeafPiece />
      </g>
      <circle cx={100} cy={100} r={86} fill={C.plate} />
      <circle cx={100} cy={100} r={76} fill="none" stroke={C.plateLine} strokeWidth={1.6} />
      <RiceMound cx={100} cy={100} r={n <= 3 ? 19 : 24} />
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = place(i)
        const id = picks[i]
        if (!id) return <circle key={`e${i}`} cx={x} cy={y} r={20} fill="none" stroke={C.plateLine} strokeWidth={2} strokeDasharray="5 5" />
        return (
          <g key={`${id}-${i}`} className="drop-in" data-pick={id}>
            <g transform={`translate(${x - 60 * scale} ${y - 60 * scale}) scale(${scale})`}>
              <Food dishId={id} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}

/** A thumbnail for a cart or order line: the dish, or a small rice plate for a build-your-own line. */
export function LineArt({ dishId, picks, className }: { dishId?: string; picks?: string[]; className?: string }) {
  if (dishId) return <DishArt dishId={dishId} meal className={className} />
  return <PlateArt picks={picks ?? []} slots={picks?.length ?? 0} className={className} />
}

export type EmptyKind = 'cart' | 'orders' | 'closed' | 'noMenu'

/** Illustrations for empty screens (UI6). */
export function EmptyArt({ kind, className }: { kind: EmptyKind; className?: string }) {
  return (
    <svg viewBox="0 0 160 120" aria-hidden className={className}>
      <ellipse cx={80} cy={104} rx={62} ry={8} fill="currentColor" opacity={0.08} />
      {kind === 'cart' && (
        <>
          {/* An opened leaf parcel with nothing inside. */}
          <path d="M80 18 L136 62 L80 104 L24 62 Z" fill={C.leaf} />
          <path d="M80 18 L80 104 M24 62 L136 62" stroke={C.leafLight} strokeWidth={2} />
          <path d="M80 34 L118 62 L80 90 L42 62 Z" fill={C.leafLight} opacity={0.5} />
          <line x1={104} y1={20} x2={150} y2={70} stroke="#c8a15a" strokeWidth={3.5} strokeLinecap="round" />
          <line x1={112} y1={16} x2={154} y2={64} stroke="#c8a15a" strokeWidth={3.5} strokeLinecap="round" />
        </>
      )}
      {kind === 'orders' && (
        <>
          <g transform="translate(20 0)">
            <LeafPiece />
            <Container kind="plate" />
          </g>
          <line x1={22} y1={30} x2={30} y2={108} stroke="#c8a15a" strokeWidth={3.5} strokeLinecap="round" />
          <line x1={32} y1={28} x2={38} y2={108} stroke="#c8a15a" strokeWidth={3.5} strokeLinecap="round" />
        </>
      )}
      {kind === 'closed' && (
        <>
          {/* A woven food cover (lồng bàn) on the table: the kitchen is resting. */}
          <rect x={20} y={92} width={120} height={8} rx={4} fill="#a87b45" />
          <path d="M28 92 Q28 30 80 28 Q132 30 132 92 Z" fill="#e2c48a" />
          {[40, 52, 64, 76, 88, 100, 112, 124].map((x) => (
            <path key={x} d={`M${x} 92 Q${80 + (x - 80) * 0.6} 46 80 30`} stroke="#b58c4e" strokeWidth={1.4} fill="none" />
          ))}
          {[48, 62, 76].map((y) => (
            <path
              key={y}
              d={`M${34 - (y - 48) * 0.3} ${y + 14} Q80 ${y - 6} ${126 + (y - 48) * 0.3} ${y + 14}`}
              stroke="#b58c4e"
              strokeWidth={1.4}
              fill="none"
            />
          ))}
          <circle cx={80} cy={26} r={6} fill="#a87b45" />
        </>
      )}
      {kind === 'noMenu' && (
        <>
          <g transform="translate(20 0)">
            <LeafPiece />
            <circle cx={60} cy={60} r={40} fill={C.plate} stroke={C.plateLine} strokeWidth={2} strokeDasharray="6 6" />
          </g>
          <g transform="rotate(35 128 40)">
            <rect x={122} y={10} width={10} height={58} rx={2} fill="#f2c94c" />
            <path d="M122 68 L127 80 L132 68 Z" fill="#e9d3b2" />
            <rect x={122} y={10} width={10} height={7} fill="#d8432c" />
          </g>
        </>
      )}
    </svg>
  )
}

/** Every dish the drawing set knows, so a test can check that each seeded dish has its own drawing. */
export const drawnDishes = Object.keys(DRAWINGS)
