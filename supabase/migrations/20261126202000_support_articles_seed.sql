-- Starter knowledge base for the CampusOS Assistant. Support agents edit and
-- extend these from the Support desk › Knowledge page.

grant execute on function public.support_audience_for(uuid) to service_role;
grant execute on function public.user_is_support_agent(uuid) to service_role;
grant select, insert, update on public.support_tickets, public.support_ai_runs to service_role;
grant select on public.support_articles to service_role;

insert into public.support_articles (title, audience, category, keywords, body)
select v.title, v.audience, v.category, v.keywords, v.body
from (values
  ('How students create a CampusOS account', 'all', 'account',
   'sign up signup register create account student download apk app website',
   'Students sign up only in the CampusOS mobile app. Download it from the CampusOS website (Download page), open it and tap "Create a student account". You enter your name, email and password, then choose your location so schools and housing near you show first. The CampusOS Portal is for businesses, lecturers and school staff, not students.'),

  ('Reset or change your password', 'all', 'account',
   'forgot password reset change password login cannot log in locked out',
   'If you forgot your password, open the login screen and tap "Forgot password?". Enter your email and we send a reset link — check spam if it does not arrive within a few minutes. If you are signed in on the app, go to Settings › Login & password to change it. If the reset email never arrives or you no longer have access to the email, talk to a person in support.'),

  ('Change your location', 'student', 'account',
   'location address area change location wrong location nearby schools near me',
   'Your location decides which schools and rooms show first. In the app go to Settings › My location, tap "Change location", then search for your area or move the map and confirm. Housing results are then sorted nearest first.'),

  ('Verify your student ID', 'student', 'verification',
   'verify student id verification matric admission letter id card verified badge pending rejected',
   'Go to Profile › Verify student ID in the app and upload a clear photo of your student ID card or admission letter. Your school or the CampusOS team reviews it and you get a notification with the result. Verified students get a badge that businesses can see. If it was rejected, read the note on the verification screen, then upload a clearer or newer document.'),

  ('Find housing and book an inspection', 'student', 'housing',
   'housing room hostel apartment inspection viewing book agent rent',
   'Open the Housing tab to see rooms near your location. Open a room to see photos, price and the agent. Tap the button to request an inspection and pick your preferred time; the agent accepts or suggests another time and you get a notification. You can also message the agent from the listing — chats appear in your Inbox.'),

  ('Housing safety: avoid scams', 'student', 'safety',
   'scam fraud fake agent pay before inspection deposit safety stolen money',
   'Never pay rent or a deposit before you have inspected the room in person and met the agent. CampusOS staff will never ask for your password. If an agent asks for money up front, refuses an inspection, or you think you were scammed, choose "Chat with support" so a person can look at it urgently.'),

  ('Food and marketplace orders', 'student', 'food',
   'food order restaurant vendor marketplace buy seller order problem wrong order',
   'Browse food vendors and the marketplace from Explore. You can message a business from its page. If something went wrong with an order, first message the business in your Inbox. If they do not respond or the problem involves money, talk to a person in support and include the business name and the time of the order.'),

  ('Notifications are not arriving', 'all', 'technical',
   'notifications push alerts not receiving no notification bell',
   'In the app, open Profile › Notifications to see everything we have sent you. For push alerts, allow notifications for CampusOS in your phone settings and make sure battery saver is not blocking the app. On the Portal, notifications appear in the bell menu.'),

  ('Update the CampusOS app', 'student', 'technical',
   'update app new version apk download latest version crash bug',
   'Go to Settings › Download app updates, or download the latest version from the CampusOS website. Install it over your current app — your account and data stay. If the app keeps crashing after updating, talk to a person in support and tell us your phone model.'),

  ('AI tutor settings', 'student', 'other',
   'ai tutor study assistant avatar voice explanation style',
   'The AI tutor helps with study questions. Open Settings › AI tutor to change its name, avatar, reply style and voice. The tutor is separate from this support assistant.'),

  ('Delete your account or your data', 'all', 'account',
   'delete account remove data privacy close account ndpa personal data',
   'You can ask us to delete your account or send you a copy of your data at any time under the Nigeria Data Protection Act. Choose "Chat with support" and say what you want; a person handles these requests. You can read more in the Privacy Policy in Settings.'),

  ('Who can use the CampusOS Portal', 'business', 'business_setup',
   'portal business account types housing agent restaurant seller service lecturer school one account',
   'The Portal is for housing agents, restaurants and food vendors, campus service providers, marketplace sellers, lecturers and school staff. One account is one kind of account — to run a second kind (for example housing and a restaurant), sign up with a different email.'),

  ('Apply as a business', 'business', 'business_setup',
   'apply application business register submit review approval cac documents',
   'After signing up on the Portal, open Apply, choose your business type and fill in your details, including your business location on the map and any documents requested (some business types need CAC details). Submit the application and the CampusOS team reviews it. You can see the status on your dashboard: submitted, under review, needs changes, approved or rejected.'),

  ('Application needs changes or was rejected', 'business', 'business_setup',
   'needs changes rejected application declined resubmit edit application reason',
   'Open your application from the dashboard to read the reviewer''s note. If it says "needs changes", update the details or documents and submit again. If it was rejected and you are not sure why, talk to a person in support with your business name.'),

  ('Finish setting up your business after approval', 'business', 'business_setup',
   'setup wizard approved profile hours contact logo location complete setup',
   'Once approved, the setup wizard walks you through your public profile, business location, opening hours, contact options and policies. Finish every step to unlock listings. You can come back and edit these later.'),

  ('Add a property or room', 'business', 'listings',
   'add property room listing housing photos video units price location map',
   'Housing agents: open Properties › Add property. Search for the address or move the map pin to the exact spot, add the rooms (units) with prices, then upload photos and videos. Listings can be reviewed by CampusOS before students see them.'),

  ('Manage inspection requests', 'business', 'housing',
   'inspection requests viewing accept decline reschedule housing agent',
   'Housing agents see requests under Inspections. Accept, decline or add a note with another time. The student gets a notification each time you respond.'),

  ('Menu and orders for restaurants', 'business', 'food',
   'menu add dish food items orders kitchen board restaurant prices',
   'Restaurants manage dishes under Menu (name, price, photo) and follow incoming orders on the Orders board. Keep prices and availability up to date so students are not disappointed.'),

  ('Billing and payments', 'business', 'payments',
   'billing payment paystack charge refund invoice plan payout money',
   'The Billing page shows your plan and payment history. Payments are processed securely by Paystack. For a failed, double or disputed charge, or anything about payouts, talk to a person in support — the assistant cannot change payments.'),

  ('Messages from students', 'business', 'listings',
   'messages inbox student chat reply enquiry',
   'Student messages about your listings and orders appear in Messages on the Portal. Reply there; students get a notification on their phone.'),

  ('Lecturer accounts', 'business', 'classes',
   'lecturer sign up school email approve classes teaching',
   'Lecturers sign up on the Portal as a lecturer, then apply with their school email. The school authority reviews the application; once approved, the Classes and Announcements tools unlock.'),

  ('School authority accounts', 'business', 'classes',
   'school admin authority register school link account departments verify students',
   'Schools are registered by the CampusOS team. Sign up on the Portal as a school, then CampusOS links your account to your school. After that you can verify students, manage departments and approve lecturers.'),

  ('Talk to a person', 'all', 'other',
   'human agent person staff talk to someone contact support email',
   'You can talk to a person at any time: choose "Chat with support" on the Support screen, or tap "Talk to a person" in this chat. A CampusOS support agent replies in the ticket chat and you get a notification. You can also email support@campusos.app.')
) as v(title, audience, category, keywords, body)
where not exists (select 1 from public.support_articles a where a.title = v.title);
