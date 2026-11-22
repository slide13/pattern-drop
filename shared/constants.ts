export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 10000;
export const MAX_IMAGES_PER_SESSION = 200;
export const SESSION_ID_PATTERN = /^[a-f0-9]{16}$/;
/** Sessions (and their drawings) not used for this long are deleted. */
export const SESSION_TTL_DAYS = 7;
