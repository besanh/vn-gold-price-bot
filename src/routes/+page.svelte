<script lang="ts">
	import { onMount } from 'svelte';
	import PriceCard from '$lib/components/PriceCard.svelte';
	import { uiState } from '$lib/uiState.svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
	
	let chartCanvas: HTMLCanvasElement;
	let trendChart: any;

	// Reactive chart initialization on data or UI state changes
	$effect(() => {
		if (chartCanvas && data.history && uiState.lang && uiState.theme) {
			initChart();
		}
	});

	function initChart() {
		const ctx = chartCanvas.getContext('2d');
		if (!ctx) return;

		const isLight = uiState.theme === 'light';
		const textColor = isLight ? '#0f172a' : '#94a3b8';
		const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

		const typeConfig: Record<string, any> = {
			'MH_SJC': { en: 'Mi Hong SJC', vn: 'Mi Hồng SJC', color: '#f59e0b' },
			'GV_SJ9999': { en: 'SJC 9999', vn: 'SJC 9999', color: '#0ea5e9' },
			'GV_SJL1L10': { en: 'SJC Ring', vn: 'SJC Nhẫn Quý', color: '#10b981' }
		};

		const lang = uiState.lang;

		const datasets = Object.entries(data.history).map(([key, historyData]) => {
			const cfg = typeConfig[key] || { en: key, vn: key, color: '#94a3b8' };
			// Force 1-minute buckets and keep only the LATEST price per bucket to ensure sharp lines (ver: 1.0.3)
			const grouped = historyData.reduce((acc: any, d: any) => {
				const bucket = Math.floor(d.t / 60000) * 60000;
				acc[bucket] = d.p; // Keep latest
				return acc;
			}, {} as Record<number, number>);

			const sortedData = Object.entries(grouped)
				.map(([x, y]) => ({ x: Number(x), y: Number(y) }))
				.sort((a, b) => a.x - b.x)
				.filter((v, i, a) => i === 0 || v.y !== a[i-1].y); // Remove redundant flat points

			return {
				label: lang === 'vi' ? cfg.vn : cfg.en,
				data: sortedData,
				borderColor: cfg.color,
				backgroundColor: 'transparent',
				stepped: true,
				borderWidth: 1,
				pointRadius: 0,
				pointHoverRadius: 5,
				fill: false,
				spanGaps: true
			};
		});

		if (trendChart) trendChart.destroy();
		
		// @ts-ignore
		trendChart = new Chart(ctx, {
			type: 'line',
			data: { datasets },
			options: {
				responsive: true, maintainAspectRatio: false,
				interaction: { intersect: false, mode: 'index' as const },
				plugins: {
					legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Outfit', size: 12 } } },
					tooltip: {
						backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.95)',
						titleColor: isLight ? '#0f172a' : '#fff',
						bodyColor: isLight ? '#475569' : '#cbd5e1',
						borderColor: 'rgba(245, 158, 11, 0.3)',
						borderWidth: 1, padding: 12,
						callbacks: {
							title: (items: any) => {
								if (!items.length) return '';
								const d = new Date(items[0].parsed.x);
								const h = d.getHours();
								const dd = d.getDate();
								const mm = d.getMonth() + 1;
								return `${dd}/${mm} ${h}h`;
							},
							label: (ctx: any) => ctx.dataset.label + ': ' + new Intl.NumberFormat('vi-VN').format(ctx.parsed.y) + ' VND'
						}
					}
				},
				scales: {
					x: {
						type: 'linear' as const,
						ticks: { 
							color: textColor, maxTicksLimit: 12,
							callback: (v: any) => { 
								const d = new Date(v); 
								const h = d.getHours();
								const dd = d.getDate();
								const mm = d.getMonth() + 1;
								return `${dd}/${mm} ${h}h`;
							}
						},
						grid: { color: gridColor }
					},
					y: {
						ticks: { color: textColor, callback: (v: any) => (v / 1000000).toFixed(1) + 'M' },
						grid: { color: gridColor }
					}
				}
			}
		});
	}

	let isSyncing = $state(false);
	async function handleSync() {
		isSyncing = true;
		try {
			const res = await fetch('/api/sync', { method: 'POST' });
			if (res.ok) {
				// Refresh the page data without full reload if possible
				// For now, reload is acceptable for sync, but for LANG it shouldn't reload.
				location.reload(); 
			}
		} finally {
			isSyncing = false;
		}
	}

	let autoSync = $state(false);
	let syncInterval: any;
	$effect(() => {
		if (autoSync) {
			syncInterval = setInterval(handleSync, 300000);
		} else {
			clearInterval(syncInterval);
		}
		return () => clearInterval(syncInterval);
	});
</script>

<div style="display: flex; justify-content: center; gap: 1rem; align-items: center; margin-bottom: 2.5rem; flex-wrap: wrap;">
	<button class="btn-sync" onclick={handleSync} class:htmx-request={isSyncing}>
		<div class="spinner"></div>
		<span>
			<span lang="en">Sync Now</span>
			<span lang="vi">Cập nhật ngay</span>
		</span>
	</button>

	<div class="toggle-container" onclick={() => autoSync = !autoSync}>
		<label class="switch">
			<input type="checkbox" aria-label="Toggle Auto Sync" bind:checked={autoSync} onclick={(e) => e.stopPropagation()} />
			<span class="slider"></span>
		</label>
		<span class="price-label" style="font-weight: 600;">
			<span lang="en">Auto (5m)</span>
			<span lang="vi">Tự động (5p)</span>
		</span>
	</div>
</div>

<div class="grid">
	{#each data.current as item}
		<PriceCard {item} />
	{/each}
	
	<div class="card chart-section">
		<canvas bind:this={chartCanvas}></canvas>
	</div>
</div>
