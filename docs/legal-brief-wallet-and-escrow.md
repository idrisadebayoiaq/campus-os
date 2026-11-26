# CampusOS: wallet and marketplace escrow. Brief for legal advice

Give this to a Nigerian fintech / payments lawyer before real money moves. It describes what the product does so they can tell you what licences, terms and limits you need. It is a description, not legal advice.

## What CampusOS is
A campus super-app for students (ordering food, buying and selling items, renting rooms, services) and a web portal for the businesses that serve them. Cards are processed by Paystack.

## Money flows we built

1. **Student wallet (closed loop)**
   - A student tops up by card (Visa, Mastercard, Verve, via Paystack). Minimum ₦500, maximum ₦100,000 per top-up, wallet cap ₦200,000.
   - The card fee is added to the top-up and shown before payment. The wallet is credited with the amount chosen.
   - Students pay for everything inside CampusOS from the wallet: food orders, marketplace purchases, rent and fee payment requests, a premium subscription.
   - Wallet money cannot be withdrawn to a bank and cannot be sent to other students. Refunds go back to the wallet.
   - CampusOS holds the real money in its Paystack balance / settlement bank account. The wallet is a ledger of what CampusOS owes each student.

2. **Businesses (kitchens, landlords, sellers, services)**
   - Money from wallet payments is credited to the business's "CampusOS balance" after CampusOS takes a commission (food 3%, rent/deposit/agent fee 5%, marketplace and service fees 2%).
   - The owner can withdraw the balance to a verified bank account (minimum ₦5,000) by Paystack Transfer.
   - Businesses can pay a ₦3,000/month plan from their balance or by card.

3. **Marketplace escrow (student-to-student and business-to-student)**
   - The buyer pays from the wallet. The money is held by CampusOS, not the seller.
   - The seller has 24 hours to accept, then 5 days to complete the handover. Otherwise the buyer is refunded automatically.
   - Handover: the buyer gives the seller a 6-digit code in person. The seller enters it with a photo. The buyer then confirms with a photo (releases at once) or does nothing, and the money is released automatically after 48 hours. The buyer can open a dispute before that.
   - A buyer can cancel freely before the seller accepts. After acceptance, cancelling needs the seller's agreement, otherwise it becomes a dispute.
   - Disputes are decided by CampusOS staff: pay the seller, refund the buyer, or split. Commission is taken only on the part paid to the seller.
   - Student sellers can withdraw their earnings to their own bank account (minimum ₦5,000).

4. **Subscriptions**: student premium ₦1,000/month taken from the wallet, auto-renewing unless turned off.

## Questions to ask the lawyer

**Licensing and structure**
- Does holding student balances in a wallet, even closed-loop and spend-only inside our own platform, need a CBN licence or an agreement with a licensed provider? If so, which category, and what are the capital and compliance requirements?
- Does the marketplace escrow (holding a buyer's money until handover) need separate authorisation, or can it run under Paystack's licence and terms? Should we use a licensed escrow or a partner instead?
- Which parts can run under Paystack's licence (for example Paystack subaccounts or split payments) so we do not hold funds ourselves?
- Where should the money be held (a ring-fenced account, a trust or escrow account, with a licensed bank) and what happens to student balances if CampusOS stops operating?

**Customer protection and terms**
- What must our terms say about wallet balances: expiry, dormancy, refunds, closing an account, fees, and who owns the money?
- What do we need on dispute resolution, refunds, chargebacks and a complaints process? Which consumer protection rules apply (for example FCCPC)?
- What must users agree to before the first top-up?
- Are wallet limits (₦100,000 per top-up, ₦200,000 cap) acceptable without identity checks, or do we need KYC tiers?

**Compliance**
- Anti-money-laundering and fraud duties for a wallet and escrow: what to monitor and report, and what records to keep and for how long?
- Data protection (NDPA): bank details, student ID images and dispute photos. Do we need a registered data controller, a DPIA or an audit?
- Tax: VAT on commission, subscriptions and fees, and income tax treatment of commission and wallet float.

**Business accounts**
- Do we need written agreements with kitchens, landlords and sellers covering commission, payouts, refunds, negative balances after refunds and fraud?
- Rent and deposits: who is responsible if a landlord keeps a deposit, and should deposits be held rather than paid out instantly?
- Student sellers receiving money: any tax or reporting duties, and age or identity rules?

## Facts to bring
- Paystack account type and whether Transfers are enabled.
- Company registration details and directors.
- This brief and screenshots of the wallet, checkout and escrow screens.
- How refunds, disputes and failed payouts are handled (in the sections above).
- Admin controls: the wallet can be switched off instantly from the portal Money page, and commissions and limits can be changed there.

## How to find the right adviser
- Look for a lawyer or firm with a **fintech / payments** practice in Nigeria, not a general corporate lawyer. Ask for a short scoping call and fixed-fee written advice on exactly the questions above.
- Ask Paystack's compliance or partnerships team what they allow for platforms that hold balances or run escrow. They often have rules for platform businesses and can tell you where their licence ends.
- You can also ask the CBN's payments supervision department for guidance on whether your model needs a licence.
- Nigerian startup communities and incubators often have vetted fintech lawyers or free legal clinics.

Until you have advice, keep the Paystack key in **test mode**, or switch the wallet off from the Money page.
