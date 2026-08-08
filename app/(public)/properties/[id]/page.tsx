import type { Metadata } from "next";
import { notFound } from "next/navigation";
import mongoose from "mongoose";
import { Bath, BedDouble, CheckCircle2, MapPin, Ruler } from "lucide-react";
import { connectDB } from "@/lib/db";
import { LANDLORD_PUBLIC_FIELDS, serializeProperty, serializeReview } from "@/lib/serialize";
import { Property } from "@/models/Property";
import { Review } from "@/models/Review";
import { formatGHS } from "@/lib/money";
import { ImageGallery } from "@/components/property/ImageGallery";
import { VerifiedBadge, StatusBadge } from "@/components/ui/Badge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { PropertyActions } from "@/components/property/PropertyActions";
import { ReviewSection } from "@/components/property/ReviewSection";
import type { PropertyDTO, ReviewDTO, SafeUser } from "@/types";

type Params = { params: Promise<{ id: string }> };

/** Loads the listing and its reviews, or null when the id is unknown/invalid. */
async function getProperty(
  id: string,
): Promise<{ property: PropertyDTO; reviews: ReviewDTO[] } | null> {
  if (!mongoose.isValidObjectId(id)) return null;

  try {
    await connectDB();
    const doc = await Property.findById(id).populate(
      "landlord",
      LANDLORD_PUBLIC_FIELDS,
    );
    if (!doc) return null;

    const reviews = await Review.find({ property: id })
      .populate("author", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .limit(20);

    return {
      property: serializeProperty(doc),
      reviews: reviews.map(serializeReview),
    };
  } catch (error) {
    console.error("[property] failed to load:", error);
    return null;
  }
}

/** Per-listing metadata, so a shared link previews the actual property. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const data = await getProperty(id);

  if (!data) {
    return { title: "Property not found" };
  }

  const { property } = data;
  const title = `${property.title} — ${formatGHS(property.price)}/month in ${property.location.city}`;
  const description = `${property.bedrooms} bedroom ${property.type} for rent in ${property.location.city}, ${property.location.state}. ${property.description.slice(0, 140)}`;

  return {
    title: property.title,
    description,
    alternates: { canonical: `/properties/${property._id}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: property.images.slice(0, 1).map((url) => ({ url })),
    },
  };
}

export default async function PropertyDetailPage({ params }: Params) {
  const { id } = await params;
  const data = await getProperty(id);

  if (!data) notFound();

  const { property, reviews } = data;
  const landlord =
    typeof property.landlord === "string" ? null : (property.landlord as SafeUser);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <ImageGallery images={property.images} title={property.title} />

          <div className="mt-8">
            <div className="flex flex-wrap items-center gap-2">
              <VerifiedBadge verified={property.verified} />
              <StatusBadge status={property.status} kind="property" />
              <span className="rounded-full border border-slate-200 bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink-700 capitalize">
                {property.type}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-bold text-balance text-ink-900">
              {property.title}
            </h1>

            <p className="mt-2 flex items-center gap-1.5 text-ink-500">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {property.location.address}, {property.location.city},{" "}
              {property.location.state}
            </p>

            <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-slate-200 py-5">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                  <BedDouble className="size-4" aria-hidden="true" />
                  Bedrooms
                </dt>
                <dd className="mt-1 text-lg font-semibold text-ink-900">
                  {property.bedrooms}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                  <Bath className="size-4" aria-hidden="true" />
                  Bathrooms
                </dt>
                <dd className="mt-1 text-lg font-semibold text-ink-900">
                  {property.bathrooms}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-ink-500">
                  <Ruler className="size-4" aria-hidden="true" />
                  Type
                </dt>
                <dd className="mt-1 text-lg font-semibold text-ink-900 capitalize">
                  {property.type}
                </dd>
              </div>
            </dl>

            <section className="mt-8" aria-labelledby="description-heading">
              <h2
                id="description-heading"
                className="text-xl font-bold text-ink-900"
              >
                About this property
              </h2>
              <p className="mt-3 leading-relaxed whitespace-pre-line text-ink-700">
                {property.description}
              </p>
            </section>

            {property.amenities.length > 0 && (
              <section className="mt-8" aria-labelledby="amenities-heading">
                <h2
                  id="amenities-heading"
                  className="text-xl font-bold text-ink-900"
                >
                  Amenities
                </h2>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {property.amenities.map((amenity) => (
                    <li
                      key={amenity}
                      className="flex items-center gap-2 text-sm text-ink-700"
                    >
                      <CheckCircle2
                        className="size-4 shrink-0 text-brand-600"
                        aria-hidden="true"
                      />
                      {amenity}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-8" aria-labelledby="location-heading">
              <h2 id="location-heading" className="text-xl font-bold text-ink-900">
                Location
              </h2>
              <p className="mt-3 text-ink-700">
                {property.location.address}, {property.location.city},{" "}
                {property.location.state}
              </p>
              {property.location.geo?.lat && property.location.geo?.lng ? (
                <iframe
                  // OpenStreetMap needs no API key, so the map works on any deploy.
                  title={`Map showing the location of ${property.title}`}
                  className="mt-3 h-72 w-full rounded-2xl border border-slate-200"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${property.location.geo.lng - 0.01}%2C${property.location.geo.lat - 0.01}%2C${property.location.geo.lng + 0.01}%2C${property.location.geo.lat + 0.01}&layer=mapnik&marker=${property.location.geo.lat}%2C${property.location.geo.lng}`}
                />
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-surface-muted p-4 text-sm text-ink-500">
                  Exact map coordinates have not been provided for this listing.
                  Contact the landlord for precise directions.
                </p>
              )}
            </section>

            <ReviewSection
              propertyId={property._id}
              initialReviews={reviews}
              ratingAverage={property.ratingAverage ?? 0}
              ratingCount={property.ratingCount ?? 0}
            />
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-ink-500">Monthly rent</p>
            <p className="text-3xl font-bold text-brand-700">
              {formatGHS(property.price)}
            </p>

            <PropertyActions property={property} />

            {landlord && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h2 className="text-sm font-semibold text-ink-900">
                  Listed by
                </h2>
                <div className="mt-3 flex items-center gap-3">
                  <UserAvatar
                    name={landlord.name}
                    src={landlord.avatar}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">
                      {landlord.name}
                    </p>
                    <div className="mt-1">
                      <VerifiedBadge verified={landlord.verified} />
                    </div>
                  </div>
                </div>
                {landlord.bio && (
                  <p className="mt-3 text-sm leading-relaxed text-ink-500">
                    {landlord.bio}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
