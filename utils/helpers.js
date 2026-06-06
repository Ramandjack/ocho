import jwt from "jsonwebtoken";
import crypto from "crypto";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeRole(role) {
  if (Array.isArray(role)) return String(role[0] || "").trim().toLowerCase();
  return String(role || "").trim().toLowerCase();
}

export function sanitizeUser(user) {
  const safe = { ...user };
  delete safe.password_hash;
  delete safe.passwordHash;
  return safe;
}

// El JWT solo identifica al usuario. El rol y el resto de datos se leen
// de NocoDB en cada request para garantizar que siempre están actualizados.
export function createToken(user) {
  return jwt.sign(
    {
      sub:   user.uuid,
      email: user.email,
    },
    process.env.JWT_SECRET || "ocho-dev-secret-change-this",
    { expiresIn: "24h" }
  );
}

const IS_PROD = (process.env.NODE_ENV || "development") === "production";

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    maxAge:   1000 * 60 * 60 * 24 * 7,
    path: "/",
  };
}

export function setAuthCookie(res, token) {
  res.cookie("ocho_token", token, getCookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie("ocho_token", { ...getCookieOptions(), maxAge: undefined });
}

export function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getCsrfCookieOptions() {
  return {
    httpOnly: false,
    secure:   IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    maxAge:   1000 * 60 * 60 * 24 * 7,
    path: "/",
  };
}

export function setCsrfCookie(res, token) {
  res.cookie("ocho_csrf", token, getCsrfCookieOptions());
}

export function clearCsrfCookie(res) {
  res.clearCookie("ocho_csrf", { ...getCsrfCookieOptions(), maxAge: undefined });
}

export function inferUserSegment(interest) {
  switch (interest) {
    case "ai_systems":  return "ai_interest";
    case "editorial":   return "editorial_interest";
    case "ecommerce":   return "ecommerce_interest";
    case "branding":
    case "marketing":   return "marketing_leads";
    default:            return "newsletter_only";
  }
}

export function inferLeadSegment(projectType) {
  switch (projectType) {
    case "ia":        return "ai_interest";
    case "ecommerce": return "ecommerce_interest";
    case "web":       return "marketing_leads";
    default:          return "high_intent";
  }
}
