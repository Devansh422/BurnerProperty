const THREE_STYLESHEET_PATH = "/3d.css";
const THREE_MODULE_PATH = "/3d.js";

function ensureStylesheet(href) {
  const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
  if (existing) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export async function init(heroHost) {
  if (!heroHost) {
    throw new Error("Hero host not found");
  }

  if (heroHost.dataset.hero3dMounted === "1") {
    return;
  }

  const template = document.getElementById("hero-3d-template");
  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error("3D hero template is missing");
  }

  ensureStylesheet(THREE_STYLESHEET_PATH);

  const fragment = template.content.cloneNode(true);
  heroHost.classList.add("hero--three");
  heroHost.replaceChildren(fragment);

  document.body.classList.add("hero-3d-active");
  heroHost.dataset.hero3dMounted = "1";

  await import(THREE_MODULE_PATH);
}
