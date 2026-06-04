import type { MetadataRoute } from "next";

const BASE = "https://novelmetric.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/dashboard`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/best`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];
}
