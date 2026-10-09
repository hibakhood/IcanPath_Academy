/**
 * A recording stand-in for the Supabase client.
 *
 * It knows nothing about the database: it records every request chain the real
 * branches of api.ts build, so the request can be checked against the migrations
 * afterwards. Data responses are deliberately empty, because the point is to
 * exercise the request-building and the code around it, not the database.
 */


export function createRecordingClient() {
  const requests = [];

  function builder(table) {
    const rec = { table, op: "select", columns: null, filters: [], order: null, limit: null, rpc: null, payload: null };
    requests.push(rec);

    const chain = {};
    for (const m of ["select", "insert", "update", "upsert", "delete"]) {
      chain[m] = (arg) => {
        rec.op = m;
        rec.payload = typeof arg === "object" && arg !== null ? Object.keys(arg) : arg;
        if (m === "select") rec.columns = arg;
        return chain;
      };
    }
    for (const m of ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is"]) {
      chain[m] = (column) => {
        rec.filters.push([m, column]);
        return chain;
      };
    }
    chain.in = (column) => {
      rec.filters.push(["in", column]);
      return chain;
    };
    chain.order = (column) => {
      rec.order = column;
      return chain;
    };
    chain.limit = (n) => {
      rec.limit = n;
      return chain;
    };
    chain.range = () => chain;
    chain.single = () => Promise.resolve({ data: {}, error: null });
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    // thenable, so await works on a plain select
    chain.then = (onOk) => Promise.resolve({ data: [], error: null }).then(onOk);
    return chain;
  }

  const client = {
    requests,
    from: (table) => builder(table),
    rpc: (fn, args) => {
      requests.push({ table: null, op: "rpc", rpc: fn, payload: args });
      return Promise.resolve({ data: {}, error: null });
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: "00000000-0000-4000-8000-000000000001" } } }, error: null }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
      signUp: () => Promise.resolve({ data: {}, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
      updateUser: () => Promise.resolve({ data: {}, error: null }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: {}, error: null }),
        remove: () => Promise.resolve({ data: [], error: null }),
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: "https://example.invalid/x" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.invalid/x" } }),
      }),
    },
    channel: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({ on: () => ({ unsubscribe: () => {} }) }) }) }) }) }),
  };
  return client;
}
