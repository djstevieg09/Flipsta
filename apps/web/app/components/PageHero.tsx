import type { ReactNode } from "react";

export type HeroDecoration = {
  /** Emoji shown floating (or boxed) around the mascot. */
  emoji: string;
  /** Tailwind positioning classes only (absolute/top/left/right/bottom) — never a rotate/transform utility, since `animate` drives transform itself. */
  className: string;
  /** Wraps the emoji in a `.card` box with a shadow, matching the Opportunities page's "boxes around him" package look — for a plain floating emoji, omit. */
  boxed?: boolean;
  /** Which of the three shared hero animations (globals.css) to run. Omit for a still decoration. */
  animate?: "bob" | "sway" | "spin";
  /** Stagger multiple decorations that share an animation so they don't move in lockstep. */
  delay?: string;
  /** Text size — defaults to text-2xl for a floating emoji / text-xl for a boxed one. */
  sizeClassName?: string;
};

/**
 * 18 Sept 2026, Steven: "you know the theme by now, go through the tabs and
 * adjust them all to match the other tabs that we have worked on so far
 * mascots with relevent animations around them." Every nav-reachable page
 * gets this same hero: the Flippy mascot photo plus a handful of emoji
 * decorations positioned and animated around it (no image-generation tool
 * is available in this session — see opportunities/page.tsx's
 * OpportunitiesHero, the pattern this generalizes), a heading and a
 * subtitle describing what that specific page actually does.
 */
export default function PageHero({
  eyebrow,
  title,
  subtitle,
  decorations = [],
  mascotClassName,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle: ReactNode;
  decorations?: HeroDecoration[];
  mascotClassName?: string;
}) {
  return (
    <section className="card relative overflow-hidden p-6 md:p-8 mb-6">
      <div className="relative flex flex-col md:flex-row items-center gap-6 md:gap-10">
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/flippy-mascot.jpg"
            alt="Flippy, the Flipsta mascot"
            className={mascotClassName ?? "w-28 md:w-36 rounded-2xl drop-shadow-[0_0_40px_rgba(242,181,69,0.35)]"}
          />
          {decorations.map((d, i) => {
            const animateClass = d.animate ? `hero-${d.animate}` : "";
            const style = d.delay ? { animationDelay: d.delay } : undefined;
            return d.boxed ? (
              <div
                key={i}
                className={`card absolute items-center justify-center shadow-xl hidden sm:flex ${d.sizeClassName ?? "text-xl"} ${d.className} ${animateClass}`}
                style={style}
                aria-hidden
              >
                {d.emoji}
              </div>
            ) : (
              <span
                key={i}
                className={`absolute select-none ${d.sizeClassName ?? "text-2xl"} ${d.className} ${animateClass}`}
                style={style}
                aria-hidden
              >
                {d.emoji}
              </span>
            );
          })}
        </div>
        <div className="flex-1 text-center md:text-left space-y-1.5">
          {eyebrow && <div className="text-xs font-bold text-gold uppercase tracking-wide">{eyebrow}</div>}
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <p className="text-textDim text-sm max-w-md mx-auto md:mx-0">{subtitle}</p>
        </div>
      </div>
    </section>
  );
}
