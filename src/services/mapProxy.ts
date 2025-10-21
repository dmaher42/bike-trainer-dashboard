export type StreetViewImageParams = {
  location: string;
  heading: number;
  pitch: number;
  fov: number;
  size: string;
};

export class MapProxyService {
  private static instance: MapProxyService;
  private baseUrl: string;

  private constructor() {
    // Use your backend URL
    this.baseUrl = process.env.REACT_APP_MAP_PROXY_URL || 'http://localhost:3001';
  }

  static getInstance(): MapProxyService {
    if (!MapProxyService.instance) {
      MapProxyService.instance = new MapProxyService();
    }
    return MapProxyService.instance;
  }

  async getStreetViewImage(params: StreetViewImageParams): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/streetview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Street View image');
    }

    const data = await response.json();
    return data.imageUrl;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/validate-key`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
