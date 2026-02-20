import { getToken, setToken, deleteToken } from '../db/index.ts';

const BASE_URL = 'https://api.meitre.com/api';

export interface MeitreCredentials {
  username: string;
  password: string;
  restaurant?: string;
}

export interface MeitreRestaurant {
  id: number;
  name: string;
  subdomainPrefix: string;
  address: string;
  timezone: string;
}

export class MeitreAPI {
  private credentials: MeitreCredentials;
  private db: D1Database;
  private encryptionKey: string;
  private cacheKey: string;
  private token: string | null = null;
  private restaurant: string | null;

  constructor(credentials: MeitreCredentials, db: D1Database, encryptionKey: string) {
    this.credentials = credentials;
    this.db = db;
    this.encryptionKey = encryptionKey;
    this.restaurant = credentials.restaurant ?? null;
    this.cacheKey = credentials.username;
  }

  private async login(): Promise<string> {
    const res = await fetch(`${BASE_URL}/login_check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.credentials.username,
        password: this.credentials.password,
      }),
    });

    if (!res.ok) {
      throw new Error(`Meitre login failed: ${res.status}`);
    }

    const data = await res.json<{ token: string }>();
    await setToken(this.db, this.cacheKey, data.token, this.encryptionKey);
    this.token = data.token;
    return data.token;
  }

  private async getOrRefreshToken(): Promise<string> {
    if (this.token) return this.token;

    const cached = await getToken(this.db, this.cacheKey, this.encryptionKey);
    if (cached) {
      this.token = cached;
      return cached;
    }

    return this.login();
  }

  async listRestaurants(): Promise<MeitreRestaurant[]> {
    const token = await this.getOrRefreshToken();

    const res = await fetch(`${BASE_URL}/admin/v2/restaurants`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Meitre API error: ${res.status}`);
    }

    const data = await res.json<{
      restaurants: Array<{
        id: number;
        name: string;
        subdomainPrefix: string;
        address: string;
        timezone: string;
      }>;
    }>();

    return data.restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      subdomainPrefix: r.subdomainPrefix,
      address: r.address,
      timezone: r.timezone,
    }));
  }

  setRestaurant(restaurant: string) {
    this.restaurant = restaurant;
  }

  private async getRestaurant(): Promise<string> {
    if (this.restaurant) return this.restaurant;

    const restaurants = await this.listRestaurants();

    if (restaurants.length === 0) {
      throw new Error('No restaurants found for this account');
    }

    if (restaurants.length > 1) {
      throw new Error(
        'Multiple restaurants found for this account. Use the list_restaurants tool to see them, then set the "restaurant" header.'
      );
    }

    this.restaurant = restaurants[0].subdomainPrefix;
    return this.restaurant;
  }

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getOrRefreshToken();
    const restaurant = await this.getRestaurant();
    const url = `${BASE_URL}/admin/v2/restaurants/${restaurant}/${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    // On 401, invalidate cache and retry once
    if (res.status === 401) {
      await deleteToken(this.db, this.cacheKey);
      this.token = null;
      const newToken = await this.login();

      const retry = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          ...options.headers,
        },
      });

      if (!retry.ok) {
        throw new Error(`Meitre API error: ${retry.status} ${await retry.text()}`);
      }

      return retry.json<T>();
    }

    if (!res.ok) {
      throw new Error(`Meitre API error: ${res.status} ${await res.text()}`);
    }

    return res.json<T>();
  }

  // --- API methods ---

  async getAreas() {
    return this.fetch<{
      code: number;
      message: string;
      areas: Array<{
        id: number;
        name: string;
        description: string;
        priority: boolean;
        offerAlways: boolean;
        privateArea: boolean;
      }>;
    }>('areas');
  }

  async getServiceTypes() {
    return this.fetch<{
      code: number;
      message: string;
      serviceTypes: Array<'lunch' | 'dinner'>;
    }>('timeslots/servicetype');
  }

  async getMenus() {
    return this.fetch<{
      code: number;
      message: string;
      menus: Array<{
        id: number;
        name: string;
        description: string;
        isActive: boolean;
        price: string;
      }>;
    }>('menus?onlyActives=1');
  }

  async getCalendar(params: {
    partySize: number;
    serviceType: string;
    areaId?: number;
    menuId?: number;
  }) {
    const searchParams = new URLSearchParams({
      partySize: String(params.partySize),
      serviceType: params.serviceType,
    });
    if (params.areaId) searchParams.set('areasIds', String(params.areaId));
    if (params.menuId) searchParams.set('menusIds', String(params.menuId));

    return this.fetch<{
      code: number;
      message: string;
      data: {
        calendar: Array<{
          date: string;
          isAvailable: boolean;
          isSpecialDay: boolean;
        }>;
      };
    }>(`availabilities/calendarnew?${searchParams}`);
  }

  async getTimeslots(params: {
    partySize: number;
    date: string;
    serviceType: string;
    areaId?: number;
    menuId?: number;
  }) {
    const searchParams = new URLSearchParams({
      partySize: String(params.partySize),
      date: params.date,
      serviceType: params.serviceType,
    });
    if (params.areaId) searchParams.set('areasIds', String(params.areaId));
    if (params.menuId) searchParams.set('menusIds', String(params.menuId));

    return this.fetch<{
      code: number;
      message: string;
      data: {
        center: {
          slots: Array<{
            hour: string;
            availableAreas: Array<{ id: number; name: string }>;
            menus: Array<{ id: number; name: string }>;
          }>;
        };
      };
    }>(`availabilities/searchallhoursadmin?${searchParams}`);
  }

  async searchReservations(term: string) {
    const searchParams = new URLSearchParams({ term });

    return this.fetch<{
      code: number;
      message: string;
      data: {
        reservations: Array<{
          id: number;
          status: string;
          resDate: string;
          resTime: string;
          guestName: string;
          guestPhone: string;
          guestEmail: string;
          partySize: number;
          areaId: number;
          area: string;
          menuId: number | null;
          menu: string | null;
        }>;
      };
    }>(`search/fulltext?${searchParams}`);
  }

  async searchClients(phone: string) {
    const searchParams = new URLSearchParams({ fullName: phone });

    return this.fetch<{
      code: number;
      message: string;
      clients: Array<{
        id: number;
        fullName: string;
        email: string;
        phone: string;
      }>;
    }>(`clients?${searchParams}`);
  }

  async createReservation(data: Record<string, unknown>) {
    return this.fetch<{
      code: number;
      message: string;
      reservation: {
        id: number;
        uniqueId: string;
        status: string;
        resDate: string;
        resTime: string;
        partySize: number;
        guestName: string;
        guestEmail: string;
        guestPhone: string;
      };
    }>('reservations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelReservation(reservationId: number) {
    const searchParams = new URLSearchParams({
      withCharge: '0',
      cancelOption: '1',
    });

    return this.fetch<{
      code: number;
      message: string;
      data: {
        reservation: {
          id: number;
          status: string;
          resDate: string;
          resTime: string;
          guestName: string;
          partySize: number;
        };
      };
    }>(`reservations/${reservationId}?${searchParams}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    });
  }
}
