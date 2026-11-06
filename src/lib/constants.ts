import {
  type BulbStatus,
  type ColourTemperature,
  type FixtureLocation,
  type RoomType,
  SOCKET_TYPES,
} from "./entity-types";

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
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

export const FIXTURE_LOCATION_LABELS: Record<FixtureLocation, string> = {
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

export const SOCKET_TYPE_OPTIONS = SOCKET_TYPES;

export const BULB_STATUS_LABELS: Record<BulbStatus, string> = {
  working: "Working",
  flickering: "Flickering",
  dead: "Dead",
};

export const BULB_STATUS_COLORS: Record<BulbStatus, string> = {
  working: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  flickering:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  dead: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export const COLOUR_TEMP_LABELS: Record<ColourTemperature, string> = {
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
