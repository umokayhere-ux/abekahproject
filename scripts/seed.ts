/**
 * Demo data seeder.
 *
 *   npm run seed          — add demo data, keeping anything already there
 *   npm run seed -- --fresh  — wipe non-admin data first, then seed
 *
 * Creates the configured admin, a demo landlord, demo tenants, and a set of
 * realistic Ghanaian listings. Safe to run repeatedly: users are matched by
 * email and properties by title, so a second run updates rather than duplicates.
 */

import "dotenv/config";
import { connectDB, disconnectDB } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { ensureAdminSeeded } from "../lib/seed-admin";
import { computeSplit } from "../lib/money";
import { User } from "../models/User";
import { Property } from "../models/Property";
import { Booking } from "../models/Booking";
import { Review } from "../models/Review";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { Payment } from "../models/Payment";
import type { PropertyType } from "../types";

const DEMO_PASSWORD = "Password123";

/**
 * Demo photos come from Unsplash's stable `images.unsplash.com` CDN using
 * permanent photo ids, so they do not rot the way search or `source.unsplash`
 * URLs do. Replace them with your own Cloudinary uploads for a real deployment.
 */
const PHOTO = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

interface SeedProperty {
  title: string;
  description: string;
  price: number;
  type: PropertyType;
  bedrooms: number;
  bathrooms: number;
  city: string;
  state: string;
  address: string;
  geo: { lat: number; lng: number };
  images: string[];
  amenities: string[];
  verified: boolean;
}

const PROPERTIES: SeedProperty[] = [
  {
    title: "Modern 2-bedroom apartment in East Legon",
    description:
      "A bright, newly finished two-bedroom apartment in a quiet gated compound off Boundary Road. Fitted kitchen, tiled throughout, and a balcony overlooking the courtyard. Walking distance to A&C Mall and several international schools. Prepaid meter, borehole backup, and 24-hour security at the gate.",
    price: 3500,
    type: "apartment",
    bedrooms: 2,
    bathrooms: 2,
    city: "Accra",
    state: "Greater Accra",
    address: "12 Boundary Road, East Legon",
    geo: { lat: 5.6353, lng: -0.1523 },
    images: [
      PHOTO("1502672260266-1c1ef2d93688"),
      PHOTO("1493809842364-78817add7ffb"),
      PHOTO("1560448204-e02f11c3d0e2"),
    ],
    amenities: [
      "Air conditioning",
      "Fitted kitchen",
      "Parking space",
      "Security post",
      "Prepaid meter",
      "Borehole water",
      "Balcony",
      "Gated compound",
    ],
    verified: true,
  },
  {
    title: "Self-contained single room at Madina",
    description:
      "Neat self-contained single room with its own bathroom and kitchenette, suitable for a working professional or student. Located in a shared compound with a quiet, friendly landlord on site. Close to the Madina market and the University of Ghana shuttle route. Water and prepaid electricity metered separately.",
    price: 700,
    type: "room",
    bedrooms: 1,
    bathrooms: 1,
    city: "Accra",
    state: "Greater Accra",
    address: "Old Road, Madina Estate",
    geo: { lat: 5.6837, lng: -0.1677 },
    images: [PHOTO("1522708323590-d24dbb6b0267"), PHOTO("1505691938895-1758d7feb511")],
    amenities: ["Prepaid meter", "Tiled floors", "Wardrobe", "Borehole water"],
    verified: true,
  },
  {
    title: "4-bedroom family house in Airport Residential",
    description:
      "Spacious detached four-bedroom house with a large walled compound, standby generator, and boys' quarters. All bedrooms are en-suite with built-in wardrobes. Generous living and dining areas open onto a covered patio. Ideal for a family or an expatriate posting, minutes from Kotoka International Airport.",
    price: 12000,
    type: "house",
    bedrooms: 4,
    bathrooms: 5,
    city: "Accra",
    state: "Greater Accra",
    address: "7 Patrice Lumumba Road, Airport Residential Area",
    geo: { lat: 5.6053, lng: -0.1815 },
    images: [
      PHOTO("1568605114967-8130f3a36994"),
      PHOTO("1580587771525-78b9dba3b914"),
      PHOTO("1600596542815-ffad4c1539a9"),
    ],
    amenities: [
      "Air conditioning",
      "Standby generator",
      "Parking space",
      "Security post",
      "CCTV",
      "Fitted kitchen",
      "Hot water",
      "Gated compound",
    ],
    verified: true,
  },
  {
    title: "Furnished studio near KNUST, Kumasi",
    description:
      "Compact fully furnished studio a short walk from the KNUST campus gate. Comes with a bed, study desk, wardrobe, two-plate cooker, and a small fridge. Wi-Fi ready with reliable fibre coverage in the area. Perfect for a postgraduate student or a young professional working in Kumasi.",
    price: 1200,
    type: "studio",
    bedrooms: 1,
    bathrooms: 1,
    city: "Kumasi",
    state: "Ashanti",
    address: "Ayeduase North Gate, KNUST",
    geo: { lat: 6.6745, lng: -1.5716 },
    images: [PHOTO("1502005229762-cf1b2da7c5d6"), PHOTO("1540518614846-7eded433c457")],
    amenities: ["Furnished", "Wi-Fi ready", "Prepaid meter", "Tiled floors", "Wardrobe"],
    verified: true,
  },
  {
    title: "3-bedroom apartment with sea view, Takoradi",
    description:
      "Third-floor three-bedroom apartment with an open sea view from the living room and master bedroom. Recently repainted with new fittings throughout. Secure parking for two cars and a lift in the building. Convenient for the harbour and the oil and gas offices in Takoradi.",
    price: 4500,
    type: "apartment",
    bedrooms: 3,
    bathrooms: 3,
    city: "Takoradi",
    state: "Western",
    address: "Beach Road, Airport Ridge",
    geo: { lat: 4.8916, lng: -1.7554 },
    images: [PHOTO("1512917774080-9991f1c4c750"), PHOTO("1484154218962-a197022b5858")],
    amenities: [
      "Air conditioning",
      "Parking space",
      "Security post",
      "Fitted kitchen",
      "Balcony",
      "Standby generator",
    ],
    verified: true,
  },
  {
    title: "2-bedroom apartment in Tema Community 25",
    description:
      "Ground-floor two-bedroom apartment in a newly developed block in Community 25. Open-plan living and kitchen, both bedrooms with wardrobes, and a shared landscaped courtyard. Reliable water supply from a borehole with an overhead tank. Easy access to the Accra–Tema motorway.",
    price: 2200,
    type: "apartment",
    bedrooms: 2,
    bathrooms: 2,
    city: "Tema",
    state: "Greater Accra",
    address: "Community 25, Devtraco Estate",
    geo: { lat: 5.6698, lng: -0.0166 },
    images: [PHOTO("1560448204-603b3fc33ddc"), PHOTO("1600585154340-be6161a56a0c")],
    amenities: [
      "Borehole water",
      "Parking space",
      "Prepaid meter",
      "Tiled floors",
      "Gated compound",
    ],
    verified: false,
  },
  {
    title: "Cosy chamber and hall at Cape Coast",
    description:
      "Affordable chamber and hall in a well-kept compound house a few minutes from the University of Cape Coast. Shared bathroom facilities, private kitchen space, and a small verandah. Quiet neighbourhood with easy access to trotro routes into the town centre.",
    price: 550,
    type: "room",
    bedrooms: 1,
    bathrooms: 1,
    city: "Cape Coast",
    state: "Central",
    address: "Amamoma, near UCC South Campus",
    geo: { lat: 5.1315, lng: -1.2795 },
    images: [PHOTO("1484154218962-a197022b5858")],
    amenities: ["Prepaid meter", "Tiled floors", "Borehole water"],
    verified: false,
  },
  {
    title: "Executive 3-bedroom house at Trasacco, Accra",
    description:
      "Executive three-bedroom house in one of Accra's most sought-after estates. Fully air-conditioned with a modern fitted kitchen, private garden, and access to the estate pool and clubhouse. Twenty-four hour estate security with controlled access and CCTV throughout the grounds.",
    price: 18000,
    type: "house",
    bedrooms: 3,
    bathrooms: 4,
    city: "Accra",
    state: "Greater Accra",
    address: "Trasacco Valley, East Legon",
    geo: { lat: 5.6471, lng: -0.1401 },
    images: [
      PHOTO("1613490493576-7fde63acd811"),
      PHOTO("1600607687939-ce8a6c25118c"),
      PHOTO("1600566753190-17f0baa2a6c3"),
    ],
    amenities: [
      "Air conditioning",
      "Swimming pool",
      "Standby generator",
      "CCTV",
      "Security post",
      "Fitted kitchen",
      "Hot water",
      "Parking space",
      "Gated compound",
    ],
    verified: true,
  },
];

/** Creates a user if the email is new; otherwise leaves the existing one. */
async function upsertUser(input: {
  name: string;
  email: string;
  role: "tenant" | "landlord";
  phone: string;
  bio?: string;
  verified: boolean;
}) {
  // Demo landlords are marked as having paid the listing fee, so the seeded
  // data is usable without putting a real charge through Paystack.
  const registrationFeePaid = input.role === "landlord";

  const existing = await User.findOne({ email: input.email });
  if (existing) {
    // Backfill for demo data seeded before the fee existed.
    if (registrationFeePaid && !existing.registrationFeePaid) {
      await User.updateOne(
        { _id: existing._id },
        { $set: { registrationFeePaid: true, registrationFeePaidAt: new Date() } },
      );
    }
    console.log(`  · ${input.role} ${input.email} already exists`);
    return existing;
  }

  const user = await User.create({
    ...input,
    password: await hashPassword(DEMO_PASSWORD),
    suspended: false,
    registrationFeePaid,
    registrationFeePaidAt: registrationFeePaid ? new Date() : undefined,
  });
  console.log(`  + created ${input.role} ${input.email}`);
  return user;
}

async function main() {
  const fresh = process.argv.includes("--fresh");

  console.log("RentFinder — seeding demo data\n");
  await connectDB();
  console.log("Connected to MongoDB");

  if (fresh) {
    console.log("\n--fresh: clearing existing non-admin data…");
    await Promise.all([
      Property.deleteMany({}),
      Booking.deleteMany({}),
      Payment.deleteMany({}),
      Review.deleteMany({}),
      Message.deleteMany({}),
      Conversation.deleteMany({}),
      User.deleteMany({ role: { $ne: "admin" } }),
    ]);
    console.log("  cleared");
  }

  console.log("\nAdmin account:");
  await ensureAdminSeeded();
  if (process.env.ADMIN_EMAIL) {
    console.log(`  · admin ${process.env.ADMIN_EMAIL} ensured`);
  } else {
    console.log("  ! ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed");
  }

  console.log("\nDemo users:");
  const landlord = await upsertUser({
    name: "Kwame Asante",
    email: "landlord@rentfinder.demo",
    role: "landlord",
    phone: "+233244123456",
    bio: "Managing quality rental properties across Greater Accra and Ashanti since 2015.",
    verified: true,
  });

  const secondLandlord = await upsertUser({
    name: "Abena Owusu",
    email: "landlord2@rentfinder.demo",
    role: "landlord",
    phone: "+233201987654",
    bio: "Family-owned properties in Kumasi, Takoradi, and Cape Coast.",
    verified: false,
  });

  const tenant = await upsertUser({
    name: "Ama Mensah",
    email: "tenant@rentfinder.demo",
    role: "tenant",
    phone: "+233244987654",
    verified: true,
  });

  const secondTenant = await upsertUser({
    name: "Yaw Boateng",
    email: "tenant2@rentfinder.demo",
    role: "tenant",
    phone: "+233209876543",
    verified: false,
  });

  console.log("\nProperties:");
  const created = [];
  for (const [index, seed] of PROPERTIES.entries()) {
    // Alternate owners so both demo landlords have listings.
    const owner = index % 3 === 2 ? secondLandlord : landlord;

    const property = await Property.findOneAndUpdate(
      { title: seed.title },
      {
        $set: {
          title: seed.title,
          description: seed.description,
          price: seed.price,
          type: seed.type,
          bedrooms: seed.bedrooms,
          bathrooms: seed.bathrooms,
          location: {
            city: seed.city,
            state: seed.state,
            address: seed.address,
            geo: seed.geo,
          },
          images: seed.images,
          amenities: seed.amenities,
          landlord: owner._id,
          verified: seed.verified,
          status: "available",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    created.push(property);
    console.log(`  + ${seed.city}: ${seed.title} (GHS ${seed.price})`);
  }

  console.log("\nSample activity:");

  // A confirmed, paid booking so the dashboards are not empty on first look.
  const showcase = created[0]!;
  const split = computeSplit(showcase.price);

  const booking = await Booking.findOneAndUpdate(
    { tenant: tenant._id, property: showcase._id },
    {
      $set: {
        tenant: tenant._id,
        property: showcase._id,
        landlord: showcase.landlord,
        status: "confirmed",
        moveInDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        amount: split.total,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log("  + confirmed booking for tenant@rentfinder.demo");

  await Payment.findOneAndUpdate(
    { reference: "RF-DEMO-SEED-0001" },
    {
      $set: {
        tenant: tenant._id,
        landlord: showcase.landlord,
        property: showcase._id,
        booking: booking._id,
        amount: split.total,
        currency: "GHS",
        status: "paid",
        purpose: "rent",
        reference: "RF-DEMO-SEED-0001",
        splitBreakdown: split,
        paidAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Property.updateOne({ _id: showcase._id }, { $set: { status: "rented" } });
  console.log(`  + settled payment of GHS ${split.total} (platform ${split.platform})`);

  // A review, which requires the confirmed booking above.
  await Review.findOneAndUpdate(
    { property: showcase._id, author: tenant._id },
    {
      $set: {
        property: showcase._id,
        author: tenant._id,
        rating: 5,
        comment:
          "Very clean apartment and the landlord responded quickly to every question. The compound is quiet and security is always on duty.",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Property.updateOne(
    { _id: showcase._id },
    { $set: { ratingAverage: 5, ratingCount: 1 } },
  );
  console.log("  + review on the showcase property");

  // A conversation so the messaging UI has something in it.
  let conversation = await Conversation.findOne({
    participants: { $all: [secondTenant._id, landlord._id], $size: 2 },
  });
  if (!conversation) {
    conversation = await Conversation.create({
      participants: [secondTenant._id, landlord._id],
      property: created[1]!._id,
      lastMessage: "Is the room still available?",
      lastMessageAt: new Date(),
    });
    await Message.create([
      {
        conversation: conversation._id,
        sender: secondTenant._id,
        text: "Good afternoon. Is the self-contained room at Madina still available?",
        read: false,
      },
      {
        conversation: conversation._id,
        sender: landlord._id,
        text: "Yes it is. You can come for a viewing any day this week after 4pm.",
        read: false,
      },
    ]);
    console.log("  + demo conversation between a tenant and a landlord");
  }

  // Saved properties for the demo tenant.
  await User.updateOne(
    { _id: tenant._id },
    { $addToSet: { favorites: { $each: [created[2]!._id, created[3]!._id] } } },
  );
  console.log("  + saved properties for tenant@rentfinder.demo");

  console.log("\n" + "=".repeat(58));
  console.log("Seed complete. Demo sign-in details:\n");
  console.log(`  Landlord   landlord@rentfinder.demo   ${DEMO_PASSWORD}`);
  console.log(`  Landlord   landlord2@rentfinder.demo  ${DEMO_PASSWORD}`);
  console.log(`  Tenant     tenant@rentfinder.demo     ${DEMO_PASSWORD}`);
  console.log(`  Tenant     tenant2@rentfinder.demo    ${DEMO_PASSWORD}`);
  if (process.env.ADMIN_EMAIL) {
    console.log(`  Admin      ${process.env.ADMIN_EMAIL}  (ADMIN_PASSWORD)`);
  }
  console.log("\nThese are demo accounts. Do not seed them into production.");
  console.log("=".repeat(58));
}

main()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
