-- Knowledge base for the whole platform: wallet, payments, fees, Premium, marketplace escrow,
-- payouts, study tools and the Portal. The CampusOS Assistant searches these, and support
-- agents can edit them from the Support desk. Safe to run twice (skips titles that exist).

insert into public.support_articles (title, audience, category, keywords, body)
select v.title, v.audience, v.category, v.keywords, v.body
from (values
  ('How the CampusOS wallet works', 'student', 'payments',
   'wallet balance money fund add money top up spend pay withdraw transfer cap limit',
   'Your CampusOS wallet pays for everything inside the app, like food and marketplace orders. Open it from the wallet card on Home or Profile › My wallet. It holds up to ₦200,000. Wallet money can only be spent inside CampusOS. It cannot be withdrawn or sent to other people. Money you earn by selling is separate and can be withdrawn (see "Selling and getting paid").'),

  ('Add money to your wallet by card', 'student', 'payments',
   'top up fund wallet card mastercard visa verve paystack pay failed declined debited charged balance not updated',
   'Go to My wallet › Add money. Enter an amount from ₦500 to ₦100,000, check the card fee shown before you pay, then tap Pay. A secure card form slides up inside the app (Mastercard, Visa and Verve work). Enter your card and authorize with your bank PIN or OTP, then you see a success or failed screen without leaving the app. If your bank debited you but the balance did not change, wait a few minutes and pull down to refresh the wallet. If it is still missing, talk to a person and send the amount and time.'),

  ('Fees: what students and businesses pay', 'all', 'payments',
   'fees charges commission percent card fee 2% 3% 5% rent order marketplace premium free cost',
   'Students pay the card processing fee only when adding money to the wallet, and it is shown before you pay. Buying food or marketplace items from your wallet has no extra student fee. Businesses pay a 3% commission on food orders. Marketplace sellers pay 2% of each sale (1% for Premium students). Housing agents pay a 5% commission on rent paid through CampusOS. Businesses also need the monthly Business plan to send payment requests.'),

  ('See your transaction history', 'student', 'payments',
   'history transactions statement purchases funding withdrawal refund filter date receipt',
   'Open My wallet. The latest 5 transactions show under Recent activity. Tap See all (or History) for the full list. You can filter by type (Funding, Purchases, Refunds, Sales, Withdrawals) and by date (Today, last 7 days, last 30 days, this month or a custom date range).'),

  ('CampusOS Premium for students', 'student', 'payments',
   'premium subscription plan badge green renew cancel auto renew benefits price 1000 upgrade',
   'Premium costs ₦1,000 a month. You get a green Premium badge on your profile, chats and listings, three times higher AI tutor limits, a lower marketplace selling fee (1% instead of 2%) and priority support. Open Profile › Premium and pay by card or from your wallet. Paying by card saves the card so Premium renews by itself; you can switch renewal off on the same screen at any time and keep Premium until the end of the paid month.'),

  ('Order food and pay from your wallet', 'student', 'food',
   'food order restaurant pay wallet cancel refund decline delivery pickup status',
   'Pick a vendor from Explore, add items and check out. Food orders are paid from your wallet, so add money first if your balance is low. You can cancel an order before the kitchen accepts it and the money returns to your wallet. If the kitchen declines or an order is refunded, the money also goes back to your wallet. See all orders in Profile › My orders. For a problem after the kitchen accepted, message the vendor first, then talk to support.'),

  ('Buying on the marketplace safely (escrow)', 'student', 'marketplace',
   'marketplace buy escrow code handover dispute refund seller hold payment protection',
   'When you buy, your payment is held by CampusOS, not paid to the seller yet. The seller has 24 hours to accept. After they accept you have 5 days to meet; give the seller your 6-digit code only when you have received the item. The seller then marks it handed over, and you can confirm or open a dispute within 48 hours. After that the payment is released automatically. If the seller does not accept in time the order is cancelled and you are refunded. Track everything in Profile › My orders and Marketplace orders.'),

  ('Selling and getting paid', 'student', 'payments',
   'sell seller earnings withdraw payout bank wallet available on hold request payout minimum',
   'If you sell on the marketplace, a second card on your wallet screen shows your earnings. Available money has been released after the buyer confirmed or the hold ended; On hold money is still protected. Tap Request payout to send money to your bank (minimum ₦5,000, add your bank first) or to your own wallet (minimum ₦100). Moving earnings to your wallet is instant. CampusOS keeps 2% of each sale (1% for Premium).'),

  ('Study lock: focus without distractions', 'student', 'other',
   'study lock timer focus distract notifications chat locked unlock minutes',
   'Open Settings › Study lock, choose how long you want to study and start. While it runs, your study tools (Study hub, AI tutor, timetable, flashcards and more) stay open, and screens that distract you, like chat, marketplace, housing and food, are covered. Notifications are held and shown after the timer ends. The timer runs on the server clock, so closing the app does not stop it. A small timer chip shows the time left.'),

  ('AI tutor limits and tips', 'student', 'other',
   'ai tutor limit questions hourly daily premium reply failed not replying answer',
   'The AI tutor answers study questions in a chat. There is an hourly and a daily limit on questions, and Premium raises both limits three times. If you reach the limit it tells you when you can ask again. If a message fails to send, check your connection, then try again. You can change the tutor name and avatar in Settings › AI tutor.'),

  ('Payment requests from businesses', 'student', 'payments',
   'payment request business pay request rent invoice accept decline pay now',
   'A business can send you a payment request, for example for rent. You get a notification; open it, check the amount and what it is for, then pay from your wallet. Only pay requests that match something you agreed. If a request looks wrong or you did not expect it, decline it and talk to a person.'),

  ('Business plan and payment requests', 'business', 'payments',
   'business plan monthly 3000 premium badge payment request locked grace renew card',
   'The Business plan costs ₦3,000 a month. It gives you a green Premium badge and lets you send payment requests to students. Open Plan in the Portal to see what is included, then pay by card or from your balance. Paying by card saves the card for automatic renewal, which you can switch off on the Plan page. If a plan lapses you get a 3-day grace period before payment requests are locked.'),

  ('Payouts: withdraw your business earnings', 'business', 'payments',
   'payout withdraw bank account earnings balance minimum 5000 settle paystack',
   'Open Payouts in the Portal. Add and verify your bank account first (the account name is checked). Your available balance is money from completed orders after commission. You can withdraw from ₦5,000. Money still within its hold period shows as pending. If a payout fails, the money returns to your balance and you can try again.'),

  ('Reviews, deals and boosts for businesses', 'business', 'listings',
   'reviews reply deals promotion boost featured insights pause orders opening hours',
   'Reply to student reviews from the Reviews page. Create limited-time Deals to attract orders, or Boost a listing to appear higher for a set period. Insights shows views and enquiries for your listings. You can pause new orders from the dashboard when the kitchen is busy.')
) as v(title, audience, category, keywords, body)
where not exists (select 1 from public.support_articles a where a.title = v.title);
