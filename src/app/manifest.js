export default function manifest() {
  return {
    name: "LoadWise",
    short_name: "LoadWise",
    description: "Academic workload, early warnings and study planning.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f1eee7",
    theme_color: "#f1eee7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
