<script lang="ts">
	import type { GoldItem } from '$lib/types';

	let { item } = $props<{ item: GoldItem }>();

	const isBuyUp = $derived(item.change_buy > 0);
	const isBuyDown = $derived(item.change_buy < 0);
	const buyChangeClass = $derived(isBuyUp ? 'up' : isBuyDown ? 'down' : 'none');
	const buyChangeSign = $derived(isBuyUp ? '↑' : isBuyDown ? '↓' : '—');

	const isSellUp = $derived(item.change_sell > 0);
	const isSellDown = $derived(item.change_sell < 0);
	const sellChangeClass = $derived(isSellUp ? 'up' : isSellDown ? 'down' : 'none');
	const sellChangeSign = $derived(isSellUp ? '↑' : isSellDown ? '↓' : '—');

	const sourceName = $derived(item.source === 'MH' ? 'Mi Hong' : 'SJC');
</script>

<div class="card price-card">
	<div class="source-tag">{sourceName}</div>
	<h2 class="gold-name">{item.name}</h2>
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

	<div class="trends-grid">
		<div class="trend-item {buyChangeClass}">
			<span class="trend-label">
				<span lang="en">Buy Change</span>
				<span lang="vi">Biến động Mua</span>
			</span>
			<span class="trend-value">
				{buyChangeSign} {Math.abs(Number(item.change_buy) || 0).toLocaleString('vi-VN')}
			</span>
		</div>
		<div class="trend-item {sellChangeClass}">
			<span class="trend-label">
				<span lang="en">Sell Change</span>
				<span lang="vi">Biến động Bán</span>
			</span>
			<span class="trend-value">
				{sellChangeSign} {Math.abs(Number(item.change_sell) || 0).toLocaleString('vi-VN')}
			</span>
		</div>
	</div>
</div>

<style>
	.trends-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.trend-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0.5rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.03);
		transition: transform 0.2s;
	}

	.trend-label {
		font-size: 0.65rem;
		text-transform: uppercase;
		font-weight: 700;
		letter-spacing: 0.05em;
		opacity: 0.5;
		color: var(--text);
	}

	.trend-value {
		font-size: 0.85rem;
		font-weight: 600;
		font-family: monospace;
	}

	.up {
		color: var(--up) !important;
		background: rgba(52, 211, 153, 0.08);
	}

	.down {
		color: var(--down) !important;
		background: rgba(248, 113, 113, 0.08);
	}

	.none {
		opacity: 0.6;
	}
</style>
