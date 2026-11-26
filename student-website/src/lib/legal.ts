export type LegalSection = { title: string; body: string[] };
export type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export const LEGAL_UPDATED = "26 November 2026";
export const SUPPORT_EMAIL = "support@campusos.app";

export const TERMS: LegalDoc = {
  title: "Terms of Service",
  updated: LEGAL_UPDATED,
  intro:
    "These terms explain how you may use CampusOS: the student mobile app, the CampusOS Portal for businesses, lecturers and schools, and our website. By creating an account or using CampusOS you agree to them.",
  sections: [
    {
      title: "1. Who can use CampusOS",
      body: [
        "You must be at least 16 years old and able to agree to these terms.",
        "Students create their accounts only in the CampusOS mobile app. Businesses, housing agents, lecturers and school authorities create their accounts on the CampusOS Portal.",
        "Give accurate information, keep your password private and tell us straight away if you think someone else is using your account. One person per account.",
      ],
    },
    {
      title: "2. Student accounts",
      body: [
        "Choose the campus you actually attend. Housing, food and marketplace results are scoped to that campus.",
        "Student ID verification is optional but some features and badges need it. Never upload someone else's ID.",
      ],
    },
    {
      title: "3. Business, lecturer and school accounts",
      body: [
        "Businesses apply through the Portal and must be allowed to sell the product or rent out the property they list. We may ask for identity or ownership documents.",
        "Listings must be honest: real photos, the full price including agent, agreement, caution and service fees, and correct availability.",
        "Respond to students' inspection requests, orders and messages in good time. Do not ask students to pay before they have inspected a property.",
        "Lecturers and school authorities must only manage classes, departments and students they are responsible for.",
      ],
    },
    {
      title: "4. Housing, food and marketplace",
      body: [
        "CampusOS connects students with providers. Unless a payment is clearly made through CampusOS checkout, any deal is between you and the provider.",
        "Always inspect a property in person before paying. CampusOS badges such as \"provider checked\" are not a guarantee.",
        "Report suspicious listings from the listing page or through Help & support.",
      ],
    },
    {
      title: "5. AI tutor",
      body: [
        "AI answers can be wrong or incomplete. Use them to learn, not as official academic advice.",
        "Do not use CampusOS to cheat in tests or exams or to break your school's academic rules.",
      ],
    },
    {
      title: "6. Messages and conduct",
      body: [
        "Do not harass, threaten, scam or spam anyone, post illegal or sexual content, share other people's private information, or try to break or scrape the platform.",
        "We may review reported content and remove it, limit features or suspend accounts that break these rules.",
      ],
    },
    {
      title: "7. Your content",
      body: [
        "You own what you post. You give CampusOS permission to store, display and share it inside the product so the feature you used can work.",
        "Make sure you have the right to post photos, documents and other content you upload.",
      ],
    },
    {
      title: "8. Maps and location",
      body: [
        "Maps and address search use OpenStreetMap data. Locations and distances are approximate.",
        "You can change the location you chose at any time in Settings.",
      ],
    },
    {
      title: "9. Fees",
      body: [
        "Core student features are free. Paid business plans and any paid student features are clearly labelled before you pay. Card payments are processed by Paystack.",
      ],
    },
    {
      title: "10. Suspension and closing your account",
      body: [
        "You can stop using CampusOS and ask us to delete your account at any time.",
        "We may suspend or close accounts that break these terms, put other users at risk or are required to be closed by law.",
      ],
    },
    {
      title: "11. Disclaimers and liability",
      body: [
        "CampusOS is provided \"as is\". We work to keep it available and accurate but cannot promise it will always be error-free.",
        "To the extent the law allows, CampusOS is not responsible for losses caused by deals between users, inaccurate listings or content posted by others.",
      ],
    },
    {
      title: "12. Changes",
      body: [
        "We may update these terms. If a change is important we will tell you in the app or by email before it takes effect.",
      ],
    },
    {
      title: "13. Law and contact",
      body: [
        "These terms are governed by the laws of the Federal Republic of Nigeria.",
        `Questions? Email ${SUPPORT_EMAIL} or use Help & support in the app.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  updated: LEGAL_UPDATED,
  intro:
    "This policy explains what personal data CampusOS collects, why, who we share it with and the choices you have. We follow the Nigeria Data Protection Act 2023.",
  sections: [
    {
      title: "1. Data we collect",
      body: [
        "Account: name, email, password (stored encrypted by our auth provider), phone if you add it.",
        "Profile and school: campus, department, level, profile photo and, if you verify, your student ID image.",
        "Location: the address you choose on the map and, only while you use location features and only if you allow it, your device's position.",
        "Activity: messages, listings, inspection requests, orders, study data (courses, timetable, grades, notes) and AI tutor conversations.",
        "Business and school accounts: business details, addresses and the verification documents you upload.",
        "Device: app version, device type, push notification token and basic usage events.",
      ],
    },
    {
      title: "2. How we use it",
      body: [
        "To run CampusOS: show your campus, connect you with housing, food and marketplace providers, deliver messages and notifications, and power study tools.",
        "To keep people safe: verify students and businesses, prevent fraud and review reports.",
        "To improve the product using aggregated usage data. We do not sell your personal data.",
      ],
    },
    {
      title: "3. Location",
      body: [
        "We use the location you choose to rank schools, housing and places near you.",
        "Your device position is only read when you tap \"use my location\" or open a map, and only with your permission. We save the address you confirm, not a continuous location history.",
        "Address searches are sent to Photon (OpenStreetMap search by Komoot) and map images are loaded from CARTO. They receive the search text and map area, not your name.",
        "You can change your location or turn off location permission at any time.",
      ],
    },
    {
      title: "4. AI features",
      body: [
        "When you use the AI tutor, your message and relevant study context are sent to our AI provider to generate a reply. Do not share passwords, ID numbers or bank details in chat.",
      ],
    },
    {
      title: "5. Who we share data with",
      body: [
        "Other users, as needed: a business sees your name and messages when you contact it, request an inspection or place an order. Your school sees verification details you submit to it.",
        "Service providers who run CampusOS for us: Supabase (database and storage), Paystack (payments), LiveKit (calls), Expo (push notifications), our AI provider, and the map providers above.",
        "Authorities, when the law requires it.",
      ],
    },
    {
      title: "6. Security and retention",
      body: [
        "Data is encrypted in transit and access is restricted by account. Verification documents are kept in private storage.",
        "We keep your data while your account is active. When you delete your account we delete or anonymise it within 30 days, except records we must keep by law.",
      ],
    },
    {
      title: "7. Your rights",
      body: [
        "You can ask to access, correct, export or delete your data, object to some uses, and withdraw consent (for example marketing or location) at any time.",
        "You can also complain to the Nigeria Data Protection Commission.",
      ],
    },
    {
      title: "8. Children",
      body: [
        "CampusOS is for people aged 16 and over. If you believe a younger child has an account, contact us and we will remove it.",
      ],
    },
    {
      title: "9. Changes and contact",
      body: [
        "We will tell you about important changes in the app or by email.",
        `Privacy questions or requests: ${SUPPORT_EMAIL}.`,
      ],
    },
  ],
};
