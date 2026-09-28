/** Shared chip sizing for lightbox top-chrome action buttons. */
export const LIGHTBOX_CHIP_BASE =
	'mo-media-chip flex h-8 items-center justify-center gap-1 rounded-full px-2.5 text-xs hover:bg-white/20 active:scale-[0.97] active:bg-white/30';

/** Icon-only controls (favorite heart, close) — square hit target. */
export const LIGHTBOX_ICON_CHIP =
	'mo-media-chip flex size-8 items-center justify-center rounded-full hover:bg-white/20 active:scale-[0.97] active:bg-white/30';

/** Filled / pressed look when a toggle (favorite, info) is on. */
export const LIGHTBOX_CHIP_ACTIVE = 'mo-media-chip-active';

/** Icon-only close control in the action bar. */
export const LIGHTBOX_CLOSE_CHIP = LIGHTBOX_ICON_CHIP;

/** Idle rotate (and other non-toggle) chip — same base as toggles without active ring. */
export function lightboxActionChipClass(): string {
	return LIGHTBOX_CHIP_BASE;
}

/** Favorite button classes: filled when favorited. */
export function lightboxFavoriteChipClass(favorite: boolean): string {
	return favorite ? `${LIGHTBOX_ICON_CHIP} ${LIGHTBOX_CHIP_ACTIVE}` : LIGHTBOX_ICON_CHIP;
}

/** Info button classes: filled when the inspector panel is open. */
export function lightboxInfoChipClass(showInfo: boolean): string {
	return showInfo ? `${LIGHTBOX_CHIP_BASE} ${LIGHTBOX_CHIP_ACTIVE}` : LIGHTBOX_CHIP_BASE;
}
