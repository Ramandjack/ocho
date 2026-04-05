const API_BASE =
  window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:3000"
    : "https://api.ocho.com.ar";

const form = document.getElementById("leadForm");
const submitBtn = document.getElementById("leadSubmitBtn");
const formStatus = document.getElementById("formStatus");

if (form && submitBtn && formStatus) {
  const originalButtonText = submitBtn.textContent;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    formStatus.textContent = "";
    formStatus.className = "form-status";
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";

    const data = new FormData(form);

    const payload = {
      name: data.get("name")?.toString().trim() || "",
      email: data.get("email")?.toString().trim() || "",
      company: data.get("company")?.toString().trim() || "",
      project_type: data.get("project_type")?.toString().trim() || "",
      budget: data.get("budget")?.toString().trim() || "",
      message: data.get("message")?.toString().trim() || "",
      source: "ocho_web",
      page: window.location.href,
      user_agent: navigator.userAgent,
      created_at: new Date().toISOString()
    };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!payload.name || !payload.email || !payload.project_type || !payload.budget || !payload.message) {
      formStatus.textContent = "Completá todos los campos obligatorios.";
      formStatus.classList.add("error");
      submitBtn.disabled = false;
      submitBtn.textContent = originalButtonText;
      return;
    }

    if (!emailRegex.test(payload.email)) {
      formStatus.textContent = "Ingresá un email válido.";
      formStatus.classList.add("error");
      submitBtn.disabled = false;
      submitBtn.textContent = originalButtonText;
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/lead`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "No se pudo enviar el formulario.");
      }

      formStatus.textContent = result.message || "Gracias. Recibimos tu consulta.";
      formStatus.classList.add("success");
      form.reset();
    } catch (error) {
      console.error("Error enviando lead:", error);
      formStatus.textContent = error.message || "Hubo un problema al enviar tu consulta. Intentá nuevamente.";
      formStatus.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalButtonText;
    }
  });
}