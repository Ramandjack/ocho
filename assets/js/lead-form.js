const form = document.getElementById("leadForm");
const submitBtn = document.getElementById("leadSubmitBtn");
const formStatus = document.getElementById("formStatus");

if (form && submitBtn && formStatus) {
  const originalButtonText = submitBtn.textContent;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    formStatus.textContent = "";
    formStatus.className = "form-status";
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const payload = {
      name: data.name?.trim() || "",
      email: data.email?.trim() || "",
      company: data.company?.trim() || "",
      project_type: data.project_type || "",
      budget: data.budget || "",
      message: data.message?.trim() || "",
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") || "";
      let result = {};

      if (contentType.includes("application/json")) {
        result = await response.json();
      } else {
        result.message = await response.text();
      }

      if (!response.ok) {
        throw new Error(result.message || "No se pudo enviar el formulario.");
      }

      formStatus.textContent = result.message || "Gracias. Recibimos tu consulta.";
      formStatus.classList.add("success");
      form.reset();
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("Error enviando lead:", error);

      if (error.name === "AbortError") {
        formStatus.textContent = "La solicitud tardó demasiado. Intentá nuevamente.";
      } else {
        formStatus.textContent = "Hubo un problema al enviar tu consulta. Intentá nuevamente.";
      }

      formStatus.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalButtonText;
    }
  });
}