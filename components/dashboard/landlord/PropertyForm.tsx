"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import {
  COMMON_AMENITIES,
  GHANA_CITIES,
  GHANA_REGIONS,
  PROPERTY_TYPE_OPTIONS,
} from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { PropertyDTO } from "@/types";

interface FormState {
  title: string;
  description: string;
  price: string;
  type: string;
  bedrooms: string;
  bathrooms: string;
  city: string;
  state: string;
  address: string;
  lat: string;
  lng: string;
}

function initialState(property?: PropertyDTO): FormState {
  return {
    title: property?.title ?? "",
    description: property?.description ?? "",
    price: property ? String(property.price) : "",
    type: property?.type ?? "apartment",
    bedrooms: property ? String(property.bedrooms) : "1",
    bathrooms: property ? String(property.bathrooms) : "1",
    city: property?.location.city ?? "",
    state: property?.location.state ?? "",
    address: property?.location.address ?? "",
    lat: property?.location.geo?.lat ? String(property.location.geo.lat) : "",
    lng: property?.location.geo?.lng ? String(property.location.geo.lng) : "",
  };
}

const CITY_OPTIONS = GHANA_CITIES.map((city) => ({ value: city, label: city }));
const REGION_OPTIONS = GHANA_REGIONS.map((region) => ({
  value: region,
  label: region,
}));

/**
 * Create/edit form for a listing.
 *
 * Images are uploaded to Cloudinary first and only their URLs are submitted, so
 * nothing depends on local disk. Client-side validation here is a convenience —
 * the server validates every field again.
 */
export function PropertyForm({
  property,
  onSaved,
  onCancel,
}: {
  property?: PropertyDTO;
  onSaved: (property: PropertyDTO) => void;
  onCancel: () => void;
}) {
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() => initialState(property));
  const [images, setImages] = useState<string[]>(property?.images ?? []);
  const [amenities, setAmenities] = useState<string[]>(property?.amenities ?? []);
  const [customAmenity, setCustomAmenity] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = Boolean(property);

  const update =
    (key: keyof FormState) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const toggleAmenity = (amenity: string) => {
    setAmenities((current) =>
      current.includes(amenity)
        ? current.filter((item) => item !== amenity)
        : [...current, amenity],
    );
  };

  const handleUpload = async (files: FileList) => {
    if (images.length + files.length > 12) {
      toast.error("A listing can have at most 12 photos");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("files", file);

    try {
      const data = await apiFetch<{ images: { url: string }[] }>("/api/uploads", {
        method: "POST",
        formData,
      });
      setImages((current) => [...current, ...data.images.map((img) => img.url)]);
      toast.success(
        `${data.images.length} photo${data.images.length === 1 ? "" : "s"} uploaded`,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not upload those photos",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    const payload = {
      ...form,
      price: Number(form.price),
      bedrooms: Number(form.bedrooms),
      bathrooms: Number(form.bathrooms),
      images,
      amenities,
      lat: form.lat || undefined,
      lng: form.lng || undefined,
    };

    try {
      const data = await apiFetch<{ property: PropertyDTO }>(
        isEditing ? `/api/properties/${property!._id}` : "/api/properties",
        { method: isEditing ? "PATCH" : "POST", body: payload },
      );
      toast.success(isEditing ? "Property updated" : "Property created");
      onSaved(data.property);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors ?? {});
        toast.error(error.message);
      } else {
        toast.error("Could not save the property");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">
          Property details
        </legend>

        <Input
          label="Listing title"
          required
          placeholder="Spacious 2-bedroom apartment in East Legon"
          value={form.title}
          error={errors.title}
          onChange={update("title")}
        />

        <Textarea
          label="Description"
          required
          rows={6}
          placeholder="Describe the property, the neighbourhood, and what is included in the rent."
          value={form.description}
          error={errors.description}
          onChange={update("description")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Monthly rent (GHS)"
            type="number"
            required
            min={1}
            placeholder="1500"
            value={form.price}
            error={errors.price}
            onChange={update("price")}
          />
          <Select
            label="Property type"
            required
            options={PROPERTY_TYPE_OPTIONS}
            value={form.type}
            error={errors.type}
            onChange={update("type")}
          />
          <Input
            label="Bedrooms"
            type="number"
            required
            min={0}
            max={50}
            value={form.bedrooms}
            error={errors.bedrooms}
            onChange={update("bedrooms")}
          />
          <Input
            label="Bathrooms"
            type="number"
            required
            min={0}
            max={50}
            value={form.bathrooms}
            error={errors.bathrooms}
            onChange={update("bathrooms")}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-900">Location</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              label="City"
              required
              list="city-suggestions"
              placeholder="Accra"
              value={form.city}
              error={errors.city}
              onChange={update("city")}
            />
            {/* A datalist keeps common cities one keystroke away without
                preventing smaller towns from being entered. */}
            <datalist id="city-suggestions">
              {CITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
          </div>

          <Select
            label="Region"
            required
            placeholder="Select a region"
            options={REGION_OPTIONS}
            value={form.state}
            error={errors.state}
            onChange={update("state")}
          />
        </div>

        <Input
          label="Street address"
          required
          placeholder="12 Boundary Road, East Legon"
          value={form.address}
          error={errors.address}
          onChange={update("address")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Latitude"
            type="number"
            step="any"
            placeholder="5.6350"
            hint="Optional. Adds a map to the listing."
            value={form.lat}
            error={errors.lat}
            onChange={update("lat")}
          />
          <Input
            label="Longitude"
            type="number"
            step="any"
            placeholder="-0.1720"
            hint="Optional."
            value={form.lng}
            error={errors.lng}
            onChange={update("lng")}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-ink-900">Photos</legend>
        <p className="mt-1 text-xs text-ink-500">
          Up to 12 photos. The first one is used as the cover image.
        </p>

        {images.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((url, index) => (
              <li
                key={url}
                className="relative aspect-4/3 overflow-hidden rounded-xl border border-slate-200"
              >
                <Image
                  src={url}
                  alt={`Listing photo ${index + 1}`}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setImages((current) => current.filter((item) => item !== url))
                  }
                  className="absolute top-1.5 right-1.5 rounded-full bg-white/95 p-1.5 shadow-sm transition-colors hover:bg-white"
                  aria-label={`Remove photo ${index + 1}`}
                >
                  <X className="size-3.5 text-ink-900" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label
          htmlFor="property-images"
          className={cn(
            "mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-6 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/40",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          <Upload className="size-6 text-ink-500" aria-hidden="true" />
          <span className="mt-2 text-sm font-semibold text-ink-900">
            {uploading ? "Uploading…" : "Upload photos"}
          </span>
          <span className="mt-0.5 text-xs text-ink-500">
            JPEG, PNG, WebP or AVIF, up to 5 MB each
          </span>
        </label>
        <input
          id="property-images"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            if (event.target.files?.length) void handleUpload(event.target.files);
            event.target.value = "";
          }}
        />
        {errors.images && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-600">
            {errors.images}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-ink-900">Amenities</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {COMMON_AMENITIES.map((amenity) => {
            const selected = amenities.includes(amenity);
            return (
              <button
                key={amenity}
                type="button"
                onClick={() => toggleAmenity(amenity)}
                aria-pressed={selected}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white text-ink-700 hover:bg-surface-muted",
                )}
              >
                {amenity}
              </button>
            );
          })}
        </div>

        {/* Anything not in the common list can still be added. */}
        {amenities.filter((a) => !COMMON_AMENITIES.includes(a as never)).length >
          0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {amenities
              .filter((a) => !COMMON_AMENITIES.includes(a as never))
              .map((amenity) => (
                <button
                  key={amenity}
                  type="button"
                  onClick={() => toggleAmenity(amenity)}
                  className="rounded-full border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                  aria-label={`Remove ${amenity}`}
                >
                  {amenity} &times;
                </button>
              ))}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={customAmenity}
            onChange={(event) => setCustomAmenity(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const value = customAmenity.trim();
                if (value && !amenities.includes(value)) {
                  setAmenities((current) => [...current, value]);
                  setCustomAmenity("");
                }
              }
            }}
            placeholder="Add another amenity"
            aria-label="Add a custom amenity"
            className="h-11 flex-1 rounded-xl border border-slate-300 px-3.5 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const value = customAmenity.trim();
              if (value && !amenities.includes(value)) {
                setAmenities((current) => [...current, value]);
                setCustomAmenity("");
              }
            }}
          >
            Add
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {isEditing ? "Save changes" : "Create listing"}
        </Button>
      </div>
    </form>
  );
}
