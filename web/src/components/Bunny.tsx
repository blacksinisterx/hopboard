// "Hop", the mascot. One SVG, five moods, all motion in CSS (see .bun in index.css).

export type Mood = 'idle' | 'sleep' | 'think' | 'happy' | 'oops';

export function Bunny({ mood = 'idle', size = 200, className = '' }: { mood?: Mood; size?: number; className?: string }) {
  return (
    <svg className={`bun ${mood} ${className}`} width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="Hop the bunny">
      <ellipse className="bun-shadow" cx="100" cy="188" rx="52" ry="7" />
      <g className="bun-body">
        {/* ears */}
        <g className="ear l">
          <ellipse cx="70" cy="46" rx="18" ry="44" transform="rotate(-8 70 46)" className="fur" />
          <ellipse cx="71" cy="50" rx="8.5" ry="29" transform="rotate(-8 71 50)" className="ear-in" />
        </g>
        <g className="ear r">
          <ellipse cx="130" cy="46" rx="18" ry="44" transform="rotate(8 130 46)" className="fur" />
          <ellipse cx="129" cy="50" rx="8.5" ry="29" transform="rotate(8 129 50)" className="ear-in" />
        </g>
        {/* head */}
        <ellipse cx="100" cy="118" rx="66" ry="56" className="fur" />
        <circle cx="62" cy="132" r="11" className="cheek" />
        <circle cx="138" cy="132" r="11" className="cheek" />
        {/* eyes */}
        <g className="eyes open">
          <g className="eye"><ellipse cx="76" cy="114" rx="7.5" ry="9.5" className="ink-fill" /><circle cx="78.5" cy="110" r="2.8" fill="#fff" /></g>
          <g className="eye"><ellipse cx="124" cy="114" rx="7.5" ry="9.5" className="ink-fill" /><circle cx="126.5" cy="110" r="2.8" fill="#fff" /></g>
        </g>
        <g className="eyes happy-eyes">
          <path d="M67 116 q9 -12 18 0" className="stroke" /><path d="M115 116 q9 -12 18 0" className="stroke" />
        </g>
        <g className="eyes sleepy">
          <path d="M67 113 q9 9 18 0" className="stroke" /><path d="M115 113 q9 9 18 0" className="stroke" />
        </g>
        <g className="eyes oops-eyes">
          <path d="M69 108 l14 12 M83 108 l-14 12" className="stroke" /><path d="M117 108 l14 12 M131 108 l-14 12" className="stroke" />
        </g>
        {/* nose + mouth + whiskers */}
        <path d="M94 126 q6 -7 12 0 q-6 9 -12 0z" className="nose" />
        <path d="M100 133 v4 M100 137 q-7 8 -15 2 M100 137 q7 8 15 2" className="stroke thin" />
        <g className="whisk"><path d="M40 124 l-18 -5 M40 132 l-19 2 M42 140 l-16 8 M160 124 l18 -5 M160 132 l19 2 M158 140 l16 8" /></g>
        {/* paws peeking */}
        <ellipse cx="72" cy="176" rx="17" ry="11" className="fur" />
        <ellipse cx="128" cy="176" rx="17" ry="11" className="fur" />
        <path d="M66 180 v-6 M72 181 v-7 M78 180 v-6 M122 180 v-6 M128 181 v-7 M134 180 v-6" className="stroke thin" />
      </g>
      <g className="zzz"><text x="150" y="60">z</text><text x="164" y="42">z</text><text x="180" y="26">Z</text></g>
      <g className="sparks">
        <path d="M30 70 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4z" /><path d="M170 82 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" />
      </g>
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect x="2" y="2" width="60" height="60" rx="18" className="logo-bg" />
        <ellipse cx="23" cy="17" rx="6" ry="14" className="logo-fur" transform="rotate(-8 23 17)" />
        <ellipse cx="41" cy="17" rx="6" ry="14" className="logo-fur" transform="rotate(8 41 17)" />
        <ellipse cx="32" cy="38" rx="20" ry="17" className="logo-fur" />
        <circle cx="25" cy="37" r="2.6" className="logo-ink" /><circle cx="39" cy="37" r="2.6" className="logo-ink" />
        <path d="M29.5 43 q2.5 3 5 0" className="logo-line" />
      </svg>
      <span className="wordmark">Hop<span>board</span></span>
    </span>
  );
}
