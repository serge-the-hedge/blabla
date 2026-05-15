const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;

export function buildPatchCacheKey(
	patch: string,
	scope = "localization-review",
): string {
	let hash = FNV_OFFSET_BASIS_32;
	for (let index = 0; index < patch.length; index += 1) {
		hash ^= patch.charCodeAt(index);
		hash = Math.imul(hash, FNV_PRIME_32) >>> 0;
	}
	return `${scope}:${patch.length}:${hash.toString(36)}`;
}
