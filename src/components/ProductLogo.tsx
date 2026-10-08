import React from "react";

export type DeliverableProduct = "figma" | "google-docs" | "figjam" | "ai-studio";

export interface ProductMeta {
  id: DeliverableProduct;
  name: string;
  shortName: string;
  productType: string;
  url: string;
  defaultDeliverable: string;
  color: string;
  bgLight: string;
  borderLight: string;
}

export const DELIVERABLE_PRODUCTS: Record<DeliverableProduct, ProductMeta> = {
  figma: {
    id: "figma",
    name: "Figma",
    shortName: "Figma",
    productType: "High-Fidelity Design",
    url: "https://www.figma.com",
    defaultDeliverable: "Figma file",
    color: "#F24E1E",
    bgLight: "bg-orange-50/70",
    borderLight: "border-orange-200/80",
  },
  "google-docs": {
    id: "google-docs",
    name: "Google Docs",
    shortName: "Google Docs",
    productType: "Documentation & Brief",
    url: "https://docs.google.com/document/",
    defaultDeliverable: "Google Doc",
    color: "#4285F4",
    bgLight: "bg-blue-50/70",
    borderLight: "border-blue-200/80",
  },
  figjam: {
    id: "figjam",
    name: "FigJam",
    shortName: "FigJam",
    productType: "Visual & Collaborative Canvas",
    url: "https://www.figma.com/figjam/",
    defaultDeliverable: "FigJam Board",
    color: "#9747FF",
    bgLight: "bg-purple-50/70",
    borderLight: "border-purple-200/80",
  },
  "ai-studio": {
    id: "ai-studio",
    name: "Google AI Studio",
    shortName: "AI Studio",
    productType: "AI Prototype & Prompt App",
    url: "https://aistudio.google.com/",
    defaultDeliverable: "AI Studio Prototype",
    color: "#4285F4",
    bgLight: "bg-slate-100",
    borderLight: "border-slate-300",
  },
};

export const FigmaLogo: React.FC<{ className?: string }> = ({
  className = "w-4 h-4",
}) => (
  <svg
    viewBox="0 0 38 57"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Figma Logo"
  >
    <path
      d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z"
      fill="#1ABCFE"
    />
    <path
      d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z"
      fill="#0ACF83"
    />
    <path
      d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z"
      fill="#FF7262"
    />
    <path
      d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z"
      fill="#F24E1E"
    />
    <path
      d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z"
      fill="#A259FF"
    />
  </svg>
);

export const GoogleDocsLogo: React.FC<{ className?: string }> = ({
  className = "w-4 h-4",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Google Docs Logo"
  >
    <path
      d="M14.5 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V7.5L14.5 2Z"
      fill="#4285F4"
    />
    <path d="M14 2V8H20L14 2Z" fill="#A1C2FA" />
    <rect x="7" y="11" width="10" height="1.6" rx="0.8" fill="white" />
    <rect x="7" y="14" width="10" height="1.6" rx="0.8" fill="white" />
    <rect x="7" y="17" width="6.5" height="1.6" rx="0.8" fill="white" />
  </svg>
);

export const FigJamLogo: React.FC<{ className?: string }> = ({
  className = "w-4 h-4",
}) => <FigmaLogo className={className} />;

export const AiStudioLogo: React.FC<{ className?: string }> = ({
  className = "w-4 h-4",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Google AI Studio Logo"
  >
    <defs>
      <linearGradient
        id="ai-studio-grad-symbol"
        x1="3"
        y1="3"
        x2="21"
        y2="21"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#4285F4" />
        <stop offset="50%" stopColor="#9B72CF" />
        <stop offset="100%" stopColor="#D96570" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="5.5" fill="#0F172A" />
    <path
      d="M12 3.5C12 8.19442 8.19442 12 3.5 12C8.19442 12 12 15.8056 12 20.5C12 15.8056 15.8056 12 20.5 12C15.8056 12 12 8.19442 12 3.5Z"
      fill="url(#ai-studio-grad-symbol)"
    />
    <circle cx="17.5" cy="6.5" r="1.3" fill="#38BDF8" />
  </svg>
);

export const ProductLogo: React.FC<{
  product: DeliverableProduct;
  className?: string;
}> = ({ product, className = "w-4 h-4" }) => {
  switch (product) {
    case "figma":
      return <FigmaLogo className={className} />;
    case "google-docs":
      return <GoogleDocsLogo className={className} />;
    case "figjam":
      return <FigmaLogo className={className} />;
    case "ai-studio":
      return <AiStudioLogo className={className} />;
    default:
      return <GoogleDocsLogo className={className} />;
  }
};

/**
 * Resolves the appropriate product for a deliverable adhering strictly to:
 * - High-fidelity designs -> Figma (deliverable is a Figma file)
 * - Doc/text related deliverable -> Google Docs
 * - Visual (non-hi fidelity design) deliverables -> FigJam
 * - AI prototypes -> AI Studio
 */
export function resolveDeliverableProduct(params: {
  title?: string;
  iconKey?: string;
  deliverable?: string;
  explicitProduct?: DeliverableProduct;
}): ProductMeta {
  if (params.explicitProduct && DELIVERABLE_PRODUCTS[params.explicitProduct]) {
    return DELIVERABLE_PRODUCTS[params.explicitProduct];
  }

  const iconKey = (params.iconKey || "").toLowerCase();
  const title = (params.title || "").toLowerCase();
  const deliverable = (params.deliverable || "").toLowerCase();
  const combined = `${iconKey} ${title} ${deliverable}`;

  // 1. AI Prototypes -> AI Studio
  if (
    iconKey === "ai-prototype" ||
    combined.includes("ai prototype") ||
    combined.includes("ai-prototype") ||
    combined.includes("ai studio") ||
    combined.includes("prompt prototype") ||
    combined.includes("llm prototype") ||
    (combined.includes("prototype") && combined.includes("ai"))
  ) {
    return DELIVERABLE_PRODUCTS["ai-studio"];
  }

  // 2. High-fidelity designs / High-fidelity wireframes -> Figma
  if (
    iconKey === "high-fi-designs" ||
    iconKey === "high-fi-wireframes" ||
    combined.includes("high-fidelity design") ||
    combined.includes("high-fi design") ||
    combined.includes("high-fidelity wireframe") ||
    combined.includes("high-fi wireframe") ||
    combined.includes("figma file") ||
    combined.includes("production ui") ||
    combined.includes("design system specs") ||
    combined.includes("hi-fi spec") ||
    combined.includes("high-fi spec")
  ) {
    return DELIVERABLE_PRODUCTS["figma"];
  }

  // 3. Visual (non-hi fidelity design) deliverables -> FigJam
  const isVisualNonHiFi =
    iconKey === "user-flows" ||
    iconKey === "low-fi-wireframes" ||
    iconKey === "mid-fi-wireframes" ||
    iconKey === "customer-journey-map" ||
    iconKey === "service-blueprint" ||
    iconKey === "empathy-map" ||
    iconKey === "affinity-diagrams" ||
    iconKey === "opportunity-solution-tree" ||
    iconKey === "value-prop-canvas" ||
    iconKey === "crazy-8s" ||
    iconKey === "workshopping" ||
    iconKey === "mood-boards" ||
    iconKey === "site-map" ||
    combined.includes("figjam") ||
    combined.includes("user flow") ||
    combined.includes("journey map") ||
    combined.includes("service blueprint") ||
    combined.includes("affinity diagram") ||
    combined.includes("affinity map") ||
    combined.includes("empathy map") ||
    combined.includes("opportunity solution") ||
    combined.includes("solution tree") ||
    combined.includes("value prop") ||
    combined.includes("crazy 8") ||
    combined.includes("workshop board") ||
    combined.includes("mood board") ||
    combined.includes("site map") ||
    combined.includes("low-fi wireframe") ||
    combined.includes("mid-fi wireframe") ||
    combined.includes("wireframe sketch") ||
    combined.includes("concept sketch") ||
    combined.includes("canvas board") ||
    combined.includes("diagram");

  if (isVisualNonHiFi) {
    return DELIVERABLE_PRODUCTS["figjam"];
  }

  // 4. Default: All doc/text related deliverables -> Google Docs
  return DELIVERABLE_PRODUCTS["google-docs"];
}

/**
 * Ensures the primary deliverable name reflects the correct product,
 * e.g. for high-fidelity designs, returns "Figma file".
 */
export function getPrimaryDeliverableLabel(params: {
  title?: string;
  iconKey?: string;
  deliverables?: string[];
}): { label: string; product: ProductMeta } {
  const iconKey = (params.iconKey || "").toLowerCase();
  const title = (params.title || "").toLowerCase();
  const firstDeliv = params.deliverables?.[0]?.trim();

  const product = resolveDeliverableProduct({
    title: params.title,
    iconKey: params.iconKey,
    deliverable: firstDeliv,
  });

  // Example from prompt: high-fidelity designs have a deliverable that is a Figma file
  if (
    iconKey === "high-fi-designs" ||
    title.includes("high-fidelity design") ||
    title.includes("high-fi design")
  ) {
    return {
      label: firstDeliv || "Figma file",
      product,
    };
  }

  if (firstDeliv) {
    return {
      label: firstDeliv,
      product,
    };
  }

  return {
    label: product.defaultDeliverable,
    product,
  };
}
