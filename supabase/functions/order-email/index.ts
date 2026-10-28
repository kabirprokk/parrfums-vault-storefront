import { createOrderEmailHandler } from "../_shared/order-email-handler.mjs";

Deno.serve(createOrderEmailHandler({ env: (name: string) => Deno.env.get(name) }));
