import { z } from 'zod';
import type { MeitreAPI } from '../lib/meitre.ts';

export interface ToolContext {
  api: MeitreAPI;
  hasHeaderRestaurant: boolean;
}

const restaurantParam = {
  restaurant: z
    .string()
    .optional()
    .describe(
      'Restaurant identifier. Optional if the account has a single restaurant. Use list_restaurants to find it.'
    ),
};

export const tools = {
  list_restaurants: {
    description:
      'List restaurants accessible to this account. Use this to find the restaurant identifier if needed.',
    parameters: z.object({}),
    execute: async (context: ToolContext) => {
      return context.api.listRestaurants();
    },
  },

  fetch_options: {
    description: 'Fetch available areas, service types and menus for the restaurant',
    parameters: z.object({
      ...restaurantParam,
    }),
    execute: async (context: ToolContext) => {
      const [areasRes, serviceTypesRes, menusRes] = await Promise.all([
        context.api.getAreas(),
        context.api.getServiceTypes(),
        context.api.getMenus(),
      ]);

      return {
        areas: areasRes.areas.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
        })),
        serviceTypes: serviceTypesRes.serviceTypes,
        menus: menusRes.menus.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
        })),
      };
    },
  },

  fetch_dates: {
    description:
      'Fetch available dates for a reservation for the next 15 days from today (or a custom start date). Filter by areaId and/or menuId when specifically asked.',
    parameters: z.object({
      ...restaurantParam,
      partySize: z.number(),
      serviceType: z.enum(['lunch', 'dinner']),
      areaId: z.number().optional(),
      menuId: z.number().optional(),
      startDate: z
        .string()
        .optional()
        .describe('Start date in YYYY-MM-DD format. Defaults to today.'),
    }),
    execute: async (
      context: ToolContext,
      params: {
        partySize: number;
        serviceType: 'lunch' | 'dinner';
        areaId?: number;
        menuId?: number;
        startDate?: string;
      }
    ) => {
      const res = await context.api.getCalendar({
        partySize: params.partySize,
        serviceType: params.serviceType,
        areaId: params.areaId,
        menuId: params.menuId,
      });

      const startDate = params.startDate ? +new Date(params.startDate) : Date.now();
      const endDate = startDate + 15 * 24 * 60 * 60 * 1000;

      return res.data.calendar
        .filter((d) => d.isAvailable)
        .filter((d) => {
          const ts = +new Date(d.date);
          return ts >= startDate && ts <= endDate;
        })
        .map((d) => d.date.split('T')[0]);
    },
  },

  fetch_timeslots: {
    description:
      'Fetch available timeslots for a specific date. Filter by areaId and/or menuId when specifically asked. Each timeslot specifies which areas and menus are available.',
    parameters: z.object({
      ...restaurantParam,
      partySize: z.number(),
      date: z.string().describe('Date in YYYY-MM-DD format'),
      serviceType: z.enum(['lunch', 'dinner']),
      areaId: z.number().optional(),
      menuId: z.number().optional(),
    }),
    execute: async (
      context: ToolContext,
      params: {
        partySize: number;
        date: string;
        serviceType: 'lunch' | 'dinner';
        areaId?: number;
        menuId?: number;
      }
    ) => {
      const res = await context.api.getTimeslots({
        partySize: params.partySize,
        date: params.date,
        serviceType: params.serviceType,
        areaId: params.areaId,
        menuId: params.menuId,
      });

      return res.data.center.slots.map((s) => ({
        hour: s.hour,
        areas: s.availableAreas.map((a) => ({ id: a.id, name: a.name })),
        menus: s.menus.map((m) => ({ id: m.id, name: m.name })),
      }));
    },
  },

  search_reservations: {
    description: 'Search for reservations by phone number. Returns only booked (active) reservations.',
    parameters: z.object({
      ...restaurantParam,
      phone: z.string().describe('Phone number to search for'),
    }),
    execute: async (context: ToolContext, params: { phone: string }) => {
      const res = await context.api.searchReservations(params.phone);

      return res.data.reservations
        .filter((r) => r.status === 'booked')
        .map((r) => ({
          id: r.id,
          date: r.resDate.split('T')[0],
          time: r.resTime.split(' ')[1]?.slice(0, 5) ?? r.resTime,
          name: r.guestName,
          phone: r.guestPhone,
          email: r.guestEmail,
          partySize: r.partySize,
          area: { id: r.areaId, name: r.area },
          menu: { id: r.menuId, name: r.menu },
        }));
    },
  },

  book_reservation: {
    description: 'Book a new reservation',
    parameters: z.object({
      ...restaurantParam,
      partySize: z.number(),
      date: z.string().describe('Date in YYYY-MM-DD format'),
      time: z.string().describe('Time in HH:MM format'),
      areaId: z
        .number()
        .describe("If the user doesn't specify an area, pick the first one from fetch_options."),
      menuId: z.number().optional().describe('Use only if the user specifies a menu.'),
      name: z.string().describe('Guest name'),
      phone: z.string().describe('Guest phone number'),
      email: z.string().optional().describe('Guest email'),
    }),
    execute: async (
      context: ToolContext,
      params: {
        partySize: number;
        date: string;
        time: string;
        areaId: number;
        menuId?: number;
        name: string;
        phone: string;
        email?: string;
      }
    ) => {
      const { reservation } = await context.api.createReservation({
        partySize: params.partySize,
        date: params.date,
        time: params.time,
        area: params.areaId,
        name: params.name,
        phone: params.phone,
        email: params.email ?? '',
        mode: 'new',
        allergies: '',
        defaultLang: 'es',
        howManyKids: 0,
        howManyVeggie: 0,
        kids: false,
        partySizeType: 'normal',
        paymentProcessor: 'stripe',
        pets: false,
        publicOrHold: 'public',
        reservationMode: 'main',
        restrictions: false,
        type: 'traditional',
        veggie: false,
      });

      return {
        id: reservation.id,
        status: reservation.status,
        date: reservation.resDate,
        time: reservation.resTime,
        name: reservation.guestName,
        partySize: reservation.partySize,
      };
    },
  },

  reschedule_reservation: {
    description: 'Reschedule an existing reservation to a new date and time',
    parameters: z.object({
      ...restaurantParam,
      reservationId: z.number().describe('ID of the reservation to reschedule'),
      partySize: z.number(),
      date: z.string().describe('New date in YYYY-MM-DD format'),
      time: z.string().describe('New time in HH:MM format'),
      areaId: z
        .number()
        .describe("If the user doesn't specify an area, pick the first one from fetch_options."),
      menuId: z.number().optional().describe('Use only if the user specifies a menu.'),
      name: z.string().describe('Guest name'),
      phone: z.string().describe('Guest phone number'),
      email: z.string().optional().describe('Guest email'),
    }),
    execute: async (
      context: ToolContext,
      params: {
        reservationId: number;
        partySize: number;
        date: string;
        time: string;
        areaId: number;
        menuId?: number;
        name: string;
        phone: string;
        email?: string;
      }
    ) => {
      const { reservation } = await context.api.createReservation({
        partySize: params.partySize,
        date: params.date,
        time: params.time,
        area: params.areaId,
        name: params.name,
        phone: params.phone,
        email: params.email ?? '',
        mode: 'reschedule',
        rescheduleOption: 1,
        reservationToRescheduleId: params.reservationId,
        allergies: '',
        defaultLang: 'es',
        howManyKids: 0,
        howManyVeggie: 0,
        kids: false,
        partySizeType: 'normal',
        paymentProcessor: 'stripe',
        pets: false,
        publicOrHold: 'public',
        reservationMode: 'main',
        restrictions: false,
        type: 'traditional',
        veggie: false,
      });

      return {
        id: reservation.id,
        status: reservation.status,
        date: reservation.resDate,
        time: reservation.resTime,
        name: reservation.guestName,
        partySize: reservation.partySize,
      };
    },
  },

  cancel_reservation: {
    description: 'Cancel an existing reservation',
    parameters: z.object({
      ...restaurantParam,
      reservationId: z.number().describe('ID of the reservation to cancel'),
    }),
    execute: async (context: ToolContext, params: { reservationId: number }) => {
      const res = await context.api.cancelReservation(params.reservationId);

      return {
        id: res.data.reservation.id,
        status: res.data.reservation.status,
        date: res.data.reservation.resDate,
        time: res.data.reservation.resTime,
        name: res.data.reservation.guestName,
        partySize: res.data.reservation.partySize,
      };
    },
  },
};

export type ToolName = keyof typeof tools;
