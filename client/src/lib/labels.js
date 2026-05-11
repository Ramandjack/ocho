export function segmentLabel(segment) {
  const map = {
    newsletter_only: "Newsletter",
    ai_interest: "IA · Sistemas",
    ecommerce_interest: "Ecommerce",
    editorial_interest: "Editorial",
    marketing_leads: "Marketing",
  };
  return map[segment] || segment || "General";
}

export function interestLabel(interest) {
  const map = {
    branding: "Branding",
    digital_products: "Productos digitales",
    ai_systems: "IA · Automatización",
    ecommerce: "Ecommerce",
    marketing: "Marketing",
    editorial: "Editorial",
    all: "Todos los temas",
  };
  return map[interest] || interest || "—";
}
