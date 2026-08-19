/**
 * Ghana-specific reference data, shared by search filters and the property form.
 */

/** The ten most common rental markets, offered first in city pickers. */
export const GHANA_CITIES = [
  "Accra",
  "Kumasi",
  "Takoradi",
  "Tema",
  "Cape Coast",
  "Tamale",
  "Ho",
  "Koforidua",
  "Sunyani",
  "Techiman",
] as const;

/** All sixteen administrative regions. */
export const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Western North",
  "Central",
  "Eastern",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
] as const;

export const COMMON_AMENITIES = [
  "Air conditioning",
  "Borehole water",
  "Parking space",
  "Security post",
  "Fitted kitchen",
  "Furnished",
  "Hot water",
  "Prepaid meter",
  "Standby generator",
  "Tiled floors",
  "Wardrobe",
  "Wi-Fi ready",
  "Balcony",
  "Gated compound",
  "CCTV",
  "Swimming pool",
] as const;

export const PROPERTY_TYPE_OPTIONS = [
  { value: "apartment", label: "Apartment" },
  { value: "room", label: "Single room" },
  { value: "house", label: "House" },
  { value: "studio", label: "Studio" },
  { value: "hostel", label: "Hostel" },
];

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "bedrooms_desc", label: "Most bedrooms" },
];

export const BEDROOM_OPTIONS = [
  { value: "1", label: "1+ bedroom" },
  { value: "2", label: "2+ bedrooms" },
  { value: "3", label: "3+ bedrooms" },
  { value: "4", label: "4+ bedrooms" },
];
