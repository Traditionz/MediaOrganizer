/** Albums to add and albums to remove when the picker selection changes. */
export function albumMembershipDiff(
	previous: readonly string[],
	next: readonly string[]
): { add: string[]; remove: string[] } {
	const prev = new Set(previous);
	const nxt = new Set(next);
	return {
		add: next.filter((id) => !prev.has(id)),
		remove: previous.filter((id) => !nxt.has(id))
	};
}
