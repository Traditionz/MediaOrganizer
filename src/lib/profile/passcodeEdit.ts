/** Client checks for add / change / remove profile passcode. */

export function passcodeEditTitle(hasPasscode: boolean): string {
	return hasPasscode ? 'Change passcode' : 'Add passcode';
}

export function passcodeEditSubmitLabel(opts: { hasPasscode: boolean; remove: boolean }): string {
	if (opts.remove) return 'Remove';
	return opts.hasPasscode ? 'Save' : 'Add';
}

export function validatePasscodeEdit(opts: {
	hasPasscode: boolean;
	remove: boolean;
	currentPasscode: string;
	newPasscode: string;
	confirmPasscode: string;
}): string | null {
	if (opts.remove) {
		if (!opts.hasPasscode) return 'This profile has no passcode';
		if (!opts.currentPasscode.trim()) return 'Enter current passcode';
		return null;
	}
	if (opts.hasPasscode && !opts.currentPasscode.trim()) return 'Enter current passcode';
	if (opts.newPasscode.trim().length < 4) return 'Passcode must be at least 4 characters';
	if (opts.newPasscode !== opts.confirmPasscode) return 'Passcodes do not match';
	return null;
}

export function passcodePatchBody(opts: {
	id: string;
	hasPasscode: boolean;
	remove: boolean;
	currentPasscode: string;
	newPasscode: string;
}): { id: string; currentPasscode: string | null; newPasscode: string | null } {
	return {
		id: opts.id,
		currentPasscode: opts.hasPasscode ? opts.currentPasscode : null,
		newPasscode: opts.remove ? null : opts.newPasscode
	};
}
