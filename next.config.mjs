/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@arcgis/map-components', '@arcgis/map-components-react', '@arcgis/core'],
};

export default nextConfig;
