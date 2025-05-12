// A custom Vite plugin to inject environment variables
export default function envPlugin() {
  return {
    name: 'vite-plugin-env-injection',
    configResolved(config) {
      // Log to confirm we can access the environment variable
      console.log('Google Maps API Key available:', !!process.env.GOOGLE_MAPS_API_KEY);
    },
    transformIndexHtml(html) {
      // Get API key from environment
      const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
      console.log('Injecting API Key into HTML');
      
      // Replace the placeholder with the actual API key
      return html.replace('__GOOGLE_MAPS_API_KEY__', apiKey);
    }
  };
}