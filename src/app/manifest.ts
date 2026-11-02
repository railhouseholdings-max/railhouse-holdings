import type { MetadataRoute } from "next";
// Install metadata only. Offline support and a service worker can be added later.
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Railhouse Holdings", short_name: "Railhouse", description: "Your personal real estate operating workspace.", start_url: "/", scope: "/", display: "standalone", background_color: "#f6f7f3", theme_color: "#173e33", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
