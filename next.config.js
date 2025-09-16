/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  distDir: "out",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Configuración para GitHub Pages
  basePath: process.env.NODE_ENV === "production" ? "/bicigame" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/bicigame/" : "",
  // Asegurar que los CSS se incluyan
  experimental: {
    optimizeCss: false,
  },
}

module.exports = nextConfig
