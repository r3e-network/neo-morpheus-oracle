import { betterStackApi, loadBetterStackEnv } from './betterstack-lib.mjs';

await loadBetterStackEnv();

const response = await betterStackApi('/heartbeats?page=1&per_page=100');
const rows = Array.isArray(response?.data) ? response.data : [];

console.log(
  JSON.stringify(
    {
      total_heartbeats: rows.length,
      heartbeats: rows.map((row) => ({
        id: row.id,
        name: row.attributes?.name || null,
        url: row.attributes?.url || null,
        period: row.attributes?.period || null,
        grace: row.attributes?.grace || null,
        status: row.attributes?.status || null,
        team_name: row.attributes?.team_name || null,
      })),
    },
    null,
    2
  )
);
