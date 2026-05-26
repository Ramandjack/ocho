import jwt from "jsonwebtoken";

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

export function createToken(user) {
  return jwt.sign(
    {
      sub:   user.uuid,
      email: user.email,
      role:  normalizeRole(user.role) || "member",
      first_name: user.first_name || "",
      last_name:  user.last_name  || "",
      full_name:  user.full_name  || "",
      city:       user.city       || "",
      country:    user.country    || "",
      phone:      user.phone      || "",
      company:    user.company    || "",
      role_title: user.role_title || "",
      interest:   user.interest   || "",
      profile:    user.profile    || "",
      newsletter_consent: Boolean(user.newsletter_consent),
      data_consent:       Boolean(user.data_consent),
      status:  user.status  || "active",
      source:  user.source  || "register_form",
      segment: user.segment || "newsletter_only",
    },
    process.env.JWT_SECRET || "ocho-dev-secret-change-this",
    { expiresIn: "7d" }
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
