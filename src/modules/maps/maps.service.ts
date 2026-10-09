import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { CONFIG, type AppConfig } from '../../config/config';
import {
  CoordinatesDto,
  MapImageDto,
  MapTileDto,
} from '../locations/location.dto';
type Feature = {
  id: string;
  geometry: { coordinates: [number, number] };
  properties: {
    full_address?: string;
    name?: string;
    place_formatted?: string;
  };
};
@Injectable()
export class MapsService {
  private readonly tileCache = new Map<
    string,
    { dataUri: string; expiresAt: number }
  >();
  private readonly tileRequests = new Map<
    string,
    Promise<{ dataUri: string }>
  >();
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  async tile({ z, x, y }: MapTileDto): Promise<{ dataUri: string }> {
    if (x >= 2 ** z || y >= 2 ** z)
      throw new BadRequestException('Invalid map tile coordinates.');
    const key = `${z}/${x}/${y}`;
    const cached = this.tileCache.get(key);
    if (cached && cached.expiresAt > Date.now())
      return { dataUri: cached.dataUri };
    const pending = this.tileRequests.get(key);
    if (pending) return pending;
    const request = (async () => {
      const url = new URL(
        `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/${key}.png`,
      );
      const response = await this.request(url);
      const dataUri = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
      if (this.tileCache.size >= 128) {
        const [oldest] = this.tileCache.keys();
        if (oldest) this.tileCache.delete(oldest);
      }
      // Runtime-only public map imagery. Tokens and user locations are never cached here.
      this.tileCache.set(key, { dataUri, expiresAt: Date.now() + 5 * 60_000 });
      return { dataUri };
    })();
    this.tileRequests.set(key, request);
    try {
      return await request;
    } finally {
      this.tileRequests.delete(key);
    }
  }
  private async request(url: URL) {
    url.searchParams.set('access_token', this.config.MAPBOX_TOKEN);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error('Provider rejected request');
      return response;
    } catch {
      throw new ServiceUnavailableException(
        'Map service is unavailable. Please try again.',
      );
    }
  }
  async search(q: string) {
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('q', q);
    url.searchParams.set('country', 'eg');
    url.searchParams.set('limit', '5');
    // These are selectable saved addresses, so request Mapbox permanent geocoding.
    url.searchParams.set('permanent', 'true');
    url.searchParams.set('autocomplete', 'false');
    return this.features(
      ((await (await this.request(url)).json()) as { features: Feature[] })
        .features,
    );
  }
  async reverse(point: CoordinatesDto) {
    const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
    url.searchParams.set('longitude', String(point.longitude));
    url.searchParams.set('latitude', String(point.latitude));
    url.searchParams.set('permanent', 'true');
    return this.features(
      ((await (await this.request(url)).json()) as { features: Feature[] })
        .features,
    );
  }
  private features(features: Feature[]) {
    return features.map((feature) => ({
      id: feature.id,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
      addressText:
        feature.properties.full_address ||
        [feature.properties.name, feature.properties.place_formatted]
          .filter(Boolean)
          .join(', '),
    }));
  }
  async route(
    pickup: CoordinatesDto,
    destination: CoordinatesDto,
    bicycle = false,
  ) {
    const profile = bicycle ? 'cycling' : 'driving';
    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/${profile}/${pickup.longitude},${pickup.latitude};${destination.longitude},${destination.latitude}`,
    );
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'simplified');
    const data = (await (await this.request(url)).json()) as {
      routes?: {
        distance: number;
        duration: number;
        geometry: { type: 'LineString'; coordinates: number[][] };
      }[];
    };
    const route = data.routes?.[0];
    if (!route || !Number.isFinite(route.distance))
      throw new ServiceUnavailableException(
        'No route found between these locations. Choose a nearby road.',
      );
    return route;
  }
  async tripImage(
    points: { longitude: number; latitude: number }[],
    route: { type: 'LineString'; coordinates: number[][] } | null,
  ) {
    const features: object[] = points.map((point, index) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        'marker-color': index === 2 ? '#D68E59' : '#193C34',
        'marker-label': ['a', 'b', 'r'][index],
        'marker-size': 'small',
      },
    }));
    if (route)
      features.unshift({
        type: 'Feature',
        geometry: route,
        properties: { stroke: '#799452', 'stroke-width': 4 },
      });
    const overlay = encodeURIComponent(
      JSON.stringify({ type: 'FeatureCollection', features }),
    );
    const url = new URL(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/geojson(${overlay})/auto/700x440?padding=50`,
    );
    const response = await this.request(url);
    return {
      dataUri: `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`,
    };
  }
  async image(
    point: MapImageDto,
    markers: { longitude: number; latitude: number }[] = [],
  ) {
    const pins = [
      `pin-s+193c34(${point.longitude},${point.latitude})`,
      ...markers
        .slice(0, 20)
        .map(
          (marker, index) =>
            `pin-s-${index + 1}+799452(${marker.longitude},${marker.latitude})`,
        ),
    ];
    const url = new URL(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pins.join(',')}/${point.longitude},${point.latitude},${point.zoom},0/700x440`,
    );
    // Keep Mapbox's built-in attribution and logo. Never return the secret-bearing URL.
    const response = await this.request(url);
    return {
      dataUri: `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`,
      width: 700,
      height: 440,
      zoom: point.zoom,
    };
  }
}
