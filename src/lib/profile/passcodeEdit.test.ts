import { describe, expect, test } from 'bun:test';
import {
	passcodeEditSubmitLabel,
	passcodeEditTitle,
	passcodePatchBody,
	validatePasscodeEdit
} from '$lib/profile/passcodeEdit';

describe('passcodeEdit', () => {
	test('passcodeEditTitle depends on existing protection', () => {
		expect(passcodeEditTitle(false)).toBe('Add passcode');
		expect(passcodeEditTitle(true)).toBe('Change passcode');
	});

	test('passcodeEditSubmitLabel covers add, save, and remove', () => {
		expect(passcodeEditSubmitLabel({ hasPasscode: false, remove: false })).toBe('Add');
		expect(passcodeEditSubmitLabel({ hasPasscode: true, remove: false })).toBe('Save');
		expect(passcodeEditSubmitLabel({ hasPasscode: true, remove: true })).toBe('Remove');
		expect(passcodeEditSubmitLabel({ hasPasscode: false, remove: true })).toBe('Remove');
	});

	test('validatePasscodeEdit covers add, change, and remove branches', () => {
		expect(
			validatePasscodeEdit({
				hasPasscode: false,
				remove: false,
				currentPasscode: '',
				newPasscode: 'abcd',
				confirmPasscode: 'abcd'
			})
		).toBeNull();
		expect(
			validatePasscodeEdit({
				hasPasscode: false,
				remove: false,
				currentPasscode: '',
				newPasscode: 'abc',
				confirmPasscode: 'abc'
			})
		).toBe('Passcode must be at least 4 characters');
		expect(
			validatePasscodeEdit({
				hasPasscode: false,
				remove: false,
				currentPasscode: '',
				newPasscode: 'abcd',
				confirmPasscode: 'abce'
			})
		).toBe('Passcodes do not match');
		expect(
			validatePasscodeEdit({
				hasPasscode: true,
				remove: false,
				currentPasscode: '',
				newPasscode: 'abcd',
				confirmPasscode: 'abcd'
			})
		).toBe('Enter current passcode');
		expect(
			validatePasscodeEdit({
				hasPasscode: true,
				remove: false,
				currentPasscode: 'oldpass',
				newPasscode: 'abcd',
				confirmPasscode: 'abcd'
			})
		).toBeNull();
		expect(
			validatePasscodeEdit({
				hasPasscode: false,
				remove: true,
				currentPasscode: '',
				newPasscode: '',
				confirmPasscode: ''
			})
		).toBe('This profile has no passcode');
		expect(
			validatePasscodeEdit({
				hasPasscode: true,
				remove: true,
				currentPasscode: '',
				newPasscode: '',
				confirmPasscode: ''
			})
		).toBe('Enter current passcode');
		expect(
			validatePasscodeEdit({
				hasPasscode: true,
				remove: true,
				currentPasscode: 'oldpass',
				newPasscode: '',
				confirmPasscode: ''
			})
		).toBeNull();
	});

	test('passcodePatchBody sends current only when protected', () => {
		expect(
			passcodePatchBody({
				id: 'p1',
				hasPasscode: false,
				remove: false,
				currentPasscode: 'ignored',
				newPasscode: 'abcd'
			})
		).toEqual({ id: 'p1', currentPasscode: null, newPasscode: 'abcd' });
		expect(
			passcodePatchBody({
				id: 'p1',
				hasPasscode: true,
				remove: false,
				currentPasscode: 'old',
				newPasscode: 'new1'
			})
		).toEqual({ id: 'p1', currentPasscode: 'old', newPasscode: 'new1' });
		expect(
			passcodePatchBody({
				id: 'p1',
				hasPasscode: true,
				remove: true,
				currentPasscode: 'old',
				newPasscode: 'new1'
			})
		).toEqual({ id: 'p1', currentPasscode: 'old', newPasscode: null });
	});
});
