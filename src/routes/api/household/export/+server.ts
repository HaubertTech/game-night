import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAccount } from '#lib/server/http.ts';
import { exportHousehold } from '#lib/server/services/household-data.ts';

/** All data of the household as a JSON download (manager only). */
export const GET: RequestHandler = async (event) => {
  const { household } = requireAccount(event);
  const data = await exportHousehold(household.id);
  const day = new Date().toISOString().slice(0, 10);
  return json(data, {
    headers: {
      'content-disposition': `attachment; filename="domaci-liga-export-${day}.json"`,
      'cache-control': 'no-store',
    },
  });
};
