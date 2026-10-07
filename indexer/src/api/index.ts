import { Hono } from "hono";
import { graphql } from "ponder";
import { db } from "ponder:api";
import schema from "ponder:schema";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    name: "rung-indexer",
    chainId: 677,
    graphql: "/graphql",
    health: "/health",
    status: "/status",
  }),
);

// Ponder 0.17 exposes GraphQL only when the API file mounts it.
app.use("/graphql", graphql({ db, schema }));

export default app;
