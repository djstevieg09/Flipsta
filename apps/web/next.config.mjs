/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // small, self-contained build for Render's Node runtime
  reactStrictMode: true,
  transpilePackages: ["@flipsta/shared"],
};

export default nextConfig;
