import {createPaymentHandler} from '../_shared/payment-handler.mjs';
Deno.serve(createPaymentHandler({env:(name:string)=>Deno.env.get(name)}));
