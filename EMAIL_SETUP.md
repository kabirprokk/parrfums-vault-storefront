# Transactional email setup

The `order-email` Edge Function sends a short, store-only alert when an order is placed. It contains the order reference, total and a **Manage this order** button; the button opens the exact order in `/admin` and still requires the owner's Google sign-in and MFA. It does not send pending-order details to the customer. After Razorpay verifies payment, the customer receives the detailed payment confirmation and the store receives a concise payment-status alert. Email delivery is best-effort; order creation/payment state do not depend on Resend. Resend idempotency keys prevent duplicate sends for the same order event.

## Resend domain

Domain: `mail.parrfumsvault.in`  
Region: `ap-northeast-1` (Tokyo)  
Sending: enabled  
Receiving/open/click tracking: disabled

Add these records in GoDaddy DNS, or use **Auto configure** from [the Resend domain page](https://resend.com/domains/051ca94d-4578-478b-af25-a8aa16911061):

| Type | Host/Name | Value | Priority |
| --- | --- | --- | ---: |
| TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCaCstQI+SnFuY9Hzvef5sgBihOCTpZlBkYYk6nllybJEqYHjN+1tS2wd9vMdaxOZ9Q8jD0pbRjsul/+qPh4QgLPFXZR6DDRlYnYQ8ydlTDX8AALicTx23Rm2DY1BSSlsBAYoM2kOmknXB6zfgdFaW9U1c792YcoutnfRre6+c4swIDAQAB` | — |
| MX | `send.mail` | `feedback-smtp.ap-northeast-1.amazonses.com` | 10 |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | — |
| CNAME | `rsend.mail` | `send.forge.rmta.net` | — |

TTL: Auto. The root domain already has DMARC; it applies to this subdomain unless a more-specific DMARC record overrides it. After DNS publishes, trigger verification on the Resend domain page.

## Sender and secrets

The authenticated sender must use the verified domain. Customer replies go to the existing Gmail contact address:

```text
ORDER_EMAIL_FROM=Parrfums Vault <orders@mail.parrfumsvault.in>
ORDER_EMAIL_REPLY_TO=quillsandcologne@gmail.com
ORDER_EMAIL_TEMPLATE_ID=parrfums-vault-order-and-payment-updates
ORDER_NOTIFICATION_TO=quillsandcologne@gmail.com
SITE_URL=https://parrfumsvault.in
```

After verification, create a **sending-only** Resend API key restricted to `mail.parrfumsvault.in`, then store it as `RESEND_API_KEY` in Supabase Edge Function secrets. Do not put the key in frontend code, Git, or chat. Supabase also needs its existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets for server-side order lookups.

The published Resend template alias is `parrfums-vault-order-and-payment-updates`. It supplies the itemized layout for the verified-payment receipt only. Store alerts are generated server-side and link to the protected admin order view.

## Seller order workflow

The seller can process a large order history from **Admin → Update details → Orders**. The console loads at most 50 rows per page and supports status filters and server-side search, including exact order IDs. The email's **Manage this order** action deep-links to the matching order filter, so the seller does not need to scan every customer's record. The seller updates fulfilment status in the console; customers see the latest status and timeline in their account and receive a concise status email. Status emails contain no delivery address or itemized payment details. The status-email endpoint independently verifies admin membership and MFA through the database; the link itself grants no access.
