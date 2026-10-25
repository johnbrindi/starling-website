/** GET /admin.webmanifest — installable "Juthelink Admin" app (opens on Confirm MoMo). */
export function GET() {
  return Response.json(
    {
      name: "Juthelink Admin",
      short_name: "JL Admin",
      description: "Confirm MoMo payments and manage Juthelink Wi-Fi.",
      id: "/admin",
      start_url: "/admin/confirm?source=pwa",
      scope: "/admin",
      display: "standalone",
      orientation: "portrait",
      background_color: "#ffffff",
      theme_color: "#16181d",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
