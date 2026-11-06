export const ROOM_TYPES = [
  "living_room",
  "bedroom",
  "kitchen",
  "bathroom",
  "dining_room",
  "office",
  "hallway",
  "garage",
  "basement",
  "attic",
  "laundry",
  "closet",
  "outdoor",
  "other",
] as const;
export const FIXTURE_LOCATIONS = [
  "ceiling",
  "wall",
  "floor",
  "table",
  "desk",
  "under_cabinet",
  "recessed",
  "track",
  "pendant",
  "chandelier",
  "sconce",
  "outdoor",
  "other",
] as const;
export const SOCKET_TYPES = [
  "E26",
  "E12",
  "E17",
  "E39",
  "GU10",
  "GU24",
  "MR16",
  "G4",
  "G9",
  "T8",
  "T5",
  "PAR20",
  "PAR30",
  "PAR38",
  "other",
] as const;
export const BULB_STATUSES = ["working", "flickering", "dead"] as const;
export const COLOUR_TEMPERATURES = ["warm", "cool", "daylight"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export type FixtureLocation = (typeof FIXTURE_LOCATIONS)[number];
export type SocketType = (typeof SOCKET_TYPES)[number];
export type BulbStatus = (typeof BULB_STATUSES)[number];
export type ColourTemperature = (typeof COLOUR_TEMPERATURES)[number];
