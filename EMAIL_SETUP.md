# Transactional email setup

The `order-email` Edge Function sends an itemized order confirmation after checkout. The `payments` function sends a separate receipt only after Razorpay payment verification. Email delivery is best-effort; order creation/payment state do not depend on Resend. Resend idempotency keys prevent duplicate sends for the same order event.

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
SITE_URL=https://parrfumsvault.in
```

After verification, create a **sending-only** Resend API key restricted to `mail.parrfumsvault.in`, then store it as `RESEND_API_KEY` in Supabase Edge Function secrets. Do not put the key in frontend code, Git, or chat. Supabase also needs its existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets for server-side order lookups.

The published Resend template alias is `parrfums-vault-order-and-payment-updates`. It supplies the itemized layout for both the pending order email and verified-payment receipt.
