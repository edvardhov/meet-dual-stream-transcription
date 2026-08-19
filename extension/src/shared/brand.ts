/** brand anchors — single source of truth for extension colors. */
export const brand = {
  cornflower: "#614EFA",
  fog: "#DFDCFE",
  haiti: "#131032",
  white: "#FFFFFF",
} as const;

/** Toolbar badge colors (no DOM/CSS in the service worker). */
export const badge = {
  recording: brand.cornflower,
  muted: "#352f6a",
} as const;

/** Tailwind `theme.extend.colors` — scales anchored on brand hex values. */
export const tailwindThemeColors = {
  cornflower: {
    50: "#f0effe",
    100: brand.fog,
    200: "#c4bffe",
    300: "#a89ffe",
    400: "#8577fb",
    500: brand.cornflower,
    600: "#5038e8",
    700: "#4229c9",
    800: "#3621a5",
    900: "#2c1b85",
    950: "#1a1060",
  },
  fog: {
    50: "#faf9ff",
    100: brand.fog,
    200: "#d0ccfd",
    300: "#c1bcfc",
    400: "#b2adfb",
    500: "#a39efa",
    600: "#8f89f8",
    700: "#7b74f6",
    800: "#6760f4",
    900: "#534cf2",
    950: "#3f38ef",
  },
  haiti: {
    50: "#e8e7f0",
    100: "#c5c3d9",
    200: "#9e9bc0",
    300: "#7773a7",
    400: "#5a558f",
    500: "#3d3777",
    600: badge.muted,
    700: "#2b265a",
    800: "#211d4a",
    900: "#1a1639",
    950: brand.haiti,
  },
} as const;

const cssVarMap = {
  "--brand-cornflower": brand.cornflower,
  "--brand-cornflower-hover": tailwindThemeColors.cornflower[400],
  "--brand-cornflower-error": tailwindThemeColors.cornflower[400],
  "--brand-fog": brand.fog,
  "--brand-haiti": brand.haiti,
  "--brand-haiti-code": tailwindThemeColors.haiti[800],
  "--brand-white": brand.white,
} as const;

/** Apply brand CSS custom properties (permission page and other non-Tailwind surfaces). */
export function applyBrandCssVars(
  root: HTMLElement = document.documentElement,
): void {
  for (const [name, value] of Object.entries(cssVarMap)) {
    root.style.setProperty(name, value);
  }
}
