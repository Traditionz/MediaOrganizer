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
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { cn } from '$lib/cn.js';
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
		'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex w-full cursor-default items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden select-none';
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
		<div
			class="bg-popover text-popover-foreground ring-foreground/10 min-w-36 rounded-lg p-1 shadow-md ring-1"
		>
			{#each items as item, i (item.separator ? `sep-${i}` : item.id)}
				{#if item.separator}
					<Separator class="my-1" />
				{:else}
					<button
						type="button"
						class={cn(
							itemClass,
							item.danger && 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10',
							item.disabled && 'pointer-events-none opacity-50'
						)}
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
							<ChevronRight class="size-4 shrink-0 opacity-70" />
						{/if}
					</button>
				{/if}
			{/each}
		</div>

		{#if openSubmenu}
			<div
				data-submenu
				class="bg-popover text-popover-foreground ring-foreground/10 fixed z-50 min-w-36 rounded-lg p-1 shadow-md ring-1"
				style:left="{submenuPos.left}px"
				style:top="{submenuPos.top}px"
				role="menu"
			>
				<ScrollArea class="max-h-[min(20rem,70vh)]">
					<div class="p-0">
						{#each openSubmenu as child, i (child.separator ? `sub-sep-${i}` : child.id)}
							{#if child.separator}
								<Separator class="my-1" />
							{:else}
								<button
									type="button"
									class={cn(
										itemClass,
										child.danger &&
											'text-destructive hover:bg-destructive/10 focus:bg-destructive/10',
										child.disabled && 'pointer-events-none opacity-50'
									)}
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
							{/if}
						{/each}
					</div>
				</ScrollArea>
			</div>
		{/if}
	</div>
{/if}
