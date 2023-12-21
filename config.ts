function isTruthy(value) {
  return [true, "true", 1, "1", "yes", "Y", "on"].includes(value);
}

const FILE_RESOURCE_BASE = "http://themis.vlaanderen.be/id/bestand/";
const STORAGE_PATH = `/share`;
const STORAGE_URI = `share://`;
const MEETING_KINDS = {
  ELECTRONIC_PROCEDURE:
    "http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/2387564a-0897-4a62-9b9a-d1755eece7af",
  PVV: "http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/9b4701f8-a136-4009-94c6-d64fdc96b9a2",
};
const ENABLE_DEBUG_WRITE_GENERATED_HTML = isTruthy(
  process.env.ENABLE_DEBUG_WRITE_GENERATED_HTML
);
export {
  FILE_RESOURCE_BASE,
  STORAGE_PATH,
  STORAGE_URI,
  MEETING_KINDS,
  ENABLE_DEBUG_WRITE_GENERATED_HTML,
};
