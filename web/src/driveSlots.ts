import type { Drive, DriveSlots } from "./types";
export function driveSlot(drive: Drive, slots: DriveSlots) {
  const id = (drive.path || drive.name).replace(/^.*\//, "").replace(/-part\d+$/, "");
  const serial = id.split("_").at(-1)!;
  const location = Object.hasOwn(slots, id)
    ? slots[id]
    : Object.hasOwn(slots, serial)
      ? slots[serial]
      : undefined;
  return location && Number.isSafeInteger(location.slot) && location.slot > 0
    ? location
    : undefined;
}
