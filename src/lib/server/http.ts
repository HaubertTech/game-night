// Shared helpers for JSON API routes: Czech error messages, auth guard, input parsing.

import { error, type RequestEvent } from '@sveltejs/kit';
import { LEVELS, type Level } from '../types.ts';
import type { Household } from './repo/households.ts';

export function fail(status: 400 | 401 | 403 | 404 | 409 | 413, message: string): never {
  error(status, message);
}

export function requireHousehold(event: Pick<RequestEvent, 'locals'>): Household {
  const household = event.locals.household;
  if (!household) fail(401, 'Nejdřív se přihlas do domácnosti.');
  return household;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    fail(400, 'Tělo požadavku musí být platný JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Tělo požadavku musí být JSON objekt.');
  return body as Record<string, unknown>;
}

export function parseId(raw: string | undefined, what = 'záznam'): number {
  if (!raw || !/^\d{1,15}$/.test(raw)) fail(404, `Takový ${what} neexistuje.`);
  return Number(raw);
}

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

export function cleanName(value: unknown, field = 'Jméno', max = 40): string {
  if (typeof value !== 'string' || !value.trim()) fail(400, `${field} nesmí být prázdné.`);
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length > max) fail(400, `${field} může mít nejvýš ${max} znaků.`);
  return name;
}

export function cleanAvatar(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 16) fail(400, 'Avatar musí být krátký text nebo emoji.');
  return value;
}

export function cleanBirthYear(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const year = Number(value);
  const now = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > now) fail(400, `Rok narození musí být číslo mezi 1900 a ${now}.`);
  return year;
}
