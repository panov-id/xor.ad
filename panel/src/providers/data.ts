import { DataProvider } from "@refinedev/core";
import { api } from "./api";
import { API_URL } from "./constants";

// Custom Refine data provider over the relay control-plane (/admin/<resource>).
// Collections return a plain array with an x-total-count header; ids are the
// record's natural key (email). Resource names map underscore -> dash
// (panel_users -> panel-users). Adding a panel resource = a relay route + a
// Refine resource, no provider change.
const path = (resource: string): string => resource.replace(/_/g, "-");

async function fail(res: Response, action: string): Promise<never> {
  let message = `${action} failed (${res.status})`;
  try {
    message = (await res.json()).error ?? message;
  } catch { /* non-JSON body */ }
  throw { message, statusCode: res.status };
}

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,

  getList: async ({ resource }) => {
    const res = await api(`/admin/${path(resource)}`);
    if (!res.ok) await fail(res, `list ${resource}`);
    const data = await res.json();
    const total = Number(res.headers.get("x-total-count") ?? data.length);
    return { data, total };
  },

  getOne: async ({ resource, id }) => {
    const res = await api(`/admin/${path(resource)}`);
    if (!res.ok) await fail(res, `get ${resource}`);
    const rows = await res.json();
    return { data: rows.find((r: { id?: unknown }) => r.id === id) };
  },

  create: async ({ resource, variables }) => {
    const res = await api(`/admin/${path(resource)}`, {
      method: "POST",
      body: JSON.stringify(variables),
    });
    if (!res.ok) await fail(res, `create ${resource}`);
    return { data: await res.json() };
  },

  update: async ({ resource, id, variables }) => {
    const res = await api(`/admin/${path(resource)}/${encodeURIComponent(String(id))}`, {
      method: "PATCH",
      body: JSON.stringify(variables),
    });
    if (!res.ok) await fail(res, `update ${resource}`);
    return { data: await res.json() };
  },

  deleteOne: async ({ resource, id }) => {
    const res = await api(`/admin/${path(resource)}/${encodeURIComponent(String(id))}`, {
      method: "DELETE",
    });
    if (!res.ok) await fail(res, `delete ${resource}`);
    return { data: await res.json() };
  },
};
