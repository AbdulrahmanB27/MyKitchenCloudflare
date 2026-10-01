
import { Recipe } from './types';

export const config = {
  pinnedTags: ["Dinner", "Healthy", "Quick"],
  sampleRecipes: [] as Recipe[], // Default recipes have been moved to D1 Database
  // Live Cloudflare Worker URL for syncing native mobile builds (Capacitor / Android):
  // You can also change this in Settings (⚙️) anytime or update this string if you buy a custom domain.
  defaultBackendUrl: "https://mykitchen.abodybahjat.workers.dev"
};
