import type { MetadataRoute } from "next";

const base = (process.env.PRODUCTION_SITE_URL || "https://icanpathacademy.vercel.app").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/ican.html`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/course.html`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/course_details.html`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/pricing.html`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/contact.html`, changeFrequency: "yearly", priority: 0.6 },
  ];
}