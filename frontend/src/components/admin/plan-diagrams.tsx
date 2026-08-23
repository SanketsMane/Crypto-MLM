import { clsx } from 'clsx';

/**
 * The two genealogies, drawn.
 *
 * Decorative by design — every fact they illustrate is written out beside them
 * in the card, so a screen reader loses nothing by skipping them. `still`
 * freezes the loop for a card that cannot be chosen, because motion reads as
 * an invitation.
 */
const NODE = 7;

function Wrap({ still, children }: { still?: boolean; children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 104"
      className={clsx('fx-diagram h-[104px] w-full', still && 'fx-diagram-still')}
    >
      {children}
    </svg>
  );
}

const edgeCls = 'stroke-[var(--color-line-strong)]';

/** Unilevel: one root, unlimited width, paid down many levels. */
export function UnilevelDiagram({ still }: { still?: boolean }) {
  const kids = [30, 65, 100, 135, 170];
  return (
    <Wrap still={still}>
      {kids.map((x, i) => (
        <line
          key={x} data-edge x1={100} y1={26} x2={x} y2={58}
          className={edgeCls} strokeWidth={1.25}
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
      <circle cx={100} cy={22} r={NODE} className="fill-[var(--color-violet)]" />
      {kids.map((x, i) => (
        <circle
          key={x} data-node cx={x} cy={62} r={NODE - 1}
          className="fill-[var(--color-violet)]/70"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
      {/* depth continues past the drawing — that is the point of unilevel */}
      {kids.slice(1, 4).map((x, i) => (
        <circle
          key={x} data-node cx={x} cy={88} r={4}
          className="fill-[var(--color-violet)]/35"
          style={{ animationDelay: `${600 + i * 120}ms` }}
        />
      ))}
      <text x={186} y={92} textAnchor="end" className="fill-[var(--color-ink-4)] text-[8px]">
        …30 levels
      </text>
    </Wrap>
  );
}

/** Binary: exactly two slots, so the third recruit spills into the downline. */
export function BinaryDiagram({ still }: { still?: boolean }) {
  return (
    <Wrap still={still}>
      <line data-edge x1={100} y1={26} x2={62} y2={54} className={edgeCls} strokeWidth={1.25} />
      <line data-edge x1={100} y1={26} x2={138} y2={54} className={edgeCls} strokeWidth={1.25} />
      <line data-edge x1={62} y1={66} x2={40} y2={82} className={edgeCls} strokeWidth={1.25}
            style={{ animationDelay: '380ms' }} />

      <circle cx={100} cy={22} r={NODE} className="fill-[var(--color-info)]" />
      <circle data-node cx={62} cy={58} r={NODE - 1} className="fill-[var(--color-info)]/75" />
      <circle data-node cx={138} cy={58} r={NODE - 1} className="fill-[var(--color-info)]/75"
              style={{ animationDelay: '150ms' }} />

      {/* the overflow recruit, falling from the root past a full leg */}
      <circle data-spill cx={40} cy={86} r={NODE - 2} className="fill-[var(--color-gold)]" />

      {/* the leg the commission is actually paid on */}
      <g data-weak>
        <circle cx={138} cy={58} r={12} className="fill-none stroke-[var(--color-good)]" strokeWidth={1.25} />
        <text x={138} y={82} textAnchor="middle" className="fill-[var(--color-good)] text-[7.5px] font-semibold">
          paid leg
        </text>
      </g>
      <text x={40} y={101} textAnchor="middle" className="fill-[var(--color-ink-4)] text-[8px]">spillover</text>
    </Wrap>
  );
}
