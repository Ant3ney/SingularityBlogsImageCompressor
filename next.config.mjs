/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep defaults that work well on Vercel. No Edge runtime is used for the image route.
	experimental: {
		serverActions: {
			bodySizeLimit: '30mb',
		},
	},
};

export default nextConfig;

