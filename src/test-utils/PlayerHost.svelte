<script lang="ts">
	import CustomPlayer from '$lib/components/CustomPlayer.svelte';

	let item = $state({ id: 'v1', views: 0 });
</script>

<CustomPlayer src={`data:video/mp4;base64,${item.id}`} mediaId={item.id} />
<button
	type="button"
	data-testid="replace-item"
	onclick={() => {
		item = { ...item, views: item.views + 1 };
	}}>replace</button
>
