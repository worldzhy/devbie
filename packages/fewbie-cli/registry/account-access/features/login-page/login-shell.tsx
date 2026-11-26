import type { CSSProperties, ReactNode } from "react";

/**
 * Design tokens the sign-in surface cascades to its subtree.
 *
 * The defaults are the night palette the account flow ships with. Because the
 * tokens only apply inside the shell, the rest of the host keeps its own design
 * system; a host overrides the keys it needs through `palette` and every
 * unspecified key keeps the module look.
 */
export type LoginPalette = CSSProperties & {
  /** Page backdrop and gradient stop behind the card column (not a shadcn token). */
  "--login-backdrop": string;
  "--background": string;
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--destructive": string;
  "--border": string;
  "--input": string;
  "--ring": string;
  "--radius": string;
};

const NIGHT_PALETTE: LoginPalette = {
  "--login-backdrop": "#070c17",
  "--background": "#0d1117",
  "--foreground": "#e6ecf7",
  "--card": "#151b24",
  "--card-foreground": "#edf2f7",
  "--popover": "#151b24",
  "--popover-foreground": "#edf2f7",
  "--primary": "#3b82f6",
  "--primary-foreground": "#ffffff",
  "--secondary": "#1c2430",
  "--secondary-foreground": "#b5c0ce",
  "--muted": "#1a212c",
  "--muted-foreground": "#7f8b9a",
  "--accent": "#192b48",
  "--accent-foreground": "#93c5fd",
  "--destructive": "#f53f3f",
  "--border": "#273241",
  "--input": "#2c3747",
  "--ring": "#3b82f6",
  "--radius": "0.5rem",
};

export interface LoginShellProps {
  children: ReactNode;
  /** Header content, usually the host's brand lockup. */
  brand?: ReactNode;
  /** Footer content; the host supplies its own copy and links. */
  footer?: ReactNode;
  /** Token overrides for this surface; unspecified keys keep the night palette. */
  palette?: Partial<LoginPalette>;
}

/**
 * Full-page sign-in surface: backdrop with a radial falloff and the blue accent
 * the account flow expects. Every colour comes from `palette`, so a host can
 * re-skin the surface without forking the shell. The photographic background is
 * intentionally left to the host so each product can ship its own artwork.
 */
export function LoginShell({ children, brand, footer, palette }: LoginShellProps) {
  return (
    <div
      style={{ ...NIGHT_PALETTE, ...palette }}
      className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[var(--login-backdrop)] text-foreground"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--login-backdrop)_85%)] opacity-70"
      />

      <header className="relative z-10 flex w-full justify-center px-6 pt-10">{brand}</header>

      <main className="relative z-10 flex w-full flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-foreground [&>*]:shadow-2xl [&>*]:shadow-black/40">{children}</div>
      </main>

      {footer ? (
        <footer className="relative z-10 flex w-full flex-col items-center gap-2 px-6 pb-8 text-center">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
