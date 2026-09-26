// ShellyHub theme — deep navy control-room panels, cyan accents, each light
// tinted by its own live colour.

export const FONT = {
  display: '/rom/fonts/Inter-SemiBold.ttf',
  label: '/rom/fonts/Inter-Medium.ttf',
  body: '/rom/fonts/Inter-Regular.ttf',
  mono: '/rom/fonts/Inter-Regular.ttf',
};

export const TYPE = {
  micro: 11,
  small: 13,
  body: 15,
  title: 17,
  heading: 24,
};

// letterSpacing factors for Inter; uppercase labels are tracked out.
export const TRACK = {
  none: 1.0,
  label: 1.6,
  heading: 2.2,
};

export const SPACE = {
  hair: 4,
  tight: 8,
  gap: 12,
  pad: 16,
  section: 20,
};

export const LAYOUT = {
  gap: SPACE.tight,
  pad: SPACE.pad,
  buttonHeight: 34,
  inputHeight: 30,
  rowHeight: 34,
  radius: 10,
  controlRadius: 6,
  scrollStep: Math.round(TYPE.body * 2.5), // 38 — same formula as deepfield
};

export const THEME = {
  shell: [0.027, 0.039, 0.059, 1.0],
  panel: [0.047, 0.067, 0.094, 1.0],
  panelRaised: [0.063, 0.086, 0.122, 1.0],
  border: [0.110, 0.157, 0.220, 1.0],
  borderStrong: [0.160, 0.235, 0.330, 1.0],
  separator: [0.110, 0.157, 0.220, 1.0],
  well: [0.035, 0.051, 0.075, 1.0],
  button: [0.059, 0.082, 0.118, 1.0],
  buttonHover: [0.086, 0.122, 0.173, 1.0],
  buttonActive: [0.063, 0.161, 0.255, 1.0],
  inputBg: [0.035, 0.051, 0.075, 1.0],
  inputFocus: [0.180, 0.560, 0.950, 0.25],
  accent: [0.200, 0.620, 1.000, 1.0],
  swatchBorder: [0.160, 0.235, 0.330, 1.0],
  scrim: [0.0, 0.01, 0.03, 0.72],
  modalPanel: [0.055, 0.075, 0.106, 1.0],
  online: [0.180, 0.820, 0.420, 1.0],
  offline: [0.900, 0.280, 0.280, 1.0],
  sliderTrack: [0.098, 0.133, 0.184, 1.0],
  sliderFill: [0.200, 0.620, 1.000, 1.0],
  sliderThumb: [0.960, 0.970, 0.990, 1.0],
  toggleOff: [0.098, 0.133, 0.184, 1.0],
  knobOff: [0.420, 0.470, 0.540, 1.0],
};

export function colour8 (r, g, b, a = 255) {
  return {r, g, b, a};
}

export const TEXT = {
  primary: colour8(232, 238, 246),
  secondary: colour8(140, 156, 178),
  muted: colour8(92, 108, 130),
  accent: colour8(80, 170, 255),
  active: colour8(245, 250, 255),
};

export const TEXT_RGBA = {
  primary: [0.910, 0.933, 0.965, 1.0],
  secondary: [0.549, 0.612, 0.698, 1.0],
  muted: [0.361, 0.424, 0.510, 1.0],
  accent: [0.314, 0.667, 1.000, 1.0],
  active: [0.961, 0.980, 1.000, 1.0],
  online: [0.180, 0.820, 0.420, 1.0],
  offline: [0.900, 0.280, 0.280, 1.0],
};

// Unused by box-based chrome; kept so colour_picker imports stay stable.
export const UI_TEXTURE = {
  plate: '',
  well: '',
  controlPlate: '',
};

// A light's colour as a UI tint; dimmed when the light is off.
export function lightTint (rgb, on = true) {
  const [r, g, b] = rgb;
  const k = on ? 1 : 0.35;
  return [(r / 255) * k, (g / 255) * k, (b / 255) * k, 1];
}
