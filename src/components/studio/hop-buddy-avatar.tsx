"use client";

import { useId, useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type HopBuddyState =
  | "idle"
  | "thinking"
  | "typing"
  | "speaking"
  | "done"
  | "error";

type HopBuddyAvatarProps = {
  state?: HopBuddyState;
  /** Animation speed multiplier (1 = normal) */
  speed?: number;
  /** Status-Badge (Punkte / Balken / Häkchen / !) */
  badge?: boolean;
  className?: string;
  size?: number;
  "aria-label"?: string;
};

const SMILE = "M452 562 C482 604 542 604 572 562";
const SMILE_WIDE = "M436 552 C478 622 546 622 588 552";
const FLAT = "M470 578 L554 578";
const PURSED = "M468 574 C492 560 520 592 556 572";
const FROWN = "M452 596 C482 558 542 558 572 596";

type AnimVars = {
  showBadge: boolean;
  badgeDots: boolean;
  badgeBars: boolean;
  badgeCheck: boolean;
  badgeBang: boolean;
  openEyes: boolean;
  happyEyes: boolean;
  mouthLine: boolean;
  mouthOpen: boolean;
  mouthPath: string;
  mouthAnim: string;
  handChin: boolean;
  laptop: boolean;
  waveHand: boolean;
  chinAnim: string;
  tapL: string;
  tapR: string;
  waveAnim: string;
  bodyAnim: string;
  shrugAnim: string;
  headAnim: string;
  browAnim: string;
  eyeLidAnim: string;
  gazeAnim: string;
  dot1: string;
  dot2: string;
  dot3: string;
};

function buildAnims(
  state: HopBuddyState,
  speed: number,
  badge: boolean,
): AnimVars {
  const k = 1 / Math.max(0.4, speed);
  const d = (n: number) => `${(n * k).toFixed(2)}s`;

  const dots = (name: string, dur: number, stagger: number) => ({
    dot1: `${name} ${d(dur)} ease-in-out infinite`,
    dot2: `${name} ${d(dur)} ease-in-out infinite ${d(stagger)}`,
    dot3: `${name} ${d(dur)} ease-in-out infinite ${d(stagger * 2)}`,
  });

  const base: AnimVars = {
    showBadge: false,
    badgeDots: false,
    badgeBars: false,
    badgeCheck: false,
    badgeBang: false,
    openEyes: true,
    happyEyes: false,
    mouthLine: true,
    mouthOpen: false,
    mouthPath: SMILE,
    mouthAnim: "none",
    handChin: false,
    laptop: false,
    waveHand: false,
    chinAnim: "none",
    tapL: "none",
    tapR: "none",
    waveAnim: "none",
    bodyAnim: `cbBreathe ${d(4.4)} ease-in-out infinite`,
    shrugAnim: "none",
    headAnim: `cbSway ${d(6)} ease-in-out infinite`,
    browAnim: "none",
    eyeLidAnim: `cbBlink ${d(5)} ease-in-out infinite`,
    gazeAnim: "none",
    dot1: "none",
    dot2: "none",
    dot3: "none",
  };

  if (state === "thinking") {
    return {
      ...base,
      headAnim: `cbTilt ${d(3.8)} ease-in-out infinite`,
      gazeAnim: `cbGazeUp ${d(3.8)} ease-in-out infinite`,
      browAnim: `cbBrowThink ${d(3.8)} ease-in-out infinite`,
      eyeLidAnim: `cbBlink ${d(6)} ease-in-out infinite`,
      mouthPath: PURSED,
      handChin: true,
      chinAnim: `cbTapChin ${d(1.6)} ease-in-out infinite`,
      showBadge: badge,
      badgeDots: true,
      ...dots("cbDotPulse", 1.4, 0.18),
    };
  }

  if (state === "typing") {
    return {
      ...base,
      bodyAnim: `cbBreathe ${d(3)} ease-in-out infinite`,
      headAnim: `cbTypeNod ${d(1.2)} ease-in-out infinite`,
      gazeAnim: `cbGazeScan ${d(2.2)} steps(6, end) infinite`,
      eyeLidAnim: `cbBlinkFast ${d(3.4)} ease-in-out infinite`,
      mouthPath: FLAT,
      laptop: true,
      tapL: `cbTapL ${d(0.44)} ease-in-out infinite`,
      tapR: `cbTapR ${d(0.44)} ease-in-out infinite ${d(0.22)}`,
      showBadge: badge,
      badgeDots: true,
      ...dots("cbDotBounce", 0.9, 0.14),
    };
  }

  if (state === "speaking") {
    return {
      ...base,
      bodyAnim: `cbBreathe ${d(2.6)} ease-in-out infinite`,
      headAnim: `cbTalkNod ${d(1.3)} ease-in-out infinite`,
      browAnim: `cbBrowTalk ${d(1.3)} ease-in-out infinite`,
      mouthLine: false,
      mouthOpen: true,
      mouthAnim: `cbTalkMouth ${d(0.42)} ease-in-out infinite`,
      eyeLidAnim: `cbBlink ${d(4)} ease-in-out infinite`,
      showBadge: badge,
      badgeBars: true,
    };
  }

  if (state === "done") {
    return {
      ...base,
      bodyAnim: `cbPop ${d(0.7)} cubic-bezier(.2,1.5,.4,1) both, cbBreathe ${d(4.4)} ease-in-out ${d(0.7)} infinite`,
      headAnim: `cbSway ${d(4)} ease-in-out infinite`,
      openEyes: false,
      happyEyes: true,
      mouthPath: SMILE_WIDE,
      waveHand: true,
      waveAnim: `cbWave ${d(0.6)} ease-in-out infinite`,
      showBadge: badge,
      badgeCheck: true,
    };
  }

  if (state === "error") {
    return {
      ...base,
      headAnim: `cbHeadShake ${d(3.2)} ease-in-out infinite`,
      shrugAnim: `cbShrug ${d(3.2)} ease-in-out infinite`,
      browAnim: "none",
      mouthPath: FROWN,
      eyeLidAnim: `cbBlink ${d(4.4)} ease-in-out infinite`,
      showBadge: badge,
      badgeBang: true,
    };
  }

  return base;
}

const animStyle = (animation: string): CSSProperties => ({
  transformBox: "view-box",
  animation: animation === "none" ? undefined : animation,
});

/** Brew Buddy — CSS-animierter Chat-Avatar (ersetzt die Hopfendolde). */
export function HopBuddyAvatar({
  state = "idle",
  speed = 1,
  badge = false,
  className,
  size,
  "aria-label": ariaLabel,
}: HopBuddyAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const g = {
    shirt: `cbShirt-${uid}`,
    skin: `cbSkin-${uid}`,
    hair: `cbHair-${uid}`,
  };

  const a = useMemo(
    () => buildAnims(state, speed, badge),
    [state, speed, badge],
  );

  return (
    <span
      className={cn("hop-buddy brew-buddy", className)}
      style={size != null ? { width: size, height: size } : undefined}
      role="img"
      aria-label={ariaLabel ?? "BrewAI"}
      data-state={state}
    >
      <svg viewBox="0 0 1024 1024" width="100%" height="100%" aria-hidden>
        <defs>
          <linearGradient id={g.shirt} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#E89259" />
            <stop offset="55%" stopColor="#D87A24" />
            <stop offset="100%" style={{ stopColor: "var(--color-acc)" }} />
          </linearGradient>
          <linearGradient id={g.skin} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#F6CDA1" />
            <stop offset="100%" stopColor="#E7B27E" />
          </linearGradient>
          <linearGradient id={g.hair} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4A2A14" />
            <stop offset="100%" stopColor="#301809" />
          </linearGradient>
        </defs>

        <g
          style={{
            ...animStyle(a.bodyAnim),
            transformOrigin: "512px 1024px",
          }}
        >
          <g
            style={{
              ...animStyle(a.shrugAnim),
              transformOrigin: "512px 1010px",
            }}
          >
            <path
              d="M170 1024 C182 836 300 746 414 716 L610 716 C724 746 842 836 854 1024 Z"
              fill={`url(#${g.shirt})`}
            />
            <path
              d="M414 716 L512 800 L610 716 C578 700 446 700 414 716Z"
              fill="#B95716"
              opacity="0.45"
            />
            <rect x="464" y="596" width="96" height="140" rx="44" fill="#E0A870" />
          </g>

          <g
            style={{
              ...animStyle(a.headAnim),
              transformOrigin: "512px 700px",
            }}
          >
            <ellipse cx="300" cy="452" rx="30" ry="44" fill="#E7B27E" />
            <ellipse cx="724" cy="452" rx="30" ry="44" fill="#E7B27E" />
            <ellipse cx="512" cy="436" rx="206" ry="228" fill={`url(#${g.skin})`} />

            <path
              d="M306 366 C318 226 412 158 514 158 C628 158 706 238 718 372 C688 314 632 276 548 264 C452 250 372 292 306 366Z"
              fill={`url(#${g.hair})`}
            />
            <path
              d="M306 366 C300 300 322 236 360 200 C330 244 314 304 316 372Z"
              fill="#5C3419"
              opacity="0.5"
            />

            <ellipse cx="358" cy="516" rx="40" ry="26" fill="#E58F4F" opacity="0.28" />
            <ellipse cx="666" cy="516" rx="40" ry="26" fill="#E58F4F" opacity="0.28" />

            <g
              style={{
                ...animStyle(a.browAnim),
                transformOrigin: "512px 452px",
              }}
            >
              <path
                d="M388 384 C412 366 452 366 476 380"
                stroke="#3A2211"
                strokeWidth="18"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M548 380 C572 366 612 366 636 384"
                stroke="#3A2211"
                strokeWidth="18"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            <g
              style={{
                ...animStyle(a.eyeLidAnim),
                transformOrigin: "512px 452px",
              }}
            >
              {a.openEyes ? (
                <>
                  <ellipse cx="438" cy="454" rx="42" ry="46" fill="#FFF6E8" />
                  <ellipse cx="586" cy="454" rx="42" ry="46" fill="#FFF6E8" />
                  <g
                    style={{
                      ...animStyle(a.gazeAnim),
                      transformOrigin: "512px 454px",
                    }}
                  >
                    <circle cx="438" cy="458" r="19" fill="#33200F" />
                    <circle cx="586" cy="458" r="19" fill="#33200F" />
                  </g>
                </>
              ) : null}
              {a.happyEyes ? (
                <>
                  <path
                    d="M404 466 C420 432 456 432 472 466"
                    stroke="#33200F"
                    strokeWidth="17"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M552 466 C568 432 604 432 620 466"
                    stroke="#33200F"
                    strokeWidth="17"
                    strokeLinecap="round"
                    fill="none"
                  />
                </>
              ) : null}
            </g>

            <path
              d="M508 490 C494 524 498 540 518 542"
              stroke="#D49A63"
              strokeWidth="13"
              strokeLinecap="round"
              fill="none"
            />

            <g
              style={{
                ...animStyle(a.mouthAnim),
                transformOrigin: "512px 580px",
              }}
            >
              {a.mouthOpen ? (
                <path
                  d="M456 566 C482 622 542 622 568 566 C532 556 492 556 456 566Z"
                  fill="#8F4523"
                />
              ) : null}
              {a.mouthLine ? (
                <path
                  d={a.mouthPath}
                  stroke="#8F4523"
                  strokeWidth="15"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : null}
            </g>
          </g>

          {a.handChin ? (
            <g
              style={{
                ...animStyle(a.chinAnim),
                transformOrigin: "660px 820px",
              }}
            >
              <path
                d="M676 812 C700 760 726 742 744 750 C762 758 754 792 738 820 C766 810 790 818 792 836 C794 858 764 880 716 888 C664 896 626 878 620 848 C614 820 640 806 676 812Z"
                fill={`url(#${g.skin})`}
              />
            </g>
          ) : null}

          {a.laptop ? (
            <g>
              <g
                style={{
                  ...animStyle(a.tapL),
                  transformOrigin: "396px 900px",
                }}
              >
                <ellipse cx="396" cy="892" rx="66" ry="52" fill={`url(#${g.skin})`} />
              </g>
              <g
                style={{
                  ...animStyle(a.tapR),
                  transformOrigin: "628px 900px",
                }}
              >
                <ellipse cx="628" cy="892" rx="66" ry="52" fill={`url(#${g.skin})`} />
              </g>
              <path
                d="M268 940 L756 940 C772 940 780 952 776 966 L768 1000 L256 1000 L248 966 C244 952 252 940 268 940Z"
                fill="#2A1A0E"
              />
              <path
                d="M268 940 L756 940 C772 940 780 952 776 966 L248 966 C244 952 252 940 268 940Z"
                fill="#3E2714"
              />
            </g>
          ) : null}

          {a.waveHand ? (
            <g
              style={{
                ...animStyle(a.waveAnim),
                transformOrigin: "790px 780px",
              }}
            >
              <path
                d="M770 764 C768 706 780 678 800 676 C820 674 828 704 826 762 C846 746 868 752 872 770 C878 796 850 836 806 852 C760 868 726 852 722 824 C718 798 740 776 770 764Z"
                fill={`url(#${g.skin})`}
              />
            </g>
          ) : null}
        </g>

        {a.showBadge ? (
          <g>
            <rect x="592" y="792" width="404" height="196" rx="98" fill="#20130A" />
            <rect
              x="592"
              y="792"
              width="404"
              height="196"
              rx="98"
              fill="none"
              stroke="#DF812B"
              strokeWidth="10"
              opacity="0.5"
            />
            {a.badgeDots ? (
              <>
                <circle
                  cx="704"
                  cy="890"
                  r="30"
                  fill="#F3C08A"
                  style={{
                    ...animStyle(a.dot1),
                    transformOrigin: "704px 890px",
                  }}
                />
                <circle
                  cx="794"
                  cy="890"
                  r="30"
                  fill="#F3C08A"
                  style={{
                    ...animStyle(a.dot2),
                    transformOrigin: "794px 890px",
                  }}
                />
                <circle
                  cx="884"
                  cy="890"
                  r="30"
                  fill="#F3C08A"
                  style={{
                    ...animStyle(a.dot3),
                    transformOrigin: "884px 890px",
                  }}
                />
              </>
            ) : null}
            {a.badgeBars ? (
              <>
                <rect
                  x="690"
                  y="850"
                  width="26"
                  height="80"
                  rx="13"
                  fill="#F3C08A"
                  style={{
                    ...animStyle("cbBar 0.5s ease-in-out infinite"),
                    transformOrigin: "703px 890px",
                  }}
                />
                <rect
                  x="742"
                  y="850"
                  width="26"
                  height="80"
                  rx="13"
                  fill="#F3C08A"
                  style={{
                    ...animStyle("cbBar 0.5s ease-in-out infinite 0.12s"),
                    transformOrigin: "755px 890px",
                  }}
                />
                <rect
                  x="794"
                  y="850"
                  width="26"
                  height="80"
                  rx="13"
                  fill="#F3C08A"
                  style={{
                    ...animStyle("cbBar 0.5s ease-in-out infinite 0.24s"),
                    transformOrigin: "807px 890px",
                  }}
                />
                <rect
                  x="846"
                  y="850"
                  width="26"
                  height="80"
                  rx="13"
                  fill="#F3C08A"
                  style={{
                    ...animStyle("cbBar 0.5s ease-in-out infinite 0.36s"),
                    transformOrigin: "859px 890px",
                  }}
                />
              </>
            ) : null}
            {a.badgeCheck ? (
              <path
                d="M712 892 L770 944 L876 838"
                stroke="#8FD48A"
                strokeWidth="34"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray="170"
                style={{ animation: "cbStroke 0.5s ease-out 0.2s both" }}
              />
            ) : null}
            {a.badgeBang ? (
              <>
                <path
                  d="M794 836 L794 900"
                  stroke="#F0A065"
                  strokeWidth="34"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="794" cy="946" r="19" fill="#F0A065" />
              </>
            ) : null}
          </g>
        ) : null}
      </svg>
    </span>
  );
}

/** Alias — Brew Buddy ist der neue Chat-Avatar. */
export const BrewBuddyAvatar = HopBuddyAvatar;
export type BrewBuddyState = HopBuddyState;
