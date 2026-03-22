export const ROOM_TYPE_LABELS: Record<string, string> = {
  living_room: "Living Room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  dining_room: "Dining Room",
  office: "Office",
  hallway: "Hallway",
  garage: "Garage",
  basement: "Basement",
  attic: "Attic",
  laundry: "Laundry",
  closet: "Closet",
  outdoor: "Outdoor",
  other: "Other",
};

export const FIXTURE_LOCATION_LABELS: Record<string, string> = {
  ceiling: "Ceiling",
  wall: "Wall",
  floor: "Floor",
  table: "Table",
  desk: "Desk",
  under_cabinet: "Under Cabinet",
  recessed: "Recessed",
  track: "Track",
  pendant: "Pendant",
  chandelier: "Chandelier",
  sconce: "Sconce",
  outdoor: "Outdoor",
  other: "Other",
};

export const SOCKET_TYPE_OPTIONS = [
  "E26", "E12", "E17", "E39",
  "GU10", "GU24", "MR16",
  "G4", "G9", "T8", "T5",
  "PAR20", "PAR30", "PAR38",
  "other",
] as const;

export const BULB_STATUS_LABELS: Record<string, string> = {
  working: "Working",
  flickering: "Flickering",
  dead: "Dead",
};

export const BULB_STATUS_COLORS: Record<string, string> = {
  working: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  flickering: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  dead: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export const COLOUR_TEMP_LABELS: Record<string, string> = {
  warm: "Warm White",
  cool: "Cool White",
  daylight: "Daylight",
};

export const FEATURE_OPTIONS = [
  "dimmable",
  "rgb",
  "smart",
  "motion_sensor",
  "timer",
  "outdoor_rated",
  "energy_star",
] as const;

export const FEATURE_LABELS: Record<string, string> = {
  dimmable: "Dimmable",
  rgb: "RGB",
  smart: "Smart",
  motion_sensor: "Motion Sensor",
  timer: "Timer",
  outdoor_rated: "Outdoor Rated",
  energy_star: "Energy Star",
};
