import type { Drive, DriveSlots } from "./types";
export function driveSlot(drive: Drive, slots: DriveSlots) {
  const port = drive.port;
  if (typeof port !== "number" || !Number.isSafeInteger(port) || port <= 0) return undefined;
  const key = String(port);
  const location = Object.hasOwn(slots, key) ? slots[key] : undefined;
  return location && Number.isSafeInteger(location.slot) && location.slot > 0
    ? location
    : undefined;
}
