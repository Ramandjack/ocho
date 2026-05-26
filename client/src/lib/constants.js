export const CONTENT_TYPE_COLOR = {
  article:    { bg: "rgba(96,165,250,.12)",  text: "#60a5fa" },
  collection: { bg: "rgba(167,139,250,.12)", text: "#a78bfa" },
  toolkit:    { bg: "rgba(45,212,191,.12)",  text: "#2dd4bf" },
  newsletter: { bg: "rgba(251,146,60,.12)",  text: "#fb923c" },
};

export const CONTENT_TYPE_LABEL = {
  article:    "Artículo",
  collection: "Colección",
  toolkit:    "Toolkit",
  newsletter: "Newsletter",
};

// Hex-only version for admin badge backgrounds (used with opacity suffix like `${COLOR}22`)
export const CONTENT_TYPE_HEX = {
  article:    "#60a5fa",
  collection: "#a78bfa",
  toolkit:    "#2dd4bf",
  newsletter: "#fb923c",
};
