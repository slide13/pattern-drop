// Image-processing settings. Kept apart from ./constants (which reads the
// environment) so the cut-out worker can import them.

export const MAX_PROCESSED_IMAGE_SIZE = 1800;
// The original camera photo never leaves the phone; only the downscaled PNG is
// uploaded (and limited by MAX_UPLOAD_BYTES on the server).
export const MAX_SOURCE_PHOTO_BYTES = 40 * 1024 * 1024;
export const DEFAULT_REMOVAL_STRENGTH = 45;
