<script lang="ts">
	import type { GoldItem } from '$lib/types';

	let { item } = $props<{ item: GoldItem }>();

	const isUp = $derived(item.change_sell > 0);
	const isDown = $derived(item.change_sell < 0);
	const changeClass = $derived(isUp ? 'up' : isDown ? 'down' : 'none');
	const changeSign = $derived(isUp ? '↑' : isDown ? '↓' : '—');
	const sourceName = $derived(item.source === 'MH' ? 'Mi Hong' : 'SJC');
</script>

<div class="card price-card">
	<div class="source-tag">{sourceName}</div>
	<div class="gold-name">{item.name}</div>
	<div class="price-row">
		<span class="price-label">
			<span lang="en">Buy</span>
			<span lang="vi">Mua</span>
		</span>
		<span class="price-val">{item.buy.toLocaleString('vi-VN')}</span>
	</div>
	<div class="price-row">
		<span class="price-label">
			<span lang="en">Sell</span>
			<span lang="vi">Bán</span>
		</span>
		<span class="price-val price-sell">{item.sell.toLocaleString('vi-VN')}</span>
	</div>
	<div class="change {changeClass}">
		{changeSign} {Math.abs(item.change_sell).toLocaleString('vi-VN')} VND
	</div>
</div>
