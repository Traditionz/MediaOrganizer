<script lang="ts" module>
	export interface ContextMenuItem {
		id: string;
		label: string;
		disabled?: boolean;
		danger?: boolean;
		separator?: boolean;
		children?: ContextMenuItem[];
	}
</script>

<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { eventTargetNode } from '$lib/parse';

	interface Props {
		open: boolean;
		x: number;
		y: number;
		items: ContextMenuItem[];
		onselect: (id: string) => void;
		onclose: () => void;
	}

	let { open, x, y, items, onselect, onclose }: Props = $props();

	let menuEl: HTMLElement | undefined = $state();
	let submenuOpenId = $state<string | null>(null);
	let pos = $state({ left: 0, top: 0 });
	let submenuPos = $state({ left: 0, top: 0 });

	const SUBMENU_GAP = 4;

	function attachMenu(node: HTMLElement) {
		menuEl = node;
		return () => {
			if (menuEl === node) menuEl = undefined;
		};
	}

	$effect(() => {
		if (!open) {
			submenuOpenId = null;
			return;
		}

		void x;
		void y;
		void menuEl;

		const node = menuEl;
		if (!node) return;

		const pad = 8;
		const rect = node.getBoundingClientRect();
		const left = Math.min(Math.max(pad, x), window.innerWidth - rect.width - pad);
		const top = Math.min(Math.max(pad, y), window.innerHeight - rect.height - pad);
		pos = { left, top };
	});

	$effect(() => {
		if (!open) return;
		const onScrollCapture = () => close();
		window.addEventListener('scroll', onScrollCapture, true);
		return () => window.removeEventListener('scroll', onScrollCapture, true);
	});

	function close() {
		submenuOpenId = null;
		onclose();
	}

	function handleSelect(item: ContextMenuItem) {
		if (item.disabled || item.separator) return;
		if (item.children?.length) {
			openSubmenuFor(item);
			return;
		}
		onselect(item.id);
		close();
	}

	function openSubmenuFor(item: ContextMenuItem) {
		submenuOpenId = item.id;
		requestAnimationFrame(() => {
			if (!menuEl) return;
			const trigger = menuEl.querySelector<HTMLElement>(`[data-menu-id="${item.id}"]`);
			const submenu = menuEl.querySelector<HTMLElement>('[data-submenu]');
			if (!trigger || !submenu) return;

			const triggerRect = trigger.getBoundingClientRect();
			const subRect = submenu.getBoundingClientRect();
			const pad = 8;
			let left = triggerRect.right + SUBMENU_GAP;
			if (left + subRect.width > window.innerWidth - pad) {
				left = triggerRect.left - subRect.width - SUBMENU_GAP;
			}
			left = Math.max(pad, left);
			let top = triggerRect.top;
			top = Math.min(Math.max(pad, top), window.innerHeight - subRect.height - pad);
			submenuPos = { left, top };
		});
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	function onPointerDown(e: PointerEvent) {
		if (!open || !menuEl) return;
		const target = eventTargetNode(e);
		if (target && !menuEl.contains(target)) close();
	}

	const openSubmenu = $derived(
		submenuOpenId ? (items.find((i) => i.id === submenuOpenId)?.children ?? null) : null
	);

	const itemClass =
		'hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none';
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:document onpointerdown={onPointerDown} />

{#if open}
	<div
		{@attach attachMenu}
		class="fixed z-50"
		style:left="{pos.left}px"
		style:top="{pos.top}px"
		role="menu"
		aria-label="Context menu"
	>
		<ul
			class="bg-popover text-popover-foreground ring-foreground/10 min-w-[11rem] rounded-xl p-1 shadow-lg ring-1"
		>
			{#each items as item, i (item.separator ? `sep-${i}` : item.id)}
				{#if item.separator}
					<li class="bg-border my-0.5 h-px p-0"></li>
				{:else}
					<li>
						<button
							type="button"
							class={[
								itemClass,
								item.danger && 'text-destructive focus:bg-destructive/10',
								item.disabled && 'pointer-events-none opacity-40'
							]}
							data-menu-id={item.id}
							disabled={item.disabled}
							role="menuitem"
							onclick={() => handleSelect(item)}
							onmouseenter={() => {
								if (item.children?.length) openSubmenuFor(item);
								else submenuOpenId = null;
							}}
						>
							<span>{item.label}</span>
							{#if item.children?.length}
								<ChevronRight class="h-3.5 w-3.5 shrink-0 opacity-70" />
							{/if}
						</button>
					</li>
				{/if}
			{/each}
		</ul>

		{#if openSubmenu}
			<ul
				data-submenu
				class="bg-popover text-popover-foreground ring-foreground/10 fixed z-50 max-h-[min(20rem,70vh)] min-w-[11rem] overflow-y-auto rounded-xl p-1 shadow-lg ring-1"
				style:left="{submenuPos.left}px"
				style:top="{submenuPos.top}px"
				role="menu"
			>
				{#each openSubmenu as child, i (child.separator ? `sub-sep-${i}` : child.id)}
					{#if child.separator}
						<li class="bg-border my-0.5 h-px p-0"></li>
					{:else}
						<li>
							<button
								type="button"
								class={[
									itemClass,
									child.danger && 'text-destructive focus:bg-destructive/10',
									child.disabled && 'pointer-events-none opacity-40'
								]}
								disabled={child.disabled}
								role="menuitem"
								onclick={() => {
									if (child.disabled || child.separator) return;
									onselect(child.id);
									close();
								}}
							>
								{child.label}
							</button>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</div>
{/if}
