import type { MetadataRoute } from "next";
import { listBestDays } from "@/lib/db";

const BASE = "https://novelmetric.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const days = await listBestDays(365).catch(() => [] as string[]);
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/dashboard`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/best`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/pro`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/insights`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    ...days.map((d) => ({
      url: `${BASE}/insights/${d}`,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
