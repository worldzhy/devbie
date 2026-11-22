import type { ReactNode } from "react";

/**
 * Every string the state renders. The headline and description are already
 * host-supplied props, so only the call-to-action label lives here.
 */
export interface SettingsRequiredStateLabels {
  actionLabel: string;
}

export interface SettingsRequiredStateProps {
  labels: SettingsRequiredStateLabels;
  /** Short headline shown below the icon, e.g. "AWS credential required". */
  title: string;
  /** Explanation of which setting is missing and why it is needed. */
  description?: ReactNode;
  /** Destination of the settings call-to-action. Required unless `onAction` is provided. */
  settingsHref?: string;
  /** Called with settingsHref; the host performs the client-side navigation. */
  onOpenSettings?: (href: string) => void;
  /** In-place action (e.g. one-click initialization); takes precedence over the settings link. */
  onAction?: () => void;
  /** Shows a spinner and disables the action while the in-place action runs. */
  actionPending?: boolean;
  /** Optional custom icon rendered inside the tinted badge. */
  icon?: ReactNode;
  /** Stretch the state to fill the parent height (used by full-screen panels). */
  fullHeight?: boolean;
  /** Allow callers to tweak the outer container when needed. */
  className?: string;
}
