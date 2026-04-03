<script lang="ts">
	import type { GoldItem } from '$lib/types';
	import { uiState } from '$lib/uiState.svelte';

	let { item } = $props<{ item: GoldItem }>();

	const buyDelta = $derived(Number(item.delta_buy) || 0);
	const sellDelta = $derived(Number(item.delta_sell) || 0);
	const buyChange = $derived(Number(item.change_buy) || 0);
	const sellChange = $derived(Number(item.change_sell) || 0);

	const isBuyUp = $derived(buyDelta > 0 || (buyDelta === 0 && buyChange > 0));
	const isBuyDown = $derived(buyDelta < 0 || (buyDelta === 0 && buyChange < 0));
	const buyChangeSign = $derived(isBuyUp ? '↑' : isBuyDown ? '↓' : '—');

	const isSellUp = $derived(sellDelta > 0 || (sellDelta === 0 && sellChange > 0));
	const isSellDown = $derived(sellDelta < 0 || (sellDelta === 0 && sellChange < 0));
	const sellChangeSign = $derived(isSellUp ? '↑' : isSellDown ? '↓' : '—');

	const sourceName = $derived(item.source === 'MH' ? 'Mi Hong' : 'SJC');
</script>

<div class="card price-card">
	<div class="card-header">
		<div class="source-tag">{sourceName}</div>
		<div class="sync-time">{uiState.lang === 'en' ? 'Updated' : 'Cập nhật'}: {item.time}</div>
	</div>

	<h2 class="gold-name">{item.name}</h2>

	<div class="price-rows">
		<div class="price-row">
			<div class="price-info">
				<span class="price-label">
					{uiState.lang === 'en' ? 'Buy' : 'Mua'}
				</span>
				<span class="unit">
					{uiState.lang === 'en' ? 'VND/mace' : 'VND/chỉ'}
				</span>
			</div>
			<span class="price-val">{item.buy.toLocaleString('vi-VN')}</span>
		</div>
		<div class="price-row">
			<div class="price-info">
				<span class="price-label">
					{uiState.lang === 'en' ? 'Sell' : 'Bán'}
				</span>
				<span class="unit">
					{uiState.lang === 'en' ? 'VND/mace' : 'VND/chỉ'}
				</span>
			</div>
			<span class="price-val price-sell">{item.sell.toLocaleString('vi-VN')}</span>
		</div>
	</div>

	<div class="trends-grid">
		<div class="trend-item" class:up={isBuyUp} class:down={isBuyDown} class:none={!isBuyUp && !isBuyDown}>
			<span class="trend-label">
				{uiState.lang === 'en' ? 'Buy Change' : 'Biến động Mua'}
			</span>
			<span class="trend-value">
				{buyChangeSign} {Math.abs(buyDelta || buyChange).toLocaleString('vi-VN')}
			</span>
		</div>
		<div class="trend-item" class:up={isSellUp} class:down={isSellDown} class:none={!isSellUp && !isSellDown}>
			<span class="trend-label">
				{uiState.lang === 'en' ? 'Sell Change' : 'Biến động Bán'}
			</span>
			<span class="trend-value">
				{sellChangeSign} {Math.abs(sellDelta || sellChange).toLocaleString('vi-VN')}
			</span>
		</div>
	</div>
</div>

<style>
	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.sync-time {
		font-size: 0.7rem;
		opacity: 0.5;
		font-family: monospace;
	}

	.price-rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.price-info {
		display: flex;
		flex-direction: column;
	}

	.unit {
		font-size: 0.6rem;
		opacity: 0.4;
		margin-top: -2px;
	}

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

	/* Explicitly target trend items with high specificity */
	.trend-item.up, .trend-item.up .trend-value {
		color: var(--up) !important;
	}

	.trend-item.down, .trend-item.down .trend-value {
		color: var(--down) !important;
	}

	.trend-item.none {
		opacity: 0.5;
	}
</style>
